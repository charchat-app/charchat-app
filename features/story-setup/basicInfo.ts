// 기본 설정 탭 ↔ StoryDraft 저장 조각 변환 (CLAUDE.md 경계 규칙 3)
import { findSameTag, normalizeTagInput } from './tags';
import type { BasicInfoDraft, BasicInfoValues, CharacterValues } from './types';

export const MAX_CHARACTERS = 10;
/** 제목·한 줄 소개·세계관과 모든 캐릭터 이름·상세의 합산 한도 (CREATE-US-01-AC09) */
export const MAX_BASIC_TEXT_LENGTH = 3000;

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
    tags: draft.tags,
    tagInput: '',
    characters: draft.characters.map((c) => ({ ...c, key: c.id ?? newCharacterKey() })),
  };
}

/** 입력창에 남아 있는 태그도 저장 대상에 넣는다. 이미 있는(같은 태그로 취급되는) 태그면 넣지 않는다. */
function withPendingTag(values: BasicInfoValues): string[] {
  const pending = normalizeTagInput(values.tagInput);
  if (pending === '' || findSameTag(values.tags, pending) !== undefined) return values.tags;
  return [...values.tags, pending];
}

/** 기본 설정 탭의 입력값을 저장할 StoryDraft 조각으로 바꾼다. 이름·상세를 포함한 원문은 그대로다. */
export function toDraftPatch(values: BasicInfoValues): BasicInfoDraft {
  return {
    title: values.title,
    subtitle: values.subtitle,
    world: values.world,
    tags: withPendingTag(values),
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
 * AC09 합산 글자 수: 제목·한 줄 소개·세계관 + 모든 캐릭터 이름·상세.
 * 공백·줄바꿈 포함, 코드 포인트 단위(이모지 1자, 서버 len()과 같음). 해시태그·퓨샷·인트로는 제외한다.
 */
export function basicTextLength(values: BasicInfoValues): number {
  const parts = [values.title, values.subtitle, values.world];
  for (const c of values.characters) parts.push(c.name, c.detail);
  return parts.reduce((sum, part) => sum + Array.from(part).length, 0);
}
