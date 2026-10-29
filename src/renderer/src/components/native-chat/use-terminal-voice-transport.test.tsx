// @vitest-environment happy-dom
import { Terminal } from '@xterm/headless'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useTerminalVoiceTransport } from './use-terminal-voice-transport'
import { cancelNativeChatPtySends } from './native-chat-pty-send-queue'
import {
  resetNativeChatPtySendQueuesForTests,
  sendNativeChatMessage
} from './native-chat-runtime-send'

const writes = vi.hoisted(() => ({
  verified: vi.fn(async (_ptyId: string, _data: string) => true),
  raw: vi.fn()
}))
vi.mock('@/runtime/runtime-terminal-verified-input', () => ({
  sendRuntimePtyInputVerified: writes.verified
}))
vi.mock('@/runtime/runtime-terminal-inspection', () => ({ sendRuntimePtyInput: writes.raw }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, text: string) => text }))
vi.mock('@/lib/native-chat-telemetry', () => ({ emitNativeChatMessageSent: vi.fn() }))
vi.mock('./native-chat-composer-target', () => ({ nativeChatComposerTargetIsRemote: () => false }))

let terminal: Terminal
beforeEach(async () => {
  vi.clearAllMocks()
  writes.verified.mockResolvedValue(true)
  terminal = new Terminal({ cols: 80, rows: 12, allowProposedApi: true })
  await new Promise<void>((resolve) => terminal.write('\x1b[?2004h\x1b[7;1H› ', resolve))
})
afterEach(() => {
  cleanup()
  resetNativeChatPtySendQueuesForTests()
  terminal.dispose()
})

it('delivers successive spoken turns through the same terminal with acknowledged writes', async () => {
  const hook = renderHook(() =>
    useTerminalVoiceTransport({ terminal, ptyId: 'existing-pty', allowed: true })
  )
  const settled = vi.fn()
  await act(async () => {
    expect(hook.result.current.send('First spoken turn', [], { onSettled: settled })).toBe(true)
    await vi.waitFor(() => expect(settled).toHaveBeenCalledWith('recorded'))
  })
  await act(async () => {
    expect(hook.result.current.send('Back to voice', [], { onSettled: settled })).toBe(true)
    await vi.waitFor(() => expect(settled).toHaveBeenCalledTimes(2))
  })
  expect(writes.verified.mock.calls.every((call) => call[0] === 'existing-pty')).toBe(true)
  expect(writes.raw).not.toHaveBeenCalled()
})

it('keeps typed input and declines voice delivery while it is present', async () => {
  await new Promise<void>((resolve) => terminal.write('Unsent draft', resolve))
  const hook = renderHook(() =>
    useTerminalVoiceTransport({ terminal, ptyId: 'existing-pty', allowed: true })
  )
  expect(hook.result.current.send('Voice', [])).toBe(false)
  expect(writes.verified).not.toHaveBeenCalled()
  expect(writes.raw).not.toHaveBeenCalled()
})

it('cancels delayed Enter when the user resumes typing', async () => {
  const hook = renderHook(() =>
    useTerminalVoiceTransport({ terminal, ptyId: 'existing-pty', allowed: true })
  )
  const settled = vi.fn()
  await act(async () => {
    hook.result.current.send('Voice', [], { onSettled: settled })
    await Promise.resolve()
    terminal.input('typed')
  })
  expect(settled).toHaveBeenCalledWith('unconfirmed')
  expect(writes.verified).toHaveBeenCalledTimes(1)
  expect(writes.raw).not.toHaveBeenCalled()
})

it('rechecks the composer when another queued terminal send finishes', async () => {
  let acknowledge: (accepted: boolean) => void = () => {}
  writes.verified.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        acknowledge = resolve
      })
  )
  sendNativeChatMessage('existing-pty', 'Earlier input', {
    clearInput: '',
    onDeliverySettled: vi.fn()
  })
  const hook = renderHook(() =>
    useTerminalVoiceTransport({ terminal, ptyId: 'existing-pty', allowed: true })
  )
  const settled = vi.fn()
  await act(async () => {
    expect(hook.result.current.send('Voice', [], { onSettled: settled })).toBe(true)
    await new Promise<void>((resolve) => terminal.write('New draft', resolve))
    acknowledge(true)
    await vi.waitFor(() => expect(settled).toHaveBeenCalledWith('returned'))
  })
  expect(writes.verified.mock.calls.some((call) => call[1].includes('Voice'))).toBe(false)
  expect(writes.raw).not.toHaveBeenCalled()
})

it('never submits after a lost body acknowledgment or writes to a replacement terminal', async () => {
  writes.verified.mockRejectedValueOnce(new Error('ack lost'))
  const hook = renderHook(
    ({ ptyId }) => useTerminalVoiceTransport({ terminal, ptyId, allowed: true }),
    { initialProps: { ptyId: 'original' } }
  )
  const settled = vi.fn()
  await act(async () => {
    hook.result.current.send('Voice', [], { onSettled: settled })
    await vi.waitFor(() => expect(settled).toHaveBeenCalledWith('unconfirmed'))
  })
  expect(writes.verified).toHaveBeenCalledTimes(1)
  act(() => {
    hook.result.current.send('Another turn', [])
    hook.rerender({ ptyId: 'replacement' })
  })
  expect(writes.verified.mock.calls.every((call) => call[0] === 'original')).toBe(true)
  expect(writes.raw).not.toHaveBeenCalled()
})

it('releases a canceled send when another terminal control takes over the shared queue', async () => {
  const hook = renderHook(() =>
    useTerminalVoiceTransport({ terminal, ptyId: 'existing-pty', allowed: true })
  )
  const settled = vi.fn()
  await act(async () => {
    hook.result.current.send('Voice', [], { onSettled: settled })
    cancelNativeChatPtySends('existing-pty')
    await vi.waitFor(() => expect(settled).toHaveBeenCalledWith('unconfirmed'))
  })
  expect(hook.result.current.sendOut).toBe(false)
  expect(writes.verified).toHaveBeenCalledTimes(1)
  expect(writes.raw).not.toHaveBeenCalled()
})
