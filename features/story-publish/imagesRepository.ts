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
};

export type StoryImagesSnapshot = {
  values: StoryImagesValues;
  saveState: StoryImagesDto['save_state'];
  savedAt: string;
};

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

export async function saveStoryImages(storyId: string, patch: StoryImagesPatch): Promise<StoryImagesSnapshot> {
  const dto = await apiRequest<StoryImagesDto>(path(storyId), {
    method: 'PUT',
    headers: { 'Idempotency-Key': requestId() },
    body: JSON.stringify(patch),
  });
  return fromStoryImagesDto(dto);
}
