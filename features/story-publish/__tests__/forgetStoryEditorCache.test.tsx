// CREATE-US-07 말투·서술에서 돌아온 편집 화면을 새로 채우기 전에, 그 스토리의 편집 조회 캐시만 정확히 지우는지 확인한다.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useForgetStoryEditorCache } from '../hooks/useForgetStoryEditorCache';
import { storyKeys } from '../hooks/useStories';
import { storyImagesKey } from '../hooks/useStoryImages';
import { storyCreationKey } from '../hooks/useStoryPresets';

it('상세·공통 저장·이미지 캐시를 이 스토리만 지우고 목록·다른 스토리는 남긴다', async () => {
  const client = new QueryClient();
  const keep = [storyKeys.list(), storyKeys.detail('8'), storyCreationKey('8'), storyImagesKey('8')];
  const drop = [storyKeys.detail('7'), storyCreationKey('7'), storyImagesKey('7')];
  for (const key of [...keep, ...drop]) client.setQueryData(key, { stale: true });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = await renderHook(() => useForgetStoryEditorCache('7'), { wrapper });

  await act(async () => result.current());

  for (const key of drop) expect(client.getQueryState(key)).toBeUndefined();
  for (const key of keep) expect(client.getQueryData(key)).toEqual({ stale: true });
});
