// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { withStsWorkMode } from '../../../../shared/sts-work-modes'
import type { NativeChatStructuredComposerTransport } from './native-chat-composer-types'
import { useNativeChatWorkMode } from './use-native-chat-work-mode'

function transportFixture() {
  const send = vi.fn<NativeChatStructuredComposerTransport['send']>(() => 'queued')
  const transport: NativeChatStructuredComposerTransport = {
    capturePresentation: () => () => true,
    send,
    dispatchCommand: vi.fn(),
    optionsSurface: {
      getSnapshot: () => [],
      setOption: async () => ({ snapshot: [] }),
      invokeAction: async () => ({ snapshot: [] }),
      subscribe: () => () => {}
    },
    optionSnapshot: [],
    onError: vi.fn(),
    runtime: 'local',
    sessionId: 'session-a',
    runtimeEnvironmentId: null
  }
  return { send, transport }
}

describe('the Codex work mode composer', () => {
  it('leaves default messages unchanged and selecting a mode sends nothing', () => {
    const { send, transport } = transportFixture()
    const { result } = renderHook(() => useNativeChatWorkMode(transport, true))
    result.current.transport.send('원래 요청', [])
    expect(send).toHaveBeenLastCalledWith('원래 요청', [], undefined)
    send.mockClear()
    act(() => result.current.setMode('brainstorm'))
    expect(send).not.toHaveBeenCalled()
  })

  it('keeps attachment references, settlement callbacks, and queued outcomes', () => {
    const { send, transport } = transportFixture()
    const { result } = renderHook(() => useNativeChatWorkMode(transport, true))
    act(() => result.current.setMode('design'))
    const attachments = [{ id: 'image', path: '/image.png', previewUrl: 'blob:preview' }]
    const request = { callerKeepsText: true as const, onSettled: vi.fn() }
    expect(result.current.transport.send('설계해줘', attachments, request)).toBe('queued')
    expect(send).toHaveBeenCalledWith(
      withStsWorkMode('설계해줘', 'design', false, { model: null }),
      attachments,
      request
    )
    expect(result.current.transport.optionsSurface).toBe(transport.optionsSurface)
    expect(result.current.transport.dispatchCommand).toBe(transport.dispatchCommand)
  })

  it('preserves a refusal and reads the new mode on the next attempt', () => {
    const { send, transport } = transportFixture()
    send.mockReturnValue(false)
    const { result } = renderHook(() => useNativeChatWorkMode(transport, true))
    act(() => result.current.setMode('brainstorm'))
    expect(result.current.transport.send('검토해줘', [])).toBe(false)
    act(() => result.current.setMode('review'))
    expect(result.current.transport.send('검토해줘', [])).toBe(false)
    expect(send).toHaveBeenLastCalledWith(
      withStsWorkMode('검토해줘', 'review', false, { model: null }),
      [],
      undefined
    )
    act(() => result.current.setMode('default'))
    result.current.transport.send(withStsWorkMode('검토해줘', 'review'), [])
    expect(send).toHaveBeenLastCalledWith('검토해줘', [], undefined)
  })

  it('does not apply modes to other providers or change host permission gates', () => {
    const { transport } = transportFixture()
    transport.sendBlockedReason = 'Waiting for permission'
    transport.sendOut = true
    const { result } = renderHook(() => useNativeChatWorkMode(transport, false))
    act(() => result.current.setMode('implement'))
    expect(result.current.transport).toBe(transport)
    expect(result.current.transport.sendBlockedReason).toBe('Waiting for permission')
  })

  it('requests a catalog-backed specialist without changing the main model or starting work', () => {
    const { send, transport } = transportFixture()
    const demand = vi.fn()
    transport.optionsSurface.demandModelCatalog = demand
    transport.optionsSurface.setOption = vi.fn()
    transport.optionSnapshot = [
      {
        id: 'model',
        label: 'Model',
        category: 'model',
        kind: {
          type: 'select',
          currentValue: 'conversation-model',
          choices: [
            { value: 'conversation-model', label: 'Conversation' },
            { value: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' }
          ]
        },
        valueSource: 'reported',
        transport: 'agent-session',
        settable: true
      }
    ]
    const { result } = renderHook(() => useNativeChatWorkMode(transport, true))
    expect(demand).not.toHaveBeenCalled()
    act(() => result.current.setMode('brainstorm'))
    expect(demand).toHaveBeenCalledOnce()
    expect(send).not.toHaveBeenCalled()
    expect(result.current.delegation.automaticModel).toBe('gpt-6.1-sol')
    result.current.transport.send('복잡한 구조를 분석해줘', [])
    expect(send.mock.lastCall?.[0]).toContain('"model":"gpt-6.1-sol"')
    expect(transport.optionsSurface.setOption).not.toHaveBeenCalled()
  })

  it('keeps a chosen model explicit and removes MAS guidance when a failed send is retried with MAS off', () => {
    const { send, transport } = transportFixture()
    const { result } = renderHook(() => useNativeChatWorkMode(transport, true))
    act(() => {
      result.current.setMode('implement')
      result.current.delegation.onModelChange('specialist-model')
    })
    result.current.transport.send('구현해줘', [])
    const sent = send.mock.lastCall?.[0]
    expect(sent).toContain('"model":"specialist-model"')
    act(() => result.current.delegation.onEnabledChange(false))
    result.current.transport.send(sent ?? '', [])
    expect(send).toHaveBeenLastCalledWith(withStsWorkMode('구현해줘', 'implement'), [], undefined)
    result.current.transport.send('/compact', [])
    expect(send).toHaveBeenLastCalledWith('/compact', [], undefined)
  })
})
