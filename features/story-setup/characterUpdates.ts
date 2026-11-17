import type { FewshotCharacter } from '@/shared/story-types';

type Listener = (characters: FewshotCharacter[]) => void;
const listeners = new Map<string, Set<Listener>>();

/** 1번의 변경 확정 후 해당 스토리의 전체 캐릭터 목록을 발행한다. 부분 목록이 아니다. */
export function publishStoryCharacters(storyId: string, characters: readonly FewshotCharacter[]) {
  for (const listener of listeners.get(storyId) ?? []) listener(characters.map((person) => ({ ...person })));
}

export function subscribeStoryCharacters(storyId: string, listener: Listener) {
  const set = listeners.get(storyId) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(storyId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(storyId);
  };
}
