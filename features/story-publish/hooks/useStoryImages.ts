import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { StoryImagesPatch } from '@/features/story-setup';

import {
  getStoryImages,
  saveStoryImages,
  type StoryImagesSaveKind,
  type StoryImagesSaveMode,
  type StoryImagesSnapshot,
} from '../imagesRepository';

export const storyImagesKey = (id: string) => ['stories', 'images', id] as const;

/** 서버에 마지막으로 저장된 스토리·캐릭터 이미지 (CREATE-US-06-AC01 재조회) */
export function useStoryImages(id: string, enabled = true) {
  return useQuery({ queryKey: storyImagesKey(id), queryFn: ({ signal }) => getStoryImages(id, signal), enabled });
}

/**
 * 이미지 목록 저장. 성공 응답만 캐시에 반영하고, 실패하면 화면의 목록은 그대로 둔다.
 * key를 넘기면 그 요청키로 보낸다(성패를 모르는 앞선 요청을 같은 키로 다시 보낼 때). 없으면 새로 만든다.
 * mode(CREATE-US-07-AC09 opt-in)는 받은 그대로 싣는다. 다시 보낼 때도 처음 값을 넘겨 같은 본문을 보낸다.
 */
export function useSaveStoryImages(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      patch,
      kind,
      key,
      mode,
    }: {
      patch: StoryImagesPatch;
      kind: StoryImagesSaveKind;
      key?: string;
      mode?: StoryImagesSaveMode;
    }) => saveStoryImages(id, patch, kind, key, mode),
    // 마무리 후보 키는 이 저장 응답 한 번에만 속한다. 조회 캐시에는 남기지 않는다.
    onSuccess: ({ finalizableAutoRequestId: _finalizable, ...snapshot }: StoryImagesSnapshot) =>
      client.setQueryData<StoryImagesSnapshot>(storyImagesKey(id), snapshot),
  });
}
