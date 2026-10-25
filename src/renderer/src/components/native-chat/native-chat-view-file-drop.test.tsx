// @vitest-environment happy-dom

import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { WORKSPACE_FILE_PATH_MIME } from '@/lib/workspace-file-drag'
import NativeChatView from './NativeChatView'
import { useNativeChatPaneFileDropClaim } from './NativeChatPaneFileDropSurface'
import { useVoiceSidebarSessions } from '@/store/voice-sidebar-state'
import type { NativeChatStructuredViewProps } from './native-chat-view-types'

const drop = vi.hoisted(() => ({ onDrop: vi.fn() }))

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('./NativeChatSessionGate', () => ({ NativeChatSessionGate: () => null }))
vi.mock('./NativeChatResolvedView', () => ({ NativeChatResolvedView: () => null }))
vi.mock('./use-native-chat-status-entry', () => ({ useNativeChatStatusEntry: vi.fn() }))
vi.mock('./NativeChatStructuredSession', () => ({
  NativeChatStructuredSession: () => {
    useNativeChatPaneFileDropClaim({
      destinationKey: 'structured:session',
      captureExternalDrop: () => async () => {},
      disabled: false,
      onDragOverCapture: (event) => event.preventDefault(),
      onDropCapture: drop.onDrop
    })
    return <div data-testid="transcript">Conversation above the composer</div>
  }
}))

afterEach(() => {
  cleanup()
  useVoiceSidebarSessions.setState({ mountedTabId: null })
})

it('owns pane drops for standalone structured sessions without a terminal portal', () => {
  const { container } = render(
    <NativeChatView
      mode="structured"
      tabId="structured-tab"
      sessionId="session"
      agent="codex"
      target={{ kind: 'local' }}
      isVisible
      isFocusedGroup
    />
  )
  const transcript = screen.getByTestId('transcript')
  const dataTransfer = { types: [WORKSPACE_FILE_PATH_MIME] }

  fireEvent.dragOver(transcript, { dataTransfer })
  expect(container.querySelector('[data-native-chat-drop-overlay]')).not.toBeNull()
  expect(transcript.closest('[data-os-file-drop-owner]')).not.toBeNull()

  fireEvent.drop(transcript, { dataTransfer })
  expect(drop.onDrop).toHaveBeenCalledTimes(1)
  expect(container.querySelector('[data-native-chat-drop-overlay]')).toBeNull()
})

it('gives the sidebar exclusive ownership of its chat and restores the full tab when it closes', () => {
  const props: NativeChatStructuredViewProps = {
    mode: 'structured',
    tabId: 'voice-tab',
    sessionId: 'voice-session',
    agent: 'codex',
    target: { kind: 'local' },
    isVisible: true,
    isFocusedGroup: true
  }
  const view = render(<NativeChatView {...props} />)
  expect(screen.queryByTestId('transcript')).not.toBeNull()
  act(() => useVoiceSidebarSessions.setState({ mountedTabId: props.tabId }))
  expect(screen.queryByTestId('transcript')).toBeNull()
  const sidebarProps: NativeChatStructuredViewProps = { ...props, presentation: 'voice-sidebar' }
  view.rerender(<NativeChatView {...sidebarProps} />)
  expect(screen.queryByTestId('transcript')).not.toBeNull()
  view.rerender(<NativeChatView {...props} />)
  expect(screen.queryByTestId('transcript')).toBeNull()
  act(() => useVoiceSidebarSessions.setState({ mountedTabId: null }))
  expect(screen.queryByTestId('transcript')).not.toBeNull()
})
