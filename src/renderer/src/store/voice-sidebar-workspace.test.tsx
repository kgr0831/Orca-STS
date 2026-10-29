// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LOCAL_EXECUTION_HOST_ID, toRuntimeExecutionHostId } from '../../../shared/execution-host'
import { useVoiceSidebarWorkspace } from './voice-sidebar-session'

const fake = vi.hoisted(() => ({
  tab: {
    id: 'existing-terminal',
    worktreeId: 'folder',
    contentType: 'terminal',
    executionHostId: 'local'
  },
  structuredOwner: vi.fn(),
  workspaceOwner: vi.fn()
}))
vi.mock('@/store', () => ({
  useAppStore: (select: (state: unknown) => unknown) =>
    select({ activeWorktreeId: 'folder', getActiveTab: () => fake.tab })
}))
vi.mock('@/runtime/structured-agent-session-owner', () => ({
  structuredAgentSessionOwnerForTab: fake.structuredOwner,
  resolveStructuredAgentSessionOwner: fake.structuredOwner
}))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  getKnownExecutionHostIdForWorktree: fake.workspaceOwner
}))
vi.mock('@/lib/agent-session-launch-plan', () => ({ planAgentSessionLaunch: vi.fn() }))
vi.mock('@/lib/agent-launch-route-input', () => ({ worktreeLaunchWorkspace: vi.fn() }))
vi.mock('@/lib/agent-launch-request-id', () => ({ newAgentLaunchRequestId: vi.fn() }))
vi.mock('@/lib/agent-session/structured-agent-session-provisional-tab', () => ({
  beginStructuredAgentSessionProvisionalLaunch: vi.fn()
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it.each([LOCAL_EXECUTION_HOST_ID, toRuntimeExecutionHostId('paired-host')])(
  'retains the active terminal and its owning host %s without creating a chat',
  (executionHostId) => {
    fake.tab.executionHostId = executionHostId
    const { result } = renderHook(useVoiceSidebarWorkspace)
    expect(result.current.tab?.id).toBe('existing-terminal')
    expect(result.current.executionHostId).toBe(executionHostId)
    expect(result.current.key).toBe(JSON.stringify([executionHostId, 'folder']))
    expect(fake.structuredOwner).not.toHaveBeenCalled()
    expect(fake.workspaceOwner).not.toHaveBeenCalled()
  }
)
