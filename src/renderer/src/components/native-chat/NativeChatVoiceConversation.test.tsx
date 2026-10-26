// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatStructuredComposerTransport } from './native-chat-composer-types'
import {
  NativeChatVoiceConversation,
  type NativeChatVoiceConversationProps
} from './NativeChatVoiceConversation'

const fake = vi.hoisted(() => ({
  input: {
    inputRef: { current: null },
    draft: '',
    partial: '',
    owned: false,
    state: 'idle',
    ready: true,
    error: '',
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
    setDraft: vi.fn()
  },
  playback: {
    speaking: false,
    pending: false,
    caption: '',
    available: true,
    error: false,
    stop: vi.fn(),
    restart: vi.fn()
  },
  capture: { onTranscript: (_text: string, _final: boolean) => {}, onCaptureEnded: () => {} }
}))
vi.mock('./use-native-chat-voice-input', () => ({
  useNativeChatVoiceInput: (args: typeof fake.capture) => {
    fake.capture = args
    return fake.input
  }
}))
vi.mock('./use-native-chat-voice-playback', () => ({
  useNativeChatVoicePlayback: () => fake.playback
}))
vi.mock('./native-chat-structured-user-action', () => ({
  completeNativeChatStructuredUserAction: vi.fn()
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, text: string) => text }))
vi.mock('@/store', () => ({
  useAppStore: (select: (s: unknown) => unknown) => select({ dictationState: 'idle', settings: {} })
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  Object.assign(fake.input, {
    draft: '',
    partial: '',
    owned: false,
    state: 'idle',
    ready: true,
    error: ''
  })
  Object.assign(fake.playback, { speaking: false, pending: false, error: false, available: true })
  fake.input.start.mockImplementation(() => {
    fake.input.owned = true
    fake.input.state = 'listening'
    return true
  })
  fake.input.setDraft.mockImplementation((text: string) => {
    fake.input.draft = text
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function setup(outcome: 'recorded' | 'unconfirmed' = 'recorded') {
  const send = vi.fn<NativeChatStructuredComposerTransport['send']>(
    (_text, _attachments, request) => {
      request?.onSettled?.(outcome)
      return true
    }
  )
  const props: NativeChatVoiceConversationProps = {
    active: true,
    blocked: false,
    working: false,
    messages: [],
    onStopAgent: vi.fn(),
    transport: {
      send,
      capturePresentation: () => () => true,
      dispatchCommand: async () => {
        throw new Error('No commands in this test')
      },
      optionsSurface: {
        getSnapshot: () => [],
        setOption: async () => ({ snapshot: [] }),
        invokeAction: async () => ({ snapshot: [] }),
        subscribe: () => () => {}
      },
      optionSnapshot: [],
      onError: () => {},
      runtime: 'local',
      sessionId: 'voice',
      runtimeEnvironmentId: null
    }
  }
  const view = render(<NativeChatVoiceConversation {...props} />)
  const update = (next: Partial<NativeChatVoiceConversationProps> = {}) => {
    Object.assign(props, next)
    view.rerender(<NativeChatVoiceConversation {...props} />)
  }
  const submit = () => {
    act(() => {
      fake.capture.onTranscript('아이디어를 비교해 줘', true)
      vi.advanceTimersByTime(250)
    })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Start voice conversation' }))
  return { ...view, props, update, submit, send }
}

describe('continuous sidebar conversation', () => {
  it('keeps the same capture through sending, tool work, playback and completion', () => {
    const { submit, update, send } = setup()
    submit()
    update({ working: true })
    fake.playback.speaking = true
    update()
    fake.playback.speaking = false
    update({ working: false, completedTurn: 'done' })
    act(() => vi.advanceTimersByTime(5000))
    expect(send).toHaveBeenCalledTimes(1)
    expect(fake.input.start).toHaveBeenCalledTimes(1)
    expect(fake.input.cancel).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'End voice conversation' })).toBeTruthy()
  })

  it('keeps acknowledgments out of the agent and waits for stop before sending a real interruption', () => {
    const { update, submit, props, send } = setup()
    submit()
    update({ working: true })
    fake.playback.speaking = true
    update()
    act(() => {
      fake.capture.onTranscript('응 그래 그렇지', false)
      fake.capture.onTranscript('응 그래 그렇지', true)
      vi.advanceTimersByTime(1000)
    })
    expect(props.onStopAgent).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(1)
    act(() => {
      fake.capture.onTranscript('잠깐 그 파일부터 고쳐줘', true)
      vi.advanceTimersByTime(250)
    })
    expect(props.onStopAgent).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledTimes(1)
    fake.playback.speaking = false
    update({ working: false, completedTurn: 'interrupted' })
    expect(send.mock.lastCall?.[0]).toBe('잠깐 그 파일부터 고쳐줘')
    expect(fake.input.start).toHaveBeenCalledTimes(1)
  })

  it('renders partial user captions and streamed assistant text while audio plays', () => {
    const { update } = setup()
    act(() => fake.capture.onTranscript('인식하는 중간 문장', false))
    expect(screen.getByText('인식하는 중간 문장')).toBeTruthy()
    fake.playback.speaking = true
    fake.playback.caption = '첫 문장'
    update({
      working: true,
      messages: [
        {
          id: 'answer',
          role: 'assistant',
          source: 'transcript',
          timestamp: 1,
          blocks: [{ type: 'text', text: '첫 문장에 이어 지금 생성되는 문장' }]
        }
      ]
    })
    expect(screen.getByText('첫 문장에 이어 지금 생성되는 문장')).toBeTruthy()
  })

  it('preserves unconfirmed words and never retries or restarts automatically', () => {
    const { submit, send } = setup('unconfirmed')
    submit()
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByRole('alert').textContent).toContain('unconfirmed')
    expect(fake.input.draft).toBe('아이디어를 비교해 줘')
    expect(send).toHaveBeenCalledTimes(1)
    expect(fake.input.start).toHaveBeenCalledTimes(1)
  })

  it('keeps the conversation alive when another window takes focus', () => {
    const { send } = setup()
    fireEvent(window, new Event('blur'))
    fireEvent(document, new Event('visibilitychange'))
    act(() => {
      fake.capture.onTranscript('계속 들어줘', true)
      vi.advanceTimersByTime(250)
    })
    expect(fake.input.cancel).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'End voice conversation' })).toBeTruthy()
  })

  it('ends only on explicit end and ignores pending or late recognition', () => {
    const { send } = setup()
    act(() => fake.capture.onTranscript('아직 보내지 않은 문장', true))
    fireEvent.click(screen.getByRole('button', { name: 'End voice conversation' }))
    act(() => {
      fake.capture.onTranscript('늦은 결과', true)
      vi.advanceTimersByTime(5000)
    })
    expect(fake.input.cancel).toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Start voice conversation' })).toBeTruthy()
  })

  it('explains an actual capture loss rather than silently returning to Start', () => {
    setup()
    act(() => fake.capture.onCaptureEnded())
    expect(screen.getByRole('alert').textContent).toContain('Microphone capture ended')
  })

  it('keeps listening after a playback error and during a temporary send block', () => {
    const { update, send } = setup()
    fake.playback.error = true
    update({ blocked: true })
    act(() => {
      fake.capture.onTranscript('계속 이야기하자', true)
      vi.advanceTimersByTime(250)
    })
    expect(screen.getByRole('alert').textContent).toContain('Listening continues')
    expect(screen.getByRole('button', { name: 'End voice conversation' })).toBeTruthy()
    expect(fake.input.cancel).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    update({ blocked: false })
    expect(send.mock.lastCall?.[0]).toBe('계속 이야기하자')
  })
})
