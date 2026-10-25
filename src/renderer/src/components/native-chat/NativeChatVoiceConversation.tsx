import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { voiceMessageText } from '../../../../shared/sts-voice-playback'
import type { NativeChatStructuredComposerTransport } from './native-chat-composer-types'
import { completeNativeChatStructuredUserAction } from './native-chat-structured-user-action'
import { useNativeChatVoiceInput } from './use-native-chat-voice-input'
import { useNativeChatVoicePlayback } from './use-native-chat-voice-playback'

export type NativeChatVoiceConversationProps = {
  active: boolean
  blocked: boolean
  working: boolean
  messages: readonly NativeChatMessage[]
  transport: NativeChatStructuredComposerTransport
  onStopAgent: () => void
}

export function NativeChatVoiceConversation(
  props: NativeChatVoiceConversationProps
): React.JSX.Element {
  const id = useId()
  const [automatic, setAutomatic] = useState(true)
  const [readAloud, setReadAloud] = useState(true)
  const [muted, setMuted] = useState(false)
  const [sending, setSending] = useState(false)
  const [awaiting, setAwaiting] = useState(false)
  const [notice, setNotice] = useState('')
  const [lastSent, setLastSent] = useState('')
  const workSeen = useRef(false)
  const sendInFlight = useRef(false)
  const conversationRun = useRef(0)
  const mounted = useRef(true)
  const dictationState = useAppStore((store) => store.dictationState)
  const voiceSettings = useAppStore((store) => store.settings?.voice)
  const playback = useNativeChatVoicePlayback(
    props.messages,
    props.working,
    props.active && !props.blocked && readAloud && !muted && dictationState === 'idle',
    voiceSettings
  )
  const input = useNativeChatVoiceInput({
    active: props.active && !props.blocked,
    autoSend: automatic,
    onReady: (text) => send(text),
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

  function notSentNotice(): string {
    return translate('stsVoice.notSent', 'Not sent. Keep the text and send when the chat is ready.')
  }

  function send(text: string): void {
    if (!text.trim() || sendInFlight.current) {
      return
    }
    if (!canSend) {
      setNotice(notSentNotice())
      return
    }
    sendInFlight.current = true
    setSending(true)
    setNotice('')
    setMuted(false)
    workSeen.current = false
    const run = ++conversationRun.current
    let result: boolean | 'queued'
    try {
      result = props.transport.send(text, [], {
        callerKeepsText: true,
        onSettled: (outcome) => {
          sendInFlight.current = false
          if (!mounted.current) {
            return
          }
          setSending(false)
          if (outcome === 'recorded') {
            setLastSent(text)
            input.setDraft('')
            setAwaiting(run === conversationRun.current)
          } else {
            setAwaiting(false)
            setNotice(
              outcome === 'unconfirmed'
                ? translate(
                    'stsVoice.unconfirmed',
                    'Delivery is unconfirmed. Check the chat before sending again.'
                  )
                : notSentNotice()
            )
          }
        }
      })
    } catch {
      sendInFlight.current = false
      setSending(false)
      setNotice(
        translate(
          'stsVoice.unconfirmed',
          'Delivery is unconfirmed. Check the chat before sending again.'
        )
      )
      return
    }
    if (result === false) {
      sendInFlight.current = false
      setSending(false)
      setNotice(notSentNotice())
    } else {
      completeNativeChatStructuredUserAction('codex', props.transport, result === true)
    }
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (props.working && (awaiting || sending)) {
      workSeen.current = true
    }
  }, [props.working, awaiting, sending])

  useEffect(() => {
    if (!props.active || props.blocked) {
      conversationRun.current += 1
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- Losing microphone ownership must cancel the next automatic turn.
      setAwaiting(false)
    }
  }, [props.active, props.blocked])

  useEffect(() => {
    const pause = () => {
      conversationRun.current += 1
      setMuted(true)
      setAwaiting(false)
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
    if (
      !automatic ||
      !awaiting ||
      !workSeen.current ||
      !canSend ||
      input.draft ||
      !input.ready ||
      input.error ||
      input.state !== 'idle' ||
      playback.speaking ||
      playback.pending
    ) {
      return
    }
    const timer = setTimeout(() => {
      setAwaiting(false)
      startInput()
    }, 500)
    return () => clearTimeout(timer)
  }, [
    automatic,
    awaiting,
    canSend,
    input.draft,
    input.error,
    input.ready,
    startInput,
    input.state,
    playback.speaking,
    playback.pending
  ])

  const latestAnswer = props.messages.findLast((message) => voiceMessageText(message).trim())
  const caption = playback.speaking
    ? playback.caption
    : latestAnswer
      ? voiceMessageText(latestAnswer)
      : ''
  const stateLabel = input.owned
    ? input.state === 'starting'
      ? translate('stsVoice.starting', 'Starting microphone…')
      : input.state === 'stopping'
        ? translate('stsVoice.processing', 'Finishing recognition…')
        : translate('stsVoice.listening', 'Listening')
    : sending
      ? translate('stsVoice.sending', 'Sending…')
      : playback.speaking
        ? translate('stsVoice.speaking', 'Reading response')
        : props.working
          ? translate('stsVoice.working', 'Codex is working')
          : translate('stsVoice.ready', 'Ready')

  return (
    <div className="mt-3 space-y-3">
      <p role="status" className="text-xs text-muted-foreground">
        {stateLabel}
      </p>
      {!input.ready ? (
        <div className="space-y-2">
          <p className="text-sm">
            {translate(
              'stsVoice.setup',
              'Enable voice input and select Korean streaming or ElevenLabs Scribe in Settings → Voice.'
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              useAppStore.getState().openSettingsTarget({ pane: 'voice', repoId: null })
              useAppStore.getState().openSettingsPage()
            }}
          >
            {translate('stsVoice.settings', 'Voice settings')}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Label htmlFor={`${id}-auto`}>
          <Checkbox
            id={`${id}-auto`}
            checked={automatic}
            onCheckedChange={(value) => setAutomatic(value === true)}
          />
          {translate('stsVoice.automatic', 'Send after a pause and listen again after the reply')}
        </Label>
        <Label htmlFor={`${id}-read`}>
          <Checkbox
            id={`${id}-read`}
            checked={readAloud}
            onCheckedChange={(value) => setReadAloud(value === true)}
          />
          {translate('stsVoice.read', 'Read replies aloud')}
        </Label>
      </div>
      {readAloud && !playback.available ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'stsVoice.noVoice',
            'Set up the selected voice in Settings → Voice. Captions remain available.'
          )}
        </p>
      ) : null}
      {playback.error ? (
        <p role="alert" className="text-sm">
          {translate(
            'stsVoice.speechError',
            'Audio playback failed. Turn Read replies aloud off and on to retry.'
          )}
        </p>
      ) : null}
      <Label htmlFor={`${id}-draft`}>{translate('stsVoice.you', 'You')}</Label>
      <Textarea
        id={`${id}-draft`}
        ref={input.inputRef}
        value={input.draft}
        readOnly={input.owned || sending}
        onChange={(event) => input.setDraft(event.target.value)}
        rows={2}
      />
      {input.partial ? <p className="text-sm text-muted-foreground">{input.partial}</p> : null}
      {!input.draft && lastSent ? (
        <p className="text-xs text-muted-foreground">{lastSent}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!input.owned && (!canSend || !input.ready || input.state !== 'idle')}
          onClick={() => (input.owned ? input.stop() : input.start())}
        >
          {input.owned
            ? translate('stsVoice.finish', 'Finish speaking')
            : translate('stsVoice.start', 'Start speaking')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canSend || input.owned || !input.draft.trim()}
          onClick={() => send(input.draft)}
        >
          {translate('stsVoice.send', 'Send text')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!playback.speaking && !awaiting && !input.owned && !sending}
          onClick={() => {
            conversationRun.current += 1
            setMuted(true)
            setAwaiting(false)
            playback.stop()
            input.cancel()
          }}
        >
          {translate('stsVoice.pause', 'Pause conversation')}
        </Button>
        {props.working ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              conversationRun.current += 1
              setAwaiting(false)
              setMuted(true)
              playback.stop()
              props.onStopAgent()
            }}
          >
            {translate('stsVoice.stopAgent', 'Stop Codex')}
          </Button>
        ) : null}
      </div>
      {notice || input.error ? (
        <p role="alert" className="text-sm">
          {notice || input.error}
        </p>
      ) : null}
      {caption ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {translate('stsVoice.assistant', 'Codex')}
          </p>
          <p className="scrollbar-sleek max-h-32 overflow-y-auto whitespace-pre-wrap text-sm">
            {caption}
          </p>
        </div>
      ) : null}
    </div>
  )
}
