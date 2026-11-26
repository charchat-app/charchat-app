// BASE-03 로그인 화면(개발용 로그인 키)·가입 온보딩 화면
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { LoginScreen, OnboardingScreen } from '@/features/auth';
import { applyGrant, getAuthSnapshot, resetAuthSession } from '@/lib/authSession';

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
const json = (data: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status });
const problem = (status: number, code: string, detail = code) => json({ status, code, detail }, status);
const pendingMe = {
  user_id: 4,
  status: 'pending',
  providers: ['dev'],
  default_play_name: null,
  consents: { terms: null, privacy: null, age_14_plus: null },
  required_consents: { terms: 'terms-v3', privacy: 'privacy-v2', age_14_plus: 'self-v1' },
  onboarding_required: true,
};
const activeMe = {
  ...pendingMe,
  status: 'active',
  default_play_name: '여행자',
  consents: { terms: 'terms-v3', privacy: 'privacy-v2', age_14_plus: 'self-v1' },
  onboarding_required: false,
};

const clients: QueryClient[] = [];
function show(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

beforeEach(() => resetAuthSession());

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  delete process.env.EXPO_PUBLIC_DEV_LOGIN;
  jest.restoreAllMocks();
});

describe('BASE-03 로그인 화면', () => {
  it('BASE-03 개발용 로그인 키 입력란은 EXPO_PUBLIC_DEV_LOGIN=1일 때만 보이고 소셜 로그인 버튼은 없다', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ providers: [] }));
    await show(<LoginScreen />);
    expect(await screen.findByText('아직 사용할 수 있는 로그인 방법이 없습니다.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('개발용 로그인 키')).toBeNull();
    expect(screen.queryByRole('button', { name: /카카오|구글|Google|Apple/ })).toBeNull();
  });

  it('BASE-03 개발용 로그인 키로 POST /auth/tokens(grant_type=dev)를 보내고 세션을 시작한다', async () => {
    process.env.EXPO_PUBLIC_DEV_LOGIN = '1';
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).endsWith('/auth/providers')
        ? json({ providers: [{ provider: 'dev', flows: ['direct'] }] })
        : json(
            {
              access_token: 'cca_4',
              token_type: 'Bearer',
              expires_in: 1800,
              refresh_token: 'ccr_4',
              refresh_expires_in: 5184000,
              user: pendingMe,
              is_new_user: true,
            },
            201,
          ),
    );
    await show(<LoginScreen />);
    expect(screen.getByRole('button', { name: '개발용 로그인' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('개발용 로그인 키'), '  tester-4 ');
    await fireEvent.press(screen.getByRole('button', { name: '개발용 로그인' }));
    await waitFor(() => expect(getAuthSnapshot()).toMatchObject({ status: 'pending', userId: '4' }));
    const [url, init] = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/auth/tokens'))!;
    expect(url).toBe(`${API}/auth/tokens`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      grant_type: 'dev',
      dev_user_key: 'tester-4',
      client_platform: 'ios',
    });
  });

  it('BASE-03 서버의 개발용 로그인이 꺼져 있으면 안내한다', async () => {
    process.env.EXPO_PUBLIC_DEV_LOGIN = '1';
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        String(input).endsWith('/auth/providers') ? json({ providers: [] }) : problem(404, 'AUTH_DEV_LOGIN_DISABLED'),
      );
    await show(<LoginScreen />);
    await fireEvent.changeText(screen.getByLabelText('개발용 로그인 키'), '1');
    await fireEvent.press(screen.getByRole('button', { name: '개발용 로그인' }));
    expect(await screen.findByText('서버에서 개발용 로그인이 꺼져 있습니다.')).toBeOnTheScreen();
    expect(getAuthSnapshot().status).toBe('loading');
  });

  it('BASE-03 로그인 방법을 불러오지 못하면 오류와 다시 시도를 보인다', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => problem(500, 'INTERNAL'));
    await show(<LoginScreen />);
    expect(await screen.findByText('로그인 방법을 불러오지 못했습니다.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeOnTheScreen();
  });
});

describe('BASE-03 가입 온보딩', () => {
  function signInPending() {
    applyGrant({ accessToken: 'cca_4', refreshToken: 'ccr_4', userId: '4', onboardingRequired: true });
  }

  it('BASE-03 필수 체크 3개(만 14세 이상·이용약관·개인정보 수집·이용)와 기본 플레이 이름이 모두 있어야 가입을 마친다', async () => {
    signInPending();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (_input, init) => json(init?.method === 'PATCH' ? activeMe : pendingMe));
    await show(<OnboardingScreen />);
    const age = await screen.findByRole('checkbox', { name: '(필수) 만 14세 이상입니다' });
    // 미리 체크해 두지 않는다.
    for (const name of ['(필수) 만 14세 이상입니다', '(필수) 이용약관 동의', '(필수) 개인정보 수집·이용 동의']) {
      expect(screen.getByRole('checkbox', { name })).not.toBeChecked();
    }
    const start = () => screen.getByRole('button', { name: '시작하기' });
    expect(start()).toBeDisabled();

    await fireEvent.press(age);
    await fireEvent.press(screen.getByRole('checkbox', { name: '(필수) 이용약관 동의' }));
    await fireEvent.changeText(screen.getByLabelText('기본 플레이 이름'), '여행자');
    // 개인정보 수집·이용이 빠지면 보낼 수 없다.
    expect(start()).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: '(필수) 개인정보 수집·이용 동의' }));
    expect(start()).toBeEnabled();
    // 이름이 공백뿐이면 보낼 수 없다.
    await fireEvent.changeText(screen.getByLabelText('기본 플레이 이름'), '   ');
    expect(start()).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('기본 플레이 이름'), ' 여행자 ');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);

    await fireEvent.press(start());
    await waitFor(() => expect(getAuthSnapshot().status).toBe('active'));
    const [url, init] = fetchMock.mock.calls.find(([, call]) => call?.method === 'PATCH')!;
    expect(url).toBe(`${API}/me`);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer cca_4');
    expect(JSON.parse(String(init?.body))).toEqual({
      default_play_name: '여행자',
      consents: { terms: 'terms-v3', privacy: 'privacy-v2', age_14_plus: 'self-v1' },
    });
  });

  it('BASE-03 기본 플레이 이름을 서버가 거절(PLAY_NAME_INVALID)하면 입력 아래에 안내한다', async () => {
    signInPending();
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (_input, init) =>
        init?.method === 'PATCH'
          ? problem(422, 'PLAY_NAME_INVALID', '플레이 이름은 20자 이하로 입력하세요.')
          : json(pendingMe),
      );
    await show(<OnboardingScreen />);
    for (const name of ['(필수) 만 14세 이상입니다', '(필수) 이용약관 동의', '(필수) 개인정보 수집·이용 동의']) {
      await fireEvent.press(await screen.findByRole('checkbox', { name }));
    }
    await fireEvent.changeText(screen.getByLabelText('기본 플레이 이름'), '아주아주긴이름');
    await fireEvent.press(screen.getByRole('button', { name: '시작하기' }));
    expect(await screen.findByText('플레이 이름은 20자 이하로 입력하세요.')).toBeOnTheScreen();
    expect(getAuthSnapshot().status).toBe('pending');
  });

  it('BASE-03 기본 플레이 이름은 20자까지만 입력받고 "20자 이하" 안내를 보인다', async () => {
    signInPending();
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => json(pendingMe));
    await show(<OnboardingScreen />);
    const name = await screen.findByLabelText('기본 플레이 이름');
    expect(name).toHaveProp('maxLength', 20);
    expect(screen.getByText('대화에서 내 캐릭터를 부를 이름입니다. 20자 이하로 입력하세요.')).toBeOnTheScreen();
  });

  it("BASE-03 '만 14세 미만이에요'를 고르면 가입할 수 없다는 안내와 함께 로그아웃한다(DELETE /me 없음)", async () => {
    signInPending();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (_input, init) => (init?.method === 'DELETE' ? json(null, 204) : json(pendingMe)));
    await show(<OnboardingScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: '만 14세 미만이에요' }));
    await waitFor(() =>
      expect(getAuthSnapshot()).toMatchObject({ status: 'signed-out', notice: '만 14세 미만은 가입할 수 없어요.' }),
    );
    const deletes = fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE').map(([url]) => String(url));
    expect(deletes).toEqual([`${API}/auth/sessions/current`]);
  });

  it('BASE-03 계정 정보를 불러오지 못하면 오류·다시 시도·로그아웃을 보인다', async () => {
    signInPending();
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => problem(500, 'INTERNAL'));
    await show(<OnboardingScreen />);
    expect(await screen.findByText('계정 정보를 불러오지 못했습니다.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeOnTheScreen();
  });
});
