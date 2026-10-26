import { useEffect, useRef, useState } from 'react'
import type { NativeChatStructuredComposerTransport } from './native-chat-composer-types'

export function useNativeChatVoicePreset(
  transport: NativeChatStructuredComposerTransport,
  enabled: boolean,
  working: boolean
) {
  const [prepared, setPrepared] = useState('')
  const [failed, setFailed] = useState('')
  const current = useRef(transport)
  current.current = transport
  const option = transport.optionSnapshot.find((entry) => entry.category === 'model')
  const choices = option?.kind.type === 'select' ? option.kind.choices : []
  const model = ['gpt-6-luna', 'gpt-6.1-sol'].find((id) =>
    choices.some((choice) => choice.value === id)
  )
  const sessionId = transport.sessionId
  useEffect(() => {
    if (enabled) {
      current.current.optionsSurface.demandModelCatalog?.()
    }
  }, [enabled, sessionId])
  useEffect(() => {
    if (!enabled || working || !model || prepared === sessionId || failed === sessionId) {
      return
    }
    let active = true
    const surface = current.current.optionsSurface
    void (async () => {
      await surface.setOption('model', model)
      if (!active) {
        return
      }
      await surface.setOption('effort', 'low')
      if (active) {
        setPrepared(sessionId)
      }
    })().catch(() => {
      if (active) {
        setFailed(sessionId)
      }
    })
    return () => {
      active = false
    }
  }, [enabled, working, model, sessionId, prepared, failed])
  const unavailable = choices.length > 0 && !model
  return {
    pending: enabled && prepared !== sessionId && failed !== sessionId && !unavailable,
    failed: failed === sessionId || unavailable
  }
}
