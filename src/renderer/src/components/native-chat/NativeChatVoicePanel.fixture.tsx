import { defineFixture } from '../../component-fixtures/component-fixture'
import { getDefaultSettings } from '../../../../shared/constants'
import { NativeChatVoicePanel, type NativeChatVoicePanelProps } from './NativeChatVoicePanel'
import { NativeChatWorkModePicker } from './NativeChatWorkModePicker'

const props: NativeChatVoicePanelProps = {
  running: true,
  listening: false,
  speaking: true,
  stateLabel: '답변 읽는 중',
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
