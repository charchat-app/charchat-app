/**
 * 스토리·등장 캐릭터 이미지 목록 편집 규칙 (CREATE-US-06). 화면과 분리한 순수 함수다.
 * 목록의 첫 이미지가 스토리 표지·캐릭터 대표 얼굴이며 별도 대표 지정은 없다(AC06).
 */
import type { MediaImage } from '@/shared/media';

export type CharacterImagesValue = { characterId: string; name: string; images: MediaImage[] };
export type StoryImagesValues = { story: MediaImage[]; characters: CharacterImagesValue[] };

/** 저장 요청 본문(서버 PUT /creation/stories/{id}/images) */
export type StoryImagesPatch = {
  story_image_ids: number[];
  characters: { character_id: number; image_ids: number[] }[];
};

export type ImageListKey = { kind: 'story' } | { kind: 'character'; characterId: string };

export function listOf(values: StoryImagesValues, key: ImageListKey): MediaImage[] {
  if (key.kind === 'story') return values.story;
  return values.characters.find((c) => c.characterId === key.characterId)?.images ?? [];
}

export function updateList(
  values: StoryImagesValues,
  key: ImageListKey,
  update: (images: MediaImage[]) => MediaImage[],
): StoryImagesValues {
  if (key.kind === 'story') return { ...values, story: update(values.story) };
  return {
    ...values,
    characters: values.characters.map((c) =>
      c.characterId === key.characterId ? { ...c, images: update(c.images) } : c,
    ),
  };
}

/** AC03: 최대 장수를 넘기면 추가하지 않는다. */
export function addImage(images: MediaImage[], image: MediaImage, max: number): MediaImage[] {
  return images.length >= max ? images : [...images, image];
}

/** AC07: 선택한 자리의 이미지만 바꾸고 나머지 순서는 유지한다. */
export function replaceImage(images: MediaImage[], index: number, image: MediaImage): MediaImage[] {
  if (index < 0 || index >= images.length) return images;
  return images.map((current, i) => (i === index ? image : current));
}

/** AC08: 마지막 이미지까지 지울 수 있고, 남은 이미지의 상대 순서는 유지한다. */
export function removeImage(images: MediaImage[], index: number): MediaImage[] {
  return images.filter((_, i) => i !== index);
}

/** AC06: from 자리의 이미지를 to 자리로 옮긴다. 맨 앞으로 옮긴 이미지가 대표가 된다. */
export function moveImage(images: MediaImage[], from: number, to: number): MediaImage[] {
  if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) return images;
  const next = [...images];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * 끌어서 놓은 거리(dx)로 새 자리를 정한다. 사진 칸은 모두 같은 너비라 칸 너비+간격(slot)으로 나눈다.
 * 칸 절반 이상 넘어가면 다음 자리로 보고, 목록 처음·끝을 넘지 않는다.
 */
export function dropIndex(from: number, dx: number, slot: number, count: number): number {
  if (count <= 0 || slot <= 0) return from;
  return Math.min(count - 1, Math.max(0, from + Math.round(dx / slot)));
}

/** from 사진을 to 자리로 옮기는 동안 index 사진이 비켜날 거리(칸 수). 들고 있는 사진은 0이다. */
export function shiftDuringDrag(index: number, from: number, to: number): number {
  if (index === from) return 0;
  if (from < to && index > from && index <= to) return -1;
  if (from > to && index >= to && index < from) return 1;
  return 0;
}

export type Cover =
  { source: 'story'; image: MediaImage } | { source: 'character'; image: MediaImage; characterName: string };

/** AC09: 스토리 이미지가 없으면 기본 설정 첫 번째 캐릭터의 첫 이미지를 대체 표지로 쓴다. */
export function coverOf(values: StoryImagesValues): Cover | null {
  if (values.story.length > 0) return { source: 'story', image: values.story[0] };
  const first = values.characters[0];
  if (first && first.images.length > 0) {
    return { source: 'character', image: first.images[0], characterName: first.name };
  }
  return null;
}

/** AC08: 필수 이미지(캐릭터마다 1장 이상)가 없는 캐릭터. 임시 저장은 되지만 완성 저장은 막힌다. */
export function charactersMissingImages(values: StoryImagesValues): CharacterImagesValue[] {
  return values.characters.filter((c) => c.images.length === 0);
}

/**
 * 기본 정보 저장 뒤 서버의 캐릭터 목록(이름·순서·추가·삭제)을 반영한다.
 * 화면에서 고친 이미지 목록은 같은 캐릭터 id면 그대로 두고, 삭제된 캐릭터의 목록은 버린다.
 */
export function mergeCharacters(local: StoryImagesValues, server: StoryImagesValues): StoryImagesValues {
  const edited = new Map(local.characters.map((c) => [c.characterId, c.images]));
  return {
    story: local.story,
    characters: server.characters.map((c) => ({ ...c, images: edited.get(c.characterId) ?? c.images })),
  };
}

export function toImagesPatch(values: StoryImagesValues): StoryImagesPatch {
  return {
    story_image_ids: values.story.map((i) => i.imageId),
    characters: values.characters.map((c) => ({
      character_id: Number(c.characterId),
      image_ids: c.images.map((i) => i.imageId),
    })),
  };
}

/** 저장할 내용이 마지막 저장본과 같은지(이미지 id와 순서만 비교) */
export function sameImages(a: StoryImagesValues, b: StoryImagesValues): boolean {
  return JSON.stringify(toImagesPatch(a)) === JSON.stringify(toImagesPatch(b));
}

/**
 * 완성 저장된 스토리에서 캐릭터의 마지막 이미지를 지워 저장이 거절됐을 때의 안내(CREATE-US-06-AC08).
 * 서버가 알려 준 캐릭터 id로 이름을 찾아 누락 대상을 보여 준다.
 */
export function requiredImageMessage(values: StoryImagesValues | null, characterIds: string[]): string {
  const ids = new Set(characterIds);
  const names = (values?.characters ?? []).filter((ch) => ids.has(ch.characterId)).map((ch) => ch.name || '이름 없음');
  const who = names.length > 0 ? names.join(', ') : '일부 캐릭터';
  return `공개·비공개 스토리는 캐릭터마다 이미지가 1장 이상 필요해요. (${who}) 이미지를 추가한 뒤 다시 저장해 주세요.`;
}
