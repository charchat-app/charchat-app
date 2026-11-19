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

it('발화자 목록의 중복 ID·잘못된 목록을 거절한다', async () => {
  const mock = jest.spyOn(globalThis, 'fetch');
  const reply = (characters: unknown) => ({ ok: true, json: async () => ({ ...response(), characters }) }) as Response;
  const repo = createServerFewshotRepository('http://localhost:8000/api/v1');
  mock.mockResolvedValueOnce(reply(null));
  await expect(repo.load('1')).rejects.toThrow('퓨샷 저장 응답');
  mock.mockResolvedValueOnce(
    reply([
      { id: '5', name: '이름', position: 0 },
      { id: '5', name: '중복', position: 1 },
    ]),
  );
  await expect(repo.load('1')).rejects.toThrow('발화자 응답');
});

it('서버가 id를 숫자로 응답해도 같은 문자열 id로 복원한다', async () => {
  const numeric = {
    ...response(),
    story_id: 1,
    characters: [{ id: 5, name: '하린', position: 0 }],
    fewshots: [
      {
        id: 10,
        client_key: 'g',
        messages: [{ id: 20, client_key: 'm', speaker_kind: 'character', character_id: 5, body: '안녕' }],
      },
    ],
  };
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => numeric } as Response);
  const document = await createServerFewshotRepository('http://localhost:8000/api/v1').load('1');
  expect(document.fewshots[0]).toMatchObject({ id: '10', messages: [{ id: '20', characterId: '5' }] });
});

it('다른 스토리 id나 안전하지 않은 숫자 id는 거절한다', async () => {
  const mock = jest.spyOn(globalThis, 'fetch');
  const repo = createServerFewshotRepository('http://localhost:8000/api/v1');
  mock.mockResolvedValueOnce({ ok: true, json: async () => ({ ...response(), story_id: 2 }) } as Response);
  await expect(repo.load('1')).rejects.toThrow('퓨샷 저장 응답');
  mock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ ...response(), characters: [{ id: 2 ** 53, name: '큰 id', position: 0 }] }),
  } as Response);
  await expect(repo.load('1')).rejects.toThrow('퓨샷 ID');
});
