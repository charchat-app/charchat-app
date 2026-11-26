// CHAT-US-13 (KAN-23) 대화 중 모델 변경: 목록·변경·생성 중 안내·실패 표시·재시도 모델 안내
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import SessionRoute from '@/app/chat-session/[sessionId]';
import type {
  ChatGeneration,
  ChatMessage,
  ChatModelList,
  ChatTurns,
  ConversationSession,
  SessionModelChange,
} from '@/shared/story-types';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ sessionId: '19' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
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
const MODELS: ChatModelList = {
  models: [
    { id: 1, name: '루나' },
    { id: 2, name: '테라' },
  ],
  default_model_id: 1,
};
const NAME_OF: Record<number, string> = { 1: '루나', 2: '테라' };
const session: ConversationSession = {
  id: 19,
  story_title: '달빛 정원',
  model: '루나',
  read_only: false,
  play_name: '여행자',
  messages: [{ speaker_kind: 'narrator', speaker_name: null, body: '문이 열렸다.' }],
  characters: [{ id: 2, name: '윤슬' }],
};
const emptyTurns: ChatTurns = {
  messages: [],
  active_generation: null,
  last_failed_generation: null,
  model: '루나',
  model_id: 1,
};
const userMessage: ChatMessage = {
  id: 5,
  role: 'user',
  parts: [{ speaker_kind: 'user', character_id: null, speaker_name: '여행자', body: '첫 메시지' }],
  created_at: '2026-11-22T00:00:00Z',
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

type Call = { url: string; method: string; body: unknown };
type Deferred = { resolve: (value: Response) => void; reject: (error: unknown) => void };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const problem = (status: number, code: string) =>
  new Response(JSON.stringify({ status, code, detail: code }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });

/** 서버 흉내. 모델 변경은 세션 모델만 바꾸고 진행 중 생성은 그대로 둔다(서버 계약). */
function fakeServer() {
  const calls: Call[] = [];
  const polls: Deferred[] = [];
  const state = { turns: emptyTurns as ChatTurns, sessionBody: session as ConversationSession };
  const wait = (queue: Deferred[], signal?: AbortSignal | null) =>
    new Promise<Response>((resolve, reject) => {
      queue.push({ resolve, reject });
      signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
  const onModels = jest.fn<Promise<Response> | Response, [Call]>(() => json(MODELS));
  const onPut = jest.fn<Promise<Response> | Response, [Call]>(({ body }) => {
    const modelId = (body as { model_id: number }).model_id;
    const active = state.turns.active_generation;
    state.turns = { ...state.turns, model: NAME_OF[modelId], model_id: modelId };
    const change: SessionModelChange = {
      model_id: modelId,
      model: NAME_OF[modelId],
      active_generation: active ? { id: active.id, model: active.model } : null,
    };
    return json(change);
  });
  const onPost = jest.fn<Promise<Response> | Response, [Call]>(() =>
    json(generation({ model: state.turns.model }), 202),
  );
  const onRetry = jest.fn<Promise<Response> | Response, [Call]>(() =>
    json(generation({ id: 10, model: state.turns.model }), 202),
  );
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : null,
    };
    calls.push(call);
    if (url === `${BASE}/sessions/19`) return json(state.sessionBody);
    if (url === `${BASE}/sessions/19/turns`) return json(state.turns);
    if (url === `${BASE}/models`) return onModels(call);
    if (url === `${BASE}/sessions/19/model`) return onPut(call);
    if (url === `${BASE}/sessions/19/messages`) return onPost(call);
    if (url.endsWith('/retry')) return onRetry(call);
    if (url.startsWith(`${BASE}/generations/`)) return wait(polls, init?.signal);
    return json({}, 404);
  });
  return {
    calls,
    state,
    onModels,
    onPut,
    onPost,
    onRetry,
    puts: () => calls.filter(({ url }) => url === `${BASE}/sessions/19/model`),
    answerPoll: async (body: ChatGeneration) => {
      await waitFor(() => expect(polls.length).toBeGreaterThan(0));
      const next = polls.shift();
      await act(async () => next?.resolve(json(body)));
    },
  };
}

const clients: QueryClient[] = [];
const newClient = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  clients.push(client);
  return client;
};
const show = (client = newClient()) =>
  render(
    <QueryClientProvider client={client}>
      <SessionRoute />
    </QueryClientProvider>,
  );

const input = () => screen.getByLabelText('메시지 입력');
const sendButton = () => screen.getByRole('button', { name: '메시지 전송' });
const changeButton = () => screen.getByRole('button', { name: '대화 모델 변경' });
const option = (name: string) => screen.getByRole('radio', { name: `${name} 모델 선택` });
const ready = async () => {
  await screen.findByLabelText('메시지 입력');
  await waitFor(() => expect(screen.queryByText('대화 이력을 불러오는 중…')).not.toBeOnTheScreen());
  await waitFor(() => expect(screen.queryByText('대화 이력을 불러온 뒤 보낼 수 있습니다.')).not.toBeOnTheScreen());
};
const openModels = async () => {
  await fireEvent.press(changeButton());
  await screen.findByLabelText('대화 모델 목록');
};

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  jest.restoreAllMocks();
});

it('CHAT-US-13-AC01: 모델 목록을 펼치면 지원 모델을 보이고 현재 모델을 선택 표시한다', async () => {
  const server = fakeServer();
  server.state.turns = { ...emptyTurns, model: '테라', model_id: 2 };
  await show();
  await ready();
  expect(await screen.findByText('모델: 테라')).toBeOnTheScreen();
  // 현재 모델 표시 자체가 변경 버튼이다(별도 버튼 없음). ▾는 닫힘, ▴는 펼침.
  expect(changeButton()).toHaveTextContent('모델: 테라▾');
  expect(changeButton()).not.toBeExpanded();
  // 목록은 펼칠 때만 읽는다.
  expect(server.onModels).not.toHaveBeenCalled();
  await openModels();
  expect(changeButton()).toHaveTextContent('모델: 테라▴');
  expect(changeButton()).toBeExpanded();
  const list = screen.getByLabelText('대화 모델 목록');
  expect(
    within(list)
      .getAllByRole('radio')
      .map((item) => item.props.accessibilityLabel),
  ).toEqual(['루나 모델 선택', '테라 모델 선택']);
  expect(option('테라')).toBeChecked();
  expect(option('루나')).not.toBeChecked();
  // 이미 쓰는 모델을 누르면 요청 없이 닫는다.
  await fireEvent.press(option('테라'));
  expect(screen.queryByLabelText('대화 모델 목록')).not.toBeOnTheScreen();
  expect(server.puts()).toHaveLength(0);
}, 20_000); // 첫 React Native 렌더는 콜드 캐시에서 기본 5초를 넘길 수 있다.

it('CHAT-US-13-AC01: 다른 모델을 고르면 model_id로 바꾸고, 표시 모델·내 대화 목록을 갱신하며 다음 답변 안내를 남긴다', async () => {
  const server = fakeServer();
  const client = newClient();
  const listKey = ['conversation', 'sessions', null];
  client.setQueryData(listKey, { pages: [], pageParams: [] });
  await show(client);
  await ready();
  expect(screen.getByText('모델: 루나')).toBeOnTheScreen();
  await openModels();
  expect(option('루나')).toBeChecked();
  await fireEvent.press(option('테라'));

  await waitFor(() => expect(server.puts()).toHaveLength(1));
  expect(server.puts()[0]).toMatchObject({ method: 'PUT', body: { model_id: 2 } });
  expect(await screen.findByText('모델: 테라')).toBeOnTheScreen();
  expect(screen.queryByText('모델: 루나')).not.toBeOnTheScreen();
  expect(screen.getByText('다음 답변부터 테라를 써요.')).toBeOnTheScreen();
  expect(screen.queryByLabelText('대화 모델 목록')).not.toBeOnTheScreen();
  expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);

  // 다시 펼치면 새 모델이 선택돼 있다.
  await openModels();
  expect(option('테라')).toBeChecked();
});

it('CHAT-US-13-AC01: 바꾼 뒤 보낸 다음 메시지는 새 모델로 처리되고 그 모델 이름으로 진행을 표시한다', async () => {
  const server = fakeServer();
  await show();
  await ready();
  await openModels();
  await fireEvent.press(option('테라'));
  expect(await screen.findByText('모델: 테라')).toBeOnTheScreen();

  await fireEvent.changeText(input(), '첫 메시지');
  server.state.turns = {
    ...server.state.turns,
    messages: [userMessage],
    active_generation: generation({ model: '테라' }),
  };
  await fireEvent.press(sendButton());
  await waitFor(() => expect(server.onPost).toHaveBeenCalledTimes(1));
  expect(await screen.findByLabelText('응답 생성 중')).toHaveTextContent('...');
  expect(await screen.findByText('테라 답변 중')).toBeOnTheScreen();
  expect(screen.queryByText('루나 답변 중')).not.toBeOnTheScreen();
});

it('CHAT-US-13-AC02: 응답 생성 중에도 바꿀 수 있고, 진행 중 답변은 기존 모델로 끝까지 만든다고 안내한다', async () => {
  const server = fakeServer();
  server.state.turns = {
    ...emptyTurns,
    messages: [userMessage],
    active_generation: generation({ status: 'streaming', model: '루나' }),
  };
  let releasePut: (() => void) | undefined;
  server.onPut.mockImplementationOnce(({ body }) => {
    const modelId = (body as { model_id: number }).model_id;
    return new Promise<Response>((resolve) => {
      releasePut = () => {
        server.state.turns = { ...server.state.turns, model: NAME_OF[modelId], model_id: modelId };
        resolve(json({ model_id: modelId, model: NAME_OF[modelId], active_generation: { id: 9, model: '루나' } }));
      };
    });
  });
  await show();
  await ready();
  expect(await screen.findByText('루나 답변 중')).toBeOnTheScreen();
  expect(sendButton()).toBeDisabled();

  await openModels();
  await fireEvent.press(option('테라'));
  // 변경 요청 중에는 목록을 누를 수 없다.
  await waitFor(() => expect(option('루나')).toBeDisabled());
  expect(option('테라')).toBeDisabled();
  await act(async () => releasePut?.());

  expect(
    await screen.findByText('지금 만드는 답변은 루나로 끝까지 만들고, 다음 답변부터 테라를 써요.'),
  ).toBeOnTheScreen();
  expect(screen.getByText('모델: 테라')).toBeOnTheScreen();
  // 진행 중 생성의 모델 표시는 바뀌지 않는다.
  expect(screen.getByLabelText('응답 생성 중')).toBeOnTheScreen();
  expect(screen.getByText('루나 답변 중')).toBeOnTheScreen();
  expect(screen.queryByText('테라 답변 중')).not.toBeOnTheScreen();
  expect(server.puts()).toHaveLength(1);
});

it('CHAT-US-13-AC02: 모델을 바꾸지 못하면 오류를 알리고 기존 모델 표시를 그대로 둔다', async () => {
  const server = fakeServer();
  server.onPut.mockImplementationOnce(() => problem(422, 'CONVERSATION_MODEL_NOT_FOUND'));
  await show();
  await ready();
  await openModels();
  await fireEvent.press(option('테라'));

  expect(await screen.findByText('모델을 바꾸지 못했어요. 다시 시도해 주세요.')).toBeOnTheScreen();
  expect(screen.getByText('모델: 루나')).toBeOnTheScreen();
  expect(screen.queryByText(/다음 답변부터/)).not.toBeOnTheScreen();
  // 목록은 열린 채 기존 모델이 선택돼 있어 다시 고를 수 있다.
  expect(option('루나')).toBeChecked();
  expect(option('테라')).toBeEnabled();

  await fireEvent.press(option('테라'));
  expect(await screen.findByText('다음 답변부터 테라를 써요.')).toBeOnTheScreen();
  expect(screen.queryByText('모델을 바꾸지 못했어요. 다시 시도해 주세요.')).not.toBeOnTheScreen();
  expect(server.puts()).toHaveLength(2);
});

it('CHAT-US-13-AC01: 모델 목록을 읽지 못하면 다시 불러올 수 있고, 빈 목록은 따로 안내한다', async () => {
  const server = fakeServer();
  server.onModels.mockImplementationOnce(() => problem(500, 'INTERNAL'));
  server.onModels.mockImplementationOnce(() => json({ models: [], default_model_id: null }));
  await show();
  await ready();
  await fireEvent.press(changeButton());
  expect(await screen.findByText('모델 목록을 불러오지 못했어요.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: '모델 목록 다시 불러오기' }));
  expect(await screen.findByText('고를 수 있는 모델이 없어요.')).toBeOnTheScreen();
  expect(screen.queryByRole('radio')).not.toBeOnTheScreen();
  expect(server.puts()).toHaveLength(0);
});

it('CHAT-US-13-AC01: 읽기 전용 대화는 모델 이름만 보이고 변경 버튼이 없다', async () => {
  const server = fakeServer();
  server.state.sessionBody = { ...session, read_only: true };
  await show();
  expect(await screen.findByText('읽기 전용')).toBeOnTheScreen();
  expect(await screen.findByText('모델: 루나')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '대화 모델 변경' })).not.toBeOnTheScreen();
  expect(screen.queryByLabelText('대화 모델 목록')).not.toBeOnTheScreen();
  expect(server.onModels).not.toHaveBeenCalled();
});

it('CHAT-US-13-AC03: 실패한 생성의 모델을 보이고, 지금 선택 모델이 다르면 재시도가 그 모델로 요청된다고 알린다', async () => {
  const server = fakeServer();
  const failed = generation({ status: 'failed', retryable: true, model: '루나' });
  server.state.turns = { ...emptyTurns, messages: [userMessage], last_failed_generation: failed };
  await show();
  await ready();
  expect(
    await screen.findByText('루나 응답을 생성하지 못했습니다. 보낸 메시지는 그대로 남아 있습니다.'),
  ).toBeOnTheScreen();
  // 같은 모델이면 따로 알리지 않는다.
  expect(screen.queryByText(/다시 시도하면/)).not.toBeOnTheScreen();

  await openModels();
  await fireEvent.press(option('테라'));
  expect(await screen.findByText('모델: 테라')).toBeOnTheScreen();
  const notice = screen.getByTestId('generation-notice');
  // 실패 안내의 모델은 실패한 생성 그대로다. 몰래 바꾸지 않고 재시도 모델을 미리 알린다.
  expect(
    within(notice).getByText('루나 응답을 생성하지 못했습니다. 보낸 메시지는 그대로 남아 있습니다.'),
  ).toBeOnTheScreen();
  expect(within(notice).getByText('다시 시도하면 테라로 요청해요.')).toBeOnTheScreen();

  server.state.turns = {
    ...server.state.turns,
    last_failed_generation: null,
    active_generation: generation({ id: 10, model: '테라' }),
  };
  await fireEvent.press(screen.getByRole('button', { name: '응답 생성 다시 시도' }));
  await waitFor(() => expect(server.onRetry).toHaveBeenCalledTimes(1));
  expect(server.onRetry.mock.calls[0][0]).toMatchObject({ url: `${BASE}/generations/9/retry`, method: 'POST' });
  expect(await screen.findByText('테라 답변 중')).toBeOnTheScreen();
  expect(screen.queryByTestId('generation-notice')).not.toBeOnTheScreen();
});

it('CHAT-US-13-AC03: 다른 모델로 실패한 생성은 재시도할 수 없는 끊김이면 재시도 안내 없이 모델만 보인다', async () => {
  const server = fakeServer();
  server.state.turns = {
    ...emptyTurns,
    model: '테라',
    model_id: 2,
    messages: [userMessage],
    last_failed_generation: generation({ status: 'failed_partial', text: '@윤슬: 반쯤', model: '루나' }),
  };
  await show();
  await ready();
  expect(await screen.findByText('루나 응답이 중간에 끊겼습니다.')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '응답 생성 다시 시도' })).not.toBeOnTheScreen();
  expect(screen.queryByText(/다시 시도하면/)).not.toBeOnTheScreen();
  expect(server.onRetry).not.toHaveBeenCalled();
});
