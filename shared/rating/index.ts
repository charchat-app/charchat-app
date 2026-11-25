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
 * 서버는 대상 캐릭터·관계 id를 보내지 않는다(선택 항목 targets의 검증된 표시 이름만). 평가기 원문·자유 텍스트도
 * 보내지 않는다.
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

/**
 * CREATE-US-08-AC09 선택 항목 rating_review_reason.targets 한 개. 서버가 제작자가 쓴 캐릭터 이름·관계 표시명과
 * 맞춰 본 표시용 이름(label)만 보낸다. 앱은 형식만 엄격히 확인하고, 사유 코드와 맞는 고정 문구와 함께 보여 준다.
 */
export const RATING_REVIEW_TARGET_KINDS = ['character', 'relationship'] as const;
export type RatingReviewTargetKind = (typeof RATING_REVIEW_TARGET_KINDS)[number];
export type RatingReviewTarget = { reason: RatingReviewReasonCode; kind: RatingReviewTargetKind; label: string };

export type RatingReviewReason = {
  outcome: RatingReviewOutcome;
  reasons: RatingReviewReasonCode[];
  /** 읽을 수 있는 대상이 하나 이상일 때만 둔다 */
  targets?: RatingReviewTarget[];
};

/** 대상 개수 상한. 넘으면 대상 목록 전체를 버린다 */
export const MAX_RATING_REVIEW_TARGETS = 50;
/**
 * 대상 이름 길이 상한(Unicode 코드 포인트, 서버 Python len과 같은 단위). 넘으면 그 항목을 버린다.
 * 서버는 이름 자체 상한이 없고 검토는 완성 저장에서만 돈다. 완성 저장은 제목·한 줄 소개·세계관·캐릭터 이름·상세
 * 합산 3000자이고 나머지 필수 4칸이 각 1자 이상이므로 캐릭터 이름은 최대 2996자, 관계 이름은 「유저 ↔ 」(5자)를
 * 더해 최대 3001자다(server save_visibility/service.py BASIC_TEXT_LIMIT, rating_review.py target_label).
 */
export const MAX_RATING_REVIEW_TARGET_LABEL_LENGTH = 3001;

const codePointLength = (text: string) => Array.from(text).length;

/** 사유 코드별 대상 종류. 장애 사유는 대상이 없다 */
const TARGET_KIND_OF: Partial<Record<RatingReviewReasonCode, RatingReviewTargetKind>> = {
  underage_stated: 'character',
  minor_depicted: 'character',
  age_undetermined: 'character',
  restricted_kinship: 'relationship',
  kinship_undetermined: 'relationship',
};
const TARGET_KEYS = ['kind', 'label', 'reason'];
// 줄바꿈·탭 등 제어 문자와 줄·문단 구분자는 표시 이름에 둘 수 없다
// eslint-disable-next-line no-control-regex
const UNSAFE_LABEL_CHARS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;

const includes = (list: readonly string[], value: string) => list.includes(value);

function readTarget(value: unknown, reasons: readonly RatingReviewReasonCode[]): RatingReviewTarget | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== TARGET_KEYS.length || keys.some((key, i) => key !== TARGET_KEYS[i])) return null;
  const { reason, kind, label } = record;
  if (typeof reason !== 'string' || !includes(reasons, reason)) return null;
  if (typeof kind !== 'string' || TARGET_KIND_OF[reason as RatingReviewReasonCode] !== kind) return null;
  if (typeof label !== 'string' || UNSAFE_LABEL_CHARS.test(label)) return null;
  const trimmed = label.trim();
  if (trimmed.length === 0 || codePointLength(trimmed) > MAX_RATING_REVIEW_TARGET_LABEL_LENGTH) return null;
  return { reason: reason as RatingReviewReasonCode, kind: kind as RatingReviewTargetKind, label: trimmed };
}

/**
 * 대상 목록을 읽는다. 목록 모양이 다르거나 상한을 넘으면 대상 전체를, 잘못된 항목은 그 항목만 버린다.
 * 사유(reasons) 판정에는 영향을 주지 않는다. 읽은 대상이 없으면 null(키를 두지 않는다).
 */
function readTargets(value: unknown, reasons: readonly RatingReviewReasonCode[]): RatingReviewTarget[] | null {
  if (!Array.isArray(value) || value.length > MAX_RATING_REVIEW_TARGETS) return null;
  const targets: RatingReviewTarget[] = [];
  for (const item of value as unknown[]) {
    const target = readTarget(item, reasons);
    if (!target) continue;
    const duplicate = targets.some(
      (t) => t.reason === target.reason && t.kind === target.kind && t.label === target.label,
    );
    if (!duplicate) targets.push(target);
  }
  return targets.length > 0 ? targets : null;
}

/**
 * rating_review_reason을 허용 목록으로 읽어 새 객체로 돌려준다(코드는 정렬). 모양·코드가 다르거나 서버 판정 규칙과
 * 어긋나면 null이다(원문을 그대로 두지 않는다). 규칙: ineligible은 확인 사유 하나 이상 + 확인·판단 불가 사유만,
 * undetermined는 판단 불가 사유만, unavailable은 장애 사유만. 사유는 비어 있거나 겹치면 안 된다.
 * 선택 항목 targets는 readTargets 규칙으로 따로 읽어, 잘못돼도 사유는 그대로 둔다.
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
  const targets = readTargets((value as Record<string, unknown>).targets, codes);
  return {
    outcome: outcome as RatingReviewOutcome,
    reasons: [...codes].sort(),
    ...(targets ? { targets } : {}),
  };
}

export function isContentRating(value: unknown): value is ContentRating {
  return typeof value === 'string' && (CONTENT_RATINGS as readonly string[]).includes(value);
}

export function isRatingReviewStatus(value: unknown): value is RatingReviewStatus {
  return typeof value === 'string' && (RATING_REVIEW_STATUSES as readonly string[]).includes(value);
}
