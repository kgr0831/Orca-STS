import { useId } from 'react'
import { translate } from '@/i18n/i18n'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { isStsWorkModeId, type StsWorkModeId } from '../../../../shared/sts-work-modes'

function workModeChoices(): { id: StsWorkModeId; label: string; description: string }[] {
  return [
    {
      id: 'default',
      label: translate('stsWorkModes.default.label', 'Default'),
      description: translate(
        'stsWorkModes.default.description',
        'Follow the existing session instructions.'
      )
    },
    {
      id: 'brainstorm',
      label: translate('stsWorkModes.brainstorm.label', 'Brainstorm'),
      description: translate(
        'stsWorkModes.brainstorm.description',
        'Explore ideas and compare alternatives through conversation.'
      )
    },
    {
      id: 'requirements',
      label: translate('stsWorkModes.requirements.label', 'Requirements'),
      description: translate(
        'stsWorkModes.requirements.description',
        'Clarify goals, scope, constraints, and acceptance criteria.'
      )
    },
    {
      id: 'design',
      label: translate('stsWorkModes.design.label', 'Design'),
      description: translate(
        'stsWorkModes.design.description',
        'Inspect existing code and discuss architecture before implementation.'
      )
    },
    {
      id: 'implement',
      label: translate('stsWorkModes.implement.label', 'Development'),
      description: translate(
        'stsWorkModes.implement.description',
        'Implement the requested changes and run relevant checks.'
      )
    },
    {
      id: 'debug',
      label: translate('stsWorkModes.debug.label', 'Debug'),
      description: translate(
        'stsWorkModes.debug.description',
        'Reproduce the issue, investigate its cause, and verify a fix.'
      )
    },
    {
      id: 'review',
      label: translate('stsWorkModes.review.label', 'Code review'),
      description: translate(
        'stsWorkModes.review.description',
        'Inspect changes and report findings without editing files.'
      )
    },
    {
      id: 'document',
      label: translate('stsWorkModes.document.label', 'Documentation'),
      description: translate(
        'stsWorkModes.document.description',
        'Draft or update documentation, decisions, and handoff notes.'
      )
    },
    {
      id: 'general',
      label: translate('stsWorkModes.general.label', 'General tasks'),
      description: translate(
        'stsWorkModes.general.description',
        'Research, compare, plan, and carry out the requested work.'
      )
    }
  ]
}

export function NativeChatWorkModePicker(props: {
  mode: StsWorkModeId
  onChange: (mode: StsWorkModeId) => void
}): React.JSX.Element {
  const id = useId()
  const choices = workModeChoices()
  const selected = choices.find((choice) => choice.id === props.mode)
  return (
    <div className="mx-3 mb-2 space-y-2 rounded-md border border-border bg-card p-3 text-card-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={id} className="text-sm">
          {translate('stsWorkModes.label', 'Work mode')}
        </Label>
        <Select
          value={props.mode}
          onValueChange={(value) => {
            if (isStsWorkModeId(value)) {
              props.onChange(value)
            }
          }}
        >
          <SelectTrigger id={id} size="sm" aria-describedby={`${id}-description`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {choices.map((choice) => (
              <SelectItem key={choice.id} value={choice.id}>
                {choice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {translate('stsWorkModes.nextMessage', 'Applies to your next messages.')}
        </span>
      </div>
      <p id={`${id}-description`} className="text-xs text-muted-foreground">
        {selected?.description}
      </p>
    </div>
  )
}
