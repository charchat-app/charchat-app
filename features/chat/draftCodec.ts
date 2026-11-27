// CHAT-US-03 작성 중 입력(입력창 글자)을 기기 보관용 문자열로 바꾸고 되돌린다
import {
  type DraftSpeaker,
  isDraftEmpty,
  type MessageDraft,
  partsToText,
  type SpeakerNames,
} from '@/features/chat/messageDraft';

/** v2: 입력창 글자 하나(`@이름:` 줄 포함). v1: 확정한 부분·입력 중 발화자·본문(이전 입력창). */
const VERSION = 2;
const LEGACY_VERSION = 1;

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

type LegacyPart = { speaker: DraftSpeaker; body: string };

function toPart(value: unknown): LegacyPart | null {
  if (!isRecord(value) || typeof value.body !== 'string') return null;
  const speaker = toSpeaker(value.speaker);
  return speaker ? { speaker, body: value.body } : null;
}

/**
 * v1 보관분을 입력창 글자로 바꾼다. 부분마다 세션 이름으로 `@이름: 본문` 줄을 만들고(맨 앞 유저 부분은 태그 생략),
 * 입력 중이던 본문은 그 발화자의 마지막 줄로 붙인다. 유저가 아닌 발화자를 골라 둔 채 비어 있었으면
 * 그 태그 줄(`@이름: `)을 남겨 같은 발화자로 이어 쓰게 한다.
 */
function fromLegacy(value: Record<string, unknown>, names: SpeakerNames): MessageDraft | null {
  if (typeof value.text !== 'string' || !Array.isArray(value.parts)) return null;
  const speaker = toSpeaker(value.speaker);
  const parts = value.parts.map(toPart);
  if (!speaker || parts.some((part) => part === null)) return null;
  const all = parts as LegacyPart[];
  const current = value.text.trim() !== '' || speaker.kind !== 'user' ? [{ speaker, body: value.text }] : [];
  return { text: partsToText([...all, ...current], names) };
}

/** 빈 입력은 보관하지 않는다(빈 문자열 = 보관분 삭제, AC07). */
export function encodeDraft(draft: MessageDraft): string {
  if (isDraftEmpty(draft)) return '';
  return JSON.stringify({ v: VERSION, text: draft.text });
}

/**
 * 형식이 맞지 않는 보관분은 버린다. 입력창에는 빈 상태로 시작한다.
 * v1 보관분은 발화자 이름이 필요해 세션 이름(`names`)으로 바꿔 복원한다.
 */
export function decodeDraft(stored: string, names: SpeakerNames): MessageDraft | null {
  if (!stored) return null;
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  let draft: MessageDraft | null = null;
  if (value.v === VERSION && typeof value.text === 'string') draft = { text: value.text };
  else if (value.v === LEGACY_VERSION) draft = fromLegacy(value, names);
  return draft && !isDraftEmpty(draft) ? draft : null;
}
