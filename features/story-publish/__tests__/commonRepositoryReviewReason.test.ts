// CREATE-US-08-AC09·AC10·AC12 공통 저장(/creation) 응답의 rating_review_reason을 허용 목록으로 읽는다.
// 서버 계약(요청 기준): rating_review_reason = { outcome, reasons } 또는 null. 대상 캐릭터·관계 id는 없다.
// 서버와 실제로 맞춰 본 결과가 아니라 응답 변환만 검증한다.
import { defaultExpression, toExpressionRow } from '@/shared/story-types';

import { createCommonSaveRepository, type CommonSaveDocument } from '../commonRepository';

const BASE = 'http://localhost:8000/api/v1';
const { story_id: _storyId, ...expression } = toExpressionRow('1', defaultExpression());

const response = (extra: Record<string, unknown> = {}) => ({
  story_id: '1',
  title: '가상',
  save_state: 'private',
  saved_at: '2026-11-17T00:00:00Z',
  expression,
  characters: [],
  fewshots: [],
  intros: [],
  relations: [],
  affinities: [],
  request_id: 'req',
  ...extra,
});

let fetcher: jest.SpyInstance;
const reply = (body: unknown) => fetcher.mockResolvedValueOnce({ ok: true, json: async () => body } as Response);
beforeEach(() => {
  fetcher = jest.spyOn(globalThis, 'fetch');
});
afterEach(() => {
  fetcher.mockRestore();
});

const COMPLETED = { requested_rating: 'UNSAFE', effective_rating: 'SAFE', rating_review_status: 'completed' };

describe('CREATE-US-08-AC09·AC10 조회 응답의 검토 사유', () => {
  it('CREATE-US-08-AC09: 완료·부적격 사유를 허용 코드로 읽는다', async () => {
    reply(
      response({
        ...COMPLETED,
        rating_review_reason: { outcome: 'ineligible', reasons: ['underage_stated', 'restricted_kinship'] },
      }),
    );
    const loaded = await createCommonSaveRepository(BASE).load('1');
    expect(loaded.rating).toEqual({
      requested: 'UNSAFE',
      effective: 'SAFE',
      reviewStatus: 'completed',
      reason: { outcome: 'ineligible', reasons: ['restricted_kinship', 'underage_stated'] },
    });
  });

  it('CREATE-US-08-AC10: 완료·판단 불가 사유를 읽는다', async () => {
    reply(response({ ...COMPLETED, rating_review_reason: { outcome: 'undetermined', reasons: ['age_undetermined'] } }));
    const loaded = await createCommonSaveRepository(BASE).load('1');
    expect(loaded.rating?.reason).toEqual({ outcome: 'undetermined', reasons: ['age_undetermined'] });
  });

  it('CREATE-US-08-AC12: 실패·일시 장애 사유를 읽는다', async () => {
    reply(
      response({
        requested_rating: 'UNSAFE',
        effective_rating: 'UNSAFE',
        rating_review_status: 'failed',
        rating_review_reason: { outcome: 'unavailable', reasons: ['evaluator_failure'] },
      }),
    );
    const loaded = await createCommonSaveRepository(BASE).load('1');
    expect(loaded.rating?.reason).toEqual({ outcome: 'unavailable', reasons: ['evaluator_failure'] });
  });

  it('사유가 없거나 null이면 reason 키를 두지 않는다(이전 응답 호환)', async () => {
    reply(response(COMPLETED));
    expect((await createCommonSaveRepository(BASE).load('1')).rating).toEqual({
      requested: 'UNSAFE',
      effective: 'SAFE',
      reviewStatus: 'completed',
    });
    reply(response({ ...COMPLETED, rating_review_reason: null }));
    expect((await createCommonSaveRepository(BASE).load('1')).rating).not.toHaveProperty('reason');
  });

  it('허용 목록 밖이거나 상태와 어긋난 사유는 원문 없이 중립 표시로 남기고 나머지 응답은 그대로 읽는다', async () => {
    const repo = createCommonSaveRepository(BASE);
    const cases: [Record<string, unknown>, unknown][] = [
      [COMPLETED, { outcome: 'ineligible', reasons: ['underage_stated', '원문'] }],
      [COMPLETED, '미성년자 캐릭터 루나'],
      // 완료인데 장애 사유, 실패인데 부적격 사유, 검토 중인데 사유
      [COMPLETED, { outcome: 'unavailable', reasons: ['evaluator_failure'] }],
      [
        { ...COMPLETED, rating_review_status: 'failed' },
        { outcome: 'ineligible', reasons: ['underage_stated'] },
      ],
      [
        { ...COMPLETED, rating_review_status: 'reviewing' },
        { outcome: 'undetermined', reasons: ['age_undetermined'] },
      ],
    ];
    for (const [rating, reason] of cases) {
      reply(response({ ...rating, rating_review_reason: reason }));
      const loaded = await repo.load('1');
      expect(loaded.rating).toBeDefined();
      // 사유가 왔다는 사실은 남겨(완료를 통과로 짐작하지 않게) 원문·코드는 옮기지 않는다
      expect(loaded.rating?.reason).toEqual({ outcome: 'unrecognized' });
      expect(JSON.stringify(loaded.rating)).not.toMatch(/원문|루나|evaluator_failure|underage_stated|age_undetermined/);
    }
  });

  it('검토 사유는 응답 전용이라 저장 요청에 싣지 않는다', async () => {
    const repo = createCommonSaveRepository(BASE);
    reply(response({ ...COMPLETED, rating_review_reason: { outcome: 'undetermined', reasons: ['age_undetermined'] } }));
    const loaded: CommonSaveDocument = await repo.load('1');
    reply(response());
    await repo.save({ ...loaded }, 'private', 'manual', 'req', 'save');
    const body = JSON.parse(fetcher.mock.calls[1][1]?.body as string) as Record<string, unknown>;
    expect(Object.keys(body).filter((k) => k.includes('rating') || k.includes('reason'))).toEqual([]);
  });
});
