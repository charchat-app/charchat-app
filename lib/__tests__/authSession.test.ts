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
    // 번호만 있고 방식을 적지 않으면 헤더 모드를 켜지 않는다(로그인 화면으로 시작).
    ['DEV_AUTH 미설정 + DEV_USER_ID', { EXPO_PUBLIC_DEV_AUTH: undefined, EXPO_PUBLIC_DEV_USER_ID: '3' }, false],
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

describe('BASE-03 로그인 진입점: 서버가 개발용 헤더를 거절할 때', () => {
  const HEADER_MODE = { EXPO_PUBLIC_DEV_AUTH: 'header', EXPO_PUBLIC_DEV_USER_ID: '3' };
  const rejected = () =>
    json({ status: 401, code: 'UNAUTHENTICATED', detail: 'Authorization: Bearer <액세스 토큰>을 보내세요.' }, 401);

  it('BASE-03 헤더 모드 요청이 401 UNAUTHENTICATED면 헤더 모드를 끄고 안내와 함께 로그인 화면 상태로 바꾼다', async () => {
    const { api, session } = load(HEADER_MODE);
    session.finishSignOut({ keepStoredAuth: true });
    const before = session.getAuthSnapshot().sessionKey;
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => rejected());

    await expect(api.apiRequest('/x')).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(api.devHeaderUserId()).toBeNull();
    expect(session.getAuthSnapshot()).toMatchObject({ status: 'signed-out', notice: api.DEV_HEADER_REJECTED_NOTICE });
    // 세션 번호가 바뀌어 이전 사용자 번호로 받은 캐시를 버린다.
    expect(session.getAuthSnapshot().sessionKey).toBe(before + 1);

    // 라우트 보호가 스냅샷 값으로 화면을 바꾸도록 거절 여부도 스냅샷에 실린다.
    expect(session.getAuthSnapshot().devHeaderRejected).toBe(true);

    await api.apiRequest('/y').catch(() => undefined);
    const headers = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(headers['X-User-Id']).toBeUndefined();

    // 이번 실행 동안은 로그인했다가 로그아웃해도 헤더 모드로 돌아가지 않는다.
    signIn(session, 'cca_after');
    await session.finishSignOut();
    expect(session.getAuthSnapshot().devHeaderRejected).toBe(true);
    expect(api.devHeaderUserId()).toBeNull();
  });

  it.each([
    ['다른 401 코드', () => problem(401, 'AUTH_TOKEN_INVALID'), {}],
    ['403', () => problem(403, 'FORBIDDEN'), {}],
    ['호출 측이 Authorization을 직접 붙인 요청', rejected, { headers: { Authorization: 'Bearer cca_manual' } }],
  ])('BASE-03 %s에는 헤더 모드를 유지한다', async (_name, response, options) => {
    const { api, session } = load(HEADER_MODE);
    session.finishSignOut({ keepStoredAuth: true });
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => response());

    await api.apiRequest('/x', options).catch(() => undefined);
    expect(api.devHeaderUserId()).toBe('3');
    expect(session.getAuthSnapshot().notice).toBeNull();
  });

  it('BASE-03 로그인 중에는 헤더를 보내지 않으므로 401 UNAUTHENTICATED를 받아도 헤더 모드 거절로 보지 않는다', async () => {
    const { api, session } = load(HEADER_MODE);
    signIn(session, 'cca_live');
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => rejected());

    await api.apiRequest('/x').catch(() => undefined);
    expect(session.getAuthSnapshot().notice).not.toBe(api.DEV_HEADER_REJECTED_NOTICE);
    await session.finishSignOut({ keepStoredAuth: true });
    expect(api.devHeaderUserId()).toBe('3');
  });
});

describe('BASE-03 단일 비행 리프레시', () => {
  it('BASE-03 같은 세션의 동시 요청 세 개가 401 AUTH_TOKEN_EXPIRED를 받으면 리프레시는 한 번만 하고 각 요청을 한 번씩 다시 보낸다', async () => {
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
    const third = api.apiRequest<{ path: string }>('/c');
    await new Promise((resolve) => setTimeout(resolve, 0));
    refresh.resolve(json(tokenBody('cca_new', 'ccr_new'), 201));

    await expect(first).resolves.toEqual({ path: '/a' });
    await expect(second).resolves.toEqual({ path: '/b' });
    await expect(third).resolves.toEqual({ path: '/c' });
    expect(refreshCalls).toBe(1);
    expect(calls.filter((call) => call.path === '/c')).toEqual([
      { path: '/c', auth: 'Bearer cca_old' },
      { path: '/c', auth: 'Bearer cca_new' },
    ]);
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

describe('BASE-03 리뷰: 토큰 연장 중 계정 전환', () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  /** 경로별로 실제 보낸 Authorization을 모은다. 리프레시는 응답을 직접 정한다. */
  function server(onRefresh: (refreshToken: string) => Response | Promise<Response>) {
    const calls: { path: string; auth: string | null }[] = [];
    const refreshTokens: string[] = [];
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = String(input).replace(API, '');
      if (path === '/auth/tokens') {
        const { refresh_token: token } = JSON.parse(String(init?.body)) as { refresh_token: string };
        refreshTokens.push(token);
        return onRefresh(token);
      }
      const auth = authorization(init);
      calls.push({ path, auth });
      // 만료된 토큰(cca_a, cca_b)은 만료, 새로 받은 토큰은 성공으로 답한다.
      return auth === 'Bearer cca_a' || auth === 'Bearer cca_b'
        ? problem(401, 'AUTH_TOKEN_EXPIRED')
        : json({ path, auth });
    });
    return {
      calls,
      refreshTokens,
      authsFor: (path: string) => calls.filter((c) => c.path === path).map((c) => c.auth),
    };
  }

  async function switchToB(session: Modules['session']) {
    await session.finishSignOut();
    signIn(session, 'cca_b_live', 'ccr_b', '2');
  }

  it('BASE-03 리프레시를 기다리는 사이 다른 계정으로 바뀌면 이전 요청을 새 토큰으로 다시 보내지 않는다', async () => {
    const { api, session } = load({ EXPO_PUBLIC_DEV_AUTH: 'token' });
    signIn(session, 'cca_a', 'ccr_a', '1');
    const refresh = deferred<Response>();
    const fake = server(() => refresh.promise);

    const pending = api.apiRequest('/a').catch((error: unknown) => error);
    await tick();
    expect(fake.refreshTokens).toEqual(['ccr_a']);
    await switchToB(session);
    refresh.resolve(json(tokenBody('cca_a_new', 'ccr_a_new', 1), 201));

    await expect(pending).resolves.toMatchObject({ status: 401, code: 'AUTH_TOKEN_EXPIRED' });
    expect(fake.authsFor('/a')).toEqual(['Bearer cca_a']);
    // 계정 B 세션은 그대로다. 이전 계정의 리프레시 결과를 받아들이지 않는다.
    expect(session.getAuthSnapshot()).toMatchObject({ status: 'active', userId: '2', accessToken: 'cca_b_live' });
    expect(session.getRefreshToken()).toBe('ccr_b');
  });

  it('BASE-03 리프레시가 끝난 직후 다시 보내기 전에 계정이 바뀌면 다시 보내지 않고 오류로 끝낸다', async () => {
    const { api, session } = load({ EXPO_PUBLIC_DEV_AUTH: 'token' });
    signIn(session, 'cca_a', 'ccr_a', '1');
    const fake = server(() => json(tokenBody('cca_a_new', 'ccr_a_new', 1), 201));
    // 새 토큰이 반영되는 순간 같은 틱 안에서(다시 보내기 전) 다른 계정으로 로그인한다.
    let switched = false;
    const unsubscribe = session.subscribeAuth(() => {
      if (switched || session.getAuthSnapshot().accessToken !== 'cca_a_new') return;
      switched = true;
      queueMicrotask(() => void switchToB(session));
    });

    await expect(api.apiRequest('/a')).rejects.toMatchObject({ status: 401, code: 'AUTH_TOKEN_EXPIRED' });
    unsubscribe();
    expect(switched).toBe(true);
    expect(fake.refreshTokens).toEqual(['ccr_a']);
    expect(fake.authsFor('/a')).toEqual(['Bearer cca_a']);
    expect(session.getAuthSnapshot()).toMatchObject({ status: 'active', userId: '2', accessToken: 'cca_b_live' });
  });

  it('BASE-03 계정이 바뀐 뒤 늦게 온 이전 요청의 만료 응답은 리프레시도 재시도도 하지 않는다', async () => {
    const { api, session } = load({ EXPO_PUBLIC_DEV_AUTH: 'token' });
    signIn(session, 'cca_a', 'ccr_a', '1');
    const late = deferred<Response>();
    const calls: (string | null)[] = [];
    let refreshCalls = 0;
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).endsWith('/auth/tokens')) {
        refreshCalls += 1;
        return json(tokenBody('cca_x', 'ccr_x', 2), 201);
      }
      calls.push(authorization(init));
      return calls.length === 1 ? late.promise : json({ ok: true });
    });

    const pending = api.apiRequest('/a').catch((error: unknown) => error);
    await tick();
    await switchToB(session);
    late.resolve(problem(401, 'AUTH_TOKEN_EXPIRED'));

    await expect(pending).resolves.toMatchObject({ code: 'AUTH_TOKEN_EXPIRED' });
    expect(calls).toEqual(['Bearer cca_a']);
    expect(refreshCalls).toBe(0);
    expect(session.getAuthSnapshot()).toMatchObject({ status: 'active', userId: '2', accessToken: 'cca_b_live' });
  });

  it('BASE-03 다른 세션의 리프레시는 공유하지 않는다: 계정 B의 만료 요청은 B의 리프레시 토큰으로 따로 연장한다', async () => {
    const { api, session } = load({ EXPO_PUBLIC_DEV_AUTH: 'token' });
    signIn(session, 'cca_a', 'ccr_a', '1');
    const refreshA = deferred<Response>();
    const fake = server((token) =>
      token === 'ccr_a' ? refreshA.promise : json(tokenBody('cca_b_new', 'ccr_b2', 2), 201),
    );

    const requestA = api.apiRequest('/a').catch((error: unknown) => error);
    await tick();
    await session.finishSignOut();
    signIn(session, 'cca_b', 'ccr_b', '2');
    const requestB = api.apiRequest<{ auth: string }>('/b');

    await expect(requestB).resolves.toMatchObject({ auth: 'Bearer cca_b_new' });
    refreshA.resolve(json(tokenBody('cca_a_new', 'ccr_a_new', 1), 201));
    await expect(requestA).resolves.toMatchObject({ code: 'AUTH_TOKEN_EXPIRED' });

    expect(fake.refreshTokens).toEqual(['ccr_a', 'ccr_b']);
    expect(fake.authsFor('/a')).toEqual(['Bearer cca_a']);
    expect(fake.authsFor('/b')).toEqual(['Bearer cca_b', 'Bearer cca_b_new']);
    expect(session.getAuthSnapshot()).toMatchObject({ status: 'active', userId: '2', accessToken: 'cca_b_new' });
    expect(session.getRefreshToken()).toBe('ccr_b2');
  });

  it('BASE-03 다시 보낸 요청이 AUTH_TOKEN_INVALID면 더 보내지 않고 로그아웃 처리한다', async () => {
    const { api, session } = load({ EXPO_PUBLIC_DEV_AUTH: 'token' });
    signIn(session, 'cca_a', 'ccr_a', '1');
    const auths: (string | null)[] = [];
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).endsWith('/auth/tokens')) return json(tokenBody('cca_a_new', 'ccr_a_new', 1), 201);
      auths.push(authorization(init));
      return auths.length === 1 ? problem(401, 'AUTH_TOKEN_EXPIRED') : problem(401, 'AUTH_TOKEN_INVALID');
    });
    await expect(api.apiRequest('/a')).rejects.toMatchObject({ code: 'AUTH_TOKEN_INVALID' });
    expect(auths).toEqual(['Bearer cca_a', 'Bearer cca_a_new']);
    expect(session.getAuthSnapshot()).toMatchObject({ status: 'signed-out', notice: '다시 로그인해 주세요' });
  });
});
