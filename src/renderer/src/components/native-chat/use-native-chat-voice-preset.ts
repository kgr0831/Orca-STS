import { useEffect, useRef, useState } from 'react'
import type { NativeChatStructuredComposerTransport } from './native-chat-composer-types'
import type { SessionOptionSetResult } from '../../../../shared/native-chat-session-options'

function applied(result: SessionOptionSetResult, id: string, value: string): boolean {
  return result.snapshot.some(
    (entry) => entry.id === id && entry.kind.type === 'select' && entry.kind.currentValue === value
  )
}

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
  const settable = option?.settable === true
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
    if (
      !enabled ||
      working ||
      !settable ||
      !model ||
      prepared === sessionId ||
      failed === sessionId
    ) {
      return
    }
    let active = true
    const surface = current.current.optionsSurface
    void (async () => {
      const modelResult = await surface.setOption('model', model)
      if (!active) {
        return
      }
      if (!applied(modelResult, 'model', model)) {
        throw new Error('voice_model_not_applied')
      }
      const effortResult = await current.current.optionsSurface.setOption('effort', 'low')
      if (active) {
        if (!applied(effortResult, 'effort', 'low')) {
          throw new Error('voice_effort_not_applied')
        }
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
  }, [enabled, working, settable, model, sessionId, prepared, failed])
  const unavailable = choices.length > 0 && !model
  return {
    pending: enabled && prepared !== sessionId && failed !== sessionId && !unavailable,
    failed: failed === sessionId || unavailable
  }
}
