// CHAT-US-03 개발 사용자 및 대화방 식별자
import { authHeaders } from '@/lib/api-client';

export function positiveConversationId(value: unknown): string | null {
  return typeof value === 'string' && /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value)) ? value : null;
}

export function getConversationOwnerId() {
  return positiveConversationId(authHeaders()['X-User-Id']);
}
