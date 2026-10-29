// @vitest-environment happy-dom
import { useEffect, type ReactNode } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useVoiceSidebarSessions } from '@/store/voice-sidebar-state'
import type { TerminalPaneController } from './use-terminal-pane-controller'
import { TerminalPaneVoicePortal } from './TerminalPaneVoicePortal'
import type { NativeChatPaneResolution } from '../native-chat/native-chat-pane-resolution'

const fake = vi.hoisted(() => ({ shell: false, mounted: vi.fn(), unmounted: vi.fn() }))
vi.mock('@/store', () => ({
  useAppStore: (select: (state: unknown) => unknown) =>
    select({
      agentStatusByPaneKey: {
        'tab:11111111-1111-4111-8111-111111111111': {
          agentType: 'codex',
          providerSession: { id: 'existing-left' }
        },
        'tab:22222222-2222-4222-8222-222222222222': {
          agentType: 'codex',
          providerSession: { id: 'existing-right' }
        }
      },
      paneForegroundAgentByPaneKey: {
        'tab:11111111-1111-4111-8111-111111111111': { shellForeground: fake.shell }
      }
    })
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, text: string) => text }))
vi.mock('../native-chat/use-native-chat-file-link-existence', () => ({
  NativeChatFileLinkExistenceProvider: ({ children }: { children: ReactNode }) => children
}))
vi.mock('../native-chat/native-chat-markdown-image-owner', () => ({
  NativeChatMarkdownImageOwnerProvider: ({ children }: { children: ReactNode }) => children
}))
vi.mock('../native-chat/TerminalVoiceSession', () => ({
  TerminalVoiceSession: ({ resolution }: { resolution: NativeChatPaneResolution }) => {
    useEffect(() => {
      fake.mounted()
      return () => fake.unmounted()
    }, [])
    return (
      <p>
        {resolution.paneKey}:{resolution.sessionId}:{resolution.ptyId}
      </p>
    )
  }
}))

beforeEach(() => {
  fake.shell = false
  vi.clearAllMocks()
  const container = document.createElement('div')
  document.body.appendChild(container)
  useVoiceSidebarSessions.setState({ portal: { tabId: 'tab', container } })
})
afterEach(() => {
  cleanup()
  useVoiceSidebarSessions.getState().portal?.container.remove()
  useVoiceSidebarSessions.setState({ portal: null })
})

function controller(leafId = 'left'): TerminalPaneController {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this fixture supplies every field read by the portal; its mocked child does not access the terminal.
  return {
    tabId: 'tab',
    activePane: {
      id: leafId === 'left' ? 1 : 2,
      leafId:
        leafId === 'left'
          ? '11111111-1111-4111-8111-111111111111'
          : '22222222-2222-4222-8222-222222222222',
      terminal: {}
    },
    activeAgentId: 'codex',
    isActive: true,
    isRendererVisible: true,
    effectiveChatViewMode: false,
    isChatEligibleForLeaf: () => true,
    paneTransportsRef: {
      current: new Map([
        [1, { getPtyId: () => 'pty-left' }],
        [2, { getPtyId: () => 'pty-right' }]
      ])
    }
  } as unknown as TerminalPaneController
}

it('keeps the same voice session when the existing terminal switches text presentation', () => {
  const current = controller()
  const view = render(<TerminalPaneVoicePortal controller={current} />)
  expect(
    screen.getByText('tab:11111111-1111-4111-8111-111111111111:existing-left:pty-left')
  ).toBeTruthy()
  current.effectiveChatViewMode = true
  view.rerender(<TerminalPaneVoicePortal controller={current} />)
  current.effectiveChatViewMode = false
  view.rerender(<TerminalPaneVoicePortal controller={current} />)
  expect(fake.mounted).toHaveBeenCalledOnce()
  expect(fake.unmounted).not.toHaveBeenCalled()
})

it('follows the exact selected split and releases capture when its tab is no longer selected', () => {
  const view = render(<TerminalPaneVoicePortal controller={controller()} />)
  view.rerender(<TerminalPaneVoicePortal controller={controller('right')} />)
  expect(
    screen.getByText('tab:22222222-2222-4222-8222-222222222222:existing-right:pty-right')
  ).toBeTruthy()
  expect(fake.unmounted).toHaveBeenCalledOnce()
  act(() => useVoiceSidebarSessions.setState({ portal: null }))
  expect(fake.unmounted).toHaveBeenCalledTimes(2)
})

it('does not reuse stale Codex metadata after the terminal returns to a shell', () => {
  const view = render(<TerminalPaneVoicePortal controller={controller()} />)
  fake.shell = true
  view.rerender(<TerminalPaneVoicePortal controller={controller()} />)
  expect(screen.getByRole('status').textContent).toContain('Start or resume Codex')
  expect(fake.unmounted).toHaveBeenCalledOnce()
})
