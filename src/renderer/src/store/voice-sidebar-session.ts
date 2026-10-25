import { useAppStore } from '@/store'
import { planAgentSessionLaunch } from '@/lib/agent-session-launch-plan'
import { worktreeLaunchWorkspace } from '@/lib/agent-launch-route-input'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { beginStructuredAgentSessionProvisionalLaunch } from '@/lib/agent-session/structured-agent-session-provisional-tab'
import { resolveStructuredAgentSessionOwner } from '@/runtime/structured-agent-session-owner'
import { structuredAgentSessionTabId } from '../../../shared/structured-agent-session-projection'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { useVoiceSidebarSessions, type VoiceSessionEntry } from './voice-sidebar-state'

export function useVoiceSidebarWorkspace() {
  const worktreeId = useAppStore((s) => s.activeWorktreeId)
  const executionHostId = useAppStore((s) =>
    worktreeId ? resolveStructuredAgentSessionOwner(s, worktreeId) : null
  )
  const key = worktreeId && executionHostId ? JSON.stringify([executionHostId, worktreeId]) : null
  const entry = useVoiceSidebarSessions((s) => (key ? s.entries[key] : undefined))
  return { worktreeId, executionHostId, key, entry }
}

export async function openVoiceSidebarSession(
  key: string,
  worktreeId: string,
  executionHostId: ExecutionHostId
): Promise<void> {
  const existing = useVoiceSidebarSessions.getState().entries[key]
  if (existing && existing.status !== 'failed') {
    return
  }
  const update = (entry: VoiceSessionEntry) =>
    useVoiceSidebarSessions.setState((s) => ({
      entries: { ...s.entries, [key]: entry }
    }))
  update({ status: 'opening' })
  try {
    const plan = planAgentSessionLaunch(useAppStore.getState(), {
      requestId: newAgentLaunchRequestId(),
      agent: 'codex',
      requestedSurface: 'chat',
      selectedExecutionHostId: executionHostId,
      workspace: worktreeLaunchWorkspace(worktreeId)
    })
    const launch = beginStructuredAgentSessionProvisionalLaunch({
      plan,
      activate: false,
      hooks: { activate: false }
    })
    const result = await launch?.settlement
    if (result?.kind === 'structured' || result?.kind === 'visibility-unknown') {
      update({
        status: 'ready',
        session: {
          sessionId: result.sessionId,
          tabId: structuredAgentSessionTabId(result.sessionId),
          executionHostId
        }
      })
    } else {
      update({ status: 'failed' })
    }
  } catch {
    update({ status: 'failed' })
  }
}
