import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { registerDictationConversationTarget } from '../dictation/dictation-conversation-target'
import { dispatchDictationControl } from '../dictation/dictation-control-events'

export function useNativeChatVoiceInput(args: {
  active: boolean
  autoSend: boolean
  onReady: (text: string) => void
  onBeforeStart: () => void
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraftState] = useState('')
  const [partial, setPartial] = useState('')
  const [owned, setOwned] = useState(false)
  const [error, setError] = useState('')
  const owns = useRef(false)
  const cancelled = useRef(false)
  const draftRef = useRef('')
  const latest = useRef(args)
  latest.current = args
  const state = useAppStore((store) => store.dictationState)
  const settings = useAppStore((store) => store.settings?.voice)
  const ready =
    settings?.enabled === true &&
    (settings.sttModel === 'zipformer-streaming-korean' ||
      (settings.sttModel === 'elevenlabs-scribe-v2-realtime' &&
        settings.elevenLabsApiKeyConfigured === true))
  const setDraft = useCallback((text: string) => {
    draftRef.current = text
    setDraftState(text)
  }, [])

  const stop = useCallback(() => {
    if (owns.current) {
      dispatchDictationControl('stop')
    }
  }, [])

  const cancel = useCallback(() => {
    cancelled.current = true
    stop()
  }, [stop])

  useEffect(() => {
    const element = inputRef.current
    if (!element || !args.active) {
      return
    }
    const unregister = registerDictationConversationTarget(element, {
      acceptsCapture: () => owns.current,
      onPartial: (text) => {
        if (owns.current) {
          setPartial(text)
        }
      },
      onFinal: (text) => {
        if (!owns.current) {
          return
        }
        setPartial('')
        setDraft(draftRef.current + text)
        if (latest.current.autoSend) {
          dispatchDictationControl('stop')
        }
      },
      onStopped: () => {
        if (!owns.current) {
          return
        }
        owns.current = false
        setOwned(false)
        setPartial('')
        if (
          !cancelled.current &&
          latest.current.active &&
          latest.current.autoSend &&
          draftRef.current.trim()
        ) {
          latest.current.onReady(draftRef.current)
        }
      },
      onError: (message) => {
        owns.current = false
        setOwned(false)
        setPartial('')
        setError(message)
      }
    })
    return () => {
      unregister()
      stop()
      owns.current = false
      setOwned(false)
      setPartial('')
    }
  }, [args.active, setDraft, stop])

  useEffect(() => {
    if (owned && state === 'idle' && owns.current) {
      owns.current = false
      setOwned(false)
      setPartial('')
    }
  }, [owned, state])

  const start = useCallback(() => {
    if (!latest.current.active || !ready || useAppStore.getState().dictationState !== 'idle') {
      return false
    }
    const element = inputRef.current
    if (!element) {
      return false
    }
    latest.current.onBeforeStart()
    element.focus()
    if (document.activeElement !== element) {
      return false
    }
    owns.current = true
    cancelled.current = false
    setOwned(true)
    setError('')
    dispatchDictationControl('start')
    return true
  }, [ready])

  return { inputRef, draft, setDraft, partial, owned, state, ready, error, start, stop, cancel }
}
