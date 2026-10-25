import { useMemo, useState } from 'react'
import { withStsWorkMode, type StsWorkModeId } from '../../../../shared/sts-work-modes'
import type { NativeChatStructuredComposerTransport } from './native-chat-composer-types'

export function useNativeChatWorkMode(
  transport: NativeChatStructuredComposerTransport,
  enabled: boolean
) {
  const [mode, setMode] = useState<StsWorkModeId>('default')
  const composerTransport = useMemo<NativeChatStructuredComposerTransport>(() => {
    if (!enabled) {
      return transport
    }
    return {
      ...transport,
      send: (text, attachments, request) =>
        transport.send(withStsWorkMode(text, mode, attachments.length > 0), attachments, request)
    }
  }, [enabled, mode, transport])
  return { mode, setMode, transport: composerTransport }
}
