// CHAT-US-02 AI 응답 원문을 발화자별 부분으로 나눈다. 서버 messaging/parser.py(parse_assistant_text)와 같은 규칙이다.
import type { ChatSpeakerKind } from '@/shared/story-types';

export const NARRATOR_TAG = '나레이터';

export type AssistantPart = {
  speaker_kind: Extract<ChatSpeakerKind, 'character' | 'narrator'>;
  speaker_name: string | null;
  body: string;
};

// 서버 정규식 `^@([^:\n]+?):[ \t]?(.*)$`와 같다. 이름은 다듬지 않고 그대로 비교한다.
const TAG = /^@([^:\n]+?):[ \t]?(.*)$/;

/**
 * Python `str.splitlines()`의 줄 경계와 같다: `\r\n`, `\n`, `\r`, `\v`, `\f`, `\x1c`~`\x1e`, `\x85`, `\u2028`, `\u2029`.
 * 줄을 나눈 뒤에는 줄 안에 줄 경계 문자가 남지 않으므로, JS `.`(줄 경계 제외)와 Python `.`(`\n`만 제외)의 차이가
 * 태그 인식에 영향을 주지 않는다.
 */
const LINE_BREAK = /\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/;

/**
 * Python `splitlines()`처럼 나눈다. 끝이 줄바꿈이면 마지막 빈 줄을 만들지 않고, 빈 문자열은 빈 배열이다.
 * (끝 빈 줄 차이는 본문 정리(trim)에서 사라지므로 결과에는 영향이 없다.)
 */
export function splitLines(text: string): string[] {
  const lines = text.split(LINE_BREAK);
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

/**
 * 규칙 (서버와 동일)
 * - 줄 맨 앞의 `@이름:`이 세션 캐릭터 이름이나 `나레이터`면 새 부분을 시작한다. `나레이터`는 항상 나레이터다.
 * - 첫 태그 앞의 글 → 나레이터 부분. 모르는 이름(유저 이름 포함)의 태그 줄 → 그 줄 원문(태그 포함)으로 새 나레이터 부분.
 * - 그 밖의 줄(콜론 없는 `@나` 포함)은 앞 부분에 이어 붙인다. 같은 발화자가 연속돼도 부분을 합치지 않는다.
 * - 부분 본문은 앞뒤 공백·빈 줄을 정리하고, 빈 부분은 버린다. `*서술*`·`**강조**` 기호는 그대로 둔다.
 * - 줄은 Python `str.splitlines()`와 같은 경계로 나눈다(`\r\n`·`\r` 포함). 나눈 줄은 `\n`으로 다시 잇는다.
 * 스트리밍 중 끝의 미완성 태그(`@나`)는 앞 부분의 글로 보이고, 완료 후 전체 원문으로 다시 나눈다.
 * 남은 차이: 본문 정리에서 JS `trim()`과 Python `strip()`이 다루는 공백 문자 집합이 일부 다르다
 * (예: `\x1c`~`\x1f`는 Python만 공백으로 본다. 단 `\x1c`~`\x1e`는 줄 경계로 먼저 나뉜다).
 */
export function parseAssistantText(text: string, characterNames: readonly string[]): AssistantPart[] {
  const names = new Set(characterNames);
  const blocks: { kind: AssistantPart['speaker_kind']; name: string | null; lines: string[] }[] = [];

  for (const line of splitLines(text)) {
    const tag = TAG.exec(line);
    const name = tag?.[1];
    const open = blocks.at(-1);
    if (tag && name !== undefined && (name === NARRATOR_TAG || names.has(name))) {
      blocks.push(
        name === NARRATOR_TAG
          ? { kind: 'narrator', name: null, lines: [tag[2]] }
          : { kind: 'character', name, lines: [tag[2]] },
      );
    } else if (tag || !open) {
      blocks.push({ kind: 'narrator', name: null, lines: [line] });
    } else {
      open.lines.push(line);
    }
  }

  return blocks
    .map(({ kind, name, lines }) => ({ speaker_kind: kind, speaker_name: name, body: lines.join('\n').trim() }))
    .filter((part) => part.body !== '');
}
