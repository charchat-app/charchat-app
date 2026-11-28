// BASE-03 로그아웃 시 그 계정의 기기 보관분(작성 중 입력·결과를 모르는 전송 기록)을 지운다.
// 사용자가 직접 로그아웃했을 때만 부른다. 세션 만료처럼 비자발적으로 끝났을 때는 남겨 두어 같은 계정으로 다시 로그인하면 이어서 쓴다.
// CHAT-US-09 대화 삭제: 지운 대화방 하나의 기기 보관분만 지운다(같은 계정의 다른 방은 그대로).
import { positiveConversationId } from '@/features/chat/conversationIdentity';
import { cancelPendingDraft, chatDraftKey } from '@/features/chat/draftPersistence';
import { getDraftStorage } from '@/features/chat/draftStorage';
import type { ChatDraftStorage } from '@/features/chat/draftStorage.types';

/**
 * 계정 번호가 들어간 기기 보관 키인지. 형식은 draftPersistence.ts·sendAttemptStorage.ts와 같다.
 * - `charchat:chat-draft:v1:{계정}:{대화방}` (작성 중 입력)
 * - `charchat:chat-send:v1:{계정}:{대화방}` (결과를 모르는 전송의 요청 ID)
 * - `charchat:chat-draft-clear:v1:charchat:chat-draft:v1:{계정}:{대화방}` (웹 삭제 세대 표시)
 * - `charchat:chat-draft-data:v1:["charchat:chat-draft:v1:{계정}:{대화방}","세대"]` (웹 세대별 원문)
 * 계정 번호 뒤의 `:`까지 비교해 1번 계정이 12번 계정의 키를 지우지 않는다.
 */
export function isOwnerChatDeviceKey(key: string, ownerId: string): boolean {
  if (!positiveConversationId(ownerId)) return false;
  const draft = `charchat:chat-draft:v1:${ownerId}:`;
  return [
    draft,
    `charchat:chat-send:v1:${ownerId}:`,
    `charchat:chat-draft-clear:v1:${draft}`,
    `charchat:chat-draft-data:v1:[${JSON.stringify(draft).slice(0, -1)}`,
  ].some((prefix) => key.startsWith(prefix));
}

type EnumerableStorage = { readonly length: number; key(index: number): string | null; removeItem(key: string): void };

function isEnumerable(storage: ChatDraftStorage): storage is ChatDraftStorage & EnumerableStorage {
  return 'length' in storage && typeof (storage as Partial<EnumerableStorage>).key === 'function';
}

/**
 * 그 계정·그 대화방 하나의 기기 보관 키인지(CHAT-US-09 대화 삭제). 형식은 isOwnerChatDeviceKey와 같다.
 * 대화방 번호 뒤까지 비교해 1번 방이 12번 방의 키를 지우지 않는다.
 */
export function isSessionChatDeviceKey(key: string, ownerId: string, sessionId: string): boolean {
  const draft = chatDraftKey(ownerId, sessionId);
  if (!draft) return false;
  return (
    key === draft ||
    key === `charchat:chat-send:v1:${ownerId}:${sessionId}` ||
    key === `charchat:chat-draft-clear:v1:${draft}` ||
    key.startsWith(`charchat:chat-draft-data:v1:[${JSON.stringify(draft)},`)
  );
}

async function clearMatching(matches: (key: string) => boolean): Promise<number> {
  const storage = getDraftStorage();
  if (!storage) return 0;
  try {
    if ('kind' in storage) {
      if (!storage.getAllKeys || !storage.multiRemove) return 0;
      const keys = (await storage.getAllKeys()).filter(matches);
      if (keys.length) await storage.multiRemove(keys);
      return keys.length;
    }
    if (!isEnumerable(storage)) return 0;
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null && matches(key)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
    return keys.length;
  } catch {
    return 0;
  }
}

/** 지운 키 개수. 저장소를 쓸 수 없으면 0. 실패해도 로그아웃은 계속한다. */
export async function clearChatDeviceData(ownerId: string | null): Promise<number> {
  if (!ownerId || !positiveConversationId(ownerId)) return 0;
  return clearMatching((key) => isOwnerChatDeviceKey(key, ownerId));
}

/**
 * CHAT-US-09-AC14: 삭제한 대화방의 작성 중 입력·전송 기록을 이 기기에서 지운다. 지운 키 개수를 돌려준다.
 * 방을 막 떠나 아직 기록되지 않은 입력(0.5초 대기)도 취소해, 지운 뒤에 되살아나지 않게 한다.
 */
export async function clearSessionDeviceData(ownerId: string | null, sessionId: string): Promise<number> {
  const draft = chatDraftKey(ownerId, sessionId);
  if (!ownerId || !draft) return 0;
  const storage = getDraftStorage();
  if (storage) cancelPendingDraft(storage, draft);
  return clearMatching((key) => isSessionChatDeviceKey(key, ownerId, sessionId));
}
