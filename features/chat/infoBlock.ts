// CHAT-US-08 (KAN-22) AI 응답 끝의 ```info 장면 상태 블록을 본문에서 떼어 낸다.
// 서버 messaging/info.py(split_info)와 같은 규칙이다(서버·앱 공통 계약 A).
import { splitLines } from '@/features/chat/assistantParser';

export type InfoSplit = {
  /** 말풍선으로 나눌 본문. 여는 줄이 없으면 원문 그대로다(스트리밍 중 끝의 반쯤 온 펜스 줄만 빠진다). */
  body: string;
  /** 두 펜스 사이의 줄을 `\n`으로 이은 info 원문. 여는 줄이 없으면 null이다. */
  info: string | null;
};

const OPEN_FENCE = '```info';
const CLOSE_FENCE = '```';
// 줄 경계는 splitLines(Python `str.splitlines()`)와 같다. 마지막 줄의 시작 위치를 찾을 때만 쓴다.
const LINE_BREAKS = /\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/g;

/** 앞뒤의 공백(U+0020)·탭(U+0009)만 지운다. `trim()`은 NBSP·BOM도 지우므로 쓰지 않는다. */
const stripSpaceTab = (line: string) => line.replace(/^[ \t]+|[ \t]+$/g, '');

/** 마지막 줄(뒤에 줄바꿈이 없는 줄)의 시작 위치. 원문이 비었거나 줄바꿈으로 끝나면 null이다. */
function trailingLineStart(text: string): number | null {
  let start = 0;
  for (const match of text.matchAll(LINE_BREAKS)) start = match.index + match[0].length;
  return start < text.length ? start : null;
}

/** 규칙 7: 앞쪽 공백·탭을 뺀 줄이 ```info의 비어 있지 않은 앞부분이면 반쯤 도착한 펜스일 수 있다. */
const isPartialOpenFence = (line: string) => {
  const head = line.replace(/^[ \t]+/, '');
  return head !== '' && OPEN_FENCE.startsWith(head);
};

/**
 * 규칙 (서버와 동일)
 * 1. 줄은 Python `str.splitlines()`와 같은 경계로 나눈다(`splitLines`).
 * 2. 여는 줄: 앞뒤 공백·탭만 무시하고 정확히 ```info인 줄(소문자만, BOM·NBSP가 붙으면 아니다).
 * 3. 닫는 줄: 여는 줄 뒤에서 처음 나오는, 앞뒤 공백·탭만 무시하고 정확히 ```인 줄.
 * 4. 여는 줄이 여러 개면 마지막 여는 줄만 쓴다.
 * 5. 블록 = 마지막 여는 줄부터 닫는 줄까지(포함). 닫는 줄이 없으면 원문 끝까지.
 * 6. 본문 = 블록 앞 줄들 + 닫는 줄 뒤 줄들을 `\n`으로 이은 것. info = 두 펜스 사이 줄들(닫는 줄이 없으면 여는 줄
 *    뒤 전부). 여는 줄이 없으면 본문 = 원문 그대로, info = null.
 * 7. `streaming`일 때만: 마지막 줄(뒤에 줄바꿈이 아직 없는 줄)이 앞쪽 공백·탭을 뺀 뒤 ```info의 비어 있지 않은
 *    앞부분(`` ` `` … ```info)이면 그 줄을 숨긴다. 완료·실패 확정 원문에는 쓰지 않는다.
 */
export function splitInfo(text: string, { streaming }: { streaming: boolean }): InfoSplit {
  let source = text;
  if (streaming) {
    const start = trailingLineStart(text);
    if (start !== null && isPartialOpenFence(text.slice(start))) source = text.slice(0, start);
  }

  const lines = splitLines(source);
  let open = -1;
  lines.forEach((line, index) => {
    if (stripSpaceTab(line) === OPEN_FENCE) open = index;
  });
  if (open === -1) return { body: source, info: null };

  const closeOffset = lines.slice(open + 1).findIndex((line) => stripSpaceTab(line) === CLOSE_FENCE);
  const close = closeOffset === -1 ? lines.length : open + 1 + closeOffset;
  return {
    body: [...lines.slice(0, open), ...lines.slice(close + 1)].join('\n'),
    info: lines.slice(open + 1, close).join('\n'),
  };
}
