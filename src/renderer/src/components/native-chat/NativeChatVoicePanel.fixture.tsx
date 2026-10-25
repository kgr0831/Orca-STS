import { useState } from 'react'
import { defineFixture } from '../../component-fixtures/component-fixture'
import { getDefaultSettings, getDefaultVoiceSettings } from '../../../../shared/constants'
import type { VoiceSettings } from '../../../../shared/speech-types'
import type { NativeChatStructuredComposerTransport } from './native-chat-composer-types'
import { NativeChatVoicePanel } from './NativeChatVoicePanel'
import { NativeChatWorkModePicker } from './NativeChatWorkModePicker'
import { ElevenLabsVoiceSettings } from '../settings/ElevenLabsVoiceSettings'
import type { StsWorkModeId } from '../../../../shared/sts-work-modes'

const transport: NativeChatStructuredComposerTransport = {
  capturePresentation: () => () => true,
  send: () => false,
  dispatchCommand: async () => {
    throw new Error('Fixture has no agent')
  },
  optionsSurface: {
    getSnapshot: () => [],
    setOption: async () => ({ snapshot: [] }),
    invokeAction: async () => ({ snapshot: [] }),
    subscribe: () => () => {}
  },
  optionSnapshot: [],
  onError: () => {},
  runtime: 'local',
  sessionId: 'voice-fixture',
  runtimeEnvironmentId: null
}

function Conversation(): React.JSX.Element {
  const [mode, setMode] = useState<StsWorkModeId>('brainstorm')
  return (
    <div className="py-3">
      <NativeChatVoicePanel
        active
        blocked={false}
        working={false}
        messages={[
          {
            id: 'reply',
            role: 'assistant',
            source: 'transcript',
            timestamp: 1,
            blocks: [
              {
                type: 'text',
                text: '아이디어를 세 가지 방향으로 나누어 볼게요. 먼저 해결하려는 문제와 가장 중요한 사용자를 정해 볼까요?'
              }
            ]
          }
        ]}
        transport={transport}
        onStopAgent={() => {}}
      />
      <NativeChatWorkModePicker mode={mode} onChange={setMode} />
    </div>
  )
}

function VoiceOptions(): React.JSX.Element {
  const settings: VoiceSettings = {
    ...getDefaultVoiceSettings(),
    elevenLabsApiKeyConfigured: true,
    ttsProvider: 'elevenlabs',
    elevenLabsVoiceId: 'preview-voice'
  }
  return (
    <div className="px-4">
      <ElevenLabsVoiceSettings
        settings={settings}
        onUpdate={() => {}}
        refreshModelStates={() => {}}
        configureRequest={0}
      />
    </div>
  )
}

export const koreanConversation = defineFixture({
  width: 520,
  store: { settings: { ...getDefaultSettings('/home/fixture'), uiLanguage: 'ko' } },
  render: () => <Conversation />,
  interact: (frame) => frame.querySelector<HTMLButtonElement>('button[aria-expanded]')?.click()
})

export const narrowConversation = defineFixture({
  ...koreanConversation,
  width: 360
})

export const elevenLabs = defineFixture({
  width: 520,
  store: { settings: { ...getDefaultSettings('/home/fixture'), uiLanguage: 'ko' } },
  render: () => <VoiceOptions />
})
