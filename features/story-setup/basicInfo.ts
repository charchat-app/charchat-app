// 기본 설정 탭 ↔ StoryDraft 저장 조각 변환 (CLAUDE.md 경계 규칙 3)
import type { BasicInfoDraft, BasicInfoValues } from './types';

const TAG_SEPARATOR = ',';

/** 저장된 스토리에서 기본 설정 탭의 입력값을 만든다. */
export function fromDraft(draft: BasicInfoDraft): BasicInfoValues {
  return {
    title: draft.title,
    subtitle: draft.subtitle,
    world: draft.world,
    tagsText: draft.tags.join(`${TAG_SEPARATOR} `),
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

/** 기본 설정 탭의 입력값을 저장할 StoryDraft 조각으로 바꾼다. 제목·소개·세계관은 원문 그대로다. */
export function toDraftPatch(values: BasicInfoValues): BasicInfoDraft {
  return {
    title: values.title,
    subtitle: values.subtitle,
    world: values.world,
    tags: parseTags(values.tagsText),
  };
}
