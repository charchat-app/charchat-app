// CHAT-US-03 웹 임시 저장 어댑터
import type { DraftStorage } from '@/features/chat/draftStorage.types';

export function getDraftStorage(): DraftStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // 브라우저 설정이 사이트 저장소 접근을 막을 수 있다.
    return null;
  }
}
