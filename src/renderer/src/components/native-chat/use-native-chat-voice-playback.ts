import { useCallback, useEffect, useRef, useState } from 'react'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { localKoreanVoice, StsVoicePlayback } from '../../../../shared/sts-voice-playback'

export function useNativeChatVoicePlayback(
  messages: readonly NativeChatMessage[],
  working: boolean,
  enabled: boolean
) {
  const [voice, setVoice] = useState<SpeechSynthesisVoice>()
  const [speaking, setSpeaking] = useState(false)
  const [caption, setCaption] = useState('')
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  const playback = useRef(new StsVoicePlayback())
  const utterance = useRef<SpeechSynthesisUtterance | null>(null)
  const latest = useRef(messages)
  latest.current = messages

  const stop = useCallback(() => {
    const current = utterance.current
    utterance.current = null
    if (current) {
      current.onend = null
      current.onerror = null
      window.speechSynthesis?.cancel()
    }
    playback.current.reset(latest.current)
    setSpeaking(false)
    setCaption('')
  }, [])

  useEffect(() => {
    const synth = window.speechSynthesis
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
      return
    }
    const refresh = () => setVoice(localKoreanVoice(synth.getVoices()))
    refresh()
    synth.addEventListener('voiceschanged', refresh)
    return () => synth.removeEventListener('voiceschanged', refresh)
  }, [])

  useEffect(() => {
    playback.current.reset(latest.current)
    setError(false)
    return stop
  }, [enabled, stop])

  useEffect(() => {
    if (!enabled || !voice || error || utterance.current) {
      return
    }
    const next = playback.current.next(messages, working)
    if (!next) {
      setSpeaking(false)
      return
    }
    const current = new SpeechSynthesisUtterance(next)
    current.voice = voice
    current.lang = voice.lang
    current.onend = () => {
      if (utterance.current !== current) {
        return
      }
      utterance.current = null
      setRevision((value) => value + 1)
    }
    current.onerror = () => {
      if (utterance.current !== current) {
        return
      }
      utterance.current = null
      setSpeaking(false)
      setError(true)
    }
    utterance.current = current
    setSpeaking(true)
    setCaption(next)
    try {
      window.speechSynthesis.speak(current)
    } catch {
      utterance.current = null
      setSpeaking(false)
      setError(true)
    }
  }, [enabled, error, messages, revision, voice, working])

  const pending =
    enabled && Boolean(voice) && !error && playback.current.hasPending(messages, working)
  return { speaking, pending, caption, available: Boolean(voice), error, stop }
}
