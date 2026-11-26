// CREATE-US-08 슬라이스 1: 공통 저장(/creation) 조회·저장 응답의 등급 필드와 저장 요청의 requested_rating.
// 서버 계약(요청 기준): 응답 requested_rating(편집에서 저장한 선택)·effective_rating(정본 적용)·rating_review_status,
// 요청은 requested_rating(SAFE·UNSAFE)만 선택적으로 받고 빠지면 서버가 기존 값을 유지한다.
// 서버와 실제로 맞춰 본 결과가 아니라 요청·응답 변환만 검증한다.
import { defaultExpression, toExpressionRow } from '@/shared/story-types';

import { createCommonSaveRepository, type CommonSaveDocument } from '../commonRepository';

const BASE = 'http://localhost:8000/api/v1';

const document = (extra: Partial<CommonSaveDocument> = {}): CommonSaveDocument => ({
  id: '1',
  title: '가상',
  saveState: 'private',
  updatedAt: '2026-11-17T00:00:00Z',
  speech: defaultExpression(),
  characters: [],
  fewshots: [],
  intros: [],
  relations: [],
  affinities: [],
  ...extra,
});

const { story_id: _storyId, ...expression } = toExpressionRow('1', defaultExpression());

const response = (extra: Record<string, unknown> = {}, requestId = 'req') => ({
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
  request_id: requestId,
  ...extra,
});

let fetcher: jest.SpyInstance;
const reply = (body: unknown) => fetcher.mockResolvedValueOnce({ ok: true, json: async () => body } as Response);
const sentBody = (call = 0): Record<string, unknown> =>
  JSON.parse(fetcher.mock.calls[call][1]?.body as string) as Record<string, unknown>;

beforeEach(() => {
  fetcher = jest.spyOn(globalThis, 'fetch');
});
afterEach(() => {
  fetcher.mockRestore();
});

describe('CREATE-US-08-AC01 조회 응답의 등급', () => {
  it('CREATE-US-08-AC01: requested_rating·effective_rating·rating_review_status를 따로 읽는다', async () => {
    reply(response({ requested_rating: 'UNSAFE', effective_rating: 'SAFE', rating_review_status: 'not_reviewed' }));
    const loaded = await createCommonSaveRepository(BASE).load('1');
    expect(loaded.rating).toEqual({ requested: 'UNSAFE', effective: 'SAFE', reviewStatus: 'not_reviewed' });
    // 응답에서 읽은 값은 저장 요청 필드(requestedRating)로 두지 않는다(다른 화면이 되돌려 보내지 않게).
    expect(loaded).not.toHaveProperty('requestedRating');
  });

  it.each(['not_reviewed', 'reviewing', 'completed', 'failed'] as const)(
    'CREATE-US-08-AC12: 검토 상태 %s를 그대로 읽는다',
    async (status) => {
      reply(response({ requested_rating: 'SAFE', effective_rating: null, rating_review_status: status }));
      const loaded = await createCommonSaveRepository(BASE).load('1');
      expect(loaded.rating).toEqual({ requested: 'SAFE', effective: null, reviewStatus: status });
    },
  );

  it('CREATE-US-08-AC01: 등급 필드가 없으면 rating을 두지 않고, null이면 null로 둔다(지어내지 않는다)', async () => {
    reply(response());
    expect(await createCommonSaveRepository(BASE).load('1')).not.toHaveProperty('rating');
    reply(response({ requested_rating: null, effective_rating: null, rating_review_status: null }));
    expect((await createCommonSaveRepository(BASE).load('1')).rating).toEqual({
      requested: null,
      effective: null,
      reviewStatus: null,
    });
  });

  it('CREATE-US-08-AC01: 알 수 없는 등급·검토 상태는 받지 않는다', async () => {
    reply(response({ requested_rating: '19세' }));
    await expect(createCommonSaveRepository(BASE).load('1')).rejects.toThrow('등급 응답을 확인할 수 없습니다.');
    reply(response({ requested_rating: 'SAFE', rating_review_status: 'done' }));
    await expect(createCommonSaveRepository(BASE).load('1')).rejects.toThrow('등급 응답을 확인할 수 없습니다.');
  });
});

describe('CREATE-US-08-AC13 저장 요청의 requested_rating', () => {
  it.each(['SAFE', 'UNSAFE'] as const)('CREATE-US-08-AC13: 고른 등급 %s만 requested_rating으로 싣는다', async (r) => {
    reply(response({ requested_rating: r, effective_rating: 'SAFE', rating_review_status: 'not_reviewed' }));
    const saved = await createCommonSaveRepository(BASE).save(
      document({ requestedRating: r }),
      'private',
      'manual',
      'req',
      'temporary',
    );
    const body = sentBody();
    expect(body.requested_rating).toBe(r);
    // 등급 검토·적용 같은 다른 필드는 보내지 않는다
    expect(Object.keys(body).filter((k) => k.includes('rating'))).toEqual(['requested_rating']);
    expect(saved.rating?.requested).toBe(r);
    expect(saved).not.toHaveProperty('requestedRating');
  });

  it('CREATE-US-08-AC13: 등급을 고르지 않았으면(undefined·null) 키를 빼서 서버가 기존 값을 유지한다', async () => {
    const repo = createCommonSaveRepository(BASE);
    reply(response({}, 'a'));
    await repo.save(document(), 'private', 'manual', 'a', 'save');
    expect(sentBody(0)).not.toHaveProperty('requested_rating');
    reply(response({}, 'b'));
    await repo.save(document({ requestedRating: null }), 'private', 'manual', 'b', 'save');
    expect(sentBody(1)).not.toHaveProperty('requested_rating');
  });

  it('CREATE-US-08-AC13: rating_only_working_copy는 working_copy_saved_at과 함께일 때만 읽고, 요청에는 싣지 않는다', async () => {
    const repo = createCommonSaveRepository(BASE);
    reply(response({ rating_only_working_copy: true, working_copy_saved_at: '2026-11-22T01:00:00Z' }));
    const loaded = await repo.load('1');
    expect(loaded.ratingOnlyWorkingCopy).toBe(true);
    reply(response({ rating_only_working_copy: true }));
    expect(await repo.load('1')).not.toHaveProperty('ratingOnlyWorkingCopy');
    reply(response({ rating_only_working_copy: false, working_copy_saved_at: '2026-11-22T01:00:00Z' }));
    expect(await repo.load('1')).not.toHaveProperty('ratingOnlyWorkingCopy');
    reply(response({}, 'd'));
    await repo.save({ ...loaded }, 'private', 'manual', 'd', 'save');
    expect(sentBody(3)).not.toHaveProperty('rating_only_working_copy');
    expect(sentBody(3)).not.toHaveProperty('finalize_rating_working_copy_at');
  });

  it('CREATE-US-08-AC13: finalize_rating_working_copy_at은 다른 변경 없는 「저장」(manual·preserve_scene)에만 싣는다', async () => {
    const repo = createCommonSaveRepository(BASE);
    const at = '2026-11-22T01:00:00Z';
    reply(response({}, 'e'));
    await repo.save(
      document({ finalizeRatingWorkingCopyAt: at, requestedRating: 'SAFE', preserveScene: true }),
      'private',
      'manual',
      'e',
      'save',
    );
    expect(sentBody(0)).toMatchObject({
      finalize_rating_working_copy_at: at,
      requested_rating: 'SAFE',
      preserve_scene: true,
      kind: 'save',
      mode: 'manual',
    });
    expect(sentBody(0)).not.toHaveProperty('finalize_auto_request_id');

    const invalid: [Partial<CommonSaveDocument>, 'manual' | 'auto', 'save' | 'temporary'][] = [
      [{ preserveScene: true }, 'manual', 'temporary'],
      [{ preserveScene: true }, 'auto', 'save'],
      [{}, 'manual', 'save'],
      [{ preserveScene: true, presets: [] }, 'manual', 'save'],
      [{ preserveScene: true, images: { characters: [] } }, 'manual', 'save'],
      [{ preserveScene: true, finalizeAutoRequestId: 'auto-1' }, 'manual', 'save'],
      // 검사는 보내기 전에 끝나므로 기본 정보는 있는지만 본다(모양은 쓰지 않는다)
      [{ preserveScene: true, basic: { title: '가상' } as CommonSaveDocument['basic'] }, 'manual', 'save'],
    ];
    for (const [extra, mode, kind] of invalid) {
      await expect(
        repo.save(document({ ...extra, finalizeRatingWorkingCopyAt: at }), 'private', mode, 'x', kind),
      ).rejects.toThrow('등급만 담긴 임시 저장본은');
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('CREATE-US-08-AC13: 조회 응답을 그대로 펼쳐 다시 보내도(2~4번 화면) requested_rating을 싣지 않는다', async () => {
    const repo = createCommonSaveRepository(BASE);
    reply(response({ requested_rating: 'UNSAFE', effective_rating: 'SAFE', rating_review_status: 'not_reviewed' }));
    const loaded = await repo.load('1');
    reply(response({}, 'c'));
    await repo.save({ ...loaded }, 'private', 'manual', 'c', 'save');
    expect(sentBody(1)).not.toHaveProperty('requested_rating');
  });
});
