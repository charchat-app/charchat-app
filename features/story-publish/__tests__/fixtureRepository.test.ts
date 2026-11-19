import { createFixtureRepository } from '../fixtureRepository';
import { seedStory } from '@/mocks/seed/story';

afterEach(() => jest.restoreAllMocks());
it('전체 문서와 동일 요청키를 로컬 경로에 전달하고 다른 영역을 유지한다', async () => {
  const reply = { ...seedStory, updatedAt: '2026-11-17T00:00:00Z' };
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ mode: 'fixture', story: reply }),
  } as Response);
  const repo = createFixtureRepository('http://127.0.0.1:8787/');
  const result = await repo.save(seedStory, 'same-request');
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('http://127.0.0.1:8787/__fixtures/stories/seed-story-001');
  expect(init?.method).toBe('PUT');
  expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('same-request');
  expect(JSON.parse(init?.body as string).document.intros).toEqual(seedStory.intros);
  expect(result).toEqual(reply);
});
it('로컬 예제 표식이 없거나 잘못된 설정이면 저장 복원 성공으로 취급하지 않는다', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch');
  const repo = createFixtureRepository('http://127.0.0.1:8787');
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ story: seedStory }) } as Response);
  await expect(repo.load(seedStory.id)).rejects.toThrow('로컬 예제 응답');
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ mode: 'fixture', story: { ...seedStory, speech: {} } }),
  } as Response);
  await expect(repo.load(seedStory.id)).rejects.toThrow();
});
