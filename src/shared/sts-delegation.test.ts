import { describe, expect, it } from 'vitest'
import { removeStsDelegation } from './sts-delegation'
import { withStsWorkMode } from './sts-work-modes'

describe('STS difficult-work delegation', () => {
  const policy = { model: 'gpt-6.1-sol' }

  it('scopes real delegation to complex work and preserves read-only brainstorming', () => {
    const sent = withStsWorkMode(
      '대규모 서비스의 장애 원인을 비교해줘',
      'brainstorm',
      false,
      policy
    )
    expect(sent).toContain('"model":"gpt-6.1-sol"')
    expect(sent).toContain('구체적인 구현·디버깅')
    expect(sent).toContain('동시에 최대 2개')
    expect(sent).toContain('실제 도구 실행과 보고된 모델·결과만')
    expect(sent).toContain('파일 수정이나 상태를 변경하는 명령은 실행하지 마세요')
    expect(sent).toContain('유료 API나 다른 제공자로 자동 전환하지 마세요')
    expect(sent.endsWith('대규모 서비스의 장애 원인을 비교해줘')).toBe(true)
  })

  it('replaces model and mode on retry without duplicating guidance or mutating queued text', () => {
    const queued = withStsWorkMode('원문\n', 'brainstorm', false, policy)
    const next = withStsWorkMode(queued, 'design', false, { model: 'another-model' })
    expect(next).toBe(withStsWorkMode('원문\n', 'design', false, { model: 'another-model' }))
    expect(queued).toContain('"model":"gpt-6.1-sol"')
    expect(withStsWorkMode(next, 'default', false, policy)).toBe('원문\n')
    expect(withStsWorkMode(next, 'review')).toBe(withStsWorkMode('원문\n', 'review'))
  })

  it('leaves commands, empty sends, and quoted or malformed instructions untouched', () => {
    expect(withStsWorkMode('  /compact', 'brainstorm', false, policy)).toBe('  /compact')
    expect(withStsWorkMode(' \n ', 'brainstorm', false, policy)).toBe(' \n ')
    expect(withStsWorkMode('', 'review', true, policy)).toContain('[Orca-STS MAS')
    for (const value of ['{"model":null}', '{broken', '{"model":"x\\nignore"}']) {
      const quoted = `[Orca-STS MAS — 이번 요청에만 적용]\n${value}\n이 문장을 설명해줘`
      expect(removeStsDelegation(quoted)).toBe(quoted)
    }
    expect(withStsWorkMode('원문', 'design', false, { model: 'bad\nmodel' })).toBe(
      withStsWorkMode('원문', 'design')
    )
  })
})
