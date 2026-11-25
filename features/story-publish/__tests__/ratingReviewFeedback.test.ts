// CREATE-US-08-AC09·AC10·AC12 등급 검토 사유(rating_review_reason) 허용 목록 읽기와 제작자 안내 문구.
// 서버 계약(요청 기준): outcome은 ineligible·undetermined·unavailable, reasons는 허용 코드 7종.
// 서버는 대상 캐릭터·관계 id를 보내지 않으므로 이름을 지어내지 않고 한계를 안내한다.
import { readRatingReviewReason } from '@/shared/rating';

import { UNRECOGNIZED_REVIEW_REASON } from '../commonRepository';
import { formatRatingReviewFeedback } from '../ratingReviewFeedback';

describe('CREATE-US-08-AC09/AC10 rating_review_reason 허용 목록 읽기', () => {
  it('허용 코드만 새 객체로 읽고 정렬한다', () => {
    const raw = { outcome: 'ineligible', reasons: ['restricted_kinship', 'age_undetermined', 'underage_stated'] };
    const read = readRatingReviewReason(raw);
    expect(read).toEqual({
      outcome: 'ineligible',
      reasons: ['age_undetermined', 'restricted_kinship', 'underage_stated'],
    });
    expect(read).not.toBe(raw);
    expect(read?.reasons).not.toBe(raw.reasons);
  });

  it('알 수 없는 키는 옮기지 않는다(원문을 그대로 두지 않는다)', () => {
    const read = readRatingReviewReason({ outcome: 'undetermined', reasons: ['age_undetermined'], raw: '평가기 원문' });
    expect(read).toEqual({ outcome: 'undetermined', reasons: ['age_undetermined'] });
    expect(read).not.toHaveProperty('raw');
  });

  it.each([
    ['없음', undefined],
    ['null', null],
    ['문자열', 'ineligible:underage_stated'],
    ['배열', ['ineligible']],
    ['모르는 outcome', { outcome: 'eligible', reasons: [] }],
    ['모르는 코드', { outcome: 'ineligible', reasons: ['underage_stated', 'too_spicy'] }],
    ['코드가 문자열이 아님', { outcome: 'ineligible', reasons: [1] }],
    ['빈 사유', { outcome: 'undetermined', reasons: [] }],
    ['reasons가 배열이 아님', { outcome: 'undetermined', reasons: 'age_undetermined' }],
    ['중복 코드', { outcome: 'undetermined', reasons: ['age_undetermined', 'age_undetermined'] }],
    // 서버 판정 규칙과 어긋나는 조합
    ['확인 코드 없는 ineligible', { outcome: 'ineligible', reasons: ['age_undetermined'] }],
    ['ineligible에 장애 코드', { outcome: 'ineligible', reasons: ['underage_stated', 'evaluator_failure'] }],
    ['undetermined에 확인 코드', { outcome: 'undetermined', reasons: ['minor_depicted'] }],
    ['unavailable에 판정 코드', { outcome: 'unavailable', reasons: ['age_undetermined'] }],
  ])('%s이면 null', (_name, value) => {
    expect(readRatingReviewReason(value)).toBeNull();
  });
});

const texts = (feedback: ReturnType<typeof formatRatingReviewFeedback>) =>
  [feedback.title, ...feedback.details].join('\n');
const CODES = [
  'underage_stated',
  'minor_depicted',
  'restricted_kinship',
  'age_undetermined',
  'kinship_undetermined',
  'invalid_signals',
  'evaluator_failure',
  'ineligible',
  'undetermined',
  'unavailable',
];

describe('CREATE-US-08-AC09·AC10·AC12 제작자 안내 문구', () => {
  it('CREATE-US-08-AC09: 미성년·제한 혈연이 확인된 부적격은 확인된 사유를 고정 문구로 알리고 대상 한계를 밝힌다', () => {
    const feedback = formatRatingReviewFeedback({
      requested: 'UNSAFE',
      effective: 'SAFE',
      reviewStatus: 'completed',
      reason: { outcome: 'ineligible', reasons: ['minor_depicted', 'restricted_kinship', 'underage_stated'] },
    });
    expect(feedback.kind).toBe('ineligible');
    expect(feedback.title).toBe('미성년자 또는 제한된 혈연 관계가 확인되어 UNSAFE 등급을 적용할 수 없어요.');
    expect(feedback.details).toEqual(
      expect.arrayContaining([
        '성인 나이에 미치지 않는다고 적힌 인물이 있어요.',
        '미성년자로 묘사된 인물이 있어요.',
        '친부모·자녀 또는 친형제자매 관계가 있어요.',
        '어느 캐릭터·관계인지는 아직 알려 드리지 못해요. 캐릭터 설명과 관계를 직접 확인해 주세요.',
      ]),
    );
    expect(feedback.canRefresh).toBe(false);
    // 서버 코드 원문을 그대로 보여 주지 않는다
    for (const code of CODES) expect(texts(feedback)).not.toContain(code);
  });

  it('CREATE-US-08-AC10: 판단할 수 없음은 부적격 확인과 구분한다', () => {
    const feedback = formatRatingReviewFeedback({
      requested: 'UNSAFE',
      effective: 'SAFE',
      reviewStatus: 'completed',
      reason: { outcome: 'undetermined', reasons: ['age_undetermined', 'kinship_undetermined'] },
    });
    expect(feedback.kind).toBe('undetermined');
    expect(feedback.title).toBe('나이나 혈연 관계를 확인할 수 없어 UNSAFE 등급을 적용하지 않았어요.');
    expect(feedback.details).toEqual(
      expect.arrayContaining([
        '나이를 확인할 수 없는 인물이 있어요.',
        '혈연 관계를 확인할 수 없는 인물이 있어요.',
        '미성년자나 제한된 관계로 확인된 것은 아니에요.',
        '어느 캐릭터·관계인지는 아직 알려 드리지 못해요. 캐릭터 설명과 관계를 직접 확인해 주세요.',
      ]),
    );
    expect(texts(feedback)).not.toContain('확인되어');
    for (const code of CODES) expect(texts(feedback)).not.toContain(code);
  });

  it('CREATE-US-08-AC12: 일시 장애는 부적격이 아니고 이전 적용 등급이 유지됨을 알리며 새로고침할 수 있다', () => {
    for (const reason of [
      { outcome: 'unavailable' as const, reasons: ['evaluator_failure' as const] },
      { outcome: 'unavailable' as const, reasons: ['invalid_signals' as const] },
      undefined,
    ]) {
      const feedback = formatRatingReviewFeedback({
        requested: 'UNSAFE',
        effective: 'UNSAFE',
        reviewStatus: 'failed',
        ...(reason ? { reason } : {}),
      });
      expect(feedback.kind).toBe('unavailable');
      expect(feedback.title).toBe('등급 검토를 일시적으로 하지 못했어요.');
      expect(feedback.details).toEqual(
        expect.arrayContaining(['부적격 판정이 아니에요.', '적용 등급은 이전 그대로예요.']),
      );
      expect(feedback.canRefresh).toBe(true);
      expect(texts(feedback)).not.toMatch(/미성년|혈연/);
    }
  });

  it('CREATE-US-08-AC12: 검토 중은 적용 등급이 바뀌지 않았음을 알리고 새로고침할 수 있다', () => {
    const feedback = formatRatingReviewFeedback({ requested: 'UNSAFE', effective: null, reviewStatus: 'reviewing' });
    expect(feedback.kind).toBe('pending');
    expect(feedback.title).toBe('등급 검토 중이에요.');
    expect(feedback.details).toContain('검토가 끝날 때까지 적용 등급은 바뀌지 않아요.');
    expect(feedback.canRefresh).toBe(true);
  });

  it('CREATE-US-08-AC12: 통과는 적용 등급이 UNSAFE인 완료일 때만이다(고른 등급으로 짐작하지 않는다)', () => {
    expect(formatRatingReviewFeedback({ requested: 'UNSAFE', effective: 'UNSAFE', reviewStatus: 'completed' })).toEqual(
      expect.objectContaining({
        kind: 'approved',
        title: '검토를 통과해 UNSAFE 등급이 적용됐어요.',
        canRefresh: false,
      }),
    );
    // 고른 등급이 UNSAFE여도 적용 등급이 없거나 SAFE면 통과로 보지 않는다
    expect(formatRatingReviewFeedback({ requested: 'UNSAFE', effective: null, reviewStatus: 'completed' }).kind).toBe(
      'completed',
    );
    expect(formatRatingReviewFeedback({ requested: 'UNSAFE', effective: 'SAFE', reviewStatus: 'completed' }).kind).toBe(
      'completed',
    );
  });

  it('검토 전·정보 없음', () => {
    expect(formatRatingReviewFeedback({ requested: 'SAFE', effective: 'SAFE', reviewStatus: 'not_reviewed' })).toEqual(
      expect.objectContaining({ kind: 'not_reviewed', title: '아직 등급 검토를 받지 않았어요.', canRefresh: false }),
    );
    expect(formatRatingReviewFeedback(undefined)).toEqual(
      expect.objectContaining({ kind: 'none', title: '등급 검토 정보가 없어요.', canRefresh: false }),
    );
  });

  it('상태와 어긋난 사유는 쓰지 않는다(완료인데 장애 사유, 실패인데 부적격 사유)', () => {
    expect(
      formatRatingReviewFeedback({
        requested: 'UNSAFE',
        effective: 'SAFE',
        reviewStatus: 'failed',
        reason: { outcome: 'ineligible', reasons: ['underage_stated'] },
      }).kind,
    ).toBe('unavailable');
    expect(
      formatRatingReviewFeedback({
        requested: 'UNSAFE',
        effective: 'SAFE',
        reviewStatus: 'reviewing',
        reason: { outcome: 'ineligible', reasons: ['underage_stated'] },
      }).kind,
    ).toBe('pending');
  });

  it('읽을 수 없는 사유가 온 완료는 적용 등급이 UNSAFE여도 통과로 말하지 않는다(중립 안내)', () => {
    const feedback = formatRatingReviewFeedback({
      requested: 'UNSAFE',
      effective: 'UNSAFE',
      reviewStatus: 'completed',
      reason: UNRECOGNIZED_REVIEW_REASON,
    });
    expect(feedback.kind).toBe('completed');
    expect(feedback.title).toBe('등급 검토가 끝났어요.');
    expect(texts(feedback)).not.toMatch(/통과|확인되어|미성년|혈연/);
    expect(feedback.canRefresh).toBe(false);
    for (const code of [...CODES, 'unrecognized']) expect(texts(feedback)).not.toContain(code);
  });

  it('읽을 수 없는 사유가 온 실패는 사유 문구 없이 일시 장애로만 알린다', () => {
    const feedback = formatRatingReviewFeedback({
      requested: 'UNSAFE',
      effective: 'SAFE',
      reviewStatus: 'failed',
      reason: UNRECOGNIZED_REVIEW_REASON,
    });
    expect(feedback.kind).toBe('unavailable');
    expect(feedback.details).not.toContain('검토 시스템에 일시적인 문제가 있었어요.');
    expect(texts(feedback)).not.toContain('unrecognized');
  });

  it('다시 저장하면 새로 검토된다고 약속하지 않는다(확인되지 않은 재검토 안내 없음)', () => {
    const all = [
      formatRatingReviewFeedback({
        requested: 'UNSAFE',
        effective: 'SAFE',
        reviewStatus: 'failed',
        reason: { outcome: 'unavailable', reasons: ['evaluator_failure'] },
      }),
      formatRatingReviewFeedback({
        requested: 'UNSAFE',
        effective: 'SAFE',
        reviewStatus: 'completed',
        reason: { outcome: 'undetermined', reasons: ['age_undetermined'] },
      }),
    ];
    for (const feedback of all) expect(texts(feedback)).not.toMatch(/다시 「저장」|새로 검토/);
  });
});
