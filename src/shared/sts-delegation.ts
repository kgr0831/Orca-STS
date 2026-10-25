export type StsDelegation = { model: string | null }

const HEADER = '[Orca-STS MAS — 이번 요청에만 적용]\n'
const INSTRUCTIONS = [
  '어려운 작업은 Codex의 실제 하위 에이전트 도구로 위임하세요. 조사·검색뿐 아니라 복잡한 설계, 구체적인 구현·디버깅, 원인 분석, 검증, 다단계 계획과 깊은 판단이 필요한 작업을 포함합니다. 단순한 대화와 정리는 주 에이전트가 직접 처리하세요.',
  'model 설정이 지정되면 하위 에이전트를 생성할 때 해당 모델을 명시하세요. null이면 도구에서 사용 가능한 모델 중 어려운 추론에 적합한 모델을 선택하세요. reasoning_effort는 high를 요청하고 특히 어려운 문제는 지원되는 더 높은 수준을 사용하세요. 모델별 지원 수준을 확인하세요. 모델을 바꾸려면 새 문맥이 필요한 도구에서는 작업에 필요한 맥락만 명시적으로 전달하세요.',
  '독립적인 작업만 나누고 동시에 최대 2개 하위 에이전트만 요청하세요. 재위임하지 않도록 지시하고 필요한 결과를 받은 뒤 종료하세요. 중복 조사와 반복 호출을 피하세요. 수정 작업은 파일별 담당자를 한 명으로 정하고 다른 작업자의 변경을 되돌리지 않도록 지시하세요.',
  '현재 작업 모드와 기존 세션의 권한·승인 규칙을 모든 하위 에이전트에게 전달하세요. 브레인스토밍·요구사항·설계·리뷰에서는 읽기·검색·분석만 위임하고 파일 수정이나 상태 변경은 금지하세요. 구체적인 구현 요청도 현재 모드에서 허용할 때만 실행하세요.',
  '주 에이전트는 결과를 기다리고 근거·충돌·검증 공백을 확인한 뒤 사용자에게 간결하게 종합하세요. 실제 도구 실행과 보고된 모델·결과만 위임 활동으로 설명하세요. 도구나 모델을 사용할 수 없으면 이를 알리고 강한 모델로 위임했다고 주장하지 마세요. 유료 API나 다른 제공자로 자동 전환하지 마세요.',
  '[Orca-STS MAS 지침 끝]',
  '',
  ''
].join('\n')

function isModel(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/.test(value))
  )
}

function prefix(delegation: StsDelegation): string {
  return `${HEADER}${JSON.stringify(delegation)}\n${INSTRUCTIONS}`
}

export function removeStsDelegation(text: string): string {
  if (!text.startsWith(HEADER)) {
    return text
  }
  const end = text.indexOf('\n', HEADER.length)
  if (end === -1) {
    return text
  }
  try {
    const value: unknown = JSON.parse(text.slice(HEADER.length, end))
    if (
      typeof value !== 'object' ||
      value === null ||
      !('model' in value) ||
      !isModel(value.model)
    ) {
      return text
    }
    const expected = prefix({ model: value.model })
    return text.startsWith(expected) ? text.slice(expected.length) : text
  } catch {
    return text
  }
}

export function withStsDelegation(text: string, delegation: StsDelegation | undefined): string {
  const request = removeStsDelegation(text)
  if (!delegation || !isModel(delegation.model)) {
    return request
  }
  return `${prefix(delegation)}${request}`
}
