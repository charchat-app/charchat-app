// CHAT-US-03 결과를 모르는 전송의 요청 ID를 기기에 보관해, 다시 열었을 때 새로 보내지 않고 확인한다
import { getConversationOwnerId, positiveConversationId } from '@/features/chat/conversationIdentity';
import { getDraftStorage } from '@/features/chat/draftStorage';
import type { ChatMessagePartInput } from '@/shared/story-types';

export type StoredSendAttempt = { requestId: string; parts: ChatMessagePartInput[] };

const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function sendAttemptKey(ownerId: string | null, sessionId: string) {
  return positiveConversationId(ownerId) && positiveConversationId(sessionId)
    ? `charchat:chat-send:v1:${ownerId}:${sessionId}`
    : null;
}

function target(sessionId: string) {
  const key = sendAttemptKey(getConversationOwnerId(), sessionId);
  const storage = key ? getDraftStorage() : null;
  return key && storage ? { key, storage } : null;
}

// 같은 키의 기록·삭제를 시작한 순서대로 실행해 늦게 끝난 기록이 삭제를 되살리지 않게 한다.
const queues = new Map<string, Promise<unknown>>();

function enqueue<T>(key: string, run: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).then(run, run);
  const settled = next.catch(() => undefined);
  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
  return next;
}

function isPart(value: unknown): value is ChatMessagePartInput {
  if (typeof value !== 'object' || value === null) return false;
  const part = value as Record<string, unknown>;
  return (
    ['user', 'character', 'narrator'].includes(part.speaker_kind as string) &&
    (part.character_id === null || Number.isSafeInteger(part.character_id)) &&
    typeof part.body === 'string'
  );
}

function decode(stored: string | null): StoredSendAttempt | null {
  if (!stored) return null;
  try {
    const value = JSON.parse(stored) as Record<string, unknown>;
    if (typeof value.requestId !== 'string' || !REQUEST_ID.test(value.requestId)) return null;
    if (!Array.isArray(value.parts) || !value.parts.every(isPart)) return null;
    return { requestId: value.requestId, parts: value.parts };
  } catch {
    return null;
  }
}

/** 전송을 시작할 때 기록한다. 실패해도 전송은 계속한다(보관은 보조 수단). */
export async function saveSendAttempt(sessionId: string, attempt: StoredSendAttempt) {
  const place = target(sessionId);
  if (!place) return;
  try {
    await enqueue(place.key, async () => place.storage.setItem(place.key, JSON.stringify(attempt)));
  } catch {
    // 저장소를 쓸 수 없으면 같은 앱 실행 안의 확인만 가능하다.
  }
}

export async function loadSendAttempt(sessionId: string): Promise<StoredSendAttempt | null> {
  const place = target(sessionId);
  if (!place) return null;
  try {
    return decode(await enqueue(place.key, async () => place.storage.getItem(place.key)));
  } catch {
    return null;
  }
}

/** 접수·거절이 확정된 요청만 지운다. 그 사이 시작한 다른 요청의 기록은 남긴다. */
export async function clearSendAttempt(sessionId: string, requestId: string) {
  const place = target(sessionId);
  if (!place) return;
  try {
    await enqueue(place.key, async () => {
      if (decode(await place.storage.getItem(place.key))?.requestId === requestId) {
        await place.storage.removeItem(place.key);
      }
    });
  } catch {
    // 남은 기록은 다음 확인 때 같은 요청 ID로 다시 조회된다.
  }
}
