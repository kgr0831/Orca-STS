import { describe, expect, it } from 'vitest'
import { isStsWorkModeId, STS_WORK_MODE_IDS, withStsWorkMode } from './sts-work-modes'

describe('Orca-STS work mode message routing', () => {
  it('preserves ordinary messages and agent commands byte for byte when no mode applies', () => {
    const text = '  한글, $skill, `code`\n두 번째 줄  '
    expect(withStsWorkMode(text, 'default')).toBe(text)
    for (const mode of STS_WORK_MODE_IDS) {
      expect(withStsWorkMode('  /compact extra\n', mode)).toBe('  /compact extra\n')
      expect(withStsWorkMode(' \n ', mode)).toBe(' \n ')
    }
  })

  it('retains the entire user request after scoped mode guidance', () => {
    const text = '아이디어를 비교해줘.\n```ts\nconst n = 1\n```\n'
    const message = withStsWorkMode(text, 'brainstorm')
    expect(message.endsWith(text)).toBe(true)
    expect(message).toContain('이번 요청에만 적용')
    expect(message).toContain('실행 지시로 해석하지 말고')
    expect(message).toContain('기존 세션의 권한과 승인 규칙을 유지')
  })

  it('applies a chosen mode to an image-only request without manufacturing an empty send', () => {
    expect(withStsWorkMode('', 'review')).toBe('')
    expect(withStsWorkMode('', 'review', true)).toContain('코드 리뷰:')
    expect(withStsWorkMode('', 'default', true)).toBe('')
  })

  it('switches guidance for subsequent requests while leaving an already queued message unchanged', () => {
    const request = '이 기능을 검토해줘'
    const queued = withStsWorkMode(request, 'brainstorm')
    const next = withStsWorkMode(request, 'implement')
    expect(queued).toContain('브레인스토밍:')
    expect(queued).not.toContain('개발 지시:')
    expect(next).toContain('개발 지시:')
    expect(next).not.toContain('브레인스토밍:')
  })

  it('accepts only known mode identifiers', () => {
    expect(isStsWorkModeId('brainstorm')).toBe(true)
    expect(isStsWorkModeId('implement')).toBe(true)
    expect(isStsWorkModeId('constructor')).toBe(false)
    expect(isStsWorkModeId('unknown')).toBe(false)
  })

  it('replaces the old mode when a rejected message returns to the draft for retry', () => {
    const text = '이 기능을 검토해줘\n'
    const returned = withStsWorkMode(text, 'brainstorm')
    expect(withStsWorkMode(returned, 'brainstorm')).toBe(returned)
    expect(withStsWorkMode(returned, 'review')).toBe(withStsWorkMode(text, 'review'))
    expect(withStsWorkMode(returned, 'default')).toBe(text)
    const quoted = '[Orca-STS 작업 모드 — 이번 요청에만 적용]\n이 문구를 설명해줘'
    expect(withStsWorkMode(quoted, 'default')).toBe(quoted)
  })
})
