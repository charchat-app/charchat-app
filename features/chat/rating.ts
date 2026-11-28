// CHAT-US-15 대화 화면의 현재 적용 등급 표시
import { type ContentRating, isContentRating } from '@/shared/rating';

/**
 * 서버가 준 적용 등급(stories.effective_rating)만 표시 값으로 쓴다. 없거나(옛 서버) 모르는 값이면 null이고,
 * 이때 등급 표시를 숨긴다. 요청 등급·기본값(SAFE)·이전에 보인 값으로 채우지 않는다(CHAT-US-15-AC01).
 */
export function displayRating(value: unknown): ContentRating | null {
  return isContentRating(value) ? value : null;
}
