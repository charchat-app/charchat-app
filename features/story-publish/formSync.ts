// 저장 결과를 기본 설정 탭 입력값에 반영하는 저장 흐름 로직 (story-publish 책임, CLAUDE.md 경계 규칙 3).
import type { BasicInfoValues } from '@/features/story-setup';
import type { FieldIssue } from '@/lib/api-client';
import { basicTextLength, MAX_BASIC_TEXT_LENGTH, MAX_CHARACTERS } from '@/features/story-setup';

/**
 * 이미 받은 안내 중 현재 입력에서 해소된 누락·인원·합산 글자 수 오류만 제외한다.
 * 합산 글자 수(AC09)는 폼이 지금 입력값으로 직접 세어 보여 주므로, 서버 안내는 아직 넘을 때만
 * 상단 안내를 띄우는 근거로 남기고, 줄여서 한도 안이 되면 지운다. 이름 형식·중복, 태그 안내는 다음 저장 결과까지 유지한다.
 */
export function currentBasicIssues(issues: FieldIssue[], sentKeys: string[], values: BasicInfoValues): FieldIssue[] {
  return issues.flatMap((issue) => {
    const match = /^characters\[(\d+)\]\.(name|description)$/.exec(issue.field);
    const character = match ? values.characters.find((c) => c.key === sentKeys[Number(match[1])]) : undefined;
    if (match && !character) return [];
    if (issue.code === 'REQUIRED') {
      const value = character
        ? match?.[2] === 'name'
          ? character.name
          : character.detail
        : issue.field === 'title' || issue.field === 'subtitle' || issue.field === 'world'
          ? values[issue.field]
          : undefined;
      // Python str.strip()과 같은 공백 범위로 판단한다(예: U+0085, BOM 제외).
      // eslint-disable-next-line no-control-regex
      if (value && /[^\p{White_Space}\u001c-\u001f]/u.test(value)) return [];
    }
    if (issue.code === 'BASIC_TEXT_TOO_LONG' && basicTextLength(values) <= MAX_BASIC_TEXT_LENGTH) return [];
    if (issue.field === 'characters' && issue.code === 'CHARACTER_COUNT_OUT_OF_RANGE') {
      const count = values.characters.length;
      if (count >= 1 && count <= MAX_CHARACTERS) return [];
      return [{ ...issue, message: issue.message.replace(/\(현재 \d+명\)/, `(현재 ${count}명)`) }];
    }
    return [issue];
  });
}

/**
 * 저장에 성공하면 서버가 발급한 id를 입력 중인 캐릭터에 붙인다.
 * 다음 저장 때 같은 캐릭터로 수정되게 해서(새로 만들고 지우지 않게) 연결을 유지한다.
 * `sentKeys`는 저장 요청에 보낸 순서, `savedIds`는 응답의 같은 순서 id다.
 */
export function applySavedIds(values: BasicInfoValues, sentKeys: string[], savedIds: string[]): BasicInfoValues {
  const idByKey = new Map(sentKeys.map((key, i) => [key, savedIds[i]]));
  return {
    ...values,
    characters: values.characters.map((c) => (idByKey.has(c.key) ? { ...c, id: idByKey.get(c.key) } : c)),
  };
}

/**
 * 서버 issues를 화면 위치로 바꾼다. 서버의 `characters[i]`는 저장 요청의 i번째이므로
 * 그때 보낸 key로 옮겨 두면, 이후 추가·삭제로 순서가 바뀌어도 오류가 엉뚱한 인물에 붙지 않는다.
 * 반환 key: 'title' | 'subtitle' | 'world' | 'characters' | '<characterKey>.name' | '<characterKey>.detail'
 */
export function toFieldErrors(issues: FieldIssue[], sentKeys: string[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const match = /^characters\[(\d+)\]\.(name|description)$/.exec(issue.field);
    let key = issue.field;
    if (match) {
      const charKey = sentKeys[Number(match[1])];
      if (charKey === undefined) continue;
      key = `${charKey}.${match[2] === 'description' ? 'detail' : 'name'}`;
    }
    errors[key] ??= issue.message;
  }
  return errors;
}
