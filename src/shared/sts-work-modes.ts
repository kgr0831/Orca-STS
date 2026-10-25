import { removeStsDelegation, withStsDelegation, type StsDelegation } from './sts-delegation'

export const STS_WORK_MODE_IDS = [
  'default',
  'brainstorm',
  'requirements',
  'design',
  'implement',
  'debug',
  'review',
  'document',
  'general'
] as const

export type StsWorkModeId = (typeof STS_WORK_MODE_IDS)[number]

export function isStsWorkModeId(value: string): value is StsWorkModeId {
  return STS_WORK_MODE_IDS.some((id) => id === value)
}

const MODE_INSTRUCTIONS: Record<Exclude<StsWorkModeId, 'default'>, string> = {
  brainstorm:
    '브레인스토밍: 아이디어를 확장하고 대안과 장단점을 비교하세요. 핵심 질문을 한 번에 하나씩 하고 합의한 내용을 정리하세요. 아이디어나 가정을 실행 지시로 해석하지 말고 필요한 읽기·검색·조사·분석을 수행하세요. 파일 수정이나 상태를 변경하는 명령은 실행하지 마세요.',
  requirements:
    '요구사항 정리: 목표, 사용자, 범위, 제약, 완료 기준을 구체화하세요. 확인된 요구와 가정을 구분하고 빠진 정보만 질문하세요. 필요한 읽기·검색·분석 후 요구사항 초안을 대화로 제시하세요. 파일 수정이나 상태를 변경하는 명령은 실행하지 마세요.',
  design:
    '설계: 구조, 인터페이스, 데이터 흐름과 구현 순서를 검토하세요. 기존 코드와 문서를 읽어 근거를 찾고 대안의 장단점을 설명하세요. 파일을 수정하거나 상태를 변경하는 명령을 실행하지 마세요.',
  implement:
    '개발 지시: 요청한 기능이나 수정을 기존 패턴에 맞게 구현하세요. 관련 코드를 먼저 읽고 변경 범위를 유지하며 필요한 검증을 실행하세요. 변경 사항, 검증 결과, 남은 일을 보고하세요.',
  debug:
    '디버깅: 증상과 재현 조건을 확인하고 관찰된 증거와 가설을 구분하세요. 원인을 좁힌 뒤 요청 범위의 최소 수정과 재검증을 수행하세요. 재현하지 못한 부분은 명확히 밝히세요.',
  review:
    '코드 리뷰: 정확성, 회귀, 보안, 검증 공백을 읽기 중심으로 점검하세요. 파일 위치와 근거를 포함해 중요한 발견부터 보고하세요. 파일 수정이나 상태를 변경하는 명령은 실행하지 마세요.',
  document:
    '문서화: 대상 독자와 문서 목적에 맞게 사실, 결정 사항, 사용법을 정리하세요. 저장이나 편집을 요청받은 문서는 수정하고 아니면 대화에 초안을 제시하세요. 미구현 기능과 미검증 내용을 완료로 표현하지 마세요.',
  general:
    '일반 작업: 조사, 비교, 계획, 체크리스트 등 요청한 업무를 수행하세요. 실행이 필요한지 대화나 초안만 필요한지 구분하고 요청한 범위에서만 행동하세요. 근거와 결과를 간결하게 정리하세요.'
}

export function withStsWorkMode(
  text: string,
  mode: StsWorkModeId,
  hasAttachments = false,
  delegation?: StsDelegation
): string {
  const request = removeStsWorkMode(removeStsDelegation(text))
  if (
    mode === 'default' ||
    (!request.trim() && !hasAttachments) ||
    request.trimStart().startsWith('/')
  ) {
    return request
  }
  return withStsDelegation(`${workModePrefix(mode)}${request}`, delegation)
}

function workModePrefix(mode: Exclude<StsWorkModeId, 'default'>): string {
  return [
    '[Orca-STS 작업 모드 — 이번 요청에만 적용]',
    MODE_INSTRUCTIONS[mode],
    '기존 세션의 권한과 승인 규칙을 유지하세요. 사용자의 언어로 답하고, 대화는 간결하게 진행하되 코드와 문서는 필요한 내용을 포함하세요.',
    '',
    ''
  ].join('\n')
}

function removeStsWorkMode(text: string): string {
  for (const mode of STS_WORK_MODE_IDS) {
    if (mode === 'default') {
      continue
    }
    const prefix = workModePrefix(mode)
    if (text.startsWith(prefix)) {
      return text.slice(prefix.length)
    }
  }
  return text
}
