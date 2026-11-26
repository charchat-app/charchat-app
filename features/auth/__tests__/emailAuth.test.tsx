// BASE-03 이메일·비밀번호 로그인·회원가입 화면
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { LoginScreen, SignupScreen } from '@/features/auth';
import { getAuthSnapshot, resetAuthSession } from '@/lib/authSession';

jest.mock('@/lib/api-client', () => {
  const { EXPO_PUBLIC_API_URL: url, EXPO_PUBLIC_DEV_USER_ID: id } = process.env;
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
  delete process.env.EXPO_PUBLIC_DEV_USER_ID;
  try {
    return jest.requireActual('@/lib/api-client');
  } finally {
    if (url === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = url;
    if (id !== undefined) process.env.EXPO_PUBLIC_DEV_USER_ID = id;
  }
});
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 5,
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
}));

const API = 'http://localhost:8000/api/v1';
const EMAIL_PROVIDERS = { providers: [{ provider: 'email', flows: ['password'] }] };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const problem = (status: number, code: string, detail = code) => json({ status, code, detail }, status);
const me = (onboardingRequired: boolean) => ({
  user_id: 8,
  status: onboardingRequired ? 'pending' : 'active',
  providers: ['email'],
  default_play_name: onboardingRequired ? null : '여행자',
  consents: { terms: null, privacy: null, age_14_plus: null },
  required_consents: { terms: 'terms-v3', privacy: 'privacy-v2', age_14_plus: 'self-v1' },
  onboarding_required: onboardingRequired,
});
// 서버는 이제 JWT를 주지만 앱은 액세스 토큰을 형식을 보지 않는 문자열로만 다룬다.
const tokens = (onboardingRequired: boolean) => ({
  access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI4In0.c2ln',
  token_type: 'Bearer',
  expires_in: 1800,
  refresh_token: 'ccr_8',
  refresh_expires_in: 5184000,
  user: me(onboardingRequired),
  is_new_user: onboardingRequired,
});

type Handler = (url: string, init: RequestInit) => Promise<Response> | Response;

/** 매 호출마다 새 Response를 만든다(본문은 한 번만 읽힌다). */
function mockFetch(handler: Handler) {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) =>
      String(input) === `${API}/auth/providers` ? json(EMAIL_PROVIDERS) : handler(String(input), init ?? {}),
    );
}

function callsTo(fetchMock: jest.SpyInstance, path: string): RequestInit[] {
  return fetchMock.mock.calls
    .filter(([input]) => String(input) === `${API}${path}`)
    .map(([, init]) => (init ?? {}) as RequestInit);
}

const clients: QueryClient[] = [];
function show(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

async function fillLogin(email: string, password: string) {
  await fireEvent.changeText(await screen.findByLabelText('이메일'), email);
  await fireEvent.changeText(screen.getByLabelText('비밀번호'), password);
}

async function fillSignup(email: string, password: string, confirm: string) {
  await fireEvent.changeText(await screen.findByLabelText('이메일'), email);
  await fireEvent.changeText(screen.getByLabelText('비밀번호'), password);
  await fireEvent.changeText(screen.getByLabelText('비밀번호 확인'), confirm);
}

beforeEach(() => resetAuthSession());

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  delete process.env.EXPO_PUBLIC_DEV_LOGIN;
  jest.restoreAllMocks();
});

describe('BASE-03 이메일 로그인', () => {
  it('BASE-03 이메일·비밀번호 입력란은 키보드·자동완성·가림 속성을 갖고, 소셜 로그인 안내는 없다', async () => {
    mockFetch(() => problem(500, 'INTERNAL'));
    await show(<LoginScreen />);
    const email = await screen.findByLabelText('이메일');
    expect(email.props).toMatchObject({
      keyboardType: 'email-address',
      autoCapitalize: 'none',
      autoComplete: 'email',
      textContentType: 'emailAddress',
    });
    expect(email.props.secureTextEntry).toBeFalsy();
    expect(screen.getByLabelText('비밀번호').props).toMatchObject({
      secureTextEntry: true,
      autoComplete: 'current-password',
      textContentType: 'password',
    });
    expect(screen.getByRole('button', { name: '로그인' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '회원가입' })).toBeEnabled();
    expect(screen.queryByText(/카카오|구글|Apple/)).toBeNull();
  });

  it('BASE-03 로그인 성공: POST /auth/tokens(grant_type=password)로 보내고 받은 토큰으로 세션을 시작한다', async () => {
    const fetchMock = mockFetch(() => json(tokens(false), 201));
    await show(<LoginScreen />);
    await fillLogin('  Reader@Example.com ', ' pass word1 ');
    await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
    await waitFor(() =>
      expect(getAuthSnapshot()).toMatchObject({
        status: 'active',
        userId: '8',
        accessToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI4In0.c2ln',
      }),
    );
    const [init] = callsTo(fetchMock, '/auth/tokens');
    expect(init.method).toBe('POST');
    // 이메일은 앞뒤 공백만 지우고(소문자화는 서버), 비밀번호는 그대로 보낸다.
    expect(JSON.parse(String(init.body))).toEqual({
      grant_type: 'password',
      email: 'Reader@Example.com',
      password: ' pass word1 ',
      client_platform: 'ios',
    });
  });

  it.each([
    [401, 'AUTH_INVALID_CREDENTIALS', '이메일 또는 비밀번호가 맞지 않아요.'],
    [422, 'EMAIL_INVALID', '이메일 형식을 확인해 주세요.'],
  ])('BASE-03 로그인 실패(%i %s)는 안내 문구를 보이고 세션을 시작하지 않는다', async (status, code, message) => {
    const fetchMock = mockFetch(() => problem(status, code));
    await show(<LoginScreen />);
    await fillLogin('reader@example.com', 'wrongpass1');
    await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(getAuthSnapshot().status).toBe('loading');
    expect(callsTo(fetchMock, '/auth/tokens')).toHaveLength(1);
    // 다시 시도할 수 있다.
    expect(screen.getByRole('button', { name: '로그인' })).toBeEnabled();
  });

  it('BASE-03 로그인 네트워크 오류는 기존 연결 안내를 보인다', async () => {
    mockFetch(() => {
      throw new TypeError('Network request failed');
    });
    await show(<LoginScreen />);
    await fillLogin('reader@example.com', 'password1');
    await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
    expect(await screen.findByText('서버에 연결하지 못했습니다. 네트워크를 확인하세요.')).toBeOnTheScreen();
  });

  it('BASE-03 로그인 요청 중에는 버튼을 비활성화해 두 번 보내지 않는다', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const fetchMock = mockFetch(async () => {
      await held;
      return json(tokens(false), 201);
    });
    await show(<LoginScreen />);
    await fillLogin('reader@example.com', 'password1');
    await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
    const busy = await screen.findByRole('button', { name: '로그인 중…' });
    expect(busy).toBeDisabled();
    expect(screen.getByRole('button', { name: '회원가입' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: '로그인 중…' }));
    await fireEvent(screen.getByLabelText('비밀번호'), 'submitEditing');
    expect(callsTo(fetchMock, '/auth/tokens')).toHaveLength(1);
    release();
    await waitFor(() => expect(getAuthSnapshot().status).toBe('active'));
    expect(callsTo(fetchMock, '/auth/tokens')).toHaveLength(1);
  });

  it('BASE-03 개발용 로그인 키 입력란은 플래그(EXPO_PUBLIC_DEV_LOGIN=1)가 있을 때만 이메일 로그인 아래에 보인다', async () => {
    mockFetch(() => problem(500, 'INTERNAL'));
    const first = await show(<LoginScreen />);
    expect(await screen.findByLabelText('이메일')).toBeOnTheScreen();
    expect(screen.queryByLabelText('개발용 로그인 키')).toBeNull();
    await first.unmount();

    process.env.EXPO_PUBLIC_DEV_LOGIN = '1';
    await show(<LoginScreen />);
    expect(await screen.findByLabelText('이메일')).toBeOnTheScreen();
    expect(screen.getByLabelText('개발용 로그인 키')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '개발용 로그인' })).toBeOnTheScreen();
  });

  it('BASE-03 서버가 이메일 로그인을 열지 않으면 이메일 입력란 대신 빈 상태를 보인다', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ providers: [] }));
    await show(<LoginScreen />);
    expect(await screen.findByText('아직 사용할 수 있는 로그인 방법이 없습니다.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('이메일')).toBeNull();
  });
});

describe('BASE-03 이메일 회원가입', () => {
  it('BASE-03 회원가입 성공: POST /auth/signup으로 보내고 온보딩 전(pending) 세션을 시작한다', async () => {
    const fetchMock = mockFetch(() => json(tokens(true), 201));
    await show(<SignupScreen />);
    expect(await screen.findByText('8~64자, 영문과 숫자를 함께 넣어 주세요.')).toBeOnTheScreen();
    expect(screen.getByLabelText('비밀번호').props).toMatchObject({
      secureTextEntry: true,
      autoComplete: 'new-password',
      textContentType: 'newPassword',
    });
    expect(screen.getByLabelText('비밀번호 확인').props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText('이메일').props).toMatchObject({
      keyboardType: 'email-address',
      autoCapitalize: 'none',
    });
    expect(screen.getByRole('button', { name: '가입하기' })).toBeDisabled();

    await fillSignup(' new@example.com ', 'password1', 'password1');
    await fireEvent.press(screen.getByRole('button', { name: '가입하기' }));
    await waitFor(() => expect(getAuthSnapshot()).toMatchObject({ status: 'pending', userId: '8' }));
    const [init] = callsTo(fetchMock, '/auth/signup');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'new@example.com',
      password: 'password1',
      client_platform: 'ios',
    });
    expect(callsTo(fetchMock, '/auth/tokens')).toHaveLength(0);
  });

  it('BASE-03 비밀번호 확인이 다르면 요청을 보내지 않고 안내한다', async () => {
    const fetchMock = mockFetch(() => json(tokens(true), 201));
    await show(<SignupScreen />);
    await fillSignup('new@example.com', 'password1', 'password2');
    await fireEvent.press(screen.getByRole('button', { name: '가입하기' }));
    expect(await screen.findByText('비밀번호가 서로 달라요. 다시 확인해 주세요.')).toBeOnTheScreen();
    expect(callsTo(fetchMock, '/auth/signup')).toHaveLength(0);
    expect(getAuthSnapshot().status).toBe('loading');

    // 고치면 안내가 사라지고 보낼 수 있다.
    await fireEvent.changeText(screen.getByLabelText('비밀번호 확인'), 'password1');
    expect(screen.queryByText('비밀번호가 서로 달라요. 다시 확인해 주세요.')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '가입하기' }));
    await waitFor(() => expect(callsTo(fetchMock, '/auth/signup')).toHaveLength(1));
  });

  it('BASE-03 이미 가입한 이메일(409 EMAIL_ALREADY_REGISTERED)이면 로그인하라고 안내한다', async () => {
    mockFetch(() => problem(409, 'EMAIL_ALREADY_REGISTERED', 'Email already registered'));
    await show(<SignupScreen />);
    await fillSignup('taken@example.com', 'password1', 'password1');
    await fireEvent.press(screen.getByRole('button', { name: '가입하기' }));
    expect(await screen.findByText('이미 가입한 이메일이에요. 로그인해 주세요.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '이미 계정이 있어요 · 로그인' })).toBeOnTheScreen();
    expect(getAuthSnapshot().status).toBe('loading');
  });

  it('BASE-03 비밀번호 규칙 오류(422 PASSWORD_INVALID)는 서버 안내를 그대로 비밀번호 입력 아래에 보인다', async () => {
    mockFetch(() => problem(422, 'PASSWORD_INVALID', '비밀번호에 숫자를 1개 이상 넣어 주세요.'));
    await show(<SignupScreen />);
    await fillSignup('new@example.com', 'passwordonly', 'passwordonly');
    await fireEvent.press(screen.getByRole('button', { name: '가입하기' }));
    expect(await screen.findByText('비밀번호에 숫자를 1개 이상 넣어 주세요.')).toBeOnTheScreen();
    // 입력 아래 문구가 규칙 안내(hint)를 대신한다.
    expect(screen.queryByText('8~64자, 영문과 숫자를 함께 넣어 주세요.')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('BASE-03 이메일 형식 오류(422 EMAIL_INVALID)는 이메일 입력 아래에 안내한다', async () => {
    mockFetch(() => problem(422, 'EMAIL_INVALID', 'invalid email'));
    await show(<SignupScreen />);
    await fillSignup('not-an-email', 'password1', 'password1');
    await fireEvent.press(screen.getByRole('button', { name: '가입하기' }));
    expect(await screen.findByText('이메일 형식을 확인해 주세요.')).toBeOnTheScreen();
  });

  it('BASE-03 가입 요청 중에는 가입하기 버튼을 비활성화해 두 번 보내지 않는다', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const fetchMock = mockFetch(async () => {
      await held;
      return json(tokens(true), 201);
    });
    await show(<SignupScreen />);
    await fillSignup('new@example.com', 'password1', 'password1');
    await fireEvent.press(screen.getByRole('button', { name: '가입하기' }));
    const busy = await screen.findByRole('button', { name: '가입 중…' });
    expect(busy).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: '가입 중…' }));
    expect(callsTo(fetchMock, '/auth/signup')).toHaveLength(1);
    release();
    await waitFor(() => expect(getAuthSnapshot().status).toBe('pending'));
    expect(callsTo(fetchMock, '/auth/signup')).toHaveLength(1);
  });

  it('BASE-03 가입 방법을 불러오지 못하거나 서버가 이메일 가입을 열지 않으면 오류·빈 상태를 보인다', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => problem(500, 'INTERNAL'));
    const first = await show(<SignupScreen />);
    expect(await screen.findByText('가입 방법을 불러오지 못했습니다.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeOnTheScreen();
    await first.unmount();

    jest.restoreAllMocks();
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ providers: [] }));
    await show(<SignupScreen />);
    expect(await screen.findByText('지금은 회원가입을 할 수 없어요.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('이메일')).toBeNull();
  });
});
