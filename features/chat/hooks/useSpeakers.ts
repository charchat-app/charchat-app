// CHAT-US-02 화자 이름과 `@` 칩 선택지: 나레이터·유저 캐릭터(플레이 이름)·세션 등장 캐릭터
import { useMemo } from 'react';

import { NARRATOR_TAG } from '@/features/chat/assistantParser';
import { type DraftSpeaker, type SpeakerNames, speakerName } from '@/features/chat/messageDraft';
import type { ConversationSession } from '@/shared/story-types';

/** 플레이 이름이 빈 문자열일 때 쓰는 유저 발화자 이름 */
export const UNKNOWN_PLAY_NAME = '내 캐릭터';

/** `@` 칩. `name`은 칩에 보이는 이름이자 입력창에 넣는 태그 이름(`@name: `)이다. */
export type SpeakerChip = { key: string; name: string };

/** 유저 발화자 이름은 세션에 적용된 플레이 이름(`play_name`, 서버가 항상 줌)이다. */
export function useSpeakers(session: ConversationSession) {
  const playName = session.play_name || UNKNOWN_PLAY_NAME;
  const { characters } = session;
  return useMemo(() => {
    const names: SpeakerNames = { playName, characters };
    // 제타와 같은 순서: 나레이터, 유저, 캐릭터들
    const chips: SpeakerChip[] = [
      { key: 'narrator', name: NARRATOR_TAG },
      { key: 'user', name: playName },
      ...characters.map(({ id, name }) => ({ key: `character-${id}`, name })),
    ];
    const labelOf = (speaker: DraftSpeaker) => speakerName(speaker, names);
    return { names, chips, labelOf, characterNames: characters.map(({ name }) => name) };
  }, [characters, playName]);
}
