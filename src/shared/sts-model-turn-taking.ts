import { STS_STOP_CONFIDENCE, type StsTurnPrediction } from './sts-turn-models'

export type StsTurnOutput = { text: string }

export class StsModelTurnTaking {
  private revision = 0
  private closed = false
  private current = ''
  private committed = ''
  private overlap: StsTurnOutput | null = null
  private interrupted = false
  private deferred = ''
  private retries = 0
  private deciding = false
  private final = false
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly callbacks: {
      output: () => StsTurnOutput | null
      predict: (text: string, output: string, final: boolean) => Promise<StsTurnPrediction>
      interrupt: () => void
      utterance: (text: string) => void
      caption: (text: string) => void
      error: () => void
      waiting?: () => void
      pending?: (value: boolean) => void
      clearAudio?: () => void
      holdOutput?: (held: boolean) => void
    }
  ) {}

  get pendingText(): string {
    return [this.committed, this.current].filter(Boolean).join(' ')
  }

  receive(value: string, final: boolean): void {
    if (this.closed || !value.trim()) {
      return
    }
    if (!final && value.trim() === this.current) {
      return
    }
    this.deferred = ''
    this.current = value.trim()
    this.callbacks.pending?.(true)
    this.retries = 0
    this.final = final
    this.overlap ??= this.callbacks.output()
    if (this.overlap && !this.interrupted) {
      this.callbacks.holdOutput?.(true)
    }
    ++this.revision
    const text = [this.committed, this.current].filter(Boolean).join(' ')
    this.callbacks.caption(text)
    if (final) {
      this.committed = text
      this.current = ''
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.schedule()
  }

  private schedule(): void {
    if (this.closed || this.deciding || this.timer !== undefined || !this.pendingText) {
      return
    }
    this.timer = setTimeout(
      () => {
        this.timer = undefined
        void this.decide(this.revision, this.pendingText, this.final)
      },
      this.final ? 0 : 120
    )
  }

  private async decide(revision: number, text: string, final: boolean): Promise<void> {
    this.deciding = true
    try {
      const result = await this.callbacks.predict(text, this.overlap?.text ?? '', final)
      if (this.closed || revision !== this.revision) {
        return
      }
      const backchannel = result.intent === 'backchannel' && result.confidence >= 0.65
      const stop = result.intent === 'stop' && result.confidence >= STS_STOP_CONFIDENCE
      if (this.overlap && !this.interrupted && backchannel) {
        this.callbacks.holdOutput?.(false)
        if (final) {
          if (result.expectsAnswer) {
            this.deferred = text
            this.committed = text
            this.current = ''
            if (!this.callbacks.output()) {
              this.outputEnded()
            }
          } else {
            this.reset()
          }
        }
        return
      }
      if (
        stop ||
        (this.overlap && (final || (result.intent === 'speech' && result.confidence >= 0.92)))
      ) {
        if (!this.interrupted) {
          this.interrupted = true
          this.callbacks.interrupt()
          this.callbacks.holdOutput?.(false)
        }
      }
      if (!final) {
        return
      }
      if (stop) {
        this.reset()
        return
      }
      this.committed = text
      this.current = ''
      if (result.complete >= 0.5) {
        this.submit()
      } else if (this.retries++ < 4) {
        this.callbacks.waiting?.()
        this.timer = setTimeout(() => {
          this.timer = undefined
          void this.decide(revision, text, true)
        }, 600)
      } else {
        this.submit()
      }
    } catch {
      if (!this.closed && revision === this.revision) {
        if (this.overlap && !this.interrupted) {
          this.interrupted = true
          this.callbacks.interrupt()
        }
        this.callbacks.holdOutput?.(false)
        this.callbacks.error()
      }
    } finally {
      this.deciding = false
      if (revision !== this.revision) {
        this.schedule()
      }
    }
  }

  outputEnded(): void {
    if (!this.deferred) {
      return
    }
    this.committed = this.deferred
    this.current = ''
    this.submit()
  }

  submit(): void {
    const text = [this.committed, this.current].filter(Boolean).join(' ')
    if (text && this.callbacks.output() && !this.interrupted) {
      this.callbacks.interrupt()
    }
    this.reset()
    if (text) {
      this.callbacks.utterance(text)
    }
  }

  reset(): void {
    ++this.revision
    clearTimeout(this.timer)
    this.timer = undefined
    this.current = ''
    this.committed = ''
    this.deferred = ''
    this.overlap = null
    this.interrupted = false
    this.retries = 0
    this.final = false
    this.callbacks.holdOutput?.(false)
    this.callbacks.pending?.(false)
    this.callbacks.clearAudio?.()
  }

  close(): void {
    this.reset()
    this.closed = true
  }
}
