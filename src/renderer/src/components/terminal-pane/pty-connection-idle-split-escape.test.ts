import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindPtyConnectionTestMocks } from './pty-connection-mocks.spec'
import { advancePartialEscapeTail } from '../../../../shared/terminal-partial-escape-tail'
import { flushAsyncTicks, renderHeadlessBuffer } from './pty-connection-test-async'
import { connectMockPanePty } from './pty-connection-test-connect-mock-pane'
import { buildPaneConnectionDeps } from './pty-connection-test-deps'
import {
  installTerminalTestGlobals,
  restoreTerminalTestGlobals
} from './pty-connection-test-environment'
import {
  createManager,
  createMockTransport,
  createPane,
  type ConnectCallbacks,
  type MockTransport
} from './pty-connection-test-pane-fixtures'
import { createInitialStoreState } from './pty-connection-test-store-fixtures'
import type { StoreState } from './pty-connection-test-store-state'

describe('idle cursor reset during a split escape', () => {
  let state: StoreState
  let transports: MockTransport[]
  let options: Record<string, unknown>[]
  let subscribers: ((state: StoreState) => void)[]

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    transports = []
    options = []
    subscribers = []
    state = createInitialStoreState(() => state)
    bindPtyConnectionTestMocks({
      getState: () => state,
      getTransportQueue: () => transports,
      getTransportOptions: () => options,
      getStoreSubscribers: () => subscribers,
      setStoreSubscribers: (value) => {
        subscribers = value
      }
    })
    await installTerminalTestGlobals()
  })

  afterEach(restoreTerminalTestGlobals)

  it.each([
    ['OSC title with BEL', '\x1b]0;사', '례와 연구 | workspace\x07'],
    ['OSC title with ST', '\x1b]2;사', '례와 연구 | workspace\x1b\\'],
    ['CSI rendition', '\x1b[38;2;', '255;255;255m']
  ])('does not print the remainder of %s into the prompt', async (_name, prefix, suffix) => {
    let pending = ''
    const callbacks: { current: ConnectCallbacks } = { current: {} }
    const transport = {
      ...createMockTransport(),
      getPendingEscapeTailAnsi: () => pending
    }
    transport.connect.mockImplementation(async (args: { callbacks?: ConnectCallbacks }) => {
      callbacks.current = args.callbacks ?? {}
      return 'pty-id'
    })
    transports.push(transport)
    const pane = createPane(1)
    const binding = await connectMockPanePty(
      pane,
      createManager(1),
      buildPaneConnectionDeps(() => state)
    )
    await flushAsyncTicks(6)
    const onIdle = options[0]?.onAgentBecameIdle
    if (typeof onIdle !== 'function' || !callbacks.current.onData) {
      throw new Error('Expected connected data and idle handlers')
    }
    const emit = (data: string): void => {
      pending = advancePartialEscapeTail(pending, data)
      callbacks.current.onData?.(data)
    }
    pane.terminal.write.mockClear()
    emit(`> ${prefix}`)
    onIdle('* Codex done')
    emit(suffix)
    await new Promise((resolve) => setTimeout(resolve, 60))
    const writes = pane.terminal.write.mock.calls.map(([data]) =>
      typeof data === 'string' ? data : new TextDecoder().decode(data)
    )
    try {
      expect(await renderHeadlessBuffer(writes)).toEqual(
        await renderHeadlessBuffer([`> ${prefix}`, suffix])
      )
    } finally {
      binding.dispose()
    }
  })
})
