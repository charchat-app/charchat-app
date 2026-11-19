import { apiRequest } from '@/lib/api-client';
import type { FewshotCharacter, FewshotGroup, FewshotsDocument, FewshotMessage } from '@/shared/story-types';

export interface FewshotRepository {
  load(id: string, signal?: AbortSignal): Promise<FewshotsDocument>;
  save(document: FewshotsDocument, requestId: string): Promise<FewshotsDocument>;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('퓨샷 응답 형식이 올바르지 않습니다.');
  return value as Record<string, unknown>;
}
/**
 * 서버 DB id를 화면용 문자열로 읽는다. 서버는 id를 숫자(int)로 응답하고, 예전 응답·시드는 숫자 문자열이다.
 * 둘 다 받되 안전한 양의 정수만 허용한다(JSON 숫자는 2^53 이상에서 정밀도를 잃음).
 */
function id(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n)
    throw new Error('퓨샷 ID가 올바르지 않습니다.');
  return value;
}
/** 응답의 story_id가 요청한 스토리와 같은지 숫자·문자열 구분 없이 확인한다. */
function sameId(value: unknown, expected: string): boolean {
  try {
    return id(value) === expected;
  } catch {
    return false;
  }
}
function key(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(value))
    throw new Error('퓨샷 편집 식별자가 올바르지 않습니다.');
  return value;
}
function parseCharacters(value: unknown): FewshotCharacter[] {
  if (!Array.isArray(value)) throw new Error('발화자 응답을 확인할 수 없습니다.');
  const ids = new Set<string>();
  return value.map((value) => {
    const c = object(value);
    const characterId = id(c.id);
    if (
      ids.has(characterId) ||
      (c.name !== null && typeof c.name !== 'string') ||
      !Number.isInteger(c.position) ||
      Number(c.position) < 0
    )
      throw new Error('발화자 응답을 확인할 수 없습니다.');
    ids.add(characterId);
    return { id: characterId, name: c.name as string | null, position: c.position as number };
  });
}
export { object as readObject, id as readId, key as readKey, sameId as isSameId };
function unique(set: Set<string>, value: string) {
  if (set.has(value)) throw new Error('중복된 응답 항목입니다.');
  set.add(value);
  return value;
}
/** 퓨샷·인트로 공통 말풍선 응답 검사. 발화자는 같은 스토리 인물만 허용한다. */
export function readMessage(
  value: unknown,
  characters: FewshotCharacter[],
  keys: Set<string>,
  messageIds: Set<string>,
): FewshotMessage {
  const message = object(value);
  if (
    !['user', 'character', 'narrator'].includes(String(message.speaker_kind)) ||
    (message.body !== null && typeof message.body !== 'string') ||
    (message.speaker_kind === 'character') !== (message.character_id !== null)
  )
    throw new Error('말풍선 응답을 확인할 수 없습니다.');
  const characterId = message.character_id === null ? null : id(message.character_id);
  if (characterId !== null && !characters.some((c) => c.id === characterId))
    throw new Error('발화자 연결을 확인할 수 없습니다.');
  return {
    id: unique(messageIds, id(message.id)),
    clientKey: unique(keys, key(message.client_key)),
    speakerKind: message.speaker_kind as FewshotMessage['speakerKind'],
    characterId,
    body: message.body as string | null,
  };
}
export function readFewshotsSnapshot(value: unknown, storyId: string, requestId?: string): FewshotsDocument {
  const source = object(value);
  if (
    !sameId(source.story_id, storyId) ||
    (typeof source.title !== 'string' && source.title !== null) ||
    typeof source.saved_at !== 'string' ||
    !Number.isFinite(Date.parse(source.saved_at)) ||
    !['draft', 'private', 'public'].includes(String(source.save_state)) ||
    !Array.isArray(source.characters) ||
    !Array.isArray(source.fewshots) ||
    (requestId !== undefined && source.request_id !== requestId)
  )
    throw new Error('퓨샷 저장 응답을 확인할 수 없습니다.');
  const characters = parseCharacters(source.characters);
  const keys = new Set<string>(),
    groupIds = new Set<string>(),
    messageIds = new Set<string>();
  const fewshots: FewshotGroup[] = source.fewshots.map((value) => {
    const group = object(value);
    if (!Array.isArray(group.messages)) throw new Error('예시 응답을 확인할 수 없습니다.');
    return {
      id: unique(groupIds, id(group.id)),
      clientKey: unique(keys, key(group.client_key)),
      messages: group.messages.map((value) => readMessage(value, characters, keys, messageIds)),
    };
  });
  return {
    id: storyId,
    title: source.title ?? '제목 없는 스토리',
    saveState: source.save_state as FewshotsDocument['saveState'],
    updatedAt: source.saved_at,
    characters,
    fewshots,
  };
}
export function fewshotsPayload(fewshots: FewshotGroup[]) {
  return {
    fewshots: fewshots.map((group) => ({
      id: group.id,
      client_key: group.clientKey,
      messages: group.messages.map((message) => ({
        id: message.id,
        client_key: message.clientKey,
        speaker_kind: message.speakerKind,
        character_id: message.characterId,
        body: message.body,
      })),
    })),
  };
}
export function createServerFewshotRepository(
  baseUrl: string,
  authorization: () => Promise<HeadersInit> = async () => ({}),
): FewshotRepository {
  const path = (storyId: string) => `/creation/stories/${id(storyId)}/fewshots`;
  return {
    async load(storyId, signal) {
      return readFewshotsSnapshot(
        await apiRequest<unknown>(path(storyId), { signal, headers: await authorization() }, baseUrl),
        storyId,
      );
    },
    async save(document, requestId) {
      const headers = new Headers(await authorization());
      headers.set('Idempotency-Key', requestId);
      return readFewshotsSnapshot(
        await apiRequest<unknown>(
          path(document.id),
          { method: 'PUT', headers, body: JSON.stringify(fewshotsPayload(document.fewshots)) },
          baseUrl,
        ),
        document.id,
        requestId,
      );
    },
  };
}
