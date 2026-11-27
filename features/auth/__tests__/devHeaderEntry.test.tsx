// BASE-03 로그인 진입점: 개발용 헤더 모드에서 서버가 X-User-Id를 거절하면 로그인 화면으로 보낸다 (Expo Router 통합)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderRouter, screen, waitFor } from 'expo-router/testing-library';

import TabsLayout from '@/app/(tabs)/_layout';
import ChatRoute from '@/app/(tabs)/chat/index';
import HomeScreen from '@/app/(tabs)/index';
import RootLayout from '@/app/_layout';
import LoginRoute from '@/app/login';
import OnboardingRoute from '@/app/onboarding';
import SignupRoute from '@/app/signup';
import { DEV_HEADER_REJECTED_NOTICE, devHeaderUserId } from '@/lib/api-client';
import { getAuthSnapshot, resetAuthSession } from '@/lib/authSession';

jest.mock('@/lib/api-client', () => {
  const { EXPO_PUBLIC_API_URL: url, EXPO_PUBLIC_DEV_USER_ID: id, EXPO_PUBLIC_DEV_AUTH: mode } = process.env;
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
  process.env.EXPO_PUBLIC_DEV_USER_ID = '1';
  process.env.EXPO_PUBLIC_DEV_AUTH = 'header';
  try {
    return jest.requireActual('@/lib/api-client');
  } finally {
    process.env.EXPO_PUBLIC_API_URL = url;
    if (url === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    if (id === undefined) delete process.env.EXPO_PUBLIC_DEV_USER_ID;
    else process.env.EXPO_PUBLIC_DEV_USER_ID = id;
    if (mode === undefined) delete process.env.EXPO_PUBLIC_DEV_AUTH;
    else process.env.EXPO_PUBLIC_DEV_AUTH = mode;
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
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

const ROUTES = {
  _layout: RootLayout,
  login: LoginRoute,
  onboarding: OnboardingRoute,
  signup: SignupRoute,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': HomeScreen,
  '(tabs)/chat/index': ChatRoute,
  '(tabs)/create/index': () => null,
  'story/[storyId]': () => null,
  'chat-session/[sessionId]': () => null,
};

beforeEach(() => {
  resetAuthSession();
  jest.mocked(AsyncStorage).getAllKeys.mockImplementation(async () => []);
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('BASE-03 로그인 진입점: 서버가 개발용 사용자 번호를 거절하면 안내와 함께 로그인 화면으로 보내고, 그 뒤 요청에는 번호를 붙이지 않는다', async () => {
  const seen: { url: string; devUser: string | null }[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    seen.push({ url, devUser: new Headers(init?.headers).get('X-User-Id') });
    if (url === `${API}/auth/providers`) {
      return json({ providers: [{ provider: 'email', flows: ['password'] }] });
    }
    if (url.startsWith(`${API}/conversation/sessions`)) {
      // 서버 AUTH_DEV_HEADER_ENABLED가 꺼져 있으면 X-User-Id를 보지 않고 401을 돌려준다.
      return json(
        { status: 401, code: 'UNAUTHENTICATED', detail: 'Authorization: Bearer <액세스 토큰>을 보내세요.' },
        401,
      );
    }
    throw new Error(`unexpected ${init?.method ?? 'GET'} ${url}`);
  });

  const view = await renderRouter(ROUTES, { initialUrl: '/chat' });

  expect(await screen.findByText(DEV_HEADER_REJECTED_NOTICE)).toBeOnTheScreen();
  expect(view.getPathname()).toBe('/login');
  expect(devHeaderUserId()).toBeNull();
  expect(getAuthSnapshot()).toMatchObject({ status: 'signed-out', notice: DEV_HEADER_REJECTED_NOTICE });
  // 거절된 요청은 개발용 번호로 보냈고, 로그인 화면이 부른 요청에는 번호를 붙이지 않았다.
  expect(seen.find((call) => call.url.startsWith(`${API}/conversation/sessions`))?.devUser).toBe('1');
  await waitFor(() => expect(seen.some((call) => call.url === `${API}/auth/providers`)).toBe(true));
  expect(seen.filter((call) => call.url === `${API}/auth/providers`).every((call) => call.devUser === null)).toBe(true);
});
