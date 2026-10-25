import { useCallback, useEffect, useRef, useState } from 'react'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import type { VoiceSettings } from '../../../../shared/speech-types'
import { localKoreanVoice, StsVoicePlayback } from '../../../../shared/sts-voice-playback'
import { playElevenLabsSpeech } from '../dictation/elevenlabs-playback'

export function useNativeChatVoicePlayback(
  messages: readonly NativeChatMessage[],
  working: boolean,
  enabled: boolean,
  settings?: VoiceSettings
) {
  const [voice, setVoice] = useState<SpeechSynthesisVoice>()
  const [speaking, setSpeaking] = useState(false)
  const [caption, setCaption] = useState('')
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  const playback = useRef(new StsVoicePlayback())
  const current = useRef<{ cancel: () => void } | null>(null)
  const latest = useRef(messages)
  latest.current = messages
  const cloud = settings?.ttsProvider === 'elevenlabs'
  const voiceId = settings?.elevenLabsVoiceId ?? ''
  const modelId = settings?.elevenLabsTtsModel ?? 'eleven_flash_v2_5'
  const available = cloud
    ? Boolean(
        settings?.elevenLabsApiKeyConfigured && voiceId && window.api.speech.synthesizeElevenLabs
      )
    : Boolean(voice)

  const stop = useCallback(() => {
    const active = current.current
    current.current = null
    active?.cancel()
    playback.current.reset(latest.current)
    setSpeaking(false)
    setCaption('')
  }, [])

  const complete = useCallback((run: { cancel: () => void }, failed: boolean) => {
    if (current.current !== run) {
      return
    }
    current.current = null
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- Audio completion and synchronous playback failure must release the microphone gate.
    setSpeaking(false)
    if (failed) {
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- Report an external playback failure, including a synchronous audio API exception.
      setError(true)
    } else {
      setRevision((value) => value + 1)
    }
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
  }, [enabled, cloud, voiceId, modelId, available, stop])

  useEffect(() => {
    if (!enabled || !available || error || current.current) {
      return
    }
    const next = playback.current.next(messages, working)
    if (!next) {
      return
    }
    const run = { cancel: () => {} }
    current.current = run
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- Starting external audio must disable microphone capture immediately.
    setSpeaking(true)
    setCaption(next)
    try {
      if (cloud) {
        run.cancel = playElevenLabsSpeech(
          { text: next, voiceId, modelId },
          () => complete(run, false),
          () => complete(run, true)
        )
      } else if (voice) {
        const utterance = new SpeechSynthesisUtterance(next)
        utterance.voice = voice
        utterance.lang = voice.lang
        utterance.rate = 0.95
        utterance.onend = () => complete(run, false)
        utterance.onerror = () => complete(run, true)
        run.cancel = () => {
          utterance.onend = null
          utterance.onerror = null
          window.speechSynthesis.cancel()
        }
        window.speechSynthesis.speak(utterance)
      }
    } catch {
      run.cancel()
      complete(run, true)
    }
  }, [
    enabled,
    available,
    cloud,
    error,
    messages,
    modelId,
    revision,
    voice,
    voiceId,
    working,
    complete
  ])

  const pending = enabled && available && !error && playback.current.hasPending(messages, working)
  return { speaking, pending, caption, available, error, stop }
}
