// 기본 설정 탭 ↔ StoryDraft 저장 조각 변환 (CLAUDE.md 경계 규칙 3)
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
