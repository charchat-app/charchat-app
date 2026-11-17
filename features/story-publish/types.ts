// story-publish: 이 도메인 전용 타입. 여러 도메인이 쓰면 shared/story-types로 옮긴다.
import type { BasicInfoDraft } from '@/features/story-setup';
import type { FieldIssue } from '@/lib/api-client';
import type { StoryDraft } from '@/shared/story-types';

/** 서버 저장 상태 값. 화면에는 shared/story-types의 한글 SaveState로 바꿔 보여 준다. */
export type ServerSaveState = 'draft' | 'private' | 'public';

/** GET/POST/PUT /creation/stories 응답 (charchat-server story_basic StoryResponse) */
export type StoryResponseDto = {
  id: number;
  save_state: ServerSaveState;
  title: string | null;
  subtitle: string | null;
  world_description: string | null;
  tags: string[];
  characters: CharacterDto[];
  saved_at: string;
  issues: FieldIssue[];
};

export type CharacterDto = {
  id: number;
  name: string | null;
  description: string | null;
  position: number;
};

/** GET /creation/stories 목록 한 줄 */
export type StorySummaryDto = {
  id: number;
  save_state: ServerSaveState;
  title: string | null;
  saved_at: string;
};

/**
 * PUT /creation/stories/{id} 요청. tags·characters를 빼면 서버가 기존 값을 유지한다.
 * characters를 보내면 그 목록이 전체 캐릭터가 된다(빠진 기존 캐릭터는 삭제, id 없으면 새로 추가).
 */
export type StoryBasicWriteDto = {
  title: string | null;
  subtitle: string | null;
  world_description: string | null;
  tags?: string[];
  characters?: { id: number | null; name: string | null; description: string | null }[];
};

/** 기본 정보 저장 단위. story-setup의 toDraftPatch() 결과다. */
export type StoryBasicFields = BasicInfoDraft;

/**
 * 편집 화면이 서버에서 받아 쓰는 스토리. 지금은 기본 정보·캐릭터만 서버와 연결되어 있어
 * StoryDraft 전체가 아니라 그 부분과 저장 상태만 담는다.
 */
export type EditorStory = StoryBasicFields &
  Pick<StoryDraft, 'id' | 'saveState' | 'updatedAt'> & {
    /**
     * 완성 저장(공개·비공개)을 막는 항목. field는 title·subtitle·world·characters와
     * 서버 순서 기준의 characters[i].name / characters[i].description이다.
     */
    issues: FieldIssue[];
  };

export type StorySummary = Pick<StoryDraft, 'id' | 'title' | 'saveState' | 'updatedAt'>;
