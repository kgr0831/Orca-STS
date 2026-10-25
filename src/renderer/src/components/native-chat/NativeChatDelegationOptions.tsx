import { useId } from 'react'
import { translate } from '@/i18n/i18n'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { SessionOptionSelectChoice } from '../../../../shared/native-chat-session-options'

export type NativeChatDelegationOptionsProps = {
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  model: string
  onModelChange: (model: string) => void
  models: SessionOptionSelectChoice[]
  automaticModel: string | null
  onOpen: () => void
}

export function NativeChatDelegationOptions(
  props: NativeChatDelegationOptionsProps
): React.JSX.Element {
  const id = useId()
  return (
    <div className="space-y-2 border-t border-border pt-2">
      <div className="flex items-center gap-2">
        <Switch
          id={id}
          checked={props.enabled}
          onCheckedChange={props.onEnabledChange}
          aria-describedby={`${id}-description`}
        />
        <Label htmlFor={id}>
          {translate('stsWorkModes.mas.label', 'Delegate difficult work (MAS)')}
        </Label>
      </div>
      {props.enabled ? (
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={`${id}-model`}>
            {translate('stsWorkModes.mas.model', 'Specialist model')}
          </Label>
          <Select
            value={props.model}
            onValueChange={props.onModelChange}
            onOpenChange={(open) => {
              if (open) {
                props.onOpen()
              }
            }}
          >
            <SelectTrigger id={`${id}-model`} size="sm" className="max-w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">
                {translate('stsWorkModes.mas.automatic', 'Automatic')} ·{' '}
                {props.automaticModel ?? translate('stsWorkModes.mas.agentChoice', 'Codex chooses')}
              </SelectItem>
              {props.model !== 'auto' &&
              !props.models.some((model) => model.value === props.model) ? (
                <SelectItem value={props.model}>
                  {props.model} · {translate('stsWorkModes.mas.unlisted', 'Not in current catalog')}
                </SelectItem>
              ) : null}
              {props.models.map((model) => (
                <SelectItem key={model.value} value={model.value}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <p id={`${id}-description`} className="text-xs text-muted-foreground">
        {translate(
          'stsWorkModes.mas.description',
          'Ask Codex to delegate research, complex reasoning, and detailed tasks with high reasoning effort. Up to two specialists per request; actual activity appears in the chat. Uses more of your Codex allowance.'
        )}
      </p>
    </div>
  )
}
