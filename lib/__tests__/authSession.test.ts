// BASE-03 api-client 인증: Bearer 헤더, 개발용 헤더 모드, 단일 비행 리프레시, 만료·온보딩 처리
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 5,
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const ORIGINAL_ENV = process.env;
const API = 'http://api.test/api/v1';

type Modules = { api: typeof import('../api-client'); session: typeof import('../authSession') };

/** 환경변수를 바꾼 뒤 api-client와 세션 모듈을 같은 모듈 묶음으로 새로 읽는다. */
function load(env: Record<string, string | undefined> = {}): Modules {
  process.env = { ...ORIGINAL_ENV, EXPO_PUBLIC_API_URL: API, ...env };
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key];
  let modules!: Modules;
  jest.isolateModules(() => {
    modules = { session: require('../authSession'), api: require('../api-client') };
  });
  return modules;
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const problem = (status: number, code: string) => json({ status, code, detail: code }, status);
const tokenBody = (access: string, refresh: string, userId = 1, onboardingRequired = false) => ({
  access_token: access,
  token_type: 'Bearer',
  expires_in: 1800,
  refresh_token: refresh,
  refresh_expires_in: 5184000,
  user: { user_id: userId, onboarding_required: onboardingRequired },
  is_new_user: false,
});

function signIn(session: Modules['session'], accessToken = 'cca_old', refreshToken = 'ccr_old', userId = '1') {
  session.applyGrant({ accessToken, refreshToken, userId, onboardingRequired: false });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function authorization(init: RequestInit | undefined) {
  return new Headers(init?.headers).get('Authorization');
}

afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.restoreAllMocks();
});

describe('BASE-03 인증 헤더', () => {
  it('BASE-03 로그인하면 Authorization: Bearer 헤더를 보내고 X-User-Id는 보내지 않는다', async () => {
    const { api, session } = load({ EXPO_PUBLIC_DEV_USER_ID: '3', EXPO_PUBLIC_DEV_AUTH: 'header' });
    signIn(session, 'cca_live');
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ ok: true }));
    await api.apiRequest('/x');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ Authorization: 'Bearer cca_live' });
    expect(init.headers).not.toHaveProperty('X-User-Id');
    expect(api.authHeaders()).toEqual({ Authorization: 'Bearer cca_live' });
  });

  it.each([
    [
      'EXPO_PUBLIC_DEV_AUTH=header + DEV_USER_ID',
      { EXPO_PUBLIC_DEV_AUTH: 'header', EXPO_PUBLIC_DEV_USER_ID: '3' },
      true,
    ],
    [
      'DEV_AUTH 미설정 + DEV_USER_ID (기존 개발 설정 호환)',
      { EXPO_PUBLIC_DEV_AUTH: undefined, EXPO_PUBLIC_DEV_USER_ID: '3' },
      true,
    ],
    ['EXPO_PUBLIC_DEV_AUTH=token', { EXPO_PUBLIC_DEV_AUTH: 'token', EXPO_PUBLIC_DEV_USER_ID: '3' }, false],
    ['DEV_USER_ID 없음', { EXPO_PUBLIC_DEV_AUTH: 'header', EXPO_PUBLIC_DEV_USER_ID: undefined }, false],
  ])('BASE-03 개발용 헤더 대체는 플래그가 있을 때만: %s', async (_name, env, expected) => {
    const { api } = load(env);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => json({}));
    await api.apiRequest('/x');
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['X-User-Id']).toBe(expected ? '3' : undefined);
    expect(headers.Authorization).toBeUndefined();
    expect(api.devHeaderUserId()).toBe(expected ? '3' : null);
  });
});

describe('BASE-03 단일 비행 리프레시', () => {
  it('BASE-03 동시에 두 요청이 401 AUTH_TOKEN_EXPIRED를 받으면 리프레시는 한 번만 하고 두 요청을 각각 한 번씩 다시 보낸다', async () => {
    const { api, session } = load({ EXPO_PUBLIC_DEV_AUTH: 'token' });
    signIn(session);
    const refresh = deferred<Response>();
    let refreshCalls = 0;
    const calls: { path: string; auth: string | null }[] = [];
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = String(input).replace(API, '');
      if (path === '/auth/tokens') {
        refreshCalls += 1;
        expect(authorization(init)).toBeNull();
        expect(JSON.parse(String(init?.body))).toEqual({ grant_type: 'refresh_token', refresh_token: 'ccr_old' });
        return refresh.promise;
      }
      calls.push({ path, auth: authorization(init) });
      return authorization(init) === 'Bearer cca_new' ? json({ path }) : problem(401, 'AUTH_TOKEN_EXPIRED');
    });

    const first = api.apiRequest<{ path: string }>('/a');
    const second = api.apiRequest<{ path: string }>('/b', { method: 'POST', body: '{}' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    refresh.resolve(json(tokenBody('cca_new', 'ccr_new'), 201));

    await expect(first).resolves.toEqual({ path: '/a' });
    await expect(second).resolves.toEqual({ path: '/b' });
    expect(refreshCalls).toBe(1);
    expect(calls.filter((call) => call.path === '/a')).toEqual([
      { path: '/a', auth: 'Bearer cca_old' },
      { path: '/a', auth: 'Bearer cca_new' },
    ]);
    expect(calls.filter((call) => call.path === '/b')).toEqual([
      { path: '/b', auth: 'Bearer cca_old' },
      { path: '/b', auth: 'Bearer cca_new' },
    ]);
    expect(session.getAuthSnapshot()).toMatchObject({ status: 'active', accessToken: 'cca_new' });
    expect(session.getRefreshToken()).toBe('ccr_new');
  });

  it('BASE-03 다시 보낸 요청이 또 만료되면 더 재시도하지 않고 로그인 화면으로 보낸다', async () => {
    const { api, session } = load({ EXPO_PUBLIC_DEV_AUTH: 'token' });
    signIn(session);
    let requests = 0;
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/auth/tokens')) return json(tokenBody('cca_new', 'ccr_new'), 201);
      requests += 1;
      return problem(401, 'AUTH_TOKEN_EXPIRED');
    });
    await expect(api.apiRequest('/x')).rejects.toMatchObject({ status: 401, code: 'AUTH_TOKEN_EXPIRED' });
    expect(requests).toBe(2);
    expect(session.getAuthSnapshot()).toMatchObject({ status: 'signed-out', notice: '다시 로그인해 주세요' });
  });

  it.each([
    [401, 'AUTH_REFRESH_INVALID'],
    [409, 'AUTH_REFRESH_CONFLICT'],
  ])('BASE-03 리프레시가 %s %s로 실패하면 로그아웃 상태와 "다시 로그인해 주세요"가 된다', async (status, code) => {
    const { api, session } = load({ EXPO_PUBLIC_DEV_AUTH: 'token' });
    signIn(session);
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        String(input).endsWith('/auth/tokens') ? problem(status, code) : problem(401, 'AUTH_TOKEN_EXPIRED'),
      );
    const before = session.getAuthSnapshot().sessionKey;
    await expect(api.apiRequest('/x')).rejects.toMatchObject({ code: 'AUTH_TOKEN_EXPIRED' });
    // 원 요청 1회 + 리프레시 1회. 원 요청은 다시 보내지 않는다.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(session.getAuthSnapshot()).toMatchObject({
      status: 'signed-out',
      accessToken: null,
      userId: null,
      notice: '다시 로그인해 주세요',
    });
    expect(session.getAuthSnapshot().sessionKey).toBe(before + 1);
    expect(session.getRefreshToken()).toBeNull();
  });

  it('BASE-03 리프레시 중 서버에 닿지 못하면 세션은 유지하고 원 요청의 실패만 알린다', async () => {
    const { api, session } = load({ EXPO_PUBLIC_DEV_AUTH: 'token' });
    signIn(session);
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/auth/tokens')) throw new Error('offline');
      return problem(401, 'AUTH_TOKEN_EXPIRED');
    });
    await expect(api.apiRequest('/x')).rejects.toMatchObject({ code: 'AUTH_TOKEN_EXPIRED' });
    expect(session.getAuthSnapshot()).toMatchObject({ status: 'active', accessToken: 'cca_old' });
  });

  it.each(['AUTH_TOKEN_INVALID', 'UNAUTHENTICATED'])(
    'BASE-03 %s는 리프레시 없이 로그아웃 상태와 "다시 로그인해 주세요"가 된다',
    async (code) => {
      const { api, session } = load({ EXPO_PUBLIC_DEV_AUTH: 'token' });
      signIn(session);
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => problem(401, code));
      await expect(api.apiRequest('/x')).rejects.toMatchObject({ status: 401, code });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(session.getAuthSnapshot()).toMatchObject({ status: 'signed-out', notice: '다시 로그인해 주세요' });
    },
  );

  it('BASE-03 403 ONBOARDING_REQUIRED를 받으면 온보딩 전(pending) 상태로 바꾼다', async () => {
    const { api, session } = load({ EXPO_PUBLIC_DEV_AUTH: 'token' });
    signIn(session);
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => problem(403, 'ONBOARDING_REQUIRED'));
    await expect(api.apiRequest('/x')).rejects.toMatchObject({ status: 403, code: 'ONBOARDING_REQUIRED' });
    expect(session.getAuthSnapshot()).toMatchObject({ status: 'pending', accessToken: 'cca_old', userId: '1' });
  });

  it('BASE-03 이전 세션 토큰으로 보낸 요청의 늦은 401은 새 세션을 끝내지 않는다', async () => {
    const { api, session } = load({ EXPO_PUBLIC_DEV_AUTH: 'token' });
    signIn(session, 'cca_a', 'ccr_a', '1');
    const late = deferred<Response>();
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => late.promise);
    const pending = api.apiRequest('/x').catch((error: unknown) => error);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await session.finishSignOut();
    signIn(session, 'cca_b', 'ccr_b', '2');
    late.resolve(problem(401, 'AUTH_TOKEN_INVALID'));
    await expect(pending).resolves.toMatchObject({ code: 'AUTH_TOKEN_INVALID' });
    expect(session.getAuthSnapshot()).toMatchObject({ status: 'active', userId: '2', accessToken: 'cca_b' });
  });

  it('BASE-03 로그아웃 정리 중에는 만료 응답을 받아도 리프레시하지 않는다', async () => {
    const { api, session } = load({ EXPO_PUBLIC_DEV_AUTH: 'token' });
    signIn(session);
    session.beginSignOut();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problem(401, 'AUTH_TOKEN_EXPIRED'));
    await expect(api.apiRequest('/auth/sessions/current', { method: 'DELETE' })).rejects.toMatchObject({
      code: 'AUTH_TOKEN_EXPIRED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(session.getAuthSnapshot().status).toBe('signing-out');
  });
});

describe('BASE-03 세션 스냅샷', () => {
  it('BASE-03 같은 계정의 토큰 회전은 세션 번호를 유지하고, 계정이 바뀌면 새 번호를 쓴다', () => {
    const { session } = load();
    signIn(session, 'cca_1', 'ccr_1', '1');
    const first = session.getAuthSnapshot().sessionKey;
    signIn(session, 'cca_2', 'ccr_2', '1');
    expect(session.getAuthSnapshot().sessionKey).toBe(first);
    void session.finishSignOut();
    signIn(session, 'cca_3', 'ccr_3', '2');
    expect(session.getAuthSnapshot().sessionKey).toBe(first + 2);
  });

  it('BASE-03 토큰 응답 형식이 다르면 세션으로 쓰지 않는다', () => {
    const { session } = load();
    expect(session.grantFromTokenResponse(tokenBody('cca_x', 'ccr_x', 9, true))).toEqual({
      accessToken: 'cca_x',
      refreshToken: 'ccr_x',
      userId: '9',
      onboardingRequired: true,
    });
    expect(session.grantFromTokenResponse({ access_token: 'cca_x', refresh_token: 'ccr_x', user: {} })).toBeNull();
    expect(session.grantFromTokenResponse({ ...tokenBody('', 'ccr_x'), access_token: '' })).toBeNull();
    expect(session.grantFromTokenResponse(null)).toBeNull();
  });
});
