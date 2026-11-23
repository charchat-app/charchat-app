// CHAT-US-02 발화자 선택지와 표시 이름: 유저 캐릭터(기본)·세션 등장 캐릭터·나레이터
import { useMemo } from 'react';

import type { SpeakerOption } from '@/features/chat/components/room/SpeakerPicker';
import { NARRATOR_TAG } from '@/features/chat/assistantParser';
import { type DraftSpeaker, USER_SPEAKER } from '@/features/chat/messageDraft';
import type { ConversationSession } from '@/shared/story-types';

/** 플레이 이름이 빈 문자열일 때 쓰는 유저 발화자 이름 */
export const UNKNOWN_PLAY_NAME = '내 캐릭터';

/** 유저 발화자 이름은 세션에 적용된 플레이 이름(`play_name`, 서버가 항상 줌)이다. */
export function useSpeakers(session: ConversationSession) {
  const playName = session.play_name || UNKNOWN_PLAY_NAME;
  const { characters } = session;
  return useMemo(() => {
    const options: SpeakerOption[] = [
      { key: 'user', label: playName, speaker: USER_SPEAKER },
      ...characters.map(({ id, name }) => ({
        key: `character-${id}`,
        label: name,
        speaker: { kind: 'character', characterId: id } as const,
      })),
      { key: 'narrator', label: NARRATOR_TAG, speaker: { kind: 'narrator' } },
    ];
    const labelOf = (speaker: DraftSpeaker) => {
      if (speaker.kind === 'user') return playName;
      if (speaker.kind === 'narrator') return NARRATOR_TAG;
      return characters.find(({ id }) => id === speaker.characterId)?.name ?? '등장 캐릭터';
    };
    return { options, labelOf, characterNames: characters.map(({ name }) => name) };
  }, [characters, playName]);
}
