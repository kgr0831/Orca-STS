import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { StsVoiceTurnTaking, voiceOverlapIntent, type VoiceOutput } from './sts-voice-turn-taking'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
function fixture(
  initial: VoiceOutput | null = { text: '두 가지 방법을 비교해 볼게요.', question: false }
) {
  let output = initial
  const interrupt = vi.fn(),
    utterance = vi.fn(),
    caption = vi.fn()
  const gate = new StsVoiceTurnTaking({ output: () => output, interrupt, utterance, caption })
  return {
    gate,
    interrupt,
    utterance,
    caption,
    end: () => {
      output = null
      gate.outputEnded()
    }
  }
}

it.each(['응', '네', '그래', '그렇지', '응 응 맞아', '음… 아 그렇구나', '네?'])(
  'keeps speaking through %s, including a delayed commit',
  (text) => {
    const f = fixture()
    f.gate.receive(text, false)
    vi.advanceTimersByTime(500)
    f.end()
    f.gate.receive(text, true)
    vi.advanceTimersByTime(2000)
    expect(f.interrupt).not.toHaveBeenCalled()
    expect(f.utterance).not.toHaveBeenCalled()
    f.gate.close()
  }
)

it('preserves a full sentence that grows out of a hesitation', () => {
  const f = fixture()
  f.gate.receive('어', false)
  vi.advanceTimersByTime(200)
  expect(f.interrupt).not.toHaveBeenCalled()
  f.gate.receive('어제 그 파일을', false)
  vi.advanceTimersByTime(180)
  expect(f.interrupt).toHaveBeenCalledOnce()
  f.gate.receive('어제 그 파일을 수정했는데 다시 봐줘', true)
  vi.advanceTimersByTime(250)
  expect(f.utterance).toHaveBeenCalledExactlyOnceWith('어제 그 파일을 수정했는데 다시 봐줘')
  f.gate.close()
})

it('cancels a proposed takeover when partial recognition corrects back to an acknowledgment', () => {
  const f = fixture()
  f.gate.receive('어제 파일을', false)
  f.gate.receive('응', false)
  vi.advanceTimersByTime(500)
  f.gate.receive('응', true)
  expect(f.interrupt).not.toHaveBeenCalled()
  f.gate.close()
})

it('stops immediately, consumes stop-only speech, and preserves a substantive continuation', () => {
  const f = fixture()
  f.gate.receive('잠깐', false)
  expect(f.interrupt).toHaveBeenCalledOnce()
  f.end()
  f.gate.receive('잠깐만.', true)
  vi.advanceTimersByTime(1000)
  expect(f.utterance).not.toHaveBeenCalled()
  f.gate.receive('잠깐, 그게 아니라 설정부터 봐줘', true)
  vi.advanceTimersByTime(250)
  expect(f.utterance).toHaveBeenCalledWith('잠깐, 그게 아니라 설정부터 봐줘')
  f.gate.close()
})

it.each(['왜?', '뭐?', '아니'])('does not swallow the short question or correction %s', (text) => {
  expect(voiceOverlapIntent(text)).toBe('speech')
  const f = fixture()
  f.gate.receive(text, true)
  vi.advanceTimersByTime(250)
  expect(f.utterance).toHaveBeenCalledWith(text)
  f.gate.close()
})

it('preserves yes/no answers after speech and defers answers overlapping a spoken question', () => {
  const f = fixture({ text: '진행할까요?', question: true })
  f.gate.receive('네', true)
  vi.advanceTimersByTime(1000)
  expect(f.utterance).not.toHaveBeenCalled()
  f.end()
  vi.advanceTimersByTime(250)
  expect(f.utterance).toHaveBeenCalledWith('네')
  expect(f.interrupt).not.toHaveBeenCalled()
  f.gate.receive('응', true)
  vi.advanceTimersByTime(250)
  expect(f.utterance).toHaveBeenLastCalledWith('응')
  f.gate.close()
})

it('ignores recognizable playback echo without suppressing a real correction', () => {
  const f = fixture()
  f.gate.receive('두 가지 방법을 비교해', false)
  vi.advanceTimersByTime(500)
  f.gate.receive('두 가지 방법을 비교해 볼게요.', true)
  expect(f.interrupt).not.toHaveBeenCalled()
  f.gate.receive('아니 그 방법 말고', true)
  vi.advanceTimersByTime(250)
  expect(f.utterance).toHaveBeenCalledWith('아니 그 방법 말고')
  f.gate.close()
})

it('merges resumed speech across commits, showing partial captions before sending', () => {
  const f = fixture(null)
  f.gate.receive('그 파일을 고치는데', true)
  vi.advanceTimersByTime(500)
  expect(f.utterance).not.toHaveBeenCalled()
  f.gate.receive('오류가', false)
  expect(f.caption).toHaveBeenLastCalledWith('그 파일을 고치는데 오류가')
  vi.advanceTimersByTime(1000)
  expect(f.utterance).not.toHaveBeenCalled()
  f.gate.receive('오류가 나니까 원인을 봐줘', true)
  vi.advanceTimersByTime(250)
  expect(f.utterance).toHaveBeenCalledExactlyOnceWith(
    '그 파일을 고치는데 오류가 나니까 원인을 봐줘'
  )
  f.gate.close()
})

it('explicit reset or close cancels delayed submissions and ignores late recognition', () => {
  const f = fixture(null)
  f.gate.receive('파일을 봐줘', true)
  f.gate.reset()
  vi.advanceTimersByTime(1000)
  f.gate.receive('다시 봐줘', true)
  f.gate.close()
  f.gate.receive('늦은 말', true)
  vi.advanceTimersByTime(1000)
  expect(f.utterance).not.toHaveBeenCalled()
})
