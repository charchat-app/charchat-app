import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createStory, getStory, listStories, saveStoryBasic } from '../api';
import type { EditorStory, StoryBasicFields } from '../types';

export const storyKeys = {
  all: ['stories'] as const,
  list: () => [...storyKeys.all, 'list'] as const,
  detail: (id: string) => [...storyKeys.all, 'detail', id] as const,
};

/** 내 스토리 목록 */
export function useMyStories() {
  return useQuery({ queryKey: storyKeys.list(), queryFn: listStories });
}

/** 서버에 마지막으로 저장된 스토리 (CREATE-US-01-AC01 재조회) */
export function useStory(id: string) {
  return useQuery({ queryKey: storyKeys.detail(id), queryFn: () => getStory(id) });
}

export function useCreateStory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createStory,
    onSuccess: (story: EditorStory) => {
      client.setQueryData(storyKeys.detail(story.id), story);
      void client.invalidateQueries({ queryKey: storyKeys.list() });
    },
  });
}

/**
 * 기본 정보 저장. 서버 커밋이 성공한 응답만 캐시에 반영한다.
 * 실패하면 화면의 입력은 그대로 두고 에러만 돌려준다 (저장 완료로 표시하지 않음).
 */
export function useSaveStoryBasic(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (fields: StoryBasicFields) => saveStoryBasic(id, fields),
    onSuccess: (story: EditorStory) => {
      client.setQueryData(storyKeys.detail(id), story);
      void client.invalidateQueries({ queryKey: storyKeys.list() });
    },
  });
}
