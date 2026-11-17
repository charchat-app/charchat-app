// 저장 결과를 기본 설정 탭 입력값에 반영하는 저장 흐름 로직 (story-publish 책임, CLAUDE.md 경계 규칙 3).
import type { BasicInfoValues } from '@/features/story-setup';
import type { FieldIssue } from '@/lib/api-client';

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
