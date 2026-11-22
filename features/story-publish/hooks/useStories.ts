import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createStory, deleteStory, getStory, listStories, saveStoryBasic } from '../api';
import type { EditorStory, StoryBasicFields, StorySummary } from '../types';
import { storyImagesKey } from './useStoryImages';

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
export function useStory(id: string, enabled = true) {
  return useQuery({ queryKey: storyKeys.detail(id), queryFn: () => getStory(id), enabled });
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
 * 스토리 삭제 (CREATE-US-07-AC10). 서버가 성공(204)을 돌려준 뒤에만 캐시를 정리한다.
 * - 먼저 진행 중인 목록·상세 조회를 취소하고 끝날 때까지 기다린다. 삭제 전에 시작된 조회가 늦게 도착해
 *   삭제한 줄을 되살리지 않게 하려는 것이다.
 * - 목록: 삭제한 스토리를 바로 빼고 다시 받게 한다.
 * - 상세: 무효로만 표시하고 지금 다시 받지 않는다. 편집 화면이 떠나기 전에 삭제된 스토리를 다시 조회해
 *   404 화면이 잠깐 보이지 않게 하려는 것이다. 다음에 구독하면 새로 받는다.
 * onSuccess가 끝나야 mutateAsync가 이행되므로, 호출한 쪽은 캐시 정리가 끝난 뒤에 이동한다.
 */
export function useDeleteStory(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => deleteStory(id),
    onSuccess: async () => {
      await Promise.all([
        client.cancelQueries({ queryKey: storyKeys.list() }),
        client.cancelQueries({ queryKey: storyKeys.detail(id) }),
        client.cancelQueries({ queryKey: storyImagesKey(id) }),
      ]);
      client.setQueryData<StorySummary[]>(storyKeys.list(), (rows) => rows?.filter((s) => s.id !== id));
      void client.invalidateQueries({ queryKey: storyKeys.detail(id), refetchType: 'none' });
      // 사진 목록도 상세와 같이 무효로만 표시한다 (삭제된 스토리의 사진을 다시 조회하지 않게).
      void client.invalidateQueries({ queryKey: storyImagesKey(id), refetchType: 'none' });
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
    onSuccess: async (story: EditorStory) => {
      await client.cancelQueries({ queryKey: storyKeys.detail(id) });
      client.setQueryData(storyKeys.detail(id), story);
      void client.invalidateQueries({ queryKey: storyKeys.list() });
    },
  });
}
