// story-publish: 서버 호출. 화면에서 fetch를 직접 쓰지 않고 이 파일을 거친다.
// 서버 필드 이름(world_description·draft 등)과 앱 타입(world·'임시 저장' 등)의 변환도 여기서만 한다.
import { ApiError, apiRequest, type FieldIssue } from '@/lib/api-client';
import type { SaveState } from '@/shared/story-types';

import type {
  EditorStory,
  ServerSaveState,
  StoryBasicFields,
  StoryBasicWriteDto,
  StoryResponseDto,
  StorySummary,
  StorySummaryDto,
} from './types';

const STORIES = '/creation/stories';

const SAVE_STATE_LABEL: Record<ServerSaveState, SaveState> = {
  draft: '임시 저장',
  private: '비공개',
  public: '공개',
};

/** 서버 필드 이름 → StoryDraft 필드 이름. 목록에 없는 이름은 그대로 둔다. */
const FIELD_NAME: Record<string, string> = { world_description: 'world' };

export function toSaveState(value: ServerSaveState): SaveState {
  return SAVE_STATE_LABEL[value];
}

export function toAppIssues(issues: FieldIssue[]): FieldIssue[] {
  return issues.map((i) => ({ ...i, field: FIELD_NAME[i.field] ?? i.field }));
}

export function toEditorStory(dto: StoryResponseDto): EditorStory {
  return {
    id: String(dto.id),
    title: dto.title ?? '',
    subtitle: dto.subtitle ?? '',
    world: dto.world_description ?? '',
    tags: dto.tags,
    characters: dto.characters.map((c) => ({
      id: String(c.id),
      name: c.name ?? '',
      detail: c.description ?? '',
    })),
    saveState: toSaveState(dto.save_state),
    updatedAt: dto.saved_at,
    issues: toAppIssues(dto.issues),
  };
}

function toSummary(dto: StorySummaryDto): StorySummary {
  return {
    id: String(dto.id),
    title: dto.title ?? '',
    saveState: toSaveState(dto.save_state),
    updatedAt: dto.saved_at,
  };
}

/** 빈 입력은 서버에 null로 보낸다. 공백만 있는 값은 사용자가 쓴 그대로 보낸다. */
function emptyToNull(value: string): string | null {
  return value === '' ? null : value;
}

/**
 * 앱의 캐릭터 id(문자열)를 서버 id(양의 정수)로 바꾼다. 시드 데이터의 'seed-…'처럼 서버가 발급하지 않은 id는
 * NaN → null(새 캐릭터)로 바뀌어 기존 캐릭터가 삭제되므로, 보내지 않고 오류로 막는다.
 */
function toServerId(id: string): number {
  if (!/^[1-9]\d*$/.test(id)) {
    throw new ApiError(0, 'INVALID_CHARACTER_ID', `서버에 저장되지 않은 캐릭터 id입니다: ${id}`);
  }
  return Number(id);
}

export function toWriteDto(fields: StoryBasicFields): StoryBasicWriteDto {
  return {
    title: emptyToNull(fields.title),
    subtitle: emptyToNull(fields.subtitle),
    world_description: emptyToNull(fields.world),
    tags: fields.tags,
    characters: fields.characters.map((c) => ({
      id: c.id === undefined ? null : toServerId(c.id),
      name: emptyToNull(c.name),
      description: emptyToNull(c.detail),
    })),
  };
}

export async function listStories(): Promise<StorySummary[]> {
  const rows = await apiRequest<StorySummaryDto[]>(STORIES);
  return rows.map(toSummary);
}

export async function getStory(id: string): Promise<EditorStory> {
  return toEditorStory(await apiRequest<StoryResponseDto>(`${STORIES}/${id}`));
}

/** 빈 스토리를 임시 저장 상태로 만든다. */
export async function createStory(): Promise<EditorStory> {
  const dto = await apiRequest<StoryResponseDto>(STORIES, { method: 'POST', body: '{}' });
  return toEditorStory(dto);
}

export async function saveStoryBasic(id: string, fields: StoryBasicFields): Promise<EditorStory> {
  const dto = await apiRequest<StoryResponseDto>(`${STORIES}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(toWriteDto(fields)),
  });
  return toEditorStory(dto);
}
