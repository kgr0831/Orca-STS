import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import {
  NativeChatVoiceConversation,
  type NativeChatVoiceConversationProps
} from './NativeChatVoiceConversation'

export function NativeChatVoicePanel(props: NativeChatVoiceConversationProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="mx-3 mb-2 rounded-md border border-border bg-card p-3 text-card-foreground">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open
          ? translate('stsVoice.close', 'Close voice conversation')
          : translate('stsVoice.open', 'Voice conversation')}
      </Button>
      {open ? <NativeChatVoiceConversation {...props} /> : null}
    </div>
  )
}
