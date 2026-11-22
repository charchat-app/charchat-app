// CHAT-US-02 입력창 메시지 구성: 발화자 전환, 부분 순서, 5,000자 한도
import { countRawText } from '@/lib/rawText';
import type { ChatMessagePartInput } from '@/shared/story-types';

/** 유저·캐릭터·나레이터 본문 합산 최대 길이(코드 포인트, 공백·줄바꿈·서식 기호 포함) */
export const MESSAGE_MAX_LENGTH = 5000;

export type DraftSpeaker = { kind: 'user' } | { kind: 'character'; characterId: number } | { kind: 'narrator' };

export type DraftPart = { speaker: DraftSpeaker; body: string };

/** 이미 확정한 부분(`parts`)과 지금 입력 중인 발화자·본문 */
export type MessageDraft = { parts: DraftPart[]; speaker: DraftSpeaker; text: string };

export type DraftProblem = 'empty' | 'too_long';

export const USER_SPEAKER: DraftSpeaker = { kind: 'user' };

export const emptyDraft = (): MessageDraft => ({ parts: [], speaker: USER_SPEAKER, text: '' });

const isBlank = (value: string) => value.trim() === '';

export const sameSpeaker = (a: DraftSpeaker, b: DraftSpeaker) =>
  a.kind === b.kind && (a.kind !== 'character' || (b.kind === 'character' && a.characterId === b.characterId));

const committedLength = (draft: MessageDraft) => draft.parts.reduce((sum, part) => sum + countRawText(part.body), 0);

/** 확정한 부분과 입력 중인 본문을 합한 길이 */
export const draftLength = (draft: MessageDraft) => committedLength(draft) + countRawText(draft.text);

/** 입력 중인 본문에 쓸 수 있는 최대 길이(코드 포인트) */
export const textBudget = (draft: MessageDraft) => Math.max(0, MESSAGE_MAX_LENGTH - committedLength(draft));

/**
 * TextInput의 maxLength는 UTF-16 단위로 센다. 현재 본문의 서로게이트 쌍만큼 더해 코드 포인트 한도와 맞춘다.
 * 새로 입력한 이모지 등은 `limitText`가 최종으로 막는다.
 */
export const inputMaxLength = (draft: MessageDraft) =>
  textBudget(draft) + (draft.text.length - countRawText(draft.text));

/** 한도를 넘는 입력은 넘는 만큼 잘라 막는다. 기존 내용은 그대로 둔다. */
export function limitText(value: string, budget: number): string {
  const chars = Array.from(value);
  return chars.length <= budget ? value : chars.slice(0, budget).join('');
}

/**
 * 입력창에 `@`를 하나 새로 입력했는지 확인한다. 입력했다면 그 `@`를 뺀 원래 본문을 돌려준다.
 * 붙여넣기처럼 여러 글자가 한꺼번에 바뀐 경우는 발화자 선택으로 보지 않는다.
 */
export function detectSpeakerTrigger(previous: string, next: string): string | null {
  if (next.length !== previous.length + 1) return null;
  let i = 0;
  while (i < previous.length && previous[i] === next[i]) i += 1;
  return next[i] === '@' && next.slice(i + 1) === previous.slice(i) ? previous : null;
}

/** 발화자를 바꾼다. 입력 중인 본문이 있으면 이전 발화자의 부분으로 확정한다. */
export function switchSpeaker(draft: MessageDraft, speaker: DraftSpeaker): MessageDraft {
  if (isBlank(draft.text)) return { ...draft, speaker, text: '' };
  return { parts: [...draft.parts, { speaker: draft.speaker, body: draft.text }], speaker, text: '' };
}

export function removePart(draft: MessageDraft, index: number): MessageDraft {
  return { ...draft, parts: draft.parts.filter((_, i) => i !== index) };
}

/** 작성 순서대로 보낼 부분. 공백뿐인 본문은 보내지 않는다. */
export function toMessageParts(draft: MessageDraft): ChatMessagePartInput[] {
  const all = isBlank(draft.text) ? draft.parts : [...draft.parts, { speaker: draft.speaker, body: draft.text }];
  return all
    .filter((part) => !isBlank(part.body))
    .map(({ speaker, body }) => ({
      speaker_kind: speaker.kind,
      character_id: speaker.kind === 'character' ? speaker.characterId : null,
      body,
    }));
}

export function validateDraft(draft: MessageDraft): DraftProblem | null {
  if (toMessageParts(draft).length === 0) return 'empty';
  if (draftLength(draft) > MESSAGE_MAX_LENGTH) return 'too_long';
  return null;
}

export const DRAFT_PROBLEM_MESSAGES: Record<DraftProblem, string> = {
  empty: '보낼 내용을 입력하세요.',
  too_long: `메시지는 모든 발화자를 합해 ${MESSAGE_MAX_LENGTH.toLocaleString()}자까지 보낼 수 있습니다.`,
};

export const isDraftEmpty = (draft: MessageDraft) => draft.parts.length === 0 && draft.text === '';

/** 서버가 거절한 전송 내용을 순서·발화자 그대로 입력창에 되돌린다. */
export function fromMessageParts(parts: ChatMessagePartInput[]): MessageDraft {
  return {
    parts: parts.map(({ speaker_kind, character_id, body }) => ({
      speaker:
        speaker_kind === 'character' && character_id !== null
          ? { kind: 'character', characterId: character_id }
          : { kind: speaker_kind === 'character' ? 'narrator' : speaker_kind },
      body,
    })),
    speaker: USER_SPEAKER,
    text: '',
  };
}
