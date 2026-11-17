// 기본 설정 탭 ↔ StoryDraft 저장 조각 변환 (CLAUDE.md 경계 규칙 3)
import type { FieldIssue } from '@/lib/api-client';

import type { BasicInfoDraft, BasicInfoValues, CharacterValues } from './types';

const TAG_SEPARATOR = ',';
export const MAX_CHARACTERS = 10;

let keySeq = 0;
/** 아직 저장하지 않은 캐릭터의 화면용 key */
export function newCharacterKey(): string {
  keySeq += 1;
  return `new-${keySeq}`;
}

/** 저장된 스토리에서 기본 설정 탭의 입력값을 만든다. */
export function fromDraft(draft: BasicInfoDraft): BasicInfoValues {
  return {
    title: draft.title,
    subtitle: draft.subtitle,
    world: draft.world,
    tagsText: draft.tags.join(`${TAG_SEPARATOR} `),
    characters: draft.characters.map((c) => ({ ...c, key: c.id ?? newCharacterKey() })),
  };
}

/**
 * 쉼표로 나눈 해시태그 목록. 구분용 쉼표 앞뒤 띄어쓰기와 빈 항목만 버리고 태그 표기는 바꾸지 않는다.
 * 길이·개수 검증은 해시태그 피처(AC13·AC15)에서 다룬다.
 */
export function parseTags(text: string): string[] {
  return text
    .split(TAG_SEPARATOR)
    .map((t) => t.trim())
    .filter((t) => t !== '');
}

/** 기본 설정 탭의 입력값을 저장할 StoryDraft 조각으로 바꾼다. 이름·상세를 포함한 원문은 그대로다. */
export function toDraftPatch(values: BasicInfoValues): BasicInfoDraft {
  return {
    title: values.title,
    subtitle: values.subtitle,
    world: values.world,
    tags: parseTags(values.tagsText),
    characters: values.characters.map(({ id, name, detail }) => ({ id, name, detail })),
  };
}

export function addCharacter(values: BasicInfoValues): BasicInfoValues {
  if (values.characters.length >= MAX_CHARACTERS) return values;
  const added: CharacterValues = { key: newCharacterKey(), name: '', detail: '' };
  return { ...values, characters: [...values.characters, added] };
}

/** 선택한 캐릭터만 빼고 남은 캐릭터의 이름·상세·순서는 그대로 둔다 (AC12). */
export function removeCharacter(values: BasicInfoValues, key: string): BasicInfoValues {
  return { ...values, characters: values.characters.filter((c) => c.key !== key) };
}

export function updateCharacter(
  values: BasicInfoValues,
  key: string,
  patch: Partial<Pick<CharacterValues, 'name' | 'detail'>>,
): BasicInfoValues {
  return { ...values, characters: values.characters.map((c) => (c.key === key ? { ...c, ...patch } : c)) };
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
