// BASE-03 로그인 라우트 보호·계정 전환·로그아웃 정리 (Expo Router 통합)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';

import TabsLayout from '@/app/(tabs)/_layout';
import ChatRoute from '@/app/(tabs)/chat/index';
import HomeScreen from '@/app/(tabs)/index';
import RootLayout from '@/app/_layout';
import LoginRoute from '@/app/login';
import OnboardingRoute from '@/app/onboarding';
import { apiRequest } from '@/lib/api-client';
import { getAuthSnapshot, resetAuthSession } from '@/lib/authSession';

jest.mock('@/lib/api-client', () => {
  const { EXPO_PUBLIC_API_URL: url, EXPO_PUBLIC_DEV_USER_ID: id, EXPO_PUBLIC_DEV_AUTH: mode } = process.env;
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
  delete process.env.EXPO_PUBLIC_DEV_USER_ID;
  process.env.EXPO_PUBLIC_DEV_AUTH = 'token';
  try {
    return jest.requireActual('@/lib/api-client');
  } finally {
    process.env.EXPO_PUBLIC_API_URL = url;
    if (url === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    if (id !== undefined) process.env.EXPO_PUBLIC_DEV_USER_ID = id;
    if (mode === undefined) delete process.env.EXPO_PUBLIC_DEV_AUTH;
    else process.env.EXPO_PUBLIC_DEV_AUTH = mode;
  }
});
jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 5,
    __values: values,
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => void values.set(key, value)),
    deleteItemAsync: jest.fn(async (key: string) => void values.delete(key)),
  };
});
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
}));

const API = 'http://localhost:8000/api/v1';
const secureValues = (SecureStore as unknown as { __values: Map<string, string> }).__values;
const deviceEntries = new Map<string, string>();
const storage = jest.mocked(AsyncStorage);

const me = (userId: number, onboardingRequired = false) => ({
  user_id: userId,
  status: onboardingRequired ? 'pending' : 'active',
  providers: ['dev'],
  default_play_name: onboardingRequired ? null : `플레이어${userId}`,
  consents: { terms: null, privacy: null, age_14_plus: null },
  required_consents: { terms: 'draft-v1', privacy: 'draft-v1', age_14_plus: 'self-v1' },
  onboarding_required: onboardingRequired,
});
const tokens = (userId: number, suffix = '', onboardingRequired = false) => ({
  access_token: `cca_${userId}${suffix}`,
  token_type: 'Bearer',
  expires_in: 1800,
  refresh_token: `ccr_${userId}${suffix}`,
  refresh_expires_in: 5184000,
  user: me(userId, onboardingRequired),
  is_new_user: false,
});
const sessionRow = (id: number, title: string) => ({
  id,
  story_id: 3,
  story_title: title,
  read_only: false,
  model: '루나',
  play_name: '여행자',
  generating: false,
  last_message_preview: null,
  last_activity_at: '2026-11-26T00:00:00Z',
});
const json = (data: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status });
const problem = (status: number, code: string) => json({ status, code, detail: code }, status);

type Handler = (url: string, init: RequestInit) => Promise<Response> | Response;
let handler: Handler;
let fetchMock: jest.SpyInstance;

function header(init: RequestInit, name: string) {
  return new Headers(init.headers).get(name);
}

function devKeyOf(init: RequestInit): string | null {
  const body = JSON.parse(String(init.body)) as Record<string, unknown>;
  return body.grant_type === 'dev' ? String(body.dev_user_key) : null;
}

const ROUTES = {
  _layout: RootLayout,
  login: LoginRoute,
  onboarding: OnboardingRoute,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': HomeScreen,
  '(tabs)/chat/index': ChatRoute,
  '(tabs)/create/index': () => null,
  'story/[storyId]': () => null,
  'chat-session/[sessionId]': () => null,
};

async function signInWithKey(key: string) {
  await fireEvent.changeText(await screen.findByLabelText('개발용 로그인 키'), key);
  await fireEvent.press(screen.getByRole('button', { name: '개발용 로그인' }));
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_DEV_LOGIN = '1';
  resetAuthSession();
  secureValues.clear();
  storage.getItem.mockImplementation(async (k) => deviceEntries.get(k) ?? null);
  storage.setItem.mockImplementation(async (k, value) => void deviceEntries.set(k, value));
  storage.removeItem.mockImplementation(async (k) => void deviceEntries.delete(k));
  storage.getAllKeys.mockImplementation(async () => [...deviceEntries.keys()]);
  storage.multiRemove.mockImplementation(async (keys) => void keys.forEach((k) => deviceEntries.delete(k)));
  fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => handler(String(input), init ?? {}));
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_DEV_LOGIN;
  deviceEntries.clear();
  jest.restoreAllMocks();
});

it('BASE-03 계정 전환: 만료 후 B로 로그인하면 A의 대화 목록·늦은 응답이 보이지 않고, 만료는 A의 기기 초안을 남긴다', async () => {
  // A(1)가 이 기기에 남긴 작성 중 입력. 세션 만료로는 지우지 않는다.
  deviceEntries.set('charchat:chat-draft:v1:1:47', 'A의 초안');
  let releaseLateA!: () => void;
  const lateA = new Promise<void>((resolve) => (releaseLateA = resolve));
  handler = async (url, init) => {
    if (url === `${API}/auth/providers`) return json({ providers: [{ provider: 'dev', flows: ['direct'] }] });
    if (url === `${API}/auth/tokens` && devKeyOf(init) === 'a') return json(tokens(1), 201);
    if (url === `${API}/auth/tokens` && devKeyOf(init) === 'b') return json(tokens(2), 201);
    if (url === `${API}/auth/tokens`) return problem(401, 'AUTH_REFRESH_INVALID');
    if (url === `${API}/conversation/sessions` && header(init, 'Authorization') === 'Bearer cca_1') {
      // A의 목록 응답은 계정이 바뀐 뒤에야 도착한다.
      await lateA;
      return json({ sessions: [sessionRow(47, 'A의 정원')], next_before_id: null });
    }
    if (url === `${API}/conversation/sessions` && header(init, 'Authorization') === 'Bearer cca_2') {
      return json({ sessions: [sessionRow(52, 'B의 호수')], next_before_id: null });
    }
    if (url === `${API}/expire-check`) return problem(401, 'AUTH_TOKEN_EXPIRED');
    throw new Error(`unexpected ${init.method ?? 'GET'} ${url}`);
  };

  const view = await renderRouter(ROUTES, { initialUrl: '/' });
  await signInWithKey('a');
  await waitFor(() => expect(getAuthSnapshot()).toMatchObject({ status: 'active', userId: '1' }));
  await act(async () => router.push('/chat'));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`${API}/conversation/sessions`, expect.anything()));

  // A의 토큰이 만료되고 리프레시도 거절된다 → 로그인 화면과 '다시 로그인해 주세요'
  await act(async () => {
    await apiRequest('/expire-check').catch(() => undefined);
  });
  expect(await screen.findByText('다시 로그인해 주세요')).toBeOnTheScreen();
  expect(view.getPathname()).toBe('/login');
  expect(deviceEntries.get('charchat:chat-draft:v1:1:47')).toBe('A의 초안');

  await signInWithKey('b');
  await waitFor(() => expect(getAuthSnapshot()).toMatchObject({ status: 'active', userId: '2' }));
  await act(async () => router.push('/chat'));
  expect(await screen.findByText('B의 호수')).toBeOnTheScreen();
  // 이전 계정의 늦은 응답은 버린 캐시에만 들어간다.
  await act(async () => {
    releaseLateA();
    await lateA;
  });
  expect(screen.queryByText('A의 정원')).toBeNull();
  expect(screen.getByText('B의 호수')).toBeOnTheScreen();
});

it('BASE-03 로그아웃: 직접 로그아웃하면 서버 세션을 폐기하고 그 계정의 기기 초안만 지운다', async () => {
  const ownKeys = ['charchat:chat-draft:v1:2:52', 'charchat:chat-send:v1:2:52'];
  ownKeys.forEach((key) => deviceEntries.set(key, '{}'));
  deviceEntries.set('charchat:chat-draft:v1:1:47', 'A의 초안');
  deviceEntries.set('charchat:chat-draft:v1:21:9', '21번 계정 초안');
  handler = async (url, init) => {
    if (url === `${API}/auth/providers`) return json({ providers: [] });
    if (url === `${API}/auth/tokens`) return json(tokens(2), 201);
    if (url === `${API}/auth/sessions/current` && init.method === 'DELETE') return json(null, 204);
    throw new Error(`unexpected ${init.method ?? 'GET'} ${url}`);
  };

  const view = await renderRouter(ROUTES, { initialUrl: '/' });
  await signInWithKey('b');
  expect(await screen.findByRole('button', { name: '로그아웃' })).toBeOnTheScreen();
  expect(secureValues.get('charchat.auth.v1')).toContain('ccr_2');

  await fireEvent.press(screen.getByRole('button', { name: '로그아웃' }));
  expect(await screen.findByLabelText('개발용 로그인 키')).toBeOnTheScreen();
  expect(view.getPathname()).toBe('/login');
  expect(fetchMock).toHaveBeenCalledWith(
    `${API}/auth/sessions/current`,
    expect.objectContaining({ method: 'DELETE', headers: expect.objectContaining({ Authorization: 'Bearer cca_2' }) }),
  );
  ownKeys.forEach((key) => expect(deviceEntries.has(key)).toBe(false));
  expect(deviceEntries.get('charchat:chat-draft:v1:1:47')).toBe('A의 초안');
  expect(deviceEntries.get('charchat:chat-draft:v1:21:9')).toBe('21번 계정 초안');
  expect(secureValues.has('charchat.auth.v1')).toBe(false);
  expect(getAuthSnapshot()).toMatchObject({ status: 'signed-out', accessToken: null, notice: null });
});

it('BASE-03 온보딩 이동: 이용 중 403 ONBOARDING_REQUIRED를 받으면 온보딩 화면으로 보낸다', async () => {
  handler = async (url, init) => {
    if (url === `${API}/auth/providers`) return json({ providers: [] });
    if (url === `${API}/auth/tokens`) return json(tokens(3), 201);
    if (url === `${API}/conversation/sessions`) return problem(403, 'ONBOARDING_REQUIRED');
    if (url === `${API}/me`) return json(me(3, true));
    throw new Error(`unexpected ${init.method ?? 'GET'} ${url}`);
  };

  const view = await renderRouter(ROUTES, { initialUrl: '/' });
  await signInWithKey('c');
  await waitFor(() => expect(getAuthSnapshot().status).toBe('active'));
  await act(async () => router.push('/chat'));
  expect(await screen.findByText('가입을 마무리해 주세요')).toBeOnTheScreen();
  expect(view.getPathname()).toBe('/onboarding');
  expect(await screen.findByRole('checkbox', { name: '(필수) 만 14세 이상입니다' })).toBeOnTheScreen();
});

it('BASE-03 시작 시 복원: 기기에 남은 리프레시 토큰으로 로그인 화면 없이 이어서 쓴다', async () => {
  secureValues.set('charchat.auth.v1', JSON.stringify({ refreshToken: 'ccr_5', userId: '5' }));
  handler = async (url, init) => {
    if (url === `${API}/auth/tokens`) {
      expect(JSON.parse(String(init.body))).toEqual({ grant_type: 'refresh_token', refresh_token: 'ccr_5' });
      return json(tokens(5, 'r'), 201);
    }
    throw new Error(`unexpected ${init.method ?? 'GET'} ${url}`);
  };

  const view = await renderRouter(ROUTES, { initialUrl: '/' });
  expect(await screen.findByRole('button', { name: '로그아웃' })).toBeOnTheScreen();
  expect(view.getPathname()).toBe('/');
  expect(getAuthSnapshot()).toMatchObject({ status: 'active', userId: '5', accessToken: 'cca_5r' });
  await waitFor(() => expect(secureValues.get('charchat.auth.v1')).toContain('ccr_5r'));
});

it('BASE-03 시작 시 복원: 확인이 끝날 때까지 기다렸다가 처음 요청한 주소(대화 목록)를 연다', async () => {
  secureValues.set('charchat.auth.v1', JSON.stringify({ refreshToken: 'ccr_6', userId: '6' }));
  handler = async (url, init) => {
    if (url === `${API}/auth/tokens`) return json(tokens(6, 'r'), 201);
    if (url === `${API}/conversation/sessions`)
      return json({ sessions: [sessionRow(60, '여섯째 이야기')], next_before_id: null });
    throw new Error(`unexpected ${init.method ?? 'GET'} ${url}`);
  };

  const view = await renderRouter(ROUTES, { initialUrl: '/chat' });
  expect(await screen.findByText('여섯째 이야기')).toBeOnTheScreen();
  expect(view.getPathname()).toBe('/chat');
});

it('BASE-03 시작 시 복원 실패: 보관된 리프레시 토큰이 거절되면 지우고 로그인 화면에 다시 로그인 안내를 보인다', async () => {
  secureValues.set('charchat.auth.v1', JSON.stringify({ refreshToken: 'ccr_7', userId: '7' }));
  handler = async (url, init) => {
    if (url === `${API}/auth/tokens`) return problem(401, 'AUTH_REFRESH_INVALID');
    if (url === `${API}/auth/providers`) return json({ providers: [] });
    throw new Error(`unexpected ${init.method ?? 'GET'} ${url}`);
  };

  const view = await renderRouter(ROUTES, { initialUrl: '/chat' });
  expect(await screen.findByText('다시 로그인해 주세요')).toBeOnTheScreen();
  expect(view.getPathname()).toBe('/login');
  await waitFor(() => expect(secureValues.has('charchat.auth.v1')).toBe(false));
});
