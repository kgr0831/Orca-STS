import WebSocket from 'ws'
import { resampleToRate } from './stt-audio-resample'
import type { SttEventSink } from './stt-service'

export class ElevenLabsTranscriptionSession {
  private socket: WebSocket | null = null
  private ready = false
  private closed = false
  private finishing = false
  private dirty = false
  private readyResolve: (() => void) | null = null
  private readyReject: ((error: Error) => void) | null = null
  private finishResolve: (() => void) | null = null
  private finishReject: ((error: Error) => void) | null = null
  private startTimer: ReturnType<typeof setTimeout> | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retries = 0
  private connectedAt = 0
  private started = false
  private apiKey = ''
  private partial = ''
  private bufferedAudio: Buffer[] = []
  private bufferedBytes = 0

  constructor(private readonly sink: SttEventSink) {}

  start(apiKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject
      this.apiKey = apiKey
      this.connect()
    })
  }

  private connect(): void {
    if (this.closed || this.finishing) {
      return
    }
    const url = new URL('wss://api.elevenlabs.io/v1/speech-to-text/realtime')
    url.searchParams.set('model_id', 'scribe_v2_realtime')
    url.searchParams.set('audio_format', 'pcm_16000')
    url.searchParams.set('keepalive_interval_ms', '5000')
    url.searchParams.set('commit_strategy', 'vad')
    url.searchParams.set('vad_silence_threshold_secs', '1.2')
    this.startTimer = setTimeout(() => this.fail('elevenlabs_connection_timeout'), 15_000)
    try {
      const socket = new WebSocket(url, {
        headers: { 'xi-api-key': this.apiKey },
        handshakeTimeout: 15_000,
        maxPayload: 1024 * 1024,
        followRedirects: false
      })
      this.socket = socket
      socket.on('message', (data) => {
        if (this.socket === socket) {
          this.receive(data.toString())
        }
      })
      socket.on('error', () => {
        if (this.socket === socket) {
          this.fail('elevenlabs_connection_failed')
        }
      })
      socket.on('close', () => {
        if (this.socket === socket) {
          this.fail('elevenlabs_connection_closed')
        }
      })
    } catch {
      this.fail('elevenlabs_connection_failed')
    }
  }

  private receive(raw: string): void {
    if (this.closed) {
      return
    }
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      this.fail('elevenlabs_invalid_response')
      return
    }
    if (!data || typeof data !== 'object' || !('message_type' in data)) {
      return
    }
    const kind = data.message_type
    if (kind === 'session_started' && !this.ready) {
      this.ready = true
      this.started = true
      this.connectedAt = Date.now()
      if (this.startTimer) {
        clearTimeout(this.startTimer)
      }
      this.readyResolve?.()
      this.readyResolve = null
      this.readyReject = null
      this.resetIdleTimer()
      const buffered = this.bufferedAudio
      this.bufferedAudio = []
      this.bufferedBytes = 0
      for (const pcm of buffered) {
        if (this.closed || !this.ready) {
          break
        }
        this.dirty = true
        this.send(pcm, false)
      }
    } else if (kind === 'partial_transcript' || kind === 'committed_transcript') {
      if (!this.ready || !('text' in data) || typeof data.text !== 'string') {
        return
      }
      this.resetIdleTimer()
      if (kind === 'committed_transcript') {
        this.dirty = false
        this.partial = ''
        if (data.text.trim()) {
          this.sink({ type: 'final', text: `${data.text.trim()} ` })
        }
        this.finishResolve?.()
      } else if (data.text !== this.partial) {
        this.partial = data.text
        this.sink({ type: 'partial', text: data.text })
      }
    } else if (
      kind !== 'warning' &&
      kind !== 'session_started' &&
      kind !== 'committed_transcript_with_timestamps' &&
      kind !== 'committed_transcript_entities' &&
      kind !== 'edited_transcript'
    ) {
      // Never forward vendor error bodies, which can contain credentials or input.
      const code =
        typeof kind === 'string' &&
        /^(auth_error|quota_exceeded|rate_limited|unaccepted_terms|transcriber_error|resource_exhausted|session_time_limit_exceeded|insufficient_audio_activity|input_error|invalid_request|chunk_size_exceeded|queue_overflow|commit_throttled)$/.test(
          kind
        )
          ? kind
          : 'transcription_failed'
      this.fail(`elevenlabs_${code}`)
    }
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
    }
    this.idleTimer = setTimeout(() => this.fail('elevenlabs_connection_timeout'), 30_000)
  }

  feedAudio(samples: Float32Array, sampleRate: number): void {
    if (this.closed || this.finishing || (!this.ready && !this.started)) {
      return
    }
    if (
      !Number.isFinite(sampleRate) ||
      sampleRate < 8000 ||
      sampleRate > 192000 ||
      samples.length > sampleRate * 2
    ) {
      this.fail('elevenlabs_invalid_audio')
      return
    }
    const normalized = resampleToRate(samples, sampleRate, 16000)
    if (!normalized.length) {
      return
    }
    const pcm = Buffer.alloc(normalized.length * 2)
    for (let i = 0; i < normalized.length; i++) {
      const value = Number.isFinite(normalized[i]) ? Math.max(-1, Math.min(1, normalized[i])) : 0
      pcm.writeInt16LE(Math.round(value * (value < 0 ? 32768 : 32767)), i * 2)
    }
    if (!this.ready) {
      this.bufferedBytes += pcm.length
      if (this.bufferedBytes > 16000 * 2 * 5) {
        this.fail('elevenlabs_audio_backpressure')
        return
      }
      this.bufferedAudio.push(pcm)
      return
    }
    this.dirty = true
    this.send(pcm, false)
  }

  private send(pcm: Buffer, commit: boolean): void {
    const socket = this.socket
    if (socket?.readyState !== WebSocket.OPEN || socket.bufferedAmount > 512 * 1024) {
      this.fail('elevenlabs_audio_backpressure')
      return
    }
    socket.send(
      JSON.stringify({
        message_type: 'input_audio_chunk',
        audio_base_64: pcm.toString('base64'),
        sample_rate: 16000,
        commit
      }),
      (error) => {
        if (error && this.socket === socket) {
          this.fail('elevenlabs_connection_failed')
        }
      }
    )
  }

  async finish(): Promise<string> {
    if (this.closed) {
      return ''
    }
    this.finishing = true
    if (!this.ready || !this.dirty) {
      this.dispose()
      return ''
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await new Promise<void>((resolve, reject) => {
        this.finishResolve = resolve
        this.finishReject = reject
        timer = setTimeout(() => reject(new Error('elevenlabs_commit_timeout')), 8_000)
        this.send(Buffer.alloc(16000), true)
      })
      return ''
    } finally {
      clearTimeout(timer)
      this.dispose()
    }
  }

  private fail(code: string): void {
    if (this.closed) {
      return
    }
    if (
      this.started &&
      !this.finishing &&
      /^elevenlabs_(connection_(failed|closed|timeout)|transcriber_error|resource_exhausted|session_time_limit_exceeded|insufficient_audio_activity)$/.test(
        code
      )
    ) {
      if (this.ready && Date.now() - this.connectedAt >= 30_000) {
        this.retries = 0
      }
      if (this.retries < 3) {
        this.ready = false
        this.dirty = false
        this.partial = ''
        if (this.startTimer) {
          clearTimeout(this.startTimer)
        }
        if (this.idleTimer) {
          clearTimeout(this.idleTimer)
        }
        const socket = this.socket
        this.socket = null
        socket?.terminate()
        this.retryTimer = setTimeout(
          () => {
            this.retryTimer = null
            this.connect()
          },
          250 * 2 ** this.retries++
        )
        return
      }
    }
    const error = new Error(code)
    const notify = this.started && !this.finishing
    this.readyReject?.(error)
    this.finishReject?.(error)
    this.dispose()
    if (notify) {
      this.sink({ type: 'error', error: code })
    }
  }

  private dispose(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    if (this.startTimer) {
      clearTimeout(this.startTimer)
    }
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
    }
    this.apiKey = ''
    this.bufferedAudio = []
    this.bufferedBytes = 0
    this.readyReject?.(new Error('dictation_canceled'))
    this.readyReject = null
    this.readyResolve = null
    this.finishResolve = null
    this.finishReject = null
    this.socket?.terminate()
    this.socket = null
  }
}
