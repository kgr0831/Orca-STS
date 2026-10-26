import { NativeChatVoiceConversation } from './NativeChatVoiceConversation'
import { NativeChatVoiceSettings } from './NativeChatVoiceSettings'
import { useNativeChatVoicePreset } from './use-native-chat-voice-preset'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { NativeChatWorkModePicker } from './NativeChatWorkModePicker'
import { useNativeChatWorkMode } from './use-native-chat-work-mode'
import type { useNativeChatInstallSlot } from './NativeChatInstallSlot'
import type { useStructuredAgentSession } from './use-structured-agent-session'
import type { nativeChatStructuredStopControls } from './native-chat-structured-stop-controls'
import type { NativeChatStructuredComposerTransport } from './native-chat-composer-types'

export function NativeChatVoiceSession({
  controller,
  transport,
  stopControls,
  composerShown,
  install,
  hostHeld,
  isVisible
}: {
  controller: Pick<
    ReturnType<typeof useStructuredAgentSession>,
    'status' | 'messages' | 'isWorking' | 'latestTurn'
  >
  transport: NativeChatStructuredComposerTransport
  stopControls: ReturnType<typeof nativeChatStructuredStopControls>
  composerShown: boolean
  install: ReturnType<typeof useNativeChatInstallSlot>
  hostHeld: boolean
  isVisible: boolean
}): React.JSX.Element {
  const workMode = useNativeChatWorkMode(transport, true, 'brainstorm')
  const voice = useAppStore((store) => store.settings?.voice)
  const preset = useNativeChatVoicePreset(
    transport,
    isVisible && composerShown,
    controller.isWorking
  )
  return (
    <div className="scrollbar-sleek flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
      <NativeChatVoiceSettings voice={voice} transport={transport} working={controller.isWorking} />
      {preset.pending || preset.failed ? (
        <p
          role={preset.failed ? 'alert' : 'status'}
          className="px-3 py-2 text-xs text-chat-foreground-faint"
        >
          {preset.failed
            ? translate(
                'stsLive.presetFailed',
                'Could not apply the fast voice model. Choose a model and low reasoning above.'
              )
            : translate('stsLive.presetPending', 'Preparing the fast voice model…')}
        </p>
      ) : null}
      <NativeChatVoiceConversation
        active={isVisible}
        blocked={
          preset.pending ||
          !composerShown ||
          Boolean(install.unavailableHint) ||
          stopControls.stopping ||
          hostHeld ||
          controller.status === 'idle' ||
          controller.status === 'loading' ||
          controller.status === 'error'
        }
        working={controller.isWorking}
        messages={controller.messages}
        transport={workMode.transport}
        completedTurn={
          controller.latestTurn?.turn.state === 'completed'
            ? controller.latestTurn.itemId
            : undefined
        }
        onStopAgent={() => stopControls.composer.onStop?.()}
      />
      <NativeChatWorkModePicker
        mode={workMode.mode}
        onChange={workMode.setMode}
        delegation={workMode.delegation}
      />
    </div>
  )
}
