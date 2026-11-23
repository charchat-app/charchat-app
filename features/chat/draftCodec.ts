// CHAT-US-03 작성 중 입력(발화자별 부분 포함)을 기기 보관용 문자열로 바꾸고 되돌린다
import { type DraftPart, type DraftSpeaker, isDraftEmpty, type MessageDraft } from '@/features/chat/messageDraft';

const VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toSpeaker(value: unknown): DraftSpeaker | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'user' || value.kind === 'narrator') return { kind: value.kind };
  if (value.kind === 'character' && Number.isSafeInteger(value.characterId) && Number(value.characterId) > 0) {
    return { kind: 'character', characterId: Number(value.characterId) };
  }
  return null;
}

function toPart(value: unknown): DraftPart | null {
  if (!isRecord(value) || typeof value.body !== 'string') return null;
  const speaker = toSpeaker(value.speaker);
  return speaker ? { speaker, body: value.body } : null;
}

/** 빈 입력은 보관하지 않는다(빈 문자열 = 보관분 삭제, AC07). */
export function encodeDraft(draft: MessageDraft): string {
  if (isDraftEmpty(draft)) return '';
  return JSON.stringify({ v: VERSION, parts: draft.parts, speaker: draft.speaker, text: draft.text });
}

/** 형식이 맞지 않는 보관분은 버린다. 입력창에는 빈 상태로 시작한다. */
export function decodeDraft(stored: string): MessageDraft | null {
  if (!stored) return null;
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.v !== VERSION || typeof value.text !== 'string' || !Array.isArray(value.parts)) {
    return null;
  }
  const speaker = toSpeaker(value.speaker);
  const parts = value.parts.map(toPart);
  if (!speaker || parts.some((part) => part === null)) return null;
  const draft: MessageDraft = { parts: parts as DraftPart[], speaker, text: value.text };
  return isDraftEmpty(draft) ? null : draft;
}
