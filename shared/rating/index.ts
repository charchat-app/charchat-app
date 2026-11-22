// CREATE-US-08 콘텐츠 등급 상수·표시
// react-native에 의존하지 않는다: story-publish/commonRepository가 Node만으로 불러오는 경로에서도 쓴다.

/** 공통 저장(/creation) 요청·응답의 등급 값. 요청은 requested_rating으로 이 값만 받는다. */
export const CONTENT_RATINGS = ['SAFE', 'UNSAFE'] as const;
export type ContentRating = (typeof CONTENT_RATINGS)[number];

/** 편집에서 저장한 선택이 없을 때 화면이 보여 주는 기본 선택 */
export const DEFAULT_CONTENT_RATING: ContentRating = 'SAFE';

/** 등급 검토 상태(rating_review_status) */
export const RATING_REVIEW_STATUSES = ['not_reviewed', 'reviewing', 'completed', 'failed'] as const;
export type RatingReviewStatus = (typeof RATING_REVIEW_STATUSES)[number];

export const RATING_REVIEW_STATUS_LABELS: Record<RatingReviewStatus, string> = {
  not_reviewed: '검토 전',
  reviewing: '검토 중',
  completed: '검토 완료',
  failed: '검토 실패',
};

export function isContentRating(value: unknown): value is ContentRating {
  return typeof value === 'string' && (CONTENT_RATINGS as readonly string[]).includes(value);
}

export function isRatingReviewStatus(value: unknown): value is RatingReviewStatus {
  return typeof value === 'string' && (RATING_REVIEW_STATUSES as readonly string[]).includes(value);
}
