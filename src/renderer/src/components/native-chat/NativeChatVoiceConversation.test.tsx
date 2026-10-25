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
  capture: { onReady: (_text: string) => {} }
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
    fake.input.owned = false
    fake.input.state = 'idle'
    fake.input.draft = '아이디어를 비교해 줘'
    act(() => fake.capture.onReady(fake.input.draft))
  }
  fireEvent.click(screen.getByRole('button', { name: 'Start voice conversation' }))
  return { ...view, props, update, submit, send }
}

describe('continuous sidebar conversation', () => {
  it('rearms after a completed tool-only turn even without a visible working frame', () => {
    const { submit, update } = setup()
    submit()
    update({ completedTurn: 'completed-tool-turn' })
    act(() => vi.advanceTimersByTime(500))
    expect(fake.input.start).toHaveBeenCalledTimes(2)
  })
  it('waits for a reply and its audio, then rearms even when a fast turn never renders working', () => {
    const { update, submit, send } = setup()
    submit()
    act(() => vi.advanceTimersByTime(2000))
    expect(send).toHaveBeenCalledTimes(1)
    expect(fake.input.start).toHaveBeenCalledTimes(1)
    fake.playback.pending = true
    update({
      messages: [
        {
          id: 'answer',
          role: 'assistant',
          source: 'transcript',
          timestamp: 1,
          blocks: [{ type: 'text', text: '두 가지 방향이 있어요.' }]
        }
      ]
    })
    act(() => vi.advanceTimersByTime(1000))
    expect(fake.input.start).toHaveBeenCalledTimes(1)
    fake.playback.pending = false
    fake.playback.speaking = true
    update()
    act(() => vi.advanceTimersByTime(1000))
    expect(fake.input.start).toHaveBeenCalledTimes(1)
    fake.playback.speaking = false
    update()
    act(() => vi.advanceTimersByTime(500))
    expect(fake.input.start).toHaveBeenCalledTimes(2)
  })

  it('waits for agent stop before listening after an interruption', () => {
    const { update, submit, props } = setup()
    submit()
    update({ working: true })
    fireEvent.click(screen.getByRole('button', { name: 'Interrupt and speak' }))
    expect(props.onStopAgent).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(1000))
    expect(fake.input.start).toHaveBeenCalledTimes(1)
    update({ working: false })
    act(() => vi.advanceTimersByTime(500))
    expect(fake.input.start).toHaveBeenCalledTimes(2)
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

  it('ends the loop on blur and ignores a late final result', () => {
    const { send } = setup()
    fireEvent(window, new Event('blur'))
    act(() => fake.capture.onReady('late words'))
    act(() => vi.advanceTimersByTime(1000))
    expect(fake.input.cancel).toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(fake.input.start).toHaveBeenCalledTimes(1)
  })
})
