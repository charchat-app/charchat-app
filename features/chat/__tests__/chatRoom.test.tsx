// CHAT-US-02 (KAN-17) 메시지 보내고 응답 읽기: 대화방 입력창·스트리밍·실패 안내
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import SessionRoute from '@/app/chat-session/[sessionId]';
import type { ChatGeneration, ChatMessage, ChatTurns, ConversationSession } from '@/shared/story-types';

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
const session: ConversationSession = {
  id: 19,
  story_title: '달빛 정원',
  model: null,
  read_only: false,
  play_name: '여행자',
  messages: [{ speaker_kind: 'narrator', speaker_name: null, body: '문이 열렸다.' }],
  characters: [
    { id: 2, name: '윤슬' },
    { id: 3, name: '서윤' },
  ],
};
const emptyTurns: ChatTurns = {
  messages: [],
  active_generation: null,
  last_failed_generation: null,
  model: 'fake-echo',
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
  model: 'fake-echo',
  ...overrides,
});

type Deferred = { resolve: (value: Response) => void; reject: (error: unknown) => void; signal?: AbortSignal | null };
type Call = { url: string; method: string; body: unknown; signal?: AbortSignal | null };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** 서버 흉내: 경로별 응답을 테스트가 정한다. 롱 폴링은 테스트가 풀어 줄 때까지 기다린다. */
function fakeServer() {
  const calls: Call[] = [];
  const polls: Deferred[] = [];
  const posts: Deferred[] = [];
  const state = { turns: emptyTurns as ChatTurns, sessionBody: session as ConversationSession, holdPosts: false };
  const wait = (queue: Deferred[], signal?: AbortSignal | null) =>
    new Promise<Response>((resolve, reject) => {
      queue.push({ resolve, reject, signal });
      signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
  const onPost = jest.fn<Promise<Response> | Response, [Call]>(() => json(generation(), 202));
  const onRetry = jest.fn<Promise<Response> | Response, [Call]>(() => json(generation({ id: 10 }), 202));
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : null,
      signal: init?.signal,
    };
    calls.push(call);
    if (url === `${BASE}/sessions/19`) return json(state.sessionBody);
    if (url === `${BASE}/sessions/19/turns`) return json(state.turns);
    if (url === `${BASE}/sessions/19/messages`) return state.holdPosts ? wait(posts, init?.signal) : onPost(call);
    if (url.endsWith('/retry')) return onRetry(call);
    if (url.startsWith(`${BASE}/generations/`)) return wait(polls, init?.signal);
    return json({}, 404);
  });
  return {
    calls,
    state,
    onPost,
    onRetry,
    posts,
    polls,
    pollUrls: () =>
      calls.filter(({ url }) => url.includes('/generations/') && !url.endsWith('/retry')).map((c) => c.url),
    postBodies: () => calls.filter(({ url }) => url.endsWith('/messages')).map(({ body }) => body),
    /** 다음 롱 폴링 응답을 돌려준다. */
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
const chips = () => screen.queryAllByRole('button', { name: /로 말하기$/ });
/** 입력창 끝에 이어 친다(사용자가 한 글자씩 치는 것과 같은 값 변화). */
const type = async (more: string) => fireEvent.changeText(input(), `${input().props.value}${more}`);
/** 입력창 끝에 `@`를 치고 칩을 누른다. */
const speakAs = async (label: string) => {
  await type('@');
  await fireEvent.press(screen.getByRole('button', { name: label }));
};
const ready = async () => {
  await screen.findByLabelText('메시지 입력');
  await waitFor(() => expect(screen.queryByText('대화 이력을 불러오는 중…')).not.toBeOnTheScreen());
  await waitFor(() => expect(screen.queryByText('대화 이력을 불러온 뒤 보낼 수 있습니다.')).not.toBeOnTheScreen());
};

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  jest.restoreAllMocks();
});

it('CHAT-US-02-AC01: 화자를 고르지 않으면 유저 캐릭터로 보내고, `@`를 치면 입력창 위에 나레이터·유저·모든 등장 캐릭터 칩이 뜬다', async () => {
  const server = fakeServer();
  await show();
  await ready();
  // 따로 있는 화자 버튼·앞 내용 카드는 없다.
  expect(screen.queryByRole('button', { name: /발화자/ })).not.toBeOnTheScreen();
  expect(input().props.placeholder).toBe('내용 입력하기 (@로 화자 바꾸기)');
  expect(chips()).toHaveLength(0);
  await type('@');
  // 제타 순서: 나레이터, 유저(플레이 이름), 캐릭터들. `@`는 입력창에 남는다.
  expect(chips().map((chip) => chip.props.accessibilityLabel)).toEqual([
    '나레이터로 말하기',
    '여행자로 말하기',
    '윤슬로 말하기',
    '서윤으로 말하기',
  ]);
  expect(input()).toHaveDisplayValue('@');
  // 칩을 누르지 않고 지우면 칩 줄을 닫는다.
  await fireEvent.changeText(input(), '');
  expect(chips()).toHaveLength(0);
  await fireEvent.changeText(input(), '첫 메시지');
  await fireEvent.press(sendButton());
  await waitFor(() => expect(server.postBodies()).toHaveLength(1));
  expect(server.postBodies()[0]).toEqual({
    request_id: expect.stringMatching(/^[A-Za-z0-9_-]{8,64}$/),
    parts: [{ speaker_kind: 'user', character_id: null, body: '첫 메시지' }],
  });
}, 20_000); // 첫 React Native 렌더는 콜드 캐시에서 기본 5초를 넘길 수 있다.

it('CHAT-US-02-AC01·AC02: `@`로 칩을 골라 한 입력창에 `@이름:` 줄을 쌓아 여러 화자를 한 번에 순서대로 보내고, 보낸 뒤에는 유저로 돌아온다', async () => {
  const server = fakeServer();
  await show();
  await ready();
  await type('안녕');
  // 줄 중간에서 칩을 고르면 새 줄에서 `@윤슬: `로 시작하고 커서는 태그 뒤에 둔다.
  await speakAs('윤슬로 말하기');
  expect(input()).toHaveDisplayValue('안녕\n@윤슬: ');
  expect(input().props.selection).toEqual({ start: 8, end: 8 });
  expect(chips()).toHaveLength(0);
  await type('*웃는다* 반가워\n');
  await speakAs('나레이터로 말하기');
  await type('바람이 분다');
  expect(input()).toHaveDisplayValue('안녕\n@윤슬: *웃는다* 반가워\n@나레이터: 바람이 분다');
  // 글자 수는 `@이름: ` 접두어를 빼고 본문만 센다: 2 + 9 + 6
  expect(screen.getByText('17 / 5,000자')).toBeOnTheScreen();

  await fireEvent.press(sendButton());
  await waitFor(() => expect(server.postBodies()).toHaveLength(1));
  expect(server.postBodies()[0]).toMatchObject({
    parts: [
      { speaker_kind: 'user', character_id: null, body: '안녕' },
      { speaker_kind: 'character', character_id: 2, body: '*웃는다* 반가워' },
      { speaker_kind: 'narrator', character_id: null, body: '바람이 분다' },
    ],
  });
  expect(input()).toHaveDisplayValue('');
  // 다음 입력은 태그 없이 쓰면 다시 유저 대사다.
  await type('다음 말');
  expect(input()).toHaveDisplayValue('다음 말');
});

it('CHAT-US-02-AC02: 칩 줄은 다른 글자를 치면 닫히고, 줄 맨 앞의 `@`는 줄바꿈 없이 그 자리에서 태그가 된다', async () => {
  fakeServer();
  await show();
  await ready();
  await type('@');
  expect(chips()).toHaveLength(4);
  await type('a');
  expect(chips()).toHaveLength(0);
  // 붙여넣기처럼 여러 글자가 한꺼번에 들어오면 칩 줄을 열지 않는다.
  await fireEvent.changeText(input(), '@a\n@@');
  expect(chips()).toHaveLength(0);
  await fireEvent.changeText(input(), '첫 줄\n');
  await speakAs('서윤으로 말하기');
  expect(input()).toHaveDisplayValue('첫 줄\n@서윤: ');
  // 커서를 옮기면 지정했던 커서 위치를 풀어 이용자가 움직인 곳을 따른다.
  await fireEvent(input(), 'selectionChange', { nativeEvent: { selection: { start: 1, end: 1 } } });
  expect(input().props.selection).toBeUndefined();
});

it('CHAT-US-02-AC03: 저장된 메시지의 *서술*은 기울임, **강조**는 굵게, 나머지는 일반 대사로 기호 없이 표시한다', async () => {
  const server = fakeServer();
  server.state.turns = {
    ...emptyTurns,
    messages: [
      {
        id: 6,
        role: 'assistant',
        parts: [
          { speaker_kind: 'character', character_id: 2, speaker_name: '윤슬', body: '*고개를 든다* 정말 **반가워**' },
        ],
        created_at: '2026-11-22T00:00:01Z',
      },
    ],
  };
  await show();
  const bubble = await screen.findByTestId('chat-message-bubble');
  expect(bubble).toHaveTextContent('윤슬고개를 든다 정말 반가워');
  expect(within(bubble).getByTestId('formatted-italic')).toHaveTextContent('고개를 든다');
  expect(within(bubble).getByTestId('formatted-bold')).toHaveTextContent('반가워');
});

it('CHAT-US-02-AC04: 빈 입력은 이유를 안내하고 전송하지 않는다', async () => {
  const server = fakeServer();
  await show();
  await ready();
  await fireEvent.press(sendButton());
  expect(screen.getByText('보낼 내용을 입력하세요.')).toBeOnTheScreen();
  await fireEvent.changeText(input(), '   \n ');
  await fireEvent.press(sendButton());
  expect(screen.getByText('보낼 내용을 입력하세요.')).toBeOnTheScreen();
  expect(server.postBodies()).toHaveLength(0);
});

it('CHAT-US-02-AC04: 모든 발화자 본문 합산 5,000자를 넘는 입력은 입력창에서 막고 기존 내용을 지킨다', async () => {
  fakeServer();
  await show();
  await ready();
  await fireEvent.changeText(input(), 'a'.repeat(4990));
  await speakAs('나레이터로 말하기');
  // `@나레이터: ` 접두어는 세지 않는다.
  expect(screen.getByText('4,990 / 5,000자')).toBeOnTheScreen();
  await type('b'.repeat(25));
  expect(input()).toHaveDisplayValue(`${'a'.repeat(4990)}\n@나레이터: ${'b'.repeat(10)}`);
  expect(screen.getByText('5,000 / 5,000자')).toBeOnTheScreen();
  // 한도 안에서 지우고 고칠 수 있다.
  await fireEvent.changeText(input(), `${'a'.repeat(4990)}\n@나레이터: bbbb`);
  expect(input()).toHaveDisplayValue(`${'a'.repeat(4990)}\n@나레이터: bbbb`);
  expect(screen.getByText('4,994 / 5,000자')).toBeOnTheScreen();
});

it('CHAT-US-02-AC05·AC06·AC08·AC09·AC12: 생성 중 진행 표시와 스트리밍, 작성은 허용하고 전송은 막으며 완료 응답을 저장 이력으로 표시한다', async () => {
  const server = fakeServer();
  await show();
  await ready();
  await fireEvent.changeText(input(), '첫 메시지');
  server.state.turns = { ...emptyTurns, messages: [userMessage], active_generation: generation() };
  await fireEvent.press(sendButton());

  // AC05: 보낸 내용은 입력창에서 비운다. AC08: 위쪽 중앙 `...` 진행 표시
  expect(input()).toHaveDisplayValue('');
  expect(await screen.findByLabelText('응답 생성 중')).toHaveTextContent('...');
  expect(await screen.findByTestId('chat-message-bubble')).toHaveTextContent('여행자첫 메시지');
  // AC06: 작성·수정은 되고 전송은 막는다.
  await fireEvent.changeText(input(), '다음 메시지');
  expect(input()).toHaveDisplayValue('다음 메시지');
  expect(sendButton()).toBeDisabled();
  expect(screen.getByText('AI 응답이 끝나면 보낼 수 있습니다.')).toBeOnTheScreen();
  await fireEvent.press(sendButton());
  expect(server.postBodies()).toHaveLength(1);
  // AC12: 취소·중단 수단이 없다.
  expect(screen.queryByRole('button', { name: /취소|중단|멈춤/ })).not.toBeOnTheScreen();

  // AC09: offset부터 이어 받아 순서대로 표시한다.
  await server.answerPoll(generation({ status: 'streaming', text: '@윤슬: 안', next_offset: 6 }));
  expect(await screen.findByTestId('chat-streaming-bubble')).toHaveTextContent('윤슬안');
  await server.answerPoll(generation({ status: 'streaming', text: '녕\n@나레이터: 바람', next_offset: 16 }));
  await waitFor(() => expect(screen.getAllByTestId('chat-streaming-bubble')).toHaveLength(2));
  expect(screen.getAllByTestId('chat-streaming-bubble')[0]).toHaveTextContent('윤슬안녕');
  expect(screen.getAllByTestId('chat-streaming-bubble')[1]).toHaveTextContent('나레이터바람');
  expect(server.pollUrls()).toEqual([
    `${BASE}/generations/9?offset=0&wait=10`,
    `${BASE}/generations/9?offset=6&wait=10`,
    `${BASE}/generations/9?offset=16&wait=10`,
  ]);

  const reply: ChatMessage = {
    id: 6,
    role: 'assistant',
    parts: [
      { speaker_kind: 'character', character_id: 2, speaker_name: '윤슬', body: '안녕' },
      { speaker_kind: 'narrator', character_id: null, speaker_name: null, body: '바람이 분다.' },
    ],
    created_at: '2026-11-22T00:00:02Z',
  };
  server.state.turns = { ...emptyTurns, messages: [userMessage, reply], model: 'model-after-reply' };
  await server.answerPoll(
    generation({ status: 'completed', text: '이 분다.', next_offset: 20, assistant_message: reply }),
  );

  await waitFor(() => expect(screen.queryByLabelText('응답 생성 중')).not.toBeOnTheScreen());
  expect(screen.queryByTestId('chat-streaming-bubble')).not.toBeOnTheScreen();
  await waitFor(() => expect(screen.getAllByTestId('chat-message-bubble')).toHaveLength(3));
  expect(screen.getAllByTestId('chat-message-bubble')[2]).toHaveTextContent('나레이터바람이 분다.');
  expect(await screen.findByText('모델: model-after-reply')).toBeOnTheScreen();
  // AC05·AC06: 완료돼도 새로 쓴 내용은 그대로이고 이제 보낼 수 있다.
  expect(input()).toHaveDisplayValue('다음 메시지');
  expect(sendButton()).toBeEnabled();
  expect(server.pollUrls()).toHaveLength(3);
});

it('CHAT-US-02-AC10: 전송 버튼을 연속으로 눌러도 요청 ID 하나로 한 번만 보낸다', async () => {
  const server = fakeServer();
  server.state.holdPosts = true;
  await show();
  await ready();
  await fireEvent.changeText(input(), '한 번만');
  await act(async () => {
    await fireEvent.press(sendButton());
    await fireEvent.press(sendButton());
  });
  expect(server.postBodies()).toHaveLength(1);
  expect(sendButton()).toBeDisabled();
  expect(screen.getByTestId('chat-pending-bubble')).toHaveTextContent('여행자한 번만');
  server.state.turns = { ...emptyTurns, messages: [userMessage], active_generation: generation() };
  await act(async () => server.posts.shift()?.resolve(json(generation(), 202)));
  await waitFor(() => expect(screen.getByLabelText('응답 생성 중')).toBeOnTheScreen());
  expect(server.postBodies()).toHaveLength(1);
});

it('CHAT-US-02-AC14·AC15: 접수 결과를 모르면 새 요청을 만들지 않고 같은 요청 ID로 확인한다', async () => {
  const server = fakeServer();
  server.onPost.mockImplementationOnce(() => Promise.reject(new TypeError('network lost')));
  await show();
  await ready();
  await fireEvent.changeText(input(), '확인할 메시지');
  await fireEvent.press(sendButton());
  const confirm = await screen.findByRole('button', { name: '보낸 메시지 접수 확인' });
  expect(screen.getByText(/접수 여부를 확인하지 못했습니다/)).toBeOnTheScreen();
  expect(screen.getByTestId('chat-pending-bubble')).toHaveTextContent('여행자확인할 메시지');
  expect(sendButton()).toBeDisabled();
  expect(server.postBodies()).toHaveLength(1);

  server.state.turns = { ...emptyTurns, messages: [userMessage], active_generation: generation() };
  await fireEvent.press(confirm);
  await waitFor(() => expect(server.postBodies()).toHaveLength(2));
  const [first, second] = server.postBodies() as { request_id: string; parts: unknown }[];
  expect(second).toEqual(first);
  expect(await screen.findByLabelText('응답 생성 중')).toBeOnTheScreen();
});

it('CHAT-US-02-AC15·AC16·AC05: 실패하면 안내와 재시도 버튼만 보이고, 누를 때 새 요청 ID로 재시도하며 새 입력은 지키지 않는다', async () => {
  const server = fakeServer();
  server.state.turns = { ...emptyTurns, messages: [userMessage], active_generation: generation() };
  await show();
  await ready();
  await fireEvent.changeText(input(), '생성 중에 쓴 다음 입력');

  const failed = generation({ status: 'failed', retryable: true, error_code: 'PROVIDER_ERROR' });
  server.state.turns = { ...emptyTurns, messages: [userMessage], last_failed_generation: failed };
  await server.answerPoll(failed);

  expect(
    await screen.findByText('fake-echo 응답을 생성하지 못했습니다. 보낸 메시지는 그대로 남아 있습니다.'),
  ).toBeOnTheScreen();
  expect(screen.getByTestId('chat-message-bubble')).toHaveTextContent('여행자첫 메시지');
  const retry = screen.getByRole('button', { name: '응답 생성 다시 시도' });
  expect(retry).toHaveTextContent('다시 시도');
  // 자동으로 다시 호출하지 않는다.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
  expect(server.onRetry).not.toHaveBeenCalled();
  expect(input()).toHaveDisplayValue('생성 중에 쓴 다음 입력');

  server.state.turns = { ...emptyTurns, messages: [userMessage], active_generation: generation({ id: 10 }) };
  await fireEvent.press(retry);
  await waitFor(() => expect(server.onRetry).toHaveBeenCalledTimes(1));
  expect(server.onRetry.mock.calls[0][0]).toMatchObject({
    url: `${BASE}/generations/9/retry`,
    method: 'POST',
    body: { request_id: expect.stringMatching(/^[A-Za-z0-9_-]{8,64}$/) },
  });
  expect(await screen.findByLabelText('응답 생성 중')).toBeOnTheScreen();
  await waitFor(() => expect(server.pollUrls().at(-1)).toBe(`${BASE}/generations/10?offset=0&wait=10`));
  expect(screen.queryByText(/응답을 생성하지 못했습니다/)).not.toBeOnTheScreen();
  expect(input()).toHaveDisplayValue('생성 중에 쓴 다음 입력');
});

it('CHAT-US-02-AC10·AC15: 재시도 결과를 모르면 다시 눌러도 같은 요청 ID를 쓴다', async () => {
  const server = fakeServer();
  const failed = generation({ status: 'failed', retryable: true });
  server.state.turns = { ...emptyTurns, messages: [userMessage], last_failed_generation: failed };
  server.onRetry.mockImplementationOnce(() => Promise.reject(new TypeError('network lost')));
  await show();
  await fireEvent.press(await screen.findByRole('button', { name: '응답 생성 다시 시도' }));
  expect(await screen.findByText(/재시도 접수 여부를 확인하지 못했습니다/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: '응답 생성 다시 시도' }));
  await waitFor(() => expect(server.onRetry).toHaveBeenCalledTimes(2));
  const ids = server.onRetry.mock.calls.map(([call]) => (call.body as { request_id: string }).request_id);
  expect(ids[1]).toBe(ids[0]);
});

const replyTo5: ChatMessage = {
  id: 6,
  role: 'assistant',
  parts: [{ speaker_kind: 'character', character_id: 2, speaker_name: '윤슬', body: '다시 왔어' }],
  created_at: '2026-11-22T00:00:03Z',
};

it('CHAT-US-02-AC10·AC15: 재시도 응답을 잃었지만 서버가 접수했으면 이력의 새 생성으로 확인을 풀고, 완료 뒤 다음 메시지를 보낼 수 있다', async () => {
  const server = fakeServer();
  const failed = generation({ status: 'failed', retryable: true });
  server.state.turns = { ...emptyTurns, messages: [userMessage], last_failed_generation: failed };
  // 서버는 재시도를 접수했지만(생성 10) 응답이 앱에 오지 않았다.
  server.onRetry.mockImplementationOnce(() => {
    server.state.turns = {
      ...emptyTurns,
      messages: [userMessage],
      active_generation: generation({ id: 10, status: 'streaming' }),
    };
    return Promise.reject(new TypeError('network lost'));
  });
  await show();
  await ready();
  await fireEvent.changeText(input(), '다음 메시지');
  await fireEvent.press(await screen.findByRole('button', { name: '응답 생성 다시 시도' }));

  // 이력을 다시 읽으면 실패 안내는 사라지고 생성 10을 이어 받는다. 확인 대기로 남지 않는다.
  await waitFor(() => expect(server.pollUrls().at(-1)).toBe(`${BASE}/generations/10?offset=0&wait=10`));
  expect(screen.queryByTestId('generation-notice')).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '재시도 접수 확인' })).not.toBeOnTheScreen();
  expect(screen.queryByText('재시도 요청을 처리하는 중입니다.')).not.toBeOnTheScreen();
  expect(screen.getByText('AI 응답이 끝나면 보낼 수 있습니다.')).toBeOnTheScreen();

  server.state.turns = { ...emptyTurns, messages: [userMessage, replyTo5] };
  await server.answerPoll(
    generation({ id: 10, status: 'completed', text: '@윤슬: 다시 왔어', next_offset: 10, assistant_message: replyTo5 }),
  );
  await waitFor(() => expect(screen.queryByLabelText('응답 생성 중')).not.toBeOnTheScreen());
  await waitFor(() => expect(sendButton()).toBeEnabled());
  await fireEvent.press(sendButton());
  await waitFor(() => expect(server.postBodies()).toHaveLength(1));
  expect(server.postBodies()[0]).toMatchObject({ parts: [{ speaker_kind: 'user', body: '다음 메시지' }] });
  expect(server.onRetry).toHaveBeenCalledTimes(1);
});

it('CHAT-US-02-AC10·AC15: 실패 안내가 사라져도 결과를 모르는 재시도는 같은 요청 ID로 확인하고, 완료 뒤 보낼 수 있다', async () => {
  const server = fakeServer();
  const failed = generation({ status: 'failed', retryable: true });
  server.state.turns = { ...emptyTurns, messages: [userMessage], last_failed_generation: failed };
  server.onRetry.mockImplementationOnce(() => {
    // 다시 읽은 이력에는 실패 안내도 새 생성도 아직 보이지 않는다.
    server.state.turns = { ...emptyTurns, messages: [userMessage] };
    return Promise.reject(new TypeError('network lost'));
  });
  await show();
  await ready();
  await fireEvent.press(await screen.findByRole('button', { name: '응답 생성 다시 시도' }));

  const confirm = await screen.findByRole('button', { name: '재시도 접수 확인' });
  expect(screen.queryByTestId('generation-notice')).not.toBeOnTheScreen();
  expect(screen.getByText('재시도 요청을 처리하는 중입니다.')).toBeOnTheScreen();

  server.onRetry.mockImplementationOnce(() => {
    server.state.turns = { ...emptyTurns, messages: [userMessage], active_generation: generation({ id: 10 }) };
    return json(generation({ id: 10 }), 202);
  });
  await fireEvent.press(confirm);
  await waitFor(() => expect(server.onRetry).toHaveBeenCalledTimes(2));
  const [first, second] = server.onRetry.mock.calls.map(([call]) => call);
  expect(second.url).toBe(`${BASE}/generations/9/retry`);
  expect((second.body as { request_id: string }).request_id).toBe((first.body as { request_id: string }).request_id);
  await waitFor(() => expect(screen.queryByRole('button', { name: '재시도 접수 확인' })).not.toBeOnTheScreen());
  await waitFor(() => expect(server.pollUrls().at(-1)).toBe(`${BASE}/generations/10?offset=0&wait=10`));

  server.state.turns = { ...emptyTurns, messages: [userMessage, replyTo5] };
  await server.answerPoll(
    generation({ id: 10, status: 'completed', text: '@윤슬: 다시 왔어', next_offset: 10, assistant_message: replyTo5 }),
  );
  await fireEvent.changeText(input(), '이어서');
  await waitFor(() => expect(sendButton()).toBeEnabled());
  await fireEvent.press(sendButton());
  await waitFor(() => expect(server.postBodies()).toHaveLength(1));
});

it.each([
  ['failed_partial', 'fake-echo 응답이 중간에 끊겼습니다.'],
  ['save_failed', 'fake-echo 응답을 저장하지 못했습니다.'],
] as const)(
  'CHAT-US-02-AC17: 일부 표시 뒤 %s는 구분해 안내하고 재시도·자동 재생성을 제공하지 않는다',
  async (status, message) => {
    const server = fakeServer();
    server.state.turns = {
      ...emptyTurns,
      messages: [userMessage],
      active_generation: generation({ status: 'streaming' }),
    };
    await show();
    await server.answerPoll(generation({ status: 'streaming', text: '@윤슬: 반쯤', next_offset: 7 }));
    expect(await screen.findByTestId('chat-streaming-bubble')).toHaveTextContent('윤슬반쯤');

    const ended = generation({ status, text: '', next_offset: 7, error_code: 'STREAM_ERROR' });
    server.state.turns = {
      ...emptyTurns,
      messages: [userMessage],
      last_failed_generation: { ...ended, text: '@윤슬: 반쯤' },
    };
    await server.answerPoll(ended);

    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(screen.getByTestId('chat-unsaved-bubble')).toHaveTextContent('윤슬반쯤');
    expect(screen.getByText('이 응답은 대화 이력에 저장되지 않았습니다.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /다시 시도/ })).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('응답 생성 중')).not.toBeOnTheScreen();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(server.onRetry).not.toHaveBeenCalled();
    expect(server.postBodies()).toHaveLength(0);
    expect(sendButton()).toBeEnabled();
  },
);

it('CHAT-US-02-AC13·AC14·AC07: 생성 중 나가면 조회만 멈추고, 다시 들어오면 받은 위치부터 이어 받으며 작성 내용도 남아 있다', async () => {
  const server = fakeServer();
  const client = newClient();
  server.state.turns = {
    ...emptyTurns,
    messages: [userMessage],
    active_generation: generation({ status: 'streaming' }),
  };
  const view = await show(client);
  await ready();
  await server.answerPoll(generation({ status: 'streaming', text: '@윤슬: 안', next_offset: 6 }));
  await fireEvent.changeText(input(), '보내지 않은 글');
  await waitFor(() => expect(server.polls).toHaveLength(1));
  const pending = server.calls.at(-1);

  await view.unmount();
  expect(pending?.signal?.aborted).toBe(true);
  // 서버 생성을 취소하는 요청은 없다.
  expect(server.calls.filter(({ method }) => method !== 'GET')).toHaveLength(0);

  server.polls.splice(0);
  await show(client);
  expect(await screen.findByTestId('chat-streaming-bubble')).toHaveTextContent('윤슬안');
  expect(input()).toHaveDisplayValue('보내지 않은 글');
  await waitFor(() => expect(server.pollUrls().at(-1)).toBe(`${BASE}/generations/9?offset=6&wait=10`));
  await server.answerPoll(generation({ status: 'streaming', text: '녕', next_offset: 7 }));
  await waitFor(() => expect(screen.getByTestId('chat-streaming-bubble')).toHaveTextContent('윤슬안녕'));
  // 나가기 전 멈춘 조회 1번과 재진입 뒤 이어 받은 조회 1번뿐이다. 처음(offset=0)부터 다시 받지 않는다.
  expect(server.pollUrls().filter((url) => url.includes('offset=6'))).toHaveLength(2);
  expect(server.pollUrls().filter((url) => url.includes('offset=0'))).toHaveLength(1);
});

it('CHAT-US-02-AC14: 폴링 연결이 끊겨도 실패로 단정하지 않고 같은 생성 상태를 다시 조회한다', async () => {
  jest.useFakeTimers();
  try {
    const server = fakeServer();
    server.state.turns = { ...emptyTurns, messages: [userMessage], active_generation: generation() };
    await show();
    await waitFor(() => expect(server.polls).toHaveLength(1));
    await act(async () => server.polls.shift()?.reject(new TypeError('network lost')));
    expect(screen.queryByText(/생성하지 못했습니다/)).not.toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(2500);
    });
    await waitFor(() => expect(server.pollUrls()).toHaveLength(2));
    expect(server.pollUrls()[1]).toBe(`${BASE}/generations/9?offset=0&wait=10`);
    expect(screen.getByLabelText('응답 생성 중')).toBeOnTheScreen();
  } finally {
    jest.useRealTimers();
  }
});

it('CHAT-US-02: 읽기 전용 대화방에는 입력창이 없고 저장된 이력만 보인다', async () => {
  const server = fakeServer();
  server.state.sessionBody = { ...session, read_only: true };
  server.state.turns = { ...emptyTurns, messages: [userMessage] };
  await show();
  expect(await screen.findByTestId('chat-message-bubble')).toHaveTextContent('여행자첫 메시지');
  expect(screen.queryByLabelText('메시지 입력')).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '메시지 전송' })).not.toBeOnTheScreen();
});

it('CHAT-US-02: 이력 조회가 실패하면 안내하고 전송을 막으며 다시 불러올 수 있다', async () => {
  const server = fakeServer();
  let failTurns = true;
  const fetchMock = jest.mocked(globalThis.fetch);
  const original = fetchMock.getMockImplementation();
  fetchMock.mockImplementation(async (resource, init) => {
    if (failTurns && String(resource).endsWith('/turns')) return json({}, 503);
    return original!(resource, init);
  });
  await show();
  expect(await screen.findByText('대화 이력을 불러오지 못했습니다.')).toBeOnTheScreen();
  expect(sendButton()).toBeDisabled();
  failTurns = false;
  server.state.turns = { ...emptyTurns, messages: [userMessage] };
  await fireEvent.press(screen.getByRole('button', { name: '대화 이력 다시 불러오기' }));
  expect(await screen.findByTestId('chat-message-bubble')).toHaveTextContent('여행자첫 메시지');
  expect(sendButton()).toBeEnabled();
});

it('CHAT-US-02-AC04·AC16: 서버가 검증으로 거절하면 이유를 안내하고 보낸 내용을 순서·발화자 그대로 입력창에 되돌린다', async () => {
  const server = fakeServer();
  server.onPost.mockImplementationOnce(() => json({ code: 'MESSAGE_INVALID_SPEAKER', detail: 'invalid speaker' }, 422));
  await show();
  await ready();
  await fireEvent.changeText(input(), '안녕\n@윤슬: 반가워');
  await fireEvent.press(sendButton());

  expect(
    await screen.findByText('선택한 발화자를 이 대화에서 쓸 수 없습니다. 보낸 내용을 입력창에 되돌렸습니다.'),
  ).toBeOnTheScreen();
  await waitFor(() => expect(input()).toHaveDisplayValue('안녕\n@윤슬: 반가워'));
  expect(screen.queryByTestId('chat-pending-bubble')).not.toBeOnTheScreen();
  expect(sendButton()).toBeEnabled();
  expect(server.postBodies()).toHaveLength(1);
});

it('CHAT-US-02-AC15: 다시 들어와도 마지막 실패를 안내하고 재시도 버튼은 누를 때만 동작한다', async () => {
  const server = fakeServer();
  server.state.turns = {
    ...emptyTurns,
    messages: [userMessage],
    last_failed_generation: generation({ status: 'failed', retryable: true, error_code: 'GENERATION_STALE' }),
  };
  await show();
  expect(
    await screen.findByText('fake-echo 응답을 생성하지 못했습니다. 보낸 메시지는 그대로 남아 있습니다.'),
  ).toBeOnTheScreen();
  expect(screen.getByText('응답 생성이 오래 멈춰 중단되었습니다.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '응답 생성 다시 시도' })).toBeEnabled();
  expect(server.onRetry).not.toHaveBeenCalled();
  expect(server.pollUrls()).toHaveLength(0);
});

it('CHAT-US-02-AC06·AC10: 다른 곳에서 이미 생성 중(409)이면 보낸 내용을 되돌리고 진행 중인 생성을 이어 받는다', async () => {
  const server = fakeServer();
  server.onPost.mockImplementationOnce(() => {
    server.state.turns = { ...emptyTurns, messages: [userMessage], active_generation: generation({ id: 12 }) };
    return json({ code: 'GENERATION_IN_PROGRESS', detail: 'busy', active_generation_id: 12 }, 409);
  });
  await show();
  await ready();
  await fireEvent.changeText(input(), '다른 탭의 메시지');
  await fireEvent.press(sendButton());
  expect(await screen.findByText(/다른 응답이 아직 생성 중이라 보내지 못했습니다/)).toBeOnTheScreen();
  // 보낸 내용은 입력창 글자로 되돌아온다(맨 앞 유저 부분은 태그 없이).
  await waitFor(() => expect(input()).toHaveDisplayValue('다른 탭의 메시지'));
  await waitFor(() => expect(server.pollUrls()).toEqual([`${BASE}/generations/12?offset=0&wait=10`]));
  expect(screen.getByLabelText('응답 생성 중')).toBeOnTheScreen();
  expect(sendButton()).toBeDisabled();
});

// CHAT-US-08 (KAN-22) AI 응답 끝의 ```info 장면 블록은 말풍선에 보이지 않는다(공통 계약 A).
const codePoints = (text: string) => [...text].length;
// info 줄(`날짜:`/`시간:`/`장소:`/`[이름] 착장:`로 시작)이나 펜스·반쯤 온 펜스(` … ```info)만인 줄이 보이면 실패한다.
// 말풍선 본문 안의 백틱이나 '장소'라는 낱말에는 걸리지 않는다.
const INFO_OR_FENCE_LINE = /^[ \t]*(?:(?:`|``|```(?:i|in|inf|info)?)[ \t]*$|(?:날짜|시간|장소):|\[[^\]\n]+\] 착장:)/m;
const noInfoShown = () => expect(screen.queryByText(INFO_OR_FENCE_LINE)).not.toBeOnTheScreen();

it('CHAT-US-08: 스트리밍 원문 끝의 info 블록과 반쯤 온 펜스(```in)는 말풍선에 보이지 않고, 끊겨도 본문만 남는다', async () => {
  const server = fakeServer();
  server.state.turns = {
    ...emptyTurns,
    messages: [userMessage],
    active_generation: generation({ status: 'streaming' }),
  };
  await show();

  const chunks = ['@윤슬: 안녕\n@나레이터: 비가 온다\n```in', 'fo\n장소: 헌책방\n시간: 19:30', '\n```'];
  let received = '';
  for (const chunk of chunks) {
    received += chunk;
    await server.answerPoll(generation({ status: 'streaming', text: chunk, next_offset: codePoints(received) }));
    await waitFor(() => expect(screen.getAllByTestId('chat-streaming-bubble')).toHaveLength(2));
    expect(screen.getAllByTestId('chat-streaming-bubble')[0]).toHaveTextContent('윤슬안녕');
    expect(screen.getAllByTestId('chat-streaming-bubble')[1]).toHaveTextContent('나레이터비가 온다');
    noInfoShown();
  }

  // 블록까지 받은 뒤 끊기면(failed_partial) 이 앱이 모은 원문에서도 본문만 말풍선으로 남는다.
  const ended = generation({ status: 'failed_partial', text: '', next_offset: codePoints(received) });
  server.state.turns = { ...emptyTurns, messages: [userMessage], last_failed_generation: { ...ended, text: received } };
  await server.answerPoll(ended);
  expect(await screen.findByText('fake-echo 응답이 중간에 끊겼습니다.')).toBeOnTheScreen();
  expect(screen.queryByTestId('chat-streaming-bubble')).not.toBeOnTheScreen();
  expect(screen.getAllByTestId('chat-unsaved-bubble')).toHaveLength(2);
  expect(screen.getAllByTestId('chat-unsaved-bubble')[0]).toHaveTextContent('윤슬안녕');
  noInfoShown();
});

it('CHAT-US-08: 스트리밍 중 원문이 반쯤 온 펜스(```in)로 끝나면 그 줄을 숨긴다', async () => {
  const server = fakeServer();
  server.state.turns = {
    ...emptyTurns,
    messages: [userMessage],
    active_generation: generation({ status: 'streaming' }),
  };
  await show();
  const text = '@윤슬: 안녕\n```in';
  await server.answerPoll(generation({ status: 'streaming', text, next_offset: codePoints(text) }));
  expect(await screen.findByTestId('chat-streaming-bubble')).toHaveTextContent('윤슬안녕');
  expect(screen.getAllByTestId('chat-streaming-bubble')).toHaveLength(1);
  noInfoShown();
});

it('CHAT-US-08: 다시 들어와 보이는 failed_partial 원문도 info 블록을 빼고 본문만 말풍선으로 보인다', async () => {
  const server = fakeServer();
  server.state.turns = {
    ...emptyTurns,
    messages: [userMessage],
    last_failed_generation: generation({
      status: 'failed_partial',
      error_code: 'STREAM_ERROR',
      text: '@윤슬: 반쯤\n```info\n장소: 헌책방\n시간: 19:30\n```\n@나레이터: 끝',
    }),
  };
  await show();
  expect(await screen.findByText('fake-echo 응답이 중간에 끊겼습니다.')).toBeOnTheScreen();
  expect(screen.getAllByTestId('chat-unsaved-bubble')).toHaveLength(2);
  expect(screen.getAllByTestId('chat-unsaved-bubble')[0]).toHaveTextContent('윤슬반쯤');
  expect(screen.getAllByTestId('chat-unsaved-bubble')[1]).toHaveTextContent('나레이터끝');
  noInfoShown();
});

it('CHAT-US-08 (11-27 개정): 응답 중간과 끝에 info 블록을 두 번 쓴 원문도 두 블록 모두 말풍선에 보이지 않는다', async () => {
  const server = fakeServer();
  server.state.turns = {
    ...emptyTurns,
    messages: [userMessage],
    last_failed_generation: generation({
      status: 'failed_partial',
      error_code: 'STREAM_ERROR',
      text: [
        '@윤슬: 이 `책` 말이야, 장소가 어디였지?',
        '```info',
        '장소: 헌책방',
        '시간: 19:20',
        '[윤슬] 착장: 코트 | 속마음: 궁금하다',
        '```',
        '...',
        '@나레이터: 비가 그친다',
        '```info',
        '장소: 헌책방',
        '시간: 19:30',
        '```',
      ].join('\n'),
    }),
  };
  await show();
  expect(await screen.findByText('fake-echo 응답이 중간에 끊겼습니다.')).toBeOnTheScreen();
  expect(screen.getAllByTestId('chat-unsaved-bubble')).toHaveLength(2);
  // 본문의 백틱과 '장소'라는 낱말은 그대로 보이고, noInfoShown에도 걸리지 않는다.
  expect(screen.getAllByTestId('chat-unsaved-bubble')[0]).toHaveTextContent(
    '윤슬이 `책` 말이야, 장소가 어디였지?\n...',
  );
  expect(screen.getAllByTestId('chat-unsaved-bubble')[1]).toHaveTextContent('나레이터비가 그친다');
  noInfoShown();
});
