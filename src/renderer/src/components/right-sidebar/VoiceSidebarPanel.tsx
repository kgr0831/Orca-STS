import { useEffect } from 'react'
import { AudioLines, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import NativeChatView from '@/components/native-chat/NativeChatView'
import { useNativeChatTabOwnerWorktreeId } from '@/components/native-chat/use-native-chat-tab-owner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { openVoiceSidebarSession, useVoiceSidebarWorkspace } from '@/store/voice-sidebar-session'
import { useVoiceSidebarSessions } from '@/store/voice-sidebar-state'
import { structuredAgentSessionTargetForHost } from '@/runtime/structured-agent-session-owner'

export default function VoiceSidebarPanel(): React.JSX.Element {
  const workspace = useVoiceSidebarWorkspace()
  return <VoiceWorkspacePanel key={workspace.key ?? 'none'} workspace={workspace} />
}

function VoiceWorkspacePanel({
  workspace
}: {
  workspace: ReturnType<typeof useVoiceSidebarWorkspace>
}): React.JSX.Element {
  const { worktreeId, executionHostId, key: workspaceKey, entry } = workspace
  const session = entry?.status === 'ready' ? entry.session : null
  const owner = useNativeChatTabOwnerWorktreeId(session?.tabId ?? '')
  const target = structuredAgentSessionTargetForHost(executionHostId)
  useEffect(() => {
    if (workspaceKey && worktreeId && executionHostId && !entry) {
      void openVoiceSidebarSession(workspaceKey, worktreeId, executionHostId)
    }
  }, [workspaceKey, worktreeId, executionHostId, entry])
  useEffect(() => {
    if (!session || !owner) {
      return
    }
    useVoiceSidebarSessions.setState({ mountedTabId: session.tabId })
    return () => {
      useVoiceSidebarSessions.setState({ mountedTabId: null })
    }
  }, [session, owner])
  const reopen = () => {
    if (!workspaceKey || !worktreeId || !executionHostId) {
      return
    }
    useVoiceSidebarSessions.setState((s) => ({
      entries: { ...s.entries, [workspaceKey]: { status: 'failed' } }
    }))
    void openVoiceSidebarSession(workspaceKey, worktreeId, executionHostId)
  }
  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col"
      aria-label={translate('stsVoice.open', 'Voice conversation')}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <AudioLines className="size-4 shrink-0" aria-hidden />
        <h2 className="flex-1 text-sm font-medium">
          {translate('stsVoice.open', 'Voice conversation')}
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={translate('stsVoice.settings', 'Voice settings')}
          onClick={() => {
            useAppStore.getState().openSettingsTarget({ pane: 'voice', repoId: null })
            useAppStore.getState().openSettingsPage()
          }}
        >
          <Settings2 className="size-4" />
        </Button>
      </header>
      {session && owner && target ? (
        <NativeChatView
          mode="structured"
          presentation="voice-sidebar"
          tabId={session.tabId}
          sessionId={session.sessionId}
          target={target}
          agent="codex"
          isVisible
          isFocusedGroup={false}
        />
      ) : (
        <div className="space-y-3 p-3 text-sm">
          <p role="status">
            {!worktreeId || !target
              ? translate(
                  'stsLive.chooseWorkspace',
                  'Select a workspace with a connected Codex host.'
                )
              : entry?.status === 'failed' || session
                ? translate(
                    'stsLive.sessionClosed',
                    'The voice chat is unavailable. Open a new conversation to continue.'
                  )
                : translate('stsLive.opening', 'Preparing your voice conversation…')}
          </p>
          {worktreeId && target && (entry?.status === 'failed' || session) ? (
            <Button variant="outline" size="sm" onClick={reopen}>
              {translate('stsLive.newConversation', 'New voice conversation')}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  )
}
