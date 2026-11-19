// story-setup: 이 도메인 전용 타입. 여러 도메인이 쓰면 shared/story-types로 옮긴다.
import type { Character, StoryDraft } from '@/shared/story-types';

/** 기본 설정 탭이 저장하는 캐릭터 조각. 사진(photoUrls)은 CREATE-US-06에서 다룬다. */
export type CharacterDraft = Pick<Character, 'id' | 'name' | 'detail'>;

/** 기본 설정 탭이 저장하는 StoryDraft 조각 (CREATE-US-01 기본 정보·캐릭터) */
export type BasicInfoDraft = Pick<StoryDraft, 'title' | 'subtitle' | 'world' | 'tags'> & {
  characters: CharacterDraft[];
};

/** 입력 중인 캐릭터 한 명. key는 화면 목록용 고유값이고 저장되지 않는다. */
export type CharacterValues = CharacterDraft & { key: string };

/** 기본 설정 탭의 입력 상태. */
export type BasicInfoValues = {
  title: string;
  subtitle: string;
  world: string;
  /** 칩으로 추가한 해시태그 원문 */
  tags: string[];
  /**
   * 해시태그 입력창에 쓰고 아직 '추가'하지 않은 글자. 저장할 때 태그로 포함해
   * 추가 버튼을 누르지 않고 저장해도 입력이 사라지지 않게 한다.
   */
  tagInput: string;
  characters: CharacterValues[];
};

/** 해시태그 자동검색 후보 (CREATE-US-01-AC17) */
export type TagSuggestion = {
  name: string;
  /** 이 태그가 붙은 공개 스토리 수. 비공개·임시 저장 제외 */
  publicStoryCount: number;
};
