// CHAT-US-02 화자 이름과 `@` 칩 선택지: 나레이터·유저 캐릭터(플레이 이름)·세션 등장 캐릭터
import { useMemo } from 'react';

import { NARRATOR_TAG } from '@/features/chat/assistantParser';
import {
  type DraftSpeaker,
  sameSpeaker,
  type SpeakerNames,
  speakerName,
  speakerOfTagName,
  USER_SPEAKER,
} from '@/features/chat/messageDraft';
import type { ConversationSession } from '@/shared/story-types';

/** 플레이 이름이 빈 문자열일 때 쓰는 유저 발화자 이름 */
export const UNKNOWN_PLAY_NAME = '내 캐릭터';

/**
 * `@` 칩. `name`은 칩에 보이는 이름이자 입력창에 넣는 태그 이름(`@name: `)이다.
 * `disabledHint`가 있으면 그 태그가 다른 화자로 읽히므로 칩을 누를 수 없고, 이유를 알려 준다.
 */
export type SpeakerChip = { key: string; name: string; disabledHint?: string };

/** 플레이 이름이 `나레이터`인 유저 칩의 안내. `@나레이터:`는 항상 나레이터다. */
export const NARRATOR_NAME_USER_HINT =
  '이 이름은 나레이터와 같아 태그로 쓸 수 없어요. @ 없이 쓰면 이 이름의 대사가 돼요';
const SAME_NAME_HINT = '이 이름은 다른 화자와 같아 태그로 쓸 수 없어요';

/** 유저 발화자 이름은 세션에 적용된 플레이 이름(`play_name`, 서버가 항상 줌)이다. */
export function useSpeakers(session: ConversationSession) {
  const playName = session.play_name || UNKNOWN_PLAY_NAME;
  const { characters } = session;
  return useMemo(() => {
    const names: SpeakerNames = { playName, characters };
    // 제타와 같은 순서: 나레이터, 유저, 캐릭터들
    const options: { key: string; name: string; speaker: DraftSpeaker }[] = [
      { key: 'narrator', name: NARRATOR_TAG, speaker: { kind: 'narrator' } },
      { key: 'user', name: playName, speaker: USER_SPEAKER },
      ...characters.map(({ id, name }) => ({
        key: `character-${id}`,
        name,
        speaker: { kind: 'character', characterId: id } as const,
      })),
    ];
    const chips: SpeakerChip[] = options.map(({ key, name, speaker }) => {
      const read = speakerOfTagName(name, names);
      if (read && sameSpeaker(read, speaker)) return { key, name };
      const hint = speaker.kind === 'user' && name === NARRATOR_TAG ? NARRATOR_NAME_USER_HINT : SAME_NAME_HINT;
      return { key, name, disabledHint: hint };
    });
    const labelOf = (speaker: DraftSpeaker) => speakerName(speaker, names);
    return { names, chips, labelOf, characterNames: characters.map(({ name }) => name) };
  }, [characters, playName]);
}
