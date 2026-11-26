// CHAT-US-03 대화 계정 및 대화방 식별자 · BASE-03 로그인 세션의 계정 번호
import { devHeaderUserId } from '@/lib/api-client';
import { getAuthSnapshot } from '@/lib/authSession';

export function positiveConversationId(value: unknown): string | null {
  return typeof value === 'string' && /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value)) ? value : null;
}

/**
 * 기기 보관 키(`charchat:chat-draft:v1:{계정}:{대화방}` 등)에 쓰는 계정 번호. 키 형식은 바뀌지 않는다.
 * 로그인 세션이 이용 가능(active)이면 그 계정, 로그인 세션이 없으면 개발용 헤더 모드의 번호다.
 * 로그아웃 정리 중(signing-out)·온보딩 전(pending)에는 null이라 대기 중인 초안 쓰기가 저장하지 않는다.
 */
export function getConversationOwnerId() {
  const { status, userId } = getAuthSnapshot();
  if (status === 'active') return positiveConversationId(userId);
  if (status === 'loading' || status === 'signed-out') return positiveConversationId(devHeaderUserId());
  return null;
}
