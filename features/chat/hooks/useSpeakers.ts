// CHAT-US-02 발화자 선택지와 표시 이름: 유저 캐릭터(기본)·세션 등장 캐릭터·나레이터
import { useMemo } from 'react';

import type { SpeakerOption } from '@/features/chat/components/room/SpeakerPicker';
import { NARRATOR_TAG } from '@/features/chat/assistantParser';
import { type DraftSpeaker, USER_SPEAKER } from '@/features/chat/messageDraft';
import type { ChatMessage, ConversationSession } from '@/shared/story-types';

/** 플레이 이름을 모를 때 쓰는 유저 발화자 이름 */
export const UNKNOWN_PLAY_NAME = '내 캐릭터';

/**
 * 세션 응답에 플레이 이름(`play_name`)이 있으면 쓰고, 없으면 저장된 유저 메시지의 speaker_name을 쓴다.
 * 둘 다 없으면 '내 캐릭터'로 표시한다.
 */
function findPlayName(session: ConversationSession, messages: ChatMessage[]) {
  if (session.play_name) return session.play_name;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const named = messages[i].parts.find((part) => part.speaker_kind === 'user' && part.speaker_name);
    if (named?.speaker_name) return named.speaker_name;
  }
  return null;
}

export function useSpeakers(session: ConversationSession, messages: ChatMessage[]) {
  const playName = findPlayName(session, messages) ?? UNKNOWN_PLAY_NAME;
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
