import { createServerFewshotRepository } from '../fewshotRepository';
const response = (requestId: string | null = null) => ({
  story_id: '1',
  title: '스토리',
  save_state: 'draft',
  saved_at: '2026-11-17T00:00:00Z',
  request_id: requestId,
  characters: [{ id: '5', name: '하린', position: 0 }],
  fewshots: [
    {
      id: '10',
      client_key: 'g',
      messages: [
        { id: '20', client_key: 'm', speaker_kind: 'character', character_id: '5', body: '  {{user}}\n*서술*  ' },
      ],
    },
  ],
});
afterEach(() => jest.restoreAllMocks());
it('실제 컬렉션 응답을 읽고 표현·다른 생성 영역 없이 ID·원문·순서만 저장한다', async () => {
  const mock = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce({ ok: true, json: async () => response() } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => response('save') } as Response);
  const repo = createServerFewshotRepository('http://localhost:8000/api/v1', async () => ({
    Authorization: 'Bearer local-test-token',
  }));
  const document = await repo.load('1');
  expect(document.fewshots[0].messages[0].body).toBe('  {{user}}\n*서술*  ');
  await repo.save(document, 'save');
  const [url, init] = mock.mock.calls[1];
  expect(url).toBe('http://localhost:8000/api/v1/creation/stories/1/fewshots');
  expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('save');
  expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer local-test-token');
  const body = JSON.parse(init?.body as string);
  expect(Object.keys(body)).toEqual(['fewshots']);
  expect(body.fewshots[0].messages[0]).toMatchObject({ id: '20', character_id: '5', body: '  {{user}}\n*서술*  ' });
});
it('같은 스토리에 없는 발화자나 잘못된 응답을 복원 성공으로 처리하지 않는다', async () => {
  const wrong = response();
  wrong.fewshots[0].messages[0].character_id = '999';
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => wrong } as Response);
  await expect(createServerFewshotRepository('http://localhost:8000/api/v1').load('1')).rejects.toThrow('발화자 연결');
});

it('본문 없이 읽기 전용 캐릭터 투영을 조회하고 다른 스토리·중복 ID·잘못된 목록을 거절한다', async () => {
  const mock = jest.spyOn(globalThis, 'fetch');
  const reply = (story_id: string, characters: unknown) =>
    ({ ok: true, json: async () => ({ story_id, characters }) }) as Response;
  mock.mockResolvedValueOnce(reply('1', [{ id: '5', name: '바뀐 이름', position: 0 }]));
  const repo = createServerFewshotRepository('http://localhost:8000/api/v1');
  expect(await repo.loadCharacters?.('1')).toEqual([{ id: '5', name: '바뀐 이름', position: 0 }]);
  expect(mock.mock.calls[0][0]).toBe('http://localhost:8000/api/v1/creation/stories/1/fewshot-characters');
  mock.mockResolvedValueOnce(reply('2', []));
  await expect(repo.loadCharacters?.('1')).rejects.toThrow('다른 스토리');
  mock.mockResolvedValueOnce(reply('1', null));
  await expect(repo.loadCharacters?.('1')).rejects.toThrow('발화자 응답');
  mock.mockResolvedValueOnce(
    reply('1', [
      { id: '5', name: '이름', position: 0 },
      { id: '5', name: '중복', position: 1 },
    ]),
  );
  await expect(repo.loadCharacters?.('1')).rejects.toThrow('발화자 응답');
});
