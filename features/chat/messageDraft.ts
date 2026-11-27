// CHAT-US-02 입력창 메시지 구성: 한 입력창의 `@이름:` 줄로 발화자 전환, 작성 순서 유지, 5,000자 한도
import { NARRATOR_TAG, SPEAKER_TAG, splitLines } from '@/features/chat/assistantParser';
import { countRawText } from '@/lib/rawText';
import type { ChatMessagePartInput } from '@/shared/story-types';

/** 유저·캐릭터·나레이터 본문 합산 최대 길이(코드 포인트, 공백·줄바꿈·서식 기호 포함) */
export const MESSAGE_MAX_LENGTH = 5000;

export type DraftSpeaker = { kind: 'user' } | { kind: 'character'; characterId: number } | { kind: 'narrator' };

/** 입력창 글자 그대로. 보낼 때 `parseUserText`로 발화자별 부분을 만든다. */
export type MessageDraft = { text: string };

/** 태그 이름을 발화자로 바꿀 때 쓰는 세션 이름. `playName`은 화면에 보이는 유저 이름(칩 이름)과 같다. */
export type SpeakerNames = { playName: string; characters: readonly { id: number; name: string }[] };

export type DraftProblem = 'empty' | 'too_long';

export const USER_SPEAKER: DraftSpeaker = { kind: 'user' };

/** 세션에 없는(삭제된) 캐릭터의 표시 이름 */
export const UNKNOWN_CHARACTER_NAME = '등장 캐릭터';

export const emptyDraft = (): MessageDraft => ({ text: '' });

export const isDraftEmpty = (draft: MessageDraft) => draft.text === '';

function speakerOfTag(name: string, names: SpeakerNames): DraftSpeaker | null {
  if (name === NARRATOR_TAG) return { kind: 'narrator' };
  // 플레이 이름은 캐릭터 이름과 같을 수 없다(CHAT-US-01-AC17). 겹치면 유저를 우선한다.
  if (name === names.playName) return USER_SPEAKER;
  const found = names.characters.find((character) => character.name === name);
  return found ? { kind: 'character', characterId: found.id } : null;
}

/** 태그에 쓰는 발화자 이름 */
export function speakerName(speaker: DraftSpeaker, names: SpeakerNames) {
  if (speaker.kind === 'user') return names.playName;
  if (speaker.kind === 'narrator') return NARRATOR_TAG;
  return names.characters.find(({ id }) => id === speaker.characterId)?.name ?? UNKNOWN_CHARACTER_NAME;
}

const toPartInput = (speaker: DraftSpeaker, body: string): ChatMessagePartInput => ({
  speaker_kind: speaker.kind,
  character_id: speaker.kind === 'character' ? speaker.characterId : null,
  body,
});

/**
 * 입력창 글자를 작성 순서대로 발화자별 부분으로 나눈다. 줄 나누기·태그 정규식은 AI 응답 파서와 같다.
 * - 줄 맨 앞 `@이름:`의 이름이 `나레이터` → 나레이터, 플레이 이름 → 유저, 세션 캐릭터 이름 → 그 캐릭터. 새 부분을 시작한다.
 * - 첫 태그 앞의 글은 유저 부분이다(AC01 기본 발화자). AI 응답 파서는 여기서 나레이터로 본다.
 * - 모르는 이름의 태그 줄은 태그를 포함한 그 줄 원문을 현재 부분(없으면 유저 부분)에 이어 붙인다.
 * - 부분 본문은 앞뒤 공백·빈 줄을 정리하고 빈 부분은 버린다. 같은 발화자가 연속돼도 합치지 않는다.
 * - 이름은 다듬지 않고 그대로 비교한다. 같은 이름의 캐릭터가 여럿이면 먼저 나온 캐릭터다.
 */
export function parseUserText(text: string, names: SpeakerNames): ChatMessagePartInput[] {
  const blocks: { speaker: DraftSpeaker; lines: string[] }[] = [];
  for (const line of splitLines(text)) {
    const tag = SPEAKER_TAG.exec(line);
    const speaker = tag ? speakerOfTag(tag[1], names) : null;
    const open = blocks.at(-1);
    if (tag && speaker) blocks.push({ speaker, lines: [tag[2]] });
    else if (open) open.lines.push(line);
    else blocks.push({ speaker: USER_SPEAKER, lines: [line] });
  }
  return blocks
    .map(({ speaker, lines }) => toPartInput(speaker, lines.join('\n').trim()))
    .filter((part) => part.body !== '');
}

/** 작성 순서대로 보낼 부분 */
export const toMessageParts = (draft: MessageDraft, names: SpeakerNames) => parseUserText(draft.text, names);

const textLength = (text: string, names: SpeakerNames) =>
  parseUserText(text, names).reduce((sum, part) => sum + countRawText(part.body), 0);

/** 보낼 부분 본문의 합산 길이. `@이름: ` 접두어와 부분 앞뒤 공백은 세지 않는다. */
export const draftLength = (draft: MessageDraft, names: SpeakerNames) => textLength(draft.text, names);

/**
 * 한도(합산 5,000자)를 넘는 추가 입력을 막는다. 새로 들어온 글자는 한도까지만 받고 기존 내용은 그대로 둔다.
 * 지우기처럼 합산 길이를 늘리지 않는 편집은 이미 한도를 넘었어도 받는다(전송 때 다시 검사한다).
 */
export function limitInput(previous: string, next: string, names: SpeakerNames): string {
  const nextLength = textLength(next, names);
  if (nextLength <= MESSAGE_MAX_LENGTH || nextLength <= textLength(previous, names)) return next;
  const before = Array.from(previous);
  const after = Array.from(next);
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end += 1;
  }
  const head = after.slice(0, start).join('');
  const inserted = after.slice(start, after.length - end);
  const tail = after.slice(after.length - end).join('');
  const build = (count: number) => head + inserted.slice(0, count).join('') + tail;
  // 들어온 글자 수에 대해 한도 안에 드는 가장 긴 앞부분을 찾는다(전부는 이미 넘는다).
  let low = 0;
  let high = inserted.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (textLength(build(mid), names) <= MESSAGE_MAX_LENGTH) low = mid;
    else high = mid - 1;
  }
  const limited = build(low);
  return textLength(limited, names) <= MESSAGE_MAX_LENGTH ? limited : previous;
}

/**
 * 입력창에 `@`를 하나 새로 입력했는지 확인한다. 입력했다면 그 `@`의 위치(UTF-16 인덱스)를 돌려준다.
 * 붙여넣기처럼 여러 글자가 한꺼번에 바뀐 경우는 화자 선택으로 보지 않는다.
 */
export function detectSpeakerTrigger(previous: string, next: string): number | null {
  if (next.length !== previous.length + 1) return null;
  let i = 0;
  while (i < previous.length && previous[i] === next[i]) i += 1;
  return next[i] === '@' && next.slice(i + 1) === previous.slice(i) ? i : null;
}

const endsLine = (value: string) => value === '' || value.endsWith('\n') || value.endsWith('\r');

/**
 * `at` 위치의 `@`를 `@이름: `로 바꾼다(`@`는 본문에 남는다). `@`가 줄 맨 앞이 아니면 앞에 줄바꿈을 넣어
 * 새 줄에서 시작한다. 바꾼 글자와 태그 바로 뒤 커서 위치를 돌려준다. 그 자리에 `@`가 없으면 null.
 */
export function insertSpeakerTag(text: string, at: number, name: string): { text: string; cursor: number } | null {
  if (text[at] !== '@') return null;
  const before = text.slice(0, at);
  const tag = `${endsLine(before) ? '' : '\n'}@${name}: `;
  return { text: before + tag + text.slice(at + 1), cursor: before.length + tag.length };
}

export function validateDraft(draft: MessageDraft, names: SpeakerNames): DraftProblem | null {
  if (toMessageParts(draft, names).length === 0) return 'empty';
  if (draftLength(draft, names) > MESSAGE_MAX_LENGTH) return 'too_long';
  return null;
}

export const DRAFT_PROBLEM_MESSAGES: Record<DraftProblem, string> = {
  empty: '보낼 내용을 입력하세요.',
  too_long: `메시지는 모든 발화자를 합해 ${MESSAGE_MAX_LENGTH.toLocaleString()}자까지 보낼 수 있습니다.`,
};

/**
 * 발화자별 부분을 입력창 글자로 만든다. 부분마다 `@이름: 본문` 줄로 시작하고, 맨 앞 유저 부분은 태그를 생략한다
 * (태그 없는 첫 글은 유저 대사이므로 같은 뜻이다).
 */
export function partsToText(parts: readonly { speaker: DraftSpeaker; body: string }[], names: SpeakerNames): string {
  return parts
    .map(({ speaker, body }, index) =>
      index === 0 && speaker.kind === 'user' ? body : `@${speakerName(speaker, names)}: ${body}`,
    )
    .join('\n');
}

/** 서버가 거절한 전송 내용을 순서·발화자 그대로 입력창 글자로 되돌린다. */
export function fromMessageParts(parts: readonly ChatMessagePartInput[], names: SpeakerNames): MessageDraft {
  return {
    text: partsToText(
      parts.map(({ speaker_kind, character_id, body }) => ({
        speaker:
          speaker_kind === 'character' && character_id !== null
            ? { kind: 'character', characterId: character_id }
            : { kind: speaker_kind === 'character' ? 'narrator' : speaker_kind },
        body,
      })),
      names,
    ),
  };
}
