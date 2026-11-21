import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { StoryImagesPatch } from '@/features/story-setup';

import {
  getStoryImages,
  saveStoryImages,
  type StoryImagesSaveKind,
  type StoryImagesSnapshot,
} from '../imagesRepository';

export const storyImagesKey = (id: string) => ['stories', 'images', id] as const;

/** 서버에 마지막으로 저장된 스토리·캐릭터 이미지 (CREATE-US-06-AC01 재조회) */
export function useStoryImages(id: string) {
  return useQuery({ queryKey: storyImagesKey(id), queryFn: ({ signal }) => getStoryImages(id, signal) });
}

/** 이미지 목록 저장. 성공 응답만 캐시에 반영하고, 실패하면 화면의 목록은 그대로 둔다. */
export function useSaveStoryImages(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ patch, kind }: { patch: StoryImagesPatch; kind: StoryImagesSaveKind }) =>
      saveStoryImages(id, patch, kind),
    onSuccess: (snapshot: StoryImagesSnapshot) => client.setQueryData(storyImagesKey(id), snapshot),
  });
}
