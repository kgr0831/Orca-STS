import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SttEvent } from './stt-service'
import { ElevenLabsTranscriptionSession } from './elevenlabs-transcription-session'

const sockets = vi.hoisted(
  (): {
    items: {
      sent: { commit?: boolean; audio_base_64?: string }[]
      terminated: boolean
      url: URL
      receive: (value: unknown) => void
      disconnect: () => void
      sendCallbacks: ((error?: Error) => void)[]
      delaySends: boolean
    }[]
  } => ({ items: [] })
)

vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    default: class extends EventEmitter {
      static OPEN = 1
      readyState = 1
      bufferedAmount = 0
      sent: { commit?: boolean; audio_base_64?: string }[] = []
      terminated = false
      sendCallbacks: ((error?: Error) => void)[] = []
      delaySends = false
      constructor(readonly url: URL) {
        super()
        sockets.items.push(this)
      }
      send(value: string, callback: (error?: Error) => void): void {
        this.sent.push(JSON.parse(value))
        this.sendCallbacks.push(callback)
        if (!this.delaySends) {
          callback()
        }
      }
      terminate(): void {
        this.terminated = true
        this.readyState = 3
        this.emit('close')
      }
      receive(value: unknown): void {
        this.emit('message', Buffer.from(JSON.stringify(value)))
      }
      disconnect(): void {
        this.emit('close')
      }
    }
  }
})

beforeEach(() => {
  vi.useFakeTimers()
  sockets.items.length = 0
})
afterEach(() => vi.useRealTimers())

async function start() {
  const events: SttEvent[] = []
  const session = new ElevenLabsTranscriptionSession((event) => events.push(event))
  const ready = session.start('test-only-key')
  const socket = sockets.items[0]
  socket.receive({ message_type: 'session_started' })
  await ready
  return { events, session, socket }
}

describe('ElevenLabs realtime dictation lifetime', () => {
  it('lets Scribe detect the spoken language instead of forcing Korean', async () => {
    const { session, socket } = await start()
    expect(socket.url.searchParams.has('language_code')).toBe(false)
    await session.finish()
  })
  it('replaces partials and emits final text once, without replaying it on stop', async () => {
    const { events, session, socket } = await start()
    session.feedAudio(new Float32Array([-1, 0, 1]), 16000)
    const pcm = Buffer.from(socket.sent[0].audio_base_64 ?? '', 'base64')
    expect(pcm.readInt16LE(0)).toBe(-32768)
    expect(pcm.readInt16LE(4)).toBe(32767)
    socket.receive({ message_type: 'partial_transcript', text: '안녕' })
    socket.receive({ message_type: 'partial_transcript', text: '안녕하세요' })
    socket.receive({ message_type: 'committed_transcript', text: '안녕하세요' })
    expect(await session.finish()).toBe('')
    socket.receive({ message_type: 'committed_transcript', text: 'late' })
    expect(events).toEqual([
      { type: 'partial', text: '안녕' },
      { type: 'partial', text: '안녕하세요' },
      { type: 'final', text: '안녕하세요 ' }
    ])
    expect(socket.terminated).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('drains the final commit before ending manual capture', async () => {
    const { events, session, socket } = await start()
    session.feedAudio(new Float32Array([0.2]), 16000)
    const stopping = session.finish()
    expect(socket.sent.at(-1)?.commit).toBe(true)
    socket.receive({ message_type: 'committed_transcript', text: '마지막' })
    expect(await stopping).toBe('')
    expect(events).toEqual([{ type: 'final', text: '마지막 ' }])
    expect(socket.terminated).toBe(true)
  })

  it('rejects startup when canceled during connection', async () => {
    const session = new ElevenLabsTranscriptionSession(vi.fn())
    const ready = session.start('test-only-key')
    const rejected = expect(ready).rejects.toThrow('dictation_canceled')
    await session.finish()
    await rejected
    expect(sockets.items[0].terminated).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not leak vendor error bodies or reconnect after quota failure', async () => {
    const { events, session, socket } = await start()
    socket.receive({ message_type: 'quota_exceeded', error: 'test-only-sensitive-text' })
    expect(events).toEqual([{ type: 'error', error: 'elevenlabs_quota_exceeded' }])
    await session.finish()
    expect(sockets.items).toHaveLength(1)
    expect(socket.terminated).toBe(true)
  })

  it('fails closed instead of sending unconfirmed partial text when commit times out', async () => {
    const { session, socket } = await start()
    session.feedAudio(new Float32Array([0.2]), 16000)
    const rejected = expect(session.finish()).rejects.toThrow('elevenlabs_commit_timeout')
    await vi.advanceTimersByTimeAsync(8_000)
    await rejected
    expect(socket.terminated).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps an explicitly started conversation open during silence and detects a dead connection', async () => {
    const { session, socket, events } = await start()
    expect(socket.url.searchParams.has('language_code')).toBe(false)
    expect(socket.url.searchParams.get('keepalive_interval_ms')).toBe('5000')
    for (let i = 0; i < 18; i++) {
      await vi.advanceTimersByTimeAsync(5000)
      socket.receive({ message_type: 'partial_transcript', text: '' })
    }
    expect(socket.terminated).toBe(false)
    expect(events.some((event) => event.type === 'error')).toBe(false)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(socket.terminated).toBe(true)
    expect(events.some((event) => event.type === 'error')).toBe(false)
    await vi.advanceTimersByTimeAsync(250)
    const recovered = sockets.items[1]
    recovered.receive({ message_type: 'session_started' })
    recovered.receive({ message_type: 'committed_transcript', text: 'still here' })
    expect(events.at(-1)).toEqual({ type: 'final', text: 'still here ' })
    await session.finish()
  })

  it('reconnects transient failures without replaying a completed transcript or accepting old socket events', async () => {
    const { session, socket, events } = await start()
    socket.receive({ message_type: 'committed_transcript', text: 'first turn' })
    socket.disconnect()
    await vi.advanceTimersByTimeAsync(250)
    const recovered = sockets.items[1]
    recovered.receive({ message_type: 'session_started' })
    socket.receive({ message_type: 'committed_transcript', text: 'late old text' })
    recovered.receive({ message_type: 'partial_transcript', text: 'next' })
    recovered.receive({ message_type: 'partial_transcript', text: 'next' })
    recovered.receive({ message_type: 'committed_transcript', text: 'next turn' })
    expect(events).toEqual([
      { type: 'final', text: 'first turn ' },
      { type: 'partial', text: 'next' },
      { type: 'final', text: 'next turn ' }
    ])
    expect(recovered.sent).toEqual([])
    await session.finish()
  })

  it('bounds repeated reconnect failures and emits one terminal error', async () => {
    const { session, socket, events } = await start()
    socket.disconnect()
    for (const delay of [250, 500, 1000]) {
      await vi.advanceTimersByTimeAsync(delay)
      sockets.items.at(-1)?.disconnect()
    }
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sockets.items).toHaveLength(4)
    expect(events).toEqual([{ type: 'error', error: 'elevenlabs_connection_closed' }])
    await session.finish()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores delayed send failures from a retired socket', async () => {
    const { session, socket, events } = await start()
    socket.delaySends = true
    session.feedAudio(new Float32Array([0.25]), 16000)
    socket.disconnect()
    await vi.advanceTimersByTimeAsync(250)
    const recovered = sockets.items[1]
    recovered.receive({ message_type: 'session_started' })
    socket.sendCallbacks[0](new Error('retired socket'))
    recovered.receive({ message_type: 'committed_transcript', text: 'recovered' })
    expect(recovered.terminated).toBe(false)
    expect(events).toEqual([{ type: 'final', text: 'recovered ' }])
    await session.finish()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels pending recovery when the user ends capture', async () => {
    const { session, socket, events } = await start()
    socket.disconnect()
    await session.finish()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sockets.items).toHaveLength(1)
    expect(events).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('buffers only newly captured audio during recovery and never resends old audio', async () => {
    const { session, socket } = await start()
    session.feedAudio(new Float32Array([0.25]), 16000)
    socket.disconnect()
    session.feedAudio(new Float32Array([0.5]), 16000)
    await vi.advanceTimersByTimeAsync(250)
    const recovered = sockets.items[1]
    expect(recovered.sent).toEqual([])
    recovered.receive({ message_type: 'session_started' })
    expect(recovered.sent).toHaveLength(1)
    const pcm = Buffer.from(recovered.sent[0].audio_base_64 ?? '', 'base64')
    expect(pcm.length).toBe(2)
    expect(pcm.readInt16LE(0)).toBe(16384)
    recovered.receive({ message_type: 'committed_transcript', text: 'new words' })
    await session.finish()
  })
})
