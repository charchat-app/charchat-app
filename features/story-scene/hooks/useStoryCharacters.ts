// CREATE-US-02·03·04 캐릭터 변경 연동
import { useMemo } from 'react';
import { useStory } from '@/features/story-publish';
import type { FewshotCharacter } from '@/shared/story-types';

/**
 * 스토리 조회 캐시(story-publish의 storyKeys.detail)를 구독해 저장된 캐릭터 목록을 발화자 형식으로 돌려준다.
 * 기본 정보 저장이 성공하면 story-publish가 같은 캐시를 갱신하므로 별도 알림·폴링 없이 바로 반영된다.
 *
 * - 서버 조회가 끝난 값만 돌려준다. 화면에 들어올 때 다시 조회하는 동안에는 이전 캐시로 판단하지 않는다
 *   (오래된 목록으로 다른 기기에서 추가한 인물의 말풍선을 지우지 않게).
 * - 아직 id가 없는(저장하지 않은) 캐릭터는 발화자로 고를 수 없어 제외한다.
 * - 순서는 서버 응답 순서이고 position은 그 순서 번호다.
 */
export function useStoryCharacters(storyId: string): {
  characters: FewshotCharacter[] | null;
  /** characters를 서버에서 받아 온 시각(ms). 다른 응답보다 오래된 목록인지 비교할 때 쓴다. */
  updatedAt: number;
  failed: boolean;
} {
  const story = useStory(storyId);
  const settled = story.status === 'success' && !story.isFetching;
  const source = settled ? story.data.characters : null;
  const characters = useMemo(
    () =>
      source
        ?.filter((person): person is typeof person & { id: string } => typeof person.id === 'string')
        .map((person, position) => ({ id: person.id, name: person.name === '' ? null : person.name, position })) ??
      null,
    [source],
  );
  return { characters, updatedAt: story.dataUpdatedAt, failed: story.isError };
}
