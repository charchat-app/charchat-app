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
};

export type StoryImagesSnapshot = {
  values: StoryImagesValues;
  saveState: StoryImagesDto['save_state'];
  savedAt: string;
  /** 값이 있으면 values는 아직 반영하지 않은 사진 임시 저장본이다. 이용자는 이전 사진을 본다. */
  workingCopySavedAt: string | null;
};

/** temporary: 비공개·공개 스토리에서 임시 저장본에만 둔다. save: 바로 반영한다(미등록 스토리). */
export type StoryImagesSaveKind = 'temporary' | 'save';

let counter = 0;
const requestId = () => `images-${Date.now()}-${++counter}-${Math.random().toString(36).slice(2)}`;

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
): Promise<StoryImagesSnapshot> {
  const dto = await apiRequest<StoryImagesDto>(path(storyId), {
    method: 'PUT',
    headers: { 'Idempotency-Key': requestId() },
    body: JSON.stringify({ ...patch, kind }),
  });
  return fromStoryImagesDto(dto);
}
