import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { storyKeys } from './useStories';
import { storyImagesKey } from './useStoryImages';
import { storyCreationKey } from './useStoryPresets';

/**
 * CREATE-US-07 말투·서술 작업 화면에서 돌아올 때 편집 화면이 다시 마운트되기 전에 부른다.
 * 작업 화면의 저장·공개는 임시 저장본의 기본 정보(새 캐릭터 포함)를 정본에 반영할 수 있으므로,
 * 편집 화면이 쓰는 조회(상세·공통 저장·이미지) 캐시를 이 스토리 키만 정확히 지워 새 화면이 서버 값으로 채우게 한다.
 * 목록·다른 스토리 캐시는 건드리지 않는다.
 */
export function useForgetStoryEditorCache(storyId: string): () => void {
  const client = useQueryClient();
  return useCallback(() => {
    for (const queryKey of [storyKeys.detail(storyId), storyCreationKey(storyId), storyImagesKey(storyId)]) {
      void client.cancelQueries({ queryKey, exact: true });
      client.removeQueries({ queryKey, exact: true });
    }
  }, [client, storyId]);
}
