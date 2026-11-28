// charchat-app#36 대화방 상단 스토리 제목 · 말풍선 옆 화자 사진(캐릭터 왼쪽·유저 오른쪽, 없으면 이름 첫 글자)
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import SessionRoute from '@/app/chat-session/[sessionId]';
import type { ConversationRoom } from '@/features/chat/types';
import type { ChatMessage, ChatTurns } from '@/shared/story-types';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ sessionId: '19' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true, dismissTo: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('@/lib/api-client', () => {
  const { EXPO_PUBLIC_API_URL: url, EXPO_PUBLIC_DEV_USER_ID: id, EXPO_PUBLIC_DEV_AUTH: mode } = process.env;
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
  process.env.EXPO_PUBLIC_DEV_USER_ID = '8';
  process.env.EXPO_PUBLIC_DEV_AUTH = 'header';
  try {
    return jest.requireActual('@/lib/api-client');
  } finally {
    if (url === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = url;
    if (id === undefined) delete process.env.EXPO_PUBLIC_DEV_USER_ID;
    else process.env.EXPO_PUBLIC_DEV_USER_ID = id;
    if (mode === undefined) delete process.env.EXPO_PUBLIC_DEV_AUTH;
    else process.env.EXPO_PUBLIC_DEV_AUTH = mode;
  }
});

const API = 'http://localhost:8000/api/v1';
const BASE = `${API}/conversation`;
const FILES = '/api/v1/creation/image-files';

const room: ConversationRoom = {
  id: 19,
  story_id: 3,
  story_title: '달빛 정원',
  model: '루나',
  read_only: false,
  play_name: '여행자',
  messages: [
    { speaker_kind: 'narrator', speaker_name: null, body: '문이 열렸다.' },
    { speaker_kind: 'character', speaker_name: '윤슬', body: '어서 와.' },
    { speaker_kind: 'character', speaker_name: '윤슬', body: '오래 기다렸어.' },
    { speaker_kind: 'character', speaker_name: '서윤', body: '안녕.' },
  ],
  characters: [
    { id: 2, name: '윤슬', image_url: `${FILES}/yunseul` },
    { id: 3, name: '서윤', image_url: null },
  ],
  user_image_url: `${FILES}/traveler`,
};
const userMessage: ChatMessage = {
  id: 5,
  role: 'user',
  parts: [
    { speaker_kind: 'user', character_id: null, speaker_name: '여행자', body: '반가워.' },
    { speaker_kind: 'user', character_id: null, speaker_name: '여행자', body: '오랜만이야.' },
  ],
  created_at: '2026-11-28T00:00:00Z',
};
const turns: ChatTurns = {
  messages: [userMessage],
  active_generation: null,
  last_failed_generation: null,
  model: '루나',
  model_id: 1,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function serve(body: unknown, history: ChatTurns = turns) {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === `${BASE}/sessions/19`) return json(body);
    if (url === `${BASE}/sessions/19/turns`) return json(history);
    return json({}, 404);
  });
}

const clients: QueryClient[] = [];
const show = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <SessionRoute />
    </QueryClientProvider>,
  );
};

// 사진은 말풍선 안 이름과 겹치므로 화면 읽기 프로그램에는 숨긴다. 테스트는 숨긴 요소까지 찾는다.
const hidden = { includeHiddenElements: true } as const;
const introRows = () => screen.getAllByTestId('conversation-bubble-row', hidden);
const savedRows = () => screen.getAllByTestId('chat-message-bubble-row', hidden);
const avatarIn = (row: ReturnType<typeof introRows>[number]) => within(row).queryByTestId('speaker-avatar', hidden);
const imageIn = (row: ReturnType<typeof introRows>[number]) =>
  within(row).queryByTestId('speaker-avatar-image', hidden);
/** 기기는 expo-image로 그린다(안드로이드에서 인증 헤더를 보내려고). expo-image는 source를 배열로 넘긴다. */
const sourceOf = (image: ReturnType<typeof imageIn>) => [image?.props.source].flat()[0];

const env = process.env.EXPO_PUBLIC_API_URL;
beforeEach(() => {
  // 서버 기준 경로를 전체 주소로 바꾸고 인증 헤더 대상인지 볼 때 이 값을 읽는다.
  process.env.EXPO_PUBLIC_API_URL = API;
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  jest.restoreAllMocks();
  if (env === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = env;
});

it('#36: 상단 제목은 「대화방」 대신 스토리 제목이다', async () => {
  serve(room);
  await show();
  expect(await screen.findByRole('header', { name: '달빛 정원' })).toBeOnTheScreen();
  expect(screen.queryByRole('header', { name: '대화방' })).not.toBeOnTheScreen();
  // 본문에 같은 제목을 한 번 더 두지 않는다.
  expect(screen.getAllByText('달빛 정원')).toHaveLength(1);
}, 20_000); // 첫 React Native 렌더는 콜드 캐시에서 기본 5초를 넘길 수 있다.

it('#36: 캐릭터는 왼쪽에 대표 사진, 유저는 오른쪽에 프로필 사진을 인증 헤더와 함께 불러오고 나레이터는 사진이 없다', async () => {
  serve(room);
  await show();
  await waitFor(() => expect(savedRows()).toHaveLength(2));

  // 나레이터 말풍선은 사진 줄이 아니다(인트로 4개 중 3개만 줄).
  expect(screen.getAllByTestId('conversation-bubble')).toHaveLength(4);
  expect(introRows()).toHaveLength(3);
  const [yunseul] = introRows();
  const image = imageIn(yunseul);
  expect(image).not.toBeNull();
  expect(sourceOf(image)).toEqual({ uri: `${API}/creation/image-files/yunseul`, headers: { 'X-User-Id': '8' } });
  expect(StyleSheet.flatten(yunseul.props.style).flexDirection).toBe('row');

  const [traveler] = savedRows();
  expect(sourceOf(imageIn(traveler))).toEqual({
    uri: `${API}/creation/image-files/traveler`,
    headers: { 'X-User-Id': '8' },
  });
  // 유저 줄은 거꾸로 놓아 사진이 오른쪽 끝, 말풍선이 그 왼쪽에 온다.
  expect(StyleSheet.flatten(traveler.props.style).flexDirection).toBe('row-reverse');
}, 20_000);

it('#36 나래님 확인 전(추천안): 같은 화자가 이어지면 첫 말풍선에만 사진과 이름을 보인다', async () => {
  serve(room);
  await show();
  await waitFor(() => expect(savedRows()).toHaveLength(2));
  const [first, second, other] = introRows();
  expect(avatarIn(first)).not.toBeNull();
  expect(within(first).getByTestId('conversation-bubble')).toHaveTextContent('윤슬어서 와.');
  // 이어진 말풍선: 사진·이름 없이 같은 들여쓰기로 붙는다.
  expect(avatarIn(second)).toBeNull();
  expect(within(second).getByTestId('conversation-bubble')).toHaveTextContent('오래 기다렸어.', { exact: true });
  // 화자가 바뀌면 다시 사진과 이름을 보인다.
  expect(avatarIn(other)).not.toBeNull();
  const [user, userAgain] = savedRows();
  expect(avatarIn(user)).not.toBeNull();
  expect(avatarIn(userAgain)).toBeNull();
}, 20_000);

it('#36 나래님 확인 전(추천안): 인트로 마지막 화자가 저장된 첫 답에서 이어지면 그 말풍선도 사진·이름 없이 붙고, 화면 읽기에는 화자 이름을 읽힌다', async () => {
  const reply: ChatMessage = {
    id: 6,
    role: 'assistant',
    parts: [
      { speaker_kind: 'character', character_id: 3, speaker_name: '서윤', body: '*고개를 든다.* 또 왔네.' },
      { speaker_kind: 'character', character_id: 2, speaker_name: '윤슬', body: '반가워.' },
    ],
    created_at: '2026-11-28T00:00:00Z',
  };
  serve(room, { ...turns, messages: [reply] });
  await show();
  await waitFor(() => expect(savedRows()).toHaveLength(2));
  const [continued, changed] = savedRows();
  // 인트로 마지막이 서윤이므로 저장된 첫 서윤 말풍선은 이어진 말풍선이다.
  expect(avatarIn(continued)).toBeNull();
  expect(screen.getByLabelText('서윤: 고개를 든다. 또 왔네.')).toBeOnTheScreen();
  expect(avatarIn(changed)).not.toBeNull();
}, 20_000);

it('#36 나래님 확인 전(추천안): 사진이 없는 화자는 이름 첫 글자, 사진을 불러오지 못해도(비공개·삭제 스토리 404) 첫 글자로 돌아간다', async () => {
  serve(room);
  await show();
  await waitFor(() => expect(savedRows()).toHaveLength(2));
  const [yunseul, , seoyun] = introRows();
  // 서윤은 대표 사진이 없다: 사진 요청 없이 첫 글자만.
  expect(imageIn(seoyun)).toBeNull();
  expect(within(seoyun).getByText('서', hidden)).toBeOnTheScreen();

  // 불러오는 동안은 첫 글자가 아래에 깔려 있고, 다 불러오면 사진만 남는다.
  expect(within(yunseul).getByText('윤', hidden)).toBeOnTheScreen();
  await fireEvent(imageIn(yunseul)!, 'load', { nativeEvent: {} });
  expect(within(yunseul).queryByText('윤', hidden)).toBeNull();

  // 유저 사진을 못 불러오면 사진을 치우고 첫 글자를 보인다.
  const [traveler] = savedRows();
  await fireEvent(imageIn(traveler)!, 'error', { nativeEvent: { error: '404' } });
  await waitFor(() => expect(imageIn(savedRows()[0])).toBeNull());
  expect(within(savedRows()[0]).getByText('여', hidden)).toBeOnTheScreen();
}, 20_000);

it('#36: 옛 서버(사진 주소 없음)여도 대화방이 열리고 모든 화자가 이름 첫 글자로 보인다', async () => {
  const { user_image_url: _user, ...old } = room;
  serve({
    ...old,
    characters: [
      { id: 2, name: '윤슬' },
      { id: 3, name: '서윤' },
    ],
  });
  await show();
  await waitFor(() => expect(savedRows()).toHaveLength(2));
  expect(screen.queryAllByTestId('speaker-avatar-image', hidden)).toHaveLength(0);
  expect(screen.getAllByTestId('speaker-avatar', hidden)).toHaveLength(3);
  expect(within(savedRows()[0]).getByText('여', hidden)).toBeOnTheScreen();
}, 20_000);
