// CHAT-US-15 (KAN-46) 스토리 상세·대화방의 현재 적용 등급 표시
// 등급에 따라 응답 내용을 거르거나 바꾸는 일은 CHAT-US-05(KAN-27) 범위라 여기서 보지 않는다.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import SessionRoute from '@/app/chat-session/[sessionId]';
import StoryRoute from '@/app/story/[storyId]';
import type {
  ChatGeneration,
  ChatMessage,
  ChatTurns,
  ConversationSession,
  ConversationStory,
} from '@/shared/story-types';

const mockRouter = { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ storyId: '7', sessionId: '19' }),
  useRouter: () => mockRouter,
  useIsFocused: () => true,
}));
jest.mock('@/lib/api-client', () => {
  const previous = process.env.EXPO_PUBLIC_API_URL;
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
  try {
    return jest.requireActual('@/lib/api-client');
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = previous;
  }
});

const BASE = 'http://localhost:8000/api/v1/conversation';
const story: ConversationStory = {
  id: 7,
  title: '달빛 정원',
  subtitle: '한밤의 초대',
  world_description: '밤이 오면 꽃이 말을 건넨다.',
  effective_rating: 'SAFE',
  characters: [{ id: 1, name: '서윤', description: '정원사' }],
  intros: [{ id: 11, title: '정원 입구', messages: [] }],
  profiles: [],
  existing_session_id: null,
  tags: ['판타지'],
};
const session: ConversationSession = {
  id: 19,
  story_title: '달빛 정원',
  model: '루나',
  read_only: false,
  play_name: '여행자',
  messages: [{ speaker_kind: 'narrator', speaker_name: null, body: '문이 열렸다.' }],
  characters: [{ id: 2, name: '윤슬' }],
  effective_rating: 'SAFE',
};
const turns: ChatTurns = {
  messages: [],
  active_generation: null,
  last_failed_generation: null,
  model: '루나',
  model_id: 1,
  effective_rating: 'SAFE',
};
const userMessage: ChatMessage = {
  id: 5,
  role: 'user',
  parts: [{ speaker_kind: 'user', character_id: null, speaker_name: '여행자', body: '안녕' }],
  created_at: '2026-11-28T00:00:00Z',
};
const reply: ChatMessage = {
  id: 6,
  role: 'assistant',
  parts: [{ speaker_kind: 'character', character_id: 2, speaker_name: '윤슬', body: '반가워' }],
  created_at: '2026-11-28T00:00:01Z',
};
const generation = (overrides: Partial<ChatGeneration> = {}): ChatGeneration => ({
  id: 9,
  session_id: 19,
  status: 'pending',
  user_message_id: 5,
  assistant_message: null,
  text: '',
  next_offset: 0,
  error_code: null,
  retryable: false,
  model: '루나',
  ...overrides,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** 경로별 응답을 테스트가 바꾼다. 매 호출마다 새 Response를 만든다. */
function fakeServer() {
  const state = {
    story: story as unknown,
    session: session as unknown,
    turns: turns as unknown,
    post: generation(),
    poll: generation({ status: 'completed', text: '@윤슬: 반가워', next_offset: 9, assistant_message: reply }),
  };
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === `${BASE}/stories/7`) return json(state.story);
    if (url === `${BASE}/sessions/19`) return json(state.session);
    if (url === `${BASE}/sessions/19/turns`) return json(state.turns);
    if (url === `${BASE}/sessions/19/messages`) return json(state.post, 202);
    if (url.startsWith(`${BASE}/generations/`)) return json(state.poll);
    return json({}, 404);
  });
  const turnsCalls = () => fetchMock.mock.calls.filter(([url]) => String(url) === `${BASE}/sessions/19/turns`).length;
  return { state, turnsCalls };
}

const clients: QueryClient[] = [];
const show = (route: ReactElement) => {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{route}</QueryClientProvider>);
};
const roomRating = () => screen.queryByTestId('chat-room-rating');
const roomReady = async () => {
  await screen.findByLabelText('메시지 입력');
  await waitFor(() => expect(screen.queryByText('대화 이력을 불러오는 중…')).not.toBeOnTheScreen());
};

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  jest.restoreAllMocks();
});

describe('스토리 상세', () => {
  it.each(['SAFE', 'UNSAFE'] as const)(
    'CHAT-US-15-AC01: 서버가 준 적용 등급 %s를 그대로 보인다',
    async (rating) => {
      const server = fakeServer();
      server.state.story = { ...story, effective_rating: rating };
      await show(<StoryRoute />);
      expect(await screen.findByText('달빛 정원')).toBeOnTheScreen();
      expect(within(screen.getByTestId('story-rating')).getByText(rating)).toBeOnTheScreen();
      expect(screen.queryByText(rating === 'SAFE' ? 'UNSAFE' : 'SAFE')).not.toBeOnTheScreen();
    },
    20_000, // 첫 React Native 렌더는 콜드 캐시에서 기본 5초를 넘길 수 있다.
  );

  it.each([
    ['null(옛 서버)', null],
    ['키 없음', undefined],
    ['모르는 값', '15세'],
  ])('CHAT-US-15-AC01: 적용 등급이 %s이면 기본값으로 채우지 않고 등급 표시를 숨긴다', async (_, value) => {
    const server = fakeServer();
    const { effective_rating: _omit, ...rest } = story;
    server.state.story = value === undefined ? rest : { ...rest, effective_rating: value };
    await show(<StoryRoute />);
    expect(await screen.findByText('달빛 정원')).toBeOnTheScreen();
    expect(screen.queryByTestId('story-rating')).not.toBeOnTheScreen();
    expect(screen.queryByText(/^(SAFE|UNSAFE|15세)$/)).not.toBeOnTheScreen();
  });
});

describe('대화방', () => {
  it('CHAT-US-15-AC03: 응답이 끝난 뒤 다시 읽은 이력의 적용 등급으로 배지를 바꾸고 따로 알림을 띄우지 않는다', async () => {
    const server = fakeServer();
    await show(<SessionRoute />);
    await roomReady();
    await waitFor(() => expect(within(roomRating()!).getByText('SAFE')).toBeOnTheScreen());
    const before = server.turnsCalls();

    // 대화방이 열린 동안 서버의 적용 등급이 UNSAFE로 바뀌었다. 세션 조회 값(SAFE)은 그대로다.
    server.state.turns = { ...turns, messages: [userMessage, reply], effective_rating: 'UNSAFE' };
    await fireEvent.changeText(screen.getByLabelText('메시지 입력'), '안녕');
    await fireEvent.press(screen.getByRole('button', { name: '메시지 전송' }));

    await waitFor(() => expect(within(roomRating()!).getByText('UNSAFE')).toBeOnTheScreen());
    expect(server.turnsCalls()).toBeGreaterThan(before);
    expect(within(roomRating()!).queryByText('SAFE')).not.toBeOnTheScreen();
    expect(screen.queryByText(/등급/)).not.toBeOnTheScreen();

    // 다음 응답에서 다시 바뀌어도 그 값을 따른다(처음 값에 고정하지 않음).
    server.state.turns = {
      ...turns,
      messages: [userMessage, reply, { ...userMessage, id: 7 }, { ...reply, id: 8 }],
      effective_rating: 'SAFE',
    };
    server.state.post = generation({ id: 10, user_message_id: 7 });
    server.state.poll = generation({
      id: 10,
      user_message_id: 7,
      status: 'completed',
      text: '@윤슬: 반가워',
      next_offset: 9,
      assistant_message: { ...reply, id: 8 },
    });
    await fireEvent.changeText(screen.getByLabelText('메시지 입력'), '또 안녕');
    await fireEvent.press(screen.getByRole('button', { name: '메시지 전송' }));
    await waitFor(() => expect(within(roomRating()!).getByText('SAFE')).toBeOnTheScreen());
  }, 20_000);

  it('CHAT-US-15-AC01·AC03: 이력이 세션 조회와 다른 값을 주면 이력 값을 보인다', async () => {
    const server = fakeServer();
    server.state.turns = { ...turns, effective_rating: 'UNSAFE' };
    await show(<SessionRoute />);
    await roomReady();
    await waitFor(() => expect(within(roomRating()!).getByText('UNSAFE')).toBeOnTheScreen());
    expect(screen.queryByText('SAFE')).not.toBeOnTheScreen();
  });

  it('CHAT-US-15-AC03: 옛 서버처럼 이력에 적용 등급이 없으면 세션 값으로 채우지 않고 배지를 숨긴다', async () => {
    const server = fakeServer();
    const { effective_rating: _omit, ...oldTurns } = turns;
    server.state.turns = oldTurns;
    await show(<SessionRoute />);
    await roomReady();
    expect(screen.getByText('달빛 정원')).toBeOnTheScreen();
    expect(roomRating()).not.toBeOnTheScreen();
    expect(screen.queryByText(/^(SAFE|UNSAFE)$/)).not.toBeOnTheScreen();
  });
});
