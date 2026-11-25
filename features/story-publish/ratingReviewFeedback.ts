// CREATE-US-08-AC09·AC10·AC12 제작자에게 보여 줄 등급 검토 결과 안내(고정 문구).
// 서버 코드 원문은 보여 주지 않는다. 대상 이름은 서버가 보낸 검증된 표시 이름(targets, shared/rating이 엄격히 읽음)만
// 쓰고 지어내지 않는다. 적용 등급은 effective만 쓴다(고른 등급 requested로 짐작하지 않는다).
import type { RatingReviewReason, RatingReviewReasonCode, RatingReviewTargetKind } from '@/shared/rating';

import type { CreationRating } from './commonRepository';

export type RatingReviewFeedbackKind =
  'none' | 'not_reviewed' | 'pending' | 'approved' | 'completed' | 'ineligible' | 'undetermined' | 'unavailable';

export type RatingReviewFeedback = {
  kind: RatingReviewFeedbackKind;
  title: string;
  details: string[];
  /** 서버 상태가 바뀔 수 있는 경우(검토 중·실패)에만 명시적 새로고침을 연다 */
  canRefresh: boolean;
};

const REASON_TEXT: Record<RatingReviewReasonCode, string> = {
  underage_stated: '성인 나이에 미치지 않는다고 적힌 인물이 있어요.',
  minor_depicted: '미성년자로 묘사된 인물이 있어요.',
  restricted_kinship: '친부모·자녀 또는 친형제자매 관계가 있어요.',
  age_undetermined: '나이를 확인할 수 없는 인물이 있어요.',
  kinship_undetermined: '혈연 관계를 확인할 수 없는 인물이 있어요.',
  invalid_signals: '검토 결과를 확인할 수 없었어요.',
  evaluator_failure: '검토 시스템에 일시적인 문제가 있었어요.',
};

/** CREATE-US-08-AC09 대상과 함께 보여 줄 사유 문구(대상 종류는 shared/rating이 코드에 맞춰 이미 확인했다) */
const TARGET_REASON_TEXT: Record<RatingReviewReasonCode, string> = {
  underage_stated: '성인 나이에 미치지 않는다고 적혀 있어요.',
  minor_depicted: '미성년자로 묘사됐어요.',
  restricted_kinship: '친부모·자녀 또는 친형제자매 관계예요.',
  age_undetermined: '나이를 확인할 수 없어요.',
  kinship_undetermined: '혈연 관계를 확인할 수 없어요.',
  invalid_signals: REASON_TEXT.invalid_signals,
  evaluator_failure: REASON_TEXT.evaluator_failure,
};
const TARGET_KIND_TEXT: Record<RatingReviewTargetKind, string> = { character: '캐릭터', relationship: '관계' };

/** 대상이 하나도 없을 때: 서버가 대상을 알려 주지 않은 한계(지어내지 않는다). 예전 문구 그대로 */
const TARGET_LIMITATION = '어느 캐릭터·관계인지는 아직 알려 드리지 못해요. 캐릭터 설명과 관계를 직접 확인해 주세요.';
/**
 * 대상이 하나라도 있을 때. 서버는 이름을 확인할 수 없는 대상을 같은 사유 안에서도 뺄 수 있으므로,
 * 모든 사유에 대상이 있어도 표시된 대상이 전부라고 말하지 않는다.
 */
const NONEXHAUSTIVE_TARGET_GUIDANCE =
  '표시된 캐릭터·관계는 일부일 수 있어요. 다른 캐릭터 설명과 관계도 직접 확인해 주세요.';

/**
 * 사유 코드 순서대로, 그 코드의 대상이 있으면 대상마다 고정 문구 한 줄, 없으면 일반 문구 한 줄을 만든다.
 * 대상은 자기 코드의 문구와만 묶인다(다른 사유를 대상에 붙이지 않는다).
 */
function reasonLines(reason: RatingReviewReason): string[] {
  return reason.reasons.flatMap((code) => {
    const targets = (reason.targets ?? []).filter((target) => target.reason === code);
    if (targets.length === 0) return [REASON_TEXT[code]];
    return targets.map((target) => `${TARGET_KIND_TEXT[target.kind]} 「${target.label}」: ${TARGET_REASON_TEXT[code]}`);
  });
}

function targetGuidance(reason: RatingReviewReason): string {
  const shown = (reason.targets ?? []).some((target) => reason.reasons.includes(target.reason));
  return shown ? NONEXHAUSTIVE_TARGET_GUIDANCE : TARGET_LIMITATION;
}

export function formatRatingReviewFeedback(rating: CreationRating | undefined): RatingReviewFeedback {
  const status = rating?.reviewStatus ?? null;
  // 상태와 어긋난 사유는 쓰지 않는다(저장소가 이미 거르지만 화면도 같은 규칙을 지킨다)
  const reason = rating?.reason;
  switch (status) {
    case null:
      return { kind: 'none', title: '등급 검토 정보가 없어요.', details: [], canRefresh: false };
    case 'not_reviewed':
      return { kind: 'not_reviewed', title: '아직 등급 검토를 받지 않았어요.', details: [], canRefresh: false };
    case 'reviewing':
      return {
        kind: 'pending',
        title: '등급 검토 중이에요.',
        details: [
          '검토가 끝날 때까지 적용 등급은 바뀌지 않아요.',
          '결과는 자동으로 갱신되지 않아요. 「검토 상태 새로고침」으로 확인해 주세요.',
        ],
        canRefresh: true,
      };
    case 'failed':
      return {
        kind: 'unavailable',
        title: '등급 검토를 일시적으로 하지 못했어요.',
        details: [
          ...(reason?.outcome === 'unavailable' ? reasonLines(reason) : []),
          '부적격 판정이 아니에요.',
          '적용 등급은 이전 그대로예요.',
          '자동으로 다시 검토하지 않아요.',
        ],
        canRefresh: true,
      };
    case 'completed':
      if (reason?.outcome === 'ineligible')
        return {
          kind: 'ineligible',
          title: '미성년자 또는 제한된 혈연 관계가 확인되어 UNSAFE 등급을 적용할 수 없어요.',
          details: [...reasonLines(reason), targetGuidance(reason)],
          canRefresh: false,
        };
      if (reason?.outcome === 'undetermined')
        return {
          kind: 'undetermined',
          title: '나이나 혈연 관계를 확인할 수 없어 UNSAFE 등급을 적용하지 않았어요.',
          details: [
            ...reasonLines(reason),
            '미성년자나 제한된 관계로 확인된 것은 아니에요.',
            targetGuidance(reason),
            '인물의 나이와 관계를 분명히 적어 주세요.',
          ],
          canRefresh: false,
        };
      // 서버가 사유를 보냈지만 읽을 수 없으면 통과·부적격 어느 쪽도 말하지 않는다
      if (reason?.outcome === 'unrecognized')
        return {
          kind: 'completed',
          title: '등급 검토가 끝났어요.',
          details: ['검토 결과의 자세한 내용을 확인할 수 없어요.'],
          canRefresh: false,
        };
      if (rating?.effective === 'UNSAFE')
        return { kind: 'approved', title: '검토를 통과해 UNSAFE 등급이 적용됐어요.', details: [], canRefresh: false };
      return { kind: 'completed', title: '등급 검토가 끝났어요.', details: [], canRefresh: false };
  }
}
