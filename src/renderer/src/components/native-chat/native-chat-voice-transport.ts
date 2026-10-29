import type { NativeChatStructuredComposerTransport } from './native-chat-composer-types'

export type NativeChatVoiceTransport = Pick<
  NativeChatStructuredComposerTransport,
  'send' | 'sendOut' | 'sendBlockedReason' | 'sessionPending'
> & {
  onAccepted?: (revealsTranscript: boolean) => void
}
