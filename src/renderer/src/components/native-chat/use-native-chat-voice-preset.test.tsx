// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { NativeChatStructuredComposerTransport } from './native-chat-composer-types'
import type { SessionOptionSetResult } from '../../../../shared/native-chat-session-options'
import { useNativeChatVoicePreset } from './use-native-chat-voice-preset'

function fixture(models = ['gpt-6-astra', 'gpt-6-luna', 'gpt-6.1-sol']) {
  const setOption = vi.fn(
    async (id: string, value: string | boolean): Promise<SessionOptionSetResult> => ({
      snapshot: [
        {
          id,
          category: id === 'model' ? 'model' : 'thought_level',
          label: id,
          transport: 'agent-session',
          valueSource: 'reported',
          settable: true,
          kind: { type: 'select', currentValue: String(value), choices: [] }
        }
      ]
    })
  )
  const transport: NativeChatStructuredComposerTransport = {
    sessionId: 'voice-a',
    runtime: 'local',
    runtimeEnvironmentId: null,
    capturePresentation: () => () => true,
    send: () => false,
    dispatchCommand: async () => {
      throw new Error('unused')
    },
    onError: vi.fn(),
    optionSnapshot: [
      {
        id: 'model',
        category: 'model',
        label: 'Model',
        transport: 'agent-session',
        valueSource: 'reported',
        settable: true,
        kind: {
          type: 'select',
          currentValue: 'gpt-6-astra',
          choices: models.map((value) => ({ value, label: value }))
        }
      }
    ],
    optionsSurface: {
      setOption,
      getSnapshot: () => [],
      subscribe: () => () => {},
      invokeAction: async () => ({ snapshot: [] }),
      demandModelCatalog: vi.fn()
    }
  }
  return { setOption, transport }
}

it('sets fast conversation defaults for each new voice session without resending them every render', async () => {
  const f = fixture()
  const { result, rerender } = renderHook(
    ({ id }) => useNativeChatVoicePreset({ ...f.transport, sessionId: id }, true, false),
    { initialProps: { id: 'voice-a' } }
  )
  expect(result.current.pending).toBe(true)
  await waitFor(() => expect(result.current.pending).toBe(false))
  expect(f.setOption.mock.calls).toEqual([
    ['model', 'gpt-6-luna'],
    ['effort', 'low']
  ])
  rerender({ id: 'voice-a' })
  expect(f.setOption).toHaveBeenCalledTimes(2)
  rerender({ id: 'voice-b' })
  await waitFor(() => expect(f.setOption).toHaveBeenCalledTimes(4))
})

it('uses Sol when Luna is unavailable and waits for the current turn before setting options', async () => {
  const f = fixture(['gpt-6.1-sol', 'gpt-6-astra'])
  const { rerender, result } = renderHook(
    ({ working }) => useNativeChatVoicePreset(f.transport, true, working),
    { initialProps: { working: true } }
  )
  expect(f.setOption).not.toHaveBeenCalled()
  rerender({ working: false })
  await waitFor(() => expect(result.current.pending).toBe(false))
  expect(f.setOption.mock.calls).toEqual([
    ['model', 'gpt-6.1-sol'],
    ['effort', 'low']
  ])
})

it('reports an option failure without looping or starting agent work', async () => {
  const f = fixture()
  f.setOption.mockRejectedValueOnce(new Error('unavailable'))
  const { result, rerender } = renderHook(() => useNativeChatVoicePreset(f.transport, true, false))
  await act(async () => {})
  expect(result.current.failed).toBe(true)
  expect(result.current.pending).toBe(false)
  rerender()
  expect(f.setOption).toHaveBeenCalledOnce()
})

it('reports a refused write even when the option surface resolves normally', async () => {
  const f = fixture()
  f.setOption.mockResolvedValueOnce({ snapshot: f.transport.optionSnapshot })
  const { result } = renderHook(() => useNativeChatVoicePreset(f.transport, true, false))
  await waitFor(() => expect(result.current.failed).toBe(true))
  expect(result.current.pending).toBe(false)
  expect(f.setOption).toHaveBeenCalledOnce()
})
