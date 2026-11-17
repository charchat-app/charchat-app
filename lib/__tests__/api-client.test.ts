const ORIGINAL_ENV = process.env;

function mockFetch(response: Partial<Response> | Error) {
  const fn = jest.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

/** 환경변수를 바꾼 뒤 모듈을 새로 읽는다 (BASE_URL은 모듈을 읽을 때 정해진다). */
function load(env: Record<string, string>) {
  process.env = { ...ORIGINAL_ENV, ...env };
  let mod!: typeof import('../api-client');
  jest.isolateModules(() => {
    mod = require('../api-client');
  });
  return mod;
}

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe('apiRequest', () => {
  const env = { EXPO_PUBLIC_API_URL: 'http://api.test/api/v1', EXPO_PUBLIC_DEV_USER_ID: '3' };

  it('개발용 사용자 헤더를 붙여 요청한다', async () => {
    const { apiRequest } = load(env);
    const fetchMock = mockFetch({ ok: true, status: 200, json: () => Promise.resolve({ id: 1 }) });
    await expect(apiRequest('/x')).resolves.toEqual({ id: 1 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/x');
    expect(init.headers).toMatchObject({ 'X-User-Id': '3' });
  });

  it('Problem Details의 code·detail·issues를 ApiError로 전달한다', async () => {
    const { apiRequest, ApiError } = load(env);
    mockFetch({
      ok: false,
      status: 422,
      json: () =>
        Promise.resolve({
          code: 'STORY_INCOMPLETE',
          detail: '저장 조건 미충족',
          issues: [{ field: 'title', code: 'REQUIRED', message: '제목을 입력하세요.' }],
        }),
    });
    const error = await apiRequest('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: 'STORY_INCOMPLETE', detail: '저장 조건 미충족' });
    expect((error as InstanceType<typeof ApiError>).issues).toHaveLength(1);
  });

  it('본문이 JSON이 아니어도 상태 코드를 남긴다', async () => {
    const { apiRequest } = load(env);
    mockFetch({ ok: false, status: 500, json: () => Promise.reject(new Error('not json')) });
    await expect(apiRequest('/x')).rejects.toMatchObject({ status: 500, code: 'HTTP_ERROR' });
  });

  it('네트워크 실패는 NETWORK_ERROR로 알린다', async () => {
    const { apiRequest } = load(env);
    mockFetch(new Error('offline'));
    await expect(apiRequest('/x')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('주소가 없으면 호출하지 않는다', async () => {
    const { apiRequest } = load({ EXPO_PUBLIC_API_URL: '' });
    const fetchMock = mockFetch({ ok: true, status: 200 });
    await expect(apiRequest('/x')).rejects.toMatchObject({ code: 'API_URL_MISSING' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
