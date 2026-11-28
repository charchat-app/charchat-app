// charchat-app#36 말풍선 옆 화자 사진: 어떤 말풍선에 누구의 사진(또는 이름 첫 글자)을 보일지 정한다.
import type { ConversationMessage } from '@/shared/story-types';

/** 대화방이 아는 화자 사진. 주소는 서버 기준 경로 그대로이고, 표시할 때 API 주소 기준 전체 주소로 바꾼다. */
export type SpeakerImages = {
  /** 세션에 적용된 유저 프로필 사진 */
  user: string | null;
  characters: readonly { id: number; name: string; image_url?: string | null }[];
};

/** 저장된 메시지 부분은 캐릭터 ID를 함께 준다. 인트로·스트리밍 조각은 이름만 있다. */
export type BubbleMessage = ConversationMessage & { character_id?: number | null };

/** 말풍선 옆에 보일 화자. 나레이터는 사진이 없다(null). */
export type SpeakerAvatarInfo = { name: string; uri: string | null };

export function speakerAvatar(message: BubbleMessage, images: SpeakerImages): SpeakerAvatarInfo | null {
  if (message.speaker_kind === 'narrator') return null;
  const name = message.speaker_name || (message.speaker_kind === 'user' ? '유저' : '캐릭터');
  if (message.speaker_kind === 'user') return { name, uri: images.user || null };
  // 저장된 부분은 세션 캐릭터 ID로, 인트로·스트리밍 조각은 이름으로 찾는다.
  const character =
    (message.character_id != null ? images.characters.find(({ id }) => id === message.character_id) : undefined) ??
    images.characters.find((candidate) => candidate.name === message.speaker_name);
  return { name, uri: character?.image_url || null };
}

/** 같은 화자인지: 종류와 보이는 이름이 같으면 같은 화자다. */
export function sameBubbleSpeaker(a: ConversationMessage | null | undefined, b: ConversationMessage): boolean {
  return !!a && a.speaker_kind === b.speaker_kind && (a.speaker_name ?? '') === (b.speaker_name ?? '');
}

/**
 * 같은 화자의 말풍선이 이어지면 첫 말풍선에만 사진과 이름을 보인다(제타와 같은 방식).
 * previous는 바로 위에 붙어 그려진 말풍선(앞 묶음의 마지막)이다. 사이에 다른 표시가 있으면 넘기지 않는다.
 */
export function runStarts(messages: readonly ConversationMessage[], previous?: ConversationMessage | null): boolean[] {
  return messages.map((message, index) => !sameBubbleSpeaker(index === 0 ? previous : messages[index - 1], message));
}
