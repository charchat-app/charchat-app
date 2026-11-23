/**
 * 스토리·등장 캐릭터 이미지 목록 조회·저장 (CREATE-US-06). 저장 로직은 story-publish에만 둔다.
 * 서버: GET/PUT /creation/stories/{id}/images. 같은 요청이 다시 가도 한 번만 반영되게 요청키를 보낸다.
 */
import { apiRequest } from '@/lib/api-client';
import type { StoryImagesPatch, StoryImagesValues } from '@/features/story-setup';
import { fromImageDto, type ImageDto } from '@/shared/media';

type StoryImagesDto = {
  story_id: number;
  save_state: 'draft' | 'private' | 'public';
  saved_at: string;
  story_images: ImageDto[];
  characters: { character_id: number; name: string | null; images: ImageDto[] }[];
  characters_missing_images: number[];
  working_copy_saved_at?: string | null;
  /** CREATE-US-07-AC09 저장 응답 전용(제안 계약): mode auto 요청을 마무리 후보로 기록했으면 그 요청 키 */
  finalize_auto_request_id?: string | null;
};

export type StoryImagesSnapshot = {
  values: StoryImagesValues;
  saveState: StoryImagesDto['save_state'];
  savedAt: string;
  /** 값이 있으면 values는 아직 반영하지 않은 사진 임시 저장본이다. 이용자는 이전 사진을 본다. */
  workingCopySavedAt: string | null;
  /**
   * CREATE-US-07-AC09 저장 응답 전용(읽기): mode auto로 보낸 요청의 응답이 finalize_auto_request_id로 보낸 키를
   * 그대로 돌려주고 working_copy_saved_at이 있을 때만 그 키를 둔다. 조회 응답·그 밖의 저장 응답에는 두지 않는다.
   */
  finalizableAutoRequestId?: string;
};

/** temporary: 비공개·공개 스토리에서 임시 저장본에만 둔다. save: 바로 반영한다(미등록 스토리). */
export type StoryImagesSaveKind = 'temporary' | 'save';
/**
 * CREATE-US-07-AC09 opt-in 표시. auto면 본문에 mode: 'auto'를 싣는다(비공개·공개 스토리의 사진만 자동 임시 저장 전용).
 * 서버가 그 요청을 마무리 후보로 기록하면 응답에 finalize_auto_request_id를 돌려준다. 없으면 본문은 지금과 같다.
 */
export type StoryImagesSaveMode = 'auto';

let counter = 0;
/**
 * 사진 저장 요청키. 성패를 모르는 요청을 다시 보낼 때는 처음 키를 그대로 넘겨 서버가 한 번만 반영하게 한다
 * (CREATE-US-07-AC09 사진 자동 임시 저장 재시도).
 */
export const newImagesRequestKey = () => `images-${Date.now()}-${++counter}-${Math.random().toString(36).slice(2)}`;

function path(storyId: string) {
  if (!/^[1-9]\d{0,18}$/.test(storyId)) throw new Error('스토리 ID를 확인해 주세요.');
  return `/creation/stories/${storyId}/images`;
}

export function fromStoryImagesDto(dto: StoryImagesDto): StoryImagesSnapshot {
  return {
    saveState: dto.save_state,
    savedAt: dto.saved_at,
    workingCopySavedAt: dto.working_copy_saved_at ?? null,
    values: {
      story: dto.story_images.map(fromImageDto),
      characters: dto.characters.map((c) => ({
        characterId: String(c.character_id),
        name: c.name ?? '',
        images: c.images.map(fromImageDto),
      })),
    },
  };
}

export async function getStoryImages(storyId: string, signal?: AbortSignal): Promise<StoryImagesSnapshot> {
  return fromStoryImagesDto(await apiRequest<StoryImagesDto>(path(storyId), { signal }));
}

export async function saveStoryImages(
  storyId: string,
  patch: StoryImagesPatch,
  kind: StoryImagesSaveKind = 'save',
  key: string = newImagesRequestKey(),
  mode?: StoryImagesSaveMode,
): Promise<StoryImagesSnapshot> {
  const dto = await apiRequest<StoryImagesDto>(path(storyId), {
    method: 'PUT',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({ ...patch, kind, ...(mode === 'auto' ? { mode } : {}) }),
  });
  const snapshot = fromStoryImagesDto(dto);
  // opt-in으로 보낸 요청에서, 보낸 키와 같은 값이고 임시 저장본 시각이 있을 때만 마무리 후보로 읽는다.
  const finalizable = dto.finalize_auto_request_id;
  if (mode === 'auto' && typeof finalizable === 'string' && finalizable === key && snapshot.workingCopySavedAt)
    snapshot.finalizableAutoRequestId = finalizable;
  return snapshot;
}
