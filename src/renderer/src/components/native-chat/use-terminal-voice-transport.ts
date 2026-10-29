import { useEffect, useRef, useState } from 'react'
import type { Terminal } from '@xterm/xterm'
import { translate } from '@/i18n/i18n'
import { emitNativeChatMessageSent } from '@/lib/native-chat-telemetry'
import { nativeChatComposerTargetIsRemote } from './native-chat-composer-target'
import { sendNativeChatMessage, type NativeChatSendHandle } from './native-chat-runtime-send'
import { terminalVoiceInputReady } from './terminal-voice-input-ready'
import type { NativeChatVoiceTransport } from './native-chat-voice-transport'

export function useTerminalVoiceTransport(args: {
  terminal: Pick<Terminal, 'buffer' | 'modes' | 'rows' | 'onWriteParsed' | 'onData'>
  ptyId: string | null
  allowed: boolean
}): NativeChatVoiceTransport {
  const [ready, setReady] = useState(() => terminalVoiceInputReady(args.terminal))
  const [sending, setSending] = useState(false)
  const pending = useRef<{ handle: NativeChatSendHandle; finish: () => void } | null>(null)
  const latest = useRef(args)
  latest.current = args
  useEffect(() => {
    setReady(terminalVoiceInputReady(args.terminal))
    const writes = args.terminal.onWriteParsed(() =>
      setReady(terminalVoiceInputReady(args.terminal))
    )
    const typing = args.terminal.onData(() => {
      const active = pending.current
      active?.handle.cancel(true)
      active?.finish()
    })
    return () => {
      writes.dispose()
      typing.dispose()
      const active = pending.current
      pending.current = null
      active?.handle.cancel(true)
    }
  }, [args.terminal, args.ptyId])

  const send: NativeChatVoiceTransport['send'] = (text, attachments, request) => {
    const { ptyId, terminal, allowed } = latest.current
    if (
      !ptyId ||
      !allowed ||
      pending.current ||
      attachments.length ||
      !terminalVoiceInputReady(terminal)
    ) {
      return false
    }
    setSending(true)
    let settled = false
    let uncertain = false
    const finish = (outcome: 'recorded' | 'returned' | 'unconfirmed') => {
      if (settled) {
        return
      }
      settled = true
      pending.current = null
      setSending(false)
      request?.onSettled?.(outcome)
    }
    const handle = sendNativeChatMessage(ptyId, text, {
      clearInput: '',
      stopOnUnconfirmed: true,
      canStart: () =>
        latest.current.ptyId === ptyId &&
        latest.current.allowed &&
        terminalVoiceInputReady(terminal),
      onWriteRejected: () => finish('returned'),
      onWriteUnconfirmed: () => {
        uncertain = true
      },
      onDeliverySettled: (accepted) =>
        finish(accepted ? 'recorded' : uncertain ? 'unconfirmed' : 'returned')
    })
    if (!settled) {
      pending.current = { handle, finish: () => finish('unconfirmed') }
    }
    void handle.settled?.then(() => {
      if (pending.current?.handle === handle) {
        finish('unconfirmed')
      }
    })
    return true
  }
  return {
    send,
    sendOut: sending,
    sendBlockedReason:
      !args.allowed || !ready
        ? translate(
            'stsHistory.terminalInputBusy',
            'Finish the current terminal input or approval before sending spoken words.'
          )
        : undefined,
    onAccepted: () =>
      emitNativeChatMessageSent({
        agent: 'codex',
        runtime: args.ptyId && nativeChatComposerTargetIsRemote(args.ptyId) ? 'remote' : 'local'
      })
  }
}
