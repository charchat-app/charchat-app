// story-setup: 이 도메인 전용 타입. 여러 도메인이 쓰면 shared/story-types로 옮긴다.
import type { StoryDraft } from '@/shared/story-types';

/** 기본 설정 탭이 저장하는 StoryDraft 조각 (CREATE-US-01 기본 정보) */
export type BasicInfoDraft = Pick<StoryDraft, 'title' | 'subtitle' | 'world' | 'tags'>;

/**
 * 기본 설정 탭의 입력 상태. 해시태그는 입력 중인 원문(`tagsText`)을 그대로 들고 있다가
 * 저장 조각을 만들 때만 목록으로 나눈다. 쉼표 입력은 해시태그 피처(칩 입력·자동검색) 전까지의 임시 방식이다.
 */
export type BasicInfoValues = {
  title: string;
  subtitle: string;
  world: string;
  tagsText: string;
};
