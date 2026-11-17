/** CREATE-US-02. ID는 불투명 문자열, clientKey는 미저장 항목의 편집 식별자다. */
export type FewshotSpeaker = 'character' | 'user' | 'narrator';
export type FewshotMessage = {
  id: string | null;
  clientKey: string;
  speakerKind: FewshotSpeaker;
  characterId: string | null;
  body: string | null;
};
export type FewshotGroup = { id: string | null; clientKey: string; messages: FewshotMessage[] };
export type FewshotCharacter = { id: string; name: string | null; position: number };
export type FewshotsDocument = {
  id: string;
  title: string;
  saveState: 'draft' | 'private' | 'public';
  updatedAt: string;
  characters: FewshotCharacter[];
  fewshots: FewshotGroup[];
};
let counter = 0;
export const newFewshotKey = (prefix = 'item') =>
  `${prefix}-${Date.now()}-${++counter}-${Math.random().toString(36).slice(2)}`;
export const newFewshotGroup = (): FewshotGroup => ({ id: null, clientKey: newFewshotKey('group'), messages: [] });
/** 순서는 로컬에서만 변경한다. 드롭마다 HTTP 요청을 보내지 않는다. */
export function moveByKey<T extends { clientKey: string }>(items: T[], from: string, to: string): T[] {
  const source = items.findIndex((item) => item.clientKey === from);
  const target = items.findIndex((item) => item.clientKey === to);
  if (source < 0 || target < 0 || source === target) return items;
  const result = [...items];
  result.splice(target, 0, result.splice(source, 1)[0]);
  return result;
}
/** 저장 중 추가한 본문·정렬·삭제는 유지하고 발급된 ID만 합친다. 퓨샷 묶음과 인트로에 공통으로 쓴다. */
export function applyAllocatedIds<G extends FewshotGroup>(current: G[], saved: FewshotGroup[]): G[] {
  const groups = new Map(saved.map((group) => [group.clientKey, group]));
  const messages = new Map(
    saved.flatMap((group) => group.messages.map((message) => [message.clientKey, message] as const)),
  );
  return current.map((group) => ({
    ...group,
    id: group.id ?? groups.get(group.clientKey)?.id ?? null,
    messages: group.messages.map((message) => ({
      ...message,
      id: message.id ?? messages.get(message.clientKey)?.id ?? null,
    })),
  }));
}
export function insertAtSelection(text: string, selection: { start: number; end: number }, token: string) {
  const start = Math.max(0, Math.min(selection.start, text.length));
  const end = Math.max(start, Math.min(selection.end, text.length));
  return {
    text: text.slice(0, start) + token + text.slice(end),
    selection: { start: start + token.length, end: start + token.length },
  };
}
