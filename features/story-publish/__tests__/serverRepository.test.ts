import { createServerExpressionRepository } from '../serverRepository';
import { defaultExpression, toExpressionRow } from '@/shared/story-types';

const id = '9007199254740993';
function response(requestId: string | null = null) {
  const { story_id: _storyId, ...expression } = toExpressionRow(id, defaultExpression());
  return {
    story_id: id,
    title: null,
    save_state: 'draft',
    saved_at: '2026-11-17T00:00:00Z',
    expression,
    request_id: requestId,
  };
}
afterEach(() => jest.restoreAllMocks());
it('실제 snake_case 응답과 큰 bigint ID를 복원하고 미조회 영역을 꾸미지 않는다', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => response() } as Response);
  const document = await createServerExpressionRepository('http://localhost:8000/api/v1').load(id);
  expect(document.id).toBe(id);
  expect(document.speech).toEqual(defaultExpression());
  expect(document.saveState).toBe('임시 저장');
  expect(document).not.toHaveProperty('characters');
});
it('실제 PUT은 표현만 전송하고 인증 헤더·중복키를 보존한다', async () => {
  const mock = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue({ ok: true, json: async () => response('save-one') } as Response);
  const repo = createServerExpressionRepository('http://localhost:8000/api/v1', async () => ({
    Authorization: 'Bearer local-test-token',
  }));
  await repo.save(
    { id, title: '표시 제목', saveState: '임시 저장', updatedAt: null, speech: defaultExpression() },
    'save-one',
  );
  const [url, init] = mock.mock.calls[0];
  expect(url).toBe(`http://localhost:8000/api/v1/creation/stories/${id}/expression`);
  expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer local-test-token');
  expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('save-one');
  const body = JSON.parse(init?.body as string);
  expect(Object.keys(body)).toEqual(['expression']);
  expect(body.expression).toHaveProperty('point_of_view', 'third_person');
  expect(body.expression).not.toHaveProperty('story_id');
});
it('Problem Details 코드와 잘못된 경로/응답을 성공으로 취급하지 않는다', async () => {
  const mock = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ code: 'FULL_SAVE_REQUIRED' }) } as Response);
  const repo = createServerExpressionRepository('http://localhost:8000/api/v1');
  await expect(repo.load(id)).rejects.toMatchObject({ status: 409, code: 'FULL_SAVE_REQUIRED' });
  await expect(repo.load('seed-story-001')).rejects.toThrow('스토리 ID');
  mock.mockResolvedValueOnce({ ok: true, json: async () => ({ ...response(), story_id: '1' }) } as Response);
  await expect(repo.load(id)).rejects.toThrow('응답');
});
