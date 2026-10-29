import { createPortal } from 'react-dom'
import { useAppStore } from '@/store'
import { useVoiceSidebarSessions } from '@/store/voice-sidebar-state'
import { translate } from '@/i18n/i18n'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { resolveNativeChatSession } from '../native-chat/native-chat-pane-resolution'
import { TerminalVoiceSession } from '../native-chat/TerminalVoiceSession'
import { NativeChatFileLinkExistenceProvider } from '../native-chat/use-native-chat-file-link-existence'
import { NativeChatMarkdownImageOwnerProvider } from '../native-chat/native-chat-markdown-image-owner'
import type { TerminalPaneController } from './use-terminal-pane-controller'

export function TerminalPaneVoicePortal({
  controller
}: {
  controller: TerminalPaneController
}): React.JSX.Element | null {
  const portal = useVoiceSidebarSessions((state) => state.portal)
  if (!controller.isActive || !controller.isRendererVisible || portal?.tabId !== controller.tabId) {
    return null
  }
  return createPortal(<TerminalPaneVoiceContent controller={controller} />, portal.container)
}

function TerminalPaneVoiceContent({
  controller
}: {
  controller: TerminalPaneController
}): React.JSX.Element {
  const { activePane, activeAgentId, tabId, paneTransportsRef } = controller
  const paneKey = activePane ? makePaneKey(tabId, activePane.leafId) : ''
  const status = useAppStore((state) => state.agentStatusByPaneKey[paneKey])
  const shellForeground = useAppStore(
    (state) => state.paneForegroundAgentByPaneKey[paneKey]?.shellForeground === true
  )
  const ptyId = activePane
    ? (paneTransportsRef.current.get(activePane.id)?.getPtyId() ?? null)
    : null
  const resolution = resolveNativeChatSession({
    paneKey,
    ptyId,
    agentStatusEntry: status,
    resolvedAgent: activeAgentId === 'codex' ? 'codex' : null
  })
  const eligible =
    activePane &&
    ptyId &&
    !shellForeground &&
    status?.restoredUnconfirmed !== true &&
    activeAgentId === 'codex' &&
    resolution?.agent === 'codex' &&
    controller.isChatEligibleForLeaf(activePane.leafId)
  return eligible ? (
    <NativeChatFileLinkExistenceProvider tabId={tabId}>
      <NativeChatMarkdownImageOwnerProvider
        tabId={tabId}
        sessionId={resolution.sessionId}
        isVisible={true}
      >
        <TerminalVoiceSession
          key={`${paneKey}:${ptyId}`}
          tabId={tabId}
          terminal={activePane.terminal}
          resolution={resolution}
        />
      </NativeChatMarkdownImageOwnerProvider>
    </NativeChatFileLinkExistenceProvider>
  ) : (
    <p role="status" className="p-3 text-sm text-chat-foreground-faint">
      {translate(
        'stsHistory.terminalRequired',
        'Start or resume Codex in this terminal to continue the same conversation by voice.'
      )}
    </p>
  )
}
