import { defineFixture } from '../../component-fixtures/component-fixture'
import { getDefaultSettings, getDefaultVoiceSettings } from '../../../../shared/constants'
import { NativeChatVoicePanel, type NativeChatVoicePanelProps } from './NativeChatVoicePanel'
import { NativeChatWorkModePicker } from './NativeChatWorkModePicker'
import { NativeChatVoiceSettings } from './NativeChatVoiceSettings'
import type { SessionOptionDescriptor } from '../../../../shared/native-chat-session-options'

const options: SessionOptionDescriptor[] = [
  {
    id: 'model',
    label: 'Model',
    category: 'model',
    settable: true,
    valueSource: 'applied',
    transport: 'agent-session',
    kind: {
      type: 'select',
      currentValue: 'gpt-6-luna',
      choices: [{ value: 'gpt-6-luna', label: 'GPT-6-Luna' }]
    }
  },
  {
    id: 'effort',
    label: 'Reasoning effort',
    category: 'thought_level',
    settable: true,
    valueSource: 'applied',
    transport: 'agent-session',
    kind: {
      type: 'select',
      currentValue: 'low',
      choices: [
        { value: 'low', label: 'Low' },
        { value: 'high', label: 'High' }
      ]
    }
  }
]

const props: NativeChatVoicePanelProps = {
  modelLabel: '로컬 AI 말차례 판단 · 시험 기능',
  canSubmitSpoken: true,
  onSubmitSpoken: () => {},
  running: true,
  listening: true,
  speaking: true,
  stateLabel: '답변 중 · 내 말도 듣고 있음',
  startDisabled: false,
  canInterrupt: true,
  userCaption: '오른쪽 패널에서 대화하면서 개발 작업도 할 수 있으면 좋겠어.',
  assistantCaption:
    '좋아요. 브레인스토밍으로 먼저 흐름을 정리하고, 개발 지시 모드에서 구현을 진행할 수 있어요.',
  notice: '',
  setupNeeded: false,
  retainedDraft: false,
  canRetry: false,
  onToggle: () => {},
  onInterrupt: () => {},
  onRetry: () => {},
  onDiscard: () => {}
}

function Panel(overrides: Partial<NativeChatVoicePanelProps>): React.JSX.Element {
  return (
    <div className="bg-sidebar text-sidebar-foreground">
      <div className="border-b border-border px-3 py-2 text-sm font-medium">음성 대화</div>
      <NativeChatVoiceSettings
        voice={{
          ...getDefaultVoiceSettings(),
          sttModel: 'elevenlabs-scribe-v2-realtime',
          ttsProvider: 'elevenlabs'
        }}
        working={false}
        transport={{
          optionSnapshot: options,
          optionsSurface: {
            getSnapshot: () => options,
            subscribe: () => () => {},
            setOption: async () => ({ snapshot: options }),
            invokeAction: async () => ({ snapshot: options })
          }
        }}
      />
      <NativeChatVoicePanel {...props} {...overrides} />
      <NativeChatWorkModePicker
        mode="brainstorm"
        onChange={() => {}}
        delegation={{
          enabled: true,
          onEnabledChange: () => {},
          model: 'auto',
          onModelChange: () => {},
          models: [],
          automaticModel: null,
          onOpen: () => {}
        }}
      />
    </div>
  )
}

export const speaking = defineFixture({
  width: 360,
  store: { settings: { ...getDefaultSettings('/home/fixture'), uiLanguage: 'ko' } },
  render: () => <Panel />
})
export const narrow = defineFixture({ ...speaking, width: 280 })
export const listening = defineFixture({
  ...speaking,
  render: () => (
    <Panel
      listening
      speaking={false}
      canInterrupt={false}
      stateLabel="듣는 중"
      userCaption="그럼 지금 이 프로젝트에서"
    />
  )
})
export const setup = defineFixture({
  ...narrow,
  render: () => (
    <Panel
      running={false}
      listening={false}
      speaking={false}
      canInterrupt={false}
      startDisabled
      setupNeeded
      stateLabel="준비됨"
      userCaption=""
      assistantCaption=""
    />
  )
})
