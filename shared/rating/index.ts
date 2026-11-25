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

/**
 * CREATE-US-08-AC09·AC10·AC12 검토 사유(rating_review_reason)의 판정 종류와 사유 코드 허용 목록.
 * 서버는 대상 캐릭터·관계 id를 보내지 않는다. 평가기 원문·자유 텍스트도 보내지 않는다.
 */
export const RATING_REVIEW_OUTCOMES = ['ineligible', 'undetermined', 'unavailable'] as const;
export type RatingReviewOutcome = (typeof RATING_REVIEW_OUTCOMES)[number];

/** 확인된 부적격 사유 */
const CONFIRMED_REASONS = ['underage_stated', 'minor_depicted', 'restricted_kinship'] as const;
/** 판단할 수 없음 사유 */
const UNDETERMINED_REASONS = ['age_undetermined', 'kinship_undetermined'] as const;
/** 일시 장애(평가 실패·잘못된 출력) 사유 */
const OUTAGE_REASONS = ['invalid_signals', 'evaluator_failure'] as const;
export const RATING_REVIEW_REASON_CODES = [...CONFIRMED_REASONS, ...UNDETERMINED_REASONS, ...OUTAGE_REASONS] as const;
export type RatingReviewReasonCode = (typeof RATING_REVIEW_REASON_CODES)[number];

export type RatingReviewReason = { outcome: RatingReviewOutcome; reasons: RatingReviewReasonCode[] };

const includes = (list: readonly string[], value: string) => list.includes(value);

/**
 * rating_review_reason을 허용 목록으로 읽어 새 객체로 돌려준다(코드는 정렬). 모양·코드가 다르거나 서버 판정 규칙과
 * 어긋나면 null이다(원문을 그대로 두지 않는다). 규칙: ineligible은 확인 사유 하나 이상 + 확인·판단 불가 사유만,
 * undetermined는 판단 불가 사유만, unavailable은 장애 사유만. 사유는 비어 있거나 겹치면 안 된다.
 */
export function readRatingReviewReason(value: unknown): RatingReviewReason | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { outcome, reasons } = value as Record<string, unknown>;
  if (typeof outcome !== 'string' || !includes(RATING_REVIEW_OUTCOMES, outcome)) return null;
  if (!Array.isArray(reasons) || reasons.length === 0) return null;
  const codes: RatingReviewReasonCode[] = [];
  for (const code of reasons as unknown[]) {
    if (typeof code !== 'string' || !includes(RATING_REVIEW_REASON_CODES, code) || codes.includes(code as never))
      return null;
    codes.push(code as RatingReviewReasonCode);
  }
  const within = (list: readonly string[]) => codes.every((code) => includes(list, code));
  const valid =
    outcome === 'ineligible'
      ? codes.some((code) => includes(CONFIRMED_REASONS, code)) &&
        within([...CONFIRMED_REASONS, ...UNDETERMINED_REASONS])
      : outcome === 'undetermined'
        ? within(UNDETERMINED_REASONS)
        : within(OUTAGE_REASONS);
  if (!valid) return null;
  return { outcome: outcome as RatingReviewOutcome, reasons: [...codes].sort() };
}

export function isContentRating(value: unknown): value is ContentRating {
  return typeof value === 'string' && (CONTENT_RATINGS as readonly string[]).includes(value);
}

export function isRatingReviewStatus(value: unknown): value is RatingReviewStatus {
  return typeof value === 'string' && (RATING_REVIEW_STATUSES as readonly string[]).includes(value);
}
