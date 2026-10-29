import { useMemo } from 'react'
import type { Terminal } from '@xterm/xterm'
import { useAppStore } from '@/store'
import { NativeChatVoiceConversation } from './NativeChatVoiceConversation'
import { NativeChatVoiceLayout } from './NativeChatVoiceLayout'
import { NativeChatVoiceSettings } from './NativeChatVoiceSettings'
import { NativeChatMessageList } from './NativeChatMessageList'
import { useNativeChatRetainedSession } from './use-native-chat-retained-session'
import { createNativeChatRuntimeSelector } from './native-chat-runtime-owner'
import { useNativeChatCanSend } from './use-native-chat-can-send'
import { useNativeChatInteractiveSend } from './use-native-chat-interactive-send'
import { useTerminalVoiceTransport } from './use-terminal-voice-transport'
import { useNativeChatImageRuntimeContext } from './native-chat-image-runtime-context'
import type { NativeChatPaneResolution } from './native-chat-pane-resolution'

export function TerminalVoiceSession({
  tabId,
  terminal,
  resolution
}: {
  tabId: string
  terminal: Terminal
  resolution: NativeChatPaneResolution
}): React.JSX.Element {
  const selectOwner = useMemo(() => createNativeChatRuntimeSelector(tabId), [tabId])
  const runtimeEnvironmentId = useAppStore(selectOwner)
  const voice = useAppStore((state) => state.settings?.voice)
  const session = useNativeChatRetainedSession({ ...resolution, runtimeEnvironmentId })
  const canSend = useNativeChatCanSend(resolution.ptyId)
  const controls = useNativeChatInteractiveSend(resolution.paneKey, resolution.ptyId, 'codex')
  const working = session.status === 'working'
  const allowed = canSend && !session.hookAwaitingInput && session.readPhase === 'ready'
  const transport = useTerminalVoiceTransport({
    terminal,
    ptyId: resolution.ptyId,
    allowed: allowed && !working
  })
  const runtimeContext = useNativeChatImageRuntimeContext(tabId)
  const lastUser = session.messages.findLast((message) => message.role === 'user')
  const stateStamp = useAppStore((state) => {
    const entry = state.agentStatusByPaneKey[resolution.paneKey]
    return entry?.mainAgent?.stateStartedAt ?? entry?.stateStartedAt
  })
  return (
    <NativeChatVoiceLayout
      history={
        <NativeChatMessageList
          session={session}
          isWorking={working}
          expandSignal={false}
          runtimeContext={runtimeContext}
        />
      }
    >
      <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col overflow-y-auto">
        <NativeChatVoiceSettings voice={voice} working={working} />
        <NativeChatVoiceConversation
          active={true}
          blocked={!allowed || !resolution.ptyId}
          working={working}
          messages={session.messages}
          completedTurn={working ? undefined : `${lastUser?.id ?? ''}:${stateStamp ?? ''}`}
          transport={transport}
          onStopAgent={() => {
            if (!working || !canSend || !resolution.ptyId || session.hookAwaitingInput) {
              return false
            }
            controls.cancel()
            return true
          }}
        />
      </div>
    </NativeChatVoiceLayout>
  )
}
