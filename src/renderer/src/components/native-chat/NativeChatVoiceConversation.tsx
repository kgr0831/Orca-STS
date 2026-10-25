import { useEffect, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { voiceMessageText } from '../../../../shared/sts-voice-playback'
import type { NativeChatStructuredComposerTransport } from './native-chat-composer-types'
import { completeNativeChatStructuredUserAction } from './native-chat-structured-user-action'
import { useNativeChatVoiceInput } from './use-native-chat-voice-input'
import { useNativeChatVoicePlayback } from './use-native-chat-voice-playback'
import { NativeChatVoicePanel } from './NativeChatVoicePanel'

export type NativeChatVoiceConversationProps = {
  active: boolean
  blocked: boolean
  working: boolean
  messages: readonly NativeChatMessage[]
  completedTurn?: string
  transport: NativeChatStructuredComposerTransport
  onStopAgent: () => void
}

export function NativeChatVoiceConversation(
  props: NativeChatVoiceConversationProps
): React.JSX.Element {
  const [running, setRunning] = useState(false)
  const [sending, setSending] = useState(false)
  const [awaiting, setAwaiting] = useState(false)
  const [interrupting, setInterrupting] = useState(false)
  const [notice, setNotice] = useState('')
  const [lastSent, setLastSent] = useState('')
  const workSeen = useRef(false)
  const sendInFlight = useRef(false)
  const conversationRun = useRef(0)
  const mounted = useRef(true)
  const replyBaseline = useRef('')
  const turnBaseline = useRef<string | undefined>(undefined)
  const latestAnswer = props.messages.findLast((message) => voiceMessageText(message).trim())
  const answer = latestAnswer ? voiceMessageText(latestAnswer) : ''
  const replyRevision = latestAnswer ? `${latestAnswer.id}:${answer}` : ''
  const dictationState = useAppStore((store) => store.dictationState)
  const voiceSettings = useAppStore((store) => store.settings?.voice)
  const playback = useNativeChatVoicePlayback(
    props.messages,
    props.working,
    props.active && running,
    voiceSettings,
    dictationState !== 'idle' || interrupting
  )
  const input = useNativeChatVoiceInput({
    active: props.active && !props.blocked,
    autoSend: true,
    onReady: (text) => {
      if (running) {
        send(text)
      }
    },
    onBeforeStart: () => {
      playback.stop()
      setNotice('')
      setAwaiting(false)
    }
  })
  const { cancel: cancelInput, start: startInput } = input
  const { stop: stopPlayback } = playback
  const canSend =
    props.active &&
    !props.blocked &&
    !props.working &&
    !sending &&
    !props.transport.sendOut &&
    !props.transport.sendBlockedReason &&
    !props.transport.sessionPending

  function end(): void {
    conversationRun.current += 1
    setRunning(false)
    setAwaiting(false)
    setInterrupting(false)
    stopPlayback()
    cancelInput()
  }

  function send(text: string): void {
    if (!text.trim() || sendInFlight.current) {
      return
    }
    if (!canSend) {
      setNotice(
        translate('stsVoice.notSent', 'Not sent. Keep the text and send when the chat is ready.')
      )
      end()
      return
    }
    sendInFlight.current = true
    setSending(true)
    setNotice('')
    workSeen.current = false
    replyBaseline.current = replyRevision
    turnBaseline.current = props.completedTurn
    const run = ++conversationRun.current
    const failed = (unconfirmed: boolean) => {
      sendInFlight.current = false
      if (!mounted.current) {
        return
      }
      setSending(false)
      end()
      setNotice(
        unconfirmed
          ? translate(
              'stsVoice.unconfirmed',
              'Delivery is unconfirmed. Check the chat before sending again.'
            )
          : translate(
              'stsVoice.notSent',
              'Not sent. Keep the text and send when the chat is ready.'
            )
      )
    }
    try {
      const result = props.transport.send(text, [], {
        callerKeepsText: true,
        onSettled: (outcome) => {
          if (outcome !== 'recorded') {
            failed(outcome === 'unconfirmed')
            return
          }
          sendInFlight.current = false
          if (!mounted.current) {
            return
          }
          setSending(false)
          setLastSent(text)
          input.setDraft('')
          setAwaiting(run === conversationRun.current)
        }
      })
      if (result === false) {
        failed(false)
      } else {
        completeNativeChatStructuredUserAction('codex', props.transport, result === true)
      }
    } catch {
      failed(true)
    }
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      conversationRun.current += 1
    }
  }, [])
  useEffect(() => {
    if (props.working && (awaiting || sending)) {
      workSeen.current = true
    }
  }, [props.working, awaiting, sending])
  useEffect(() => {
    const pause = () => {
      conversationRun.current += 1
      setRunning(false)
      setAwaiting(false)
      setInterrupting(false)
      stopPlayback()
      cancelInput()
    }
    const visibilityChanged = () => {
      if (document.visibilityState !== 'visible') {
        pause()
      }
    }
    window.addEventListener('blur', pause)
    document.addEventListener('visibilitychange', visibilityChanged)
    return () => {
      window.removeEventListener('blur', pause)
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }, [cancelInput, stopPlayback])
  useEffect(() => {
    if (!props.active || input.error || playback.error || (running && !playback.available)) {
      conversationRun.current += 1
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- External audio failure must release capture and cancel automatic turns.
      setRunning(false)
      setAwaiting(false)
      stopPlayback()
      cancelInput()
    }
  }, [
    props.active,
    input.error,
    playback.error,
    playback.available,
    running,
    stopPlayback,
    cancelInput
  ])
  useEffect(() => {
    const replyFinished =
      !awaiting ||
      workSeen.current ||
      replyRevision !== replyBaseline.current ||
      (props.completedTurn !== undefined && props.completedTurn !== turnBaseline.current)
    if (
      !running ||
      !replyFinished ||
      !canSend ||
      input.draft ||
      !input.ready ||
      input.error ||
      input.owned ||
      input.state !== 'idle' ||
      playback.speaking ||
      (!interrupting && playback.pending) ||
      playback.error ||
      !playback.available
    ) {
      return
    }
    const timer = setTimeout(() => {
      setAwaiting(false)
      setInterrupting(false)
      startInput()
    }, 500)
    return () => clearTimeout(timer)
  }, [
    running,
    awaiting,
    interrupting,
    canSend,
    replyRevision,
    props.completedTurn,
    input.draft,
    input.ready,
    input.error,
    input.owned,
    input.state,
    startInput,
    playback.speaking,
    playback.pending,
    playback.error,
    playback.available
  ])

  const stateLabel = interrupting
    ? translate('stsLive.interrupting', 'Stopping the reply…')
    : input.owned
      ? input.state === 'starting'
        ? translate('stsVoice.starting', 'Starting microphone…')
        : input.state === 'stopping'
          ? translate('stsVoice.processing', 'Finishing recognition…')
          : translate('stsVoice.listening', 'Listening')
      : sending
        ? translate('stsVoice.sending', 'Sending…')
        : playback.speaking
          ? translate('stsVoice.speaking', 'Reading response')
          : props.blocked
            ? translate('stsLive.waiting', 'Waiting for the chat to be ready')
            : props.working || awaiting
              ? translate('stsVoice.working', 'Codex is working')
              : running
                ? translate('stsLive.reconnecting', 'Listening again shortly…')
                : translate('stsVoice.ready', 'Ready')
  return (
    <>
      <textarea
        ref={input.inputRef}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        readOnly
        value={input.draft}
      />
      <NativeChatVoicePanel
        running={running}
        listening={input.owned}
        speaking={playback.speaking}
        stateLabel={stateLabel}
        startDisabled={
          !canSend ||
          !input.ready ||
          !playback.available ||
          input.state !== 'idle' ||
          Boolean(input.draft)
        }
        canInterrupt={
          running && !sending && !interrupting && (props.working || playback.speaking || awaiting)
        }
        userCaption={[input.draft || (input.owned ? '' : lastSent), input.partial]
          .filter(Boolean)
          .join(' ')}
        assistantCaption={playback.speaking ? playback.caption : answer}
        notice={
          notice ||
          input.error ||
          (playback.error
            ? translate(
                'stsLive.audioFailed',
                'Audio failed. Check Voice settings, then start again.'
              )
            : '')
        }
        setupNeeded={!input.ready || !playback.available}
        retainedDraft={!running && Boolean(input.draft)}
        canRetry={canSend && input.state === 'idle'}
        onRetry={() => send(input.draft)}
        onDiscard={() => {
          input.setDraft('')
          setNotice('')
        }}
        onToggle={() => {
          if (running) {
            end()
            if (props.working) {
              props.onStopAgent()
            }
            return
          }
          playback.restart()
          setNotice('')
          setRunning(true)
          setAwaiting(false)
          startInput()
        }}
        onInterrupt={() => {
          conversationRun.current += 1
          setAwaiting(false)
          setInterrupting(true)
          stopPlayback()
          if (props.working) {
            props.onStopAgent()
          }
        }}
      />
    </>
  )
}
