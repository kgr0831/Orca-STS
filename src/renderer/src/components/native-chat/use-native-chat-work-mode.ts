import { useEffect, useMemo, useState } from 'react'
import { withStsWorkMode, type StsWorkModeId } from '../../../../shared/sts-work-modes'
import type { NativeChatStructuredComposerTransport } from './native-chat-composer-types'

export function useNativeChatWorkMode(
  transport: NativeChatStructuredComposerTransport,
  enabled: boolean,
  initialMode: StsWorkModeId = 'default'
) {
  const [mode, setMode] = useState<StsWorkModeId>(initialMode)
  const [delegationEnabled, setDelegationEnabled] = useState(true)
  const [model, setModel] = useState('auto')
  const modelOption = transport.optionSnapshot.find((option) => option.category === 'model')
  const models = modelOption?.kind.type === 'select' ? modelOption.kind.choices : []
  const automaticModel = models.find((choice) => choice.value === 'gpt-6.1-sol')?.value ?? null
  const specialistModel = model === 'auto' ? automaticModel : model
  const demandModelCatalog = transport.optionsSurface.demandModelCatalog
  useEffect(() => {
    if (enabled && mode !== 'default' && delegationEnabled) {
      demandModelCatalog?.()
    }
  }, [enabled, mode, delegationEnabled, demandModelCatalog])
  const composerTransport = useMemo<NativeChatStructuredComposerTransport>(() => {
    if (!enabled) {
      return transport
    }
    return {
      ...transport,
      send: (text, attachments, request) => {
        const message = withStsWorkMode(
          text,
          mode,
          attachments.length > 0,
          delegationEnabled ? { model: specialistModel } : undefined
        )
        return request === undefined
          ? transport.send(message, attachments)
          : transport.send(message, attachments, request)
      }
    }
  }, [enabled, mode, transport, delegationEnabled, specialistModel])
  return {
    mode,
    setMode,
    transport: composerTransport,
    delegation: {
      enabled: delegationEnabled,
      onEnabledChange: setDelegationEnabled,
      model,
      onModelChange: setModel,
      models,
      automaticModel,
      onOpen: () => demandModelCatalog?.()
    }
  }
}
