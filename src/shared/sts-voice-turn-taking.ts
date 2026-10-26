const compact = (text: string) => text.normalize('NFKC').replace(/[\s,.!…~。！？?]/gu, '')
const acknowledgment =
  /^(?:그렇구나|그랬구나|그렇지|맞아요|맞아|그래요|그래|아하|으응|으음|응+|어+|음+|흠+|아+|오+|네|넵|예)+$/u
const stopOnly =
  /^(?:아|어|응|음)?(?:잠깐만?|잠시만|그만|그만해|멈춰|멈춰줘|스톱|조용히해|말하지마)$/u
const stopPrefix =
  /^(?:(?:아|어|응|음)[,\s]+)?(?:잠깐만?|잠시만|그만(?:해)?|멈춰(?:줘)?|스톱)(?:[\s,.!?…]|$)/u
const echoKey = (text: string) => text.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '')

export function voiceOverlapIntent(text: string): 'stop' | 'backchannel' | 'speech' {
  if (stopOnly.test(compact(text)) || stopPrefix.test(text.trim())) {
    return 'stop'
  }
  return acknowledgment.test(compact(text)) ? 'backchannel' : 'speech'
}

export type VoiceOutput = { text: string; question: boolean }
type Overlap = VoiceOutput & { promoted: boolean; deferred?: string }

export class StsVoiceTurnTaking {
  private overlap: Overlap | null = null
  private text = ''
  private committed = ''
  private takeover: ReturnType<typeof setTimeout> | undefined
  private settlement: ReturnType<typeof setTimeout> | undefined
  private closed = false

  constructor(
    private readonly callbacks: {
      output: () => VoiceOutput | null
      interrupt: () => void
      utterance: (text: string) => void
      caption: (text: string) => void
    }
  ) {}

  receive(value: string, final: boolean): void {
    if (this.closed || !value.trim()) {
      return
    }
    this.text = value.trim()
    clearTimeout(this.settlement)
    const output = this.callbacks.output()
    this.overlap ??= output && !this.committed ? { ...output, promoted: false } : null
    const intent = voiceOverlapIntent(this.text)
    const state = this.overlap
    this.callbacks.caption([this.committed, this.text].filter(Boolean).join(' '))
    if (intent === 'stop') {
      this.promote()
      if (final && stopOnly.test(compact(this.text))) {
        this.reset()
        return
      }
    }
    if (state && !state.promoted && intent !== 'stop') {
      const key = echoKey(this.text)
      if (key.length >= 4 && echoKey(`${state.text} ${output?.text ?? ''}`).includes(key)) {
        clearTimeout(this.takeover)
        this.takeover = undefined
        if (final) {
          this.reset()
        }
        return
      }
      if (intent === 'backchannel') {
        clearTimeout(this.takeover)
        this.takeover = undefined
        if (final) {
          if (state.question && output) {
            state.deferred = this.text
          } else if (state.question) {
            this.commit(this.text)
          } else {
            this.reset()
          }
        }
        return
      }
      if (!final && compact(this.text).length >= 4 && !this.takeover) {
        this.takeover = setTimeout(() => {
          this.takeover = undefined
          this.promote()
        }, 180)
      }
      if (final) {
        this.promote()
      }
    }
    if (final) {
      this.commit(this.text)
    }
  }

  outputEnded(): void {
    const deferred = this.overlap?.deferred
    if (deferred) {
      this.commit(deferred)
    }
  }

  private promote(): void {
    clearTimeout(this.takeover)
    this.takeover = undefined
    if (this.overlap?.promoted) {
      return
    }
    if (this.overlap) {
      this.overlap.promoted = true
    }
    this.callbacks.interrupt()
  }

  private commit(text: string): void {
    clearTimeout(this.takeover)
    clearTimeout(this.settlement)
    this.overlap = null
    this.takeover = undefined
    this.committed = [this.committed, text].filter(Boolean).join(' ')
    this.text = ''
    const incomplete =
      /(?:그리고|그런데|그래서|그러니까|일단|그게|어|음|는데|지만|거든)[\s,.…]*$/u.test(text)
    this.settlement = setTimeout(
      () => {
        const words = this.committed
        this.reset()
        if (words) {
          this.callbacks.utterance(words)
        }
      },
      incomplete ? 900 : 250
    )
  }

  reset(): void {
    clearTimeout(this.takeover)
    clearTimeout(this.settlement)
    this.takeover = undefined
    this.settlement = undefined
    this.overlap = null
    this.text = ''
    this.committed = ''
  }

  close(): void {
    this.reset()
    this.closed = true
  }
}
