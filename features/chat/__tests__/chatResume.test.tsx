// CHAT-US-03 (KAN-24) 대화방 재접속: 작성 중 입력 기기 보관·복원, 결과를 모르는 전송의 요청 ID 확인
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import SessionRoute from '@/app/chat-session/[sessionId]';
import * as identity from '@/features/chat/conversationIdentity';
import { encodeDraft } from '@/features/chat/draftCodec';
import { chatDraftKey, readDraft } from '@/features/chat/draftPersistence';
import * as storage from '@/features/chat/draftStorage';
import type { DraftStorage, NativeDraftStorage } from '@/features/chat/draftStorage.types';
import { sendAttemptKey } from '@/features/chat/sendAttemptStorage';
import type { ChatGeneration, ChatMessage, ChatTurns, ConversationSession } from '@/shared/story-types';

let mockSessionId = '19';
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ sessionId: mockSessionId }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
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

const BASE = 'http://localhost:8000/api/v1/conversation';
const room = (id: number): ConversationSession => ({
  id,
  story_title: `방 ${id}`,
  model: '루나',
  read_only: false,
  play_name: '여행자',
  messages: [{ speaker_kind: 'narrator', speaker_name: null, body: '문이 열렸다.' }],
  characters: [{ id: 2, name: '윤슬' }],
});
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
  parts: [{ speaker_kind: 'user', character_id: null, speaker_name: '여행자', body: '사라진 응답' }],
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

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
type Call = { url: string; method: string; body: unknown };
type Deferred = { resolve: (value: Response) => void };

function fakeServer() {
  const calls: Call[] = [];
  const polls: Deferred[] = [];
  const state = { turns: emptyTurns, lookup: { generations: [] as ChatGeneration[] } };
  const onPost = jest.fn<Response | Promise<Response>, [Call]>(() => json(generation(), 202));
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const call = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    const match = url.match(/\/sessions\/(\d+)(.*)$/);
    if (match && match[2] === '') return json(room(Number(match[1])));
    if (match && match[2] === '/turns') return json(state.turns);
    if (match && match[2] === '/messages') return onPost(call);
    if (match && match[2].startsWith('/generations?')) return json(state.lookup);
    if (url.startsWith(`${BASE}/generations/`)) {
      return new Promise<Response>((resolve, reject) => {
        polls.push({ resolve });
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    }
    return json({}, 404);
  });
  return {
    calls,
    state,
    onPost,
    postBodies: () => calls.filter(({ url }) => url.endsWith('/messages')).map(({ body }) => body),
    lookups: () => calls.filter(({ url }) => url.includes('/generations?')).map(({ url }) => url),
    pollUrls: () => calls.filter(({ url }) => url.startsWith(`${BASE}/generations/`)).map(({ url }) => url),
    answerPoll: async (body: ChatGeneration) => {
      await waitFor(() => expect(polls.length).toBeGreaterThan(0));
      const next = polls.shift();
      await act(async () => next?.resolve(json(body)));
    },
  };
}

// 같은 origin의 localStorage처럼 앱을 다시 열어도 남는 저장소.
const entries = new Map<string, string>();
const local: DraftStorage = {
  getItem: (key) => entries.get(key) ?? null,
  setItem: (key, value) => void entries.set(key, value),
  removeItem: (key) => void entries.delete(key),
};
const draftOf = (owner: string, session: string) => readDraft(local, chatDraftKey(owner, session)!);
const clients: QueryClient[] = [];
let views: { unmount: () => unknown }[] = [];

/** 새 QueryClient로 열면 앱·브라우저를 새로 연 것과 같다(메모리 캐시 없음). */
async function openApp(sessionId = '19') {
  mockSessionId = sessionId;
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  clients.push(client);
  const view = await render(
    <QueryClientProvider client={client}>
      <SessionRoute />
    </QueryClientProvider>,
  );
  views.push(view);
  await screen.findByLabelText('메시지 입력');
  await waitFor(() => expect(screen.queryByText('대화 이력을 불러오는 중…')).not.toBeOnTheScreen());
  return view;
}

async function closeApp() {
  await act(async () => {
    views.forEach((view) => view.unmount());
  });
  views = [];
  clients.splice(0).forEach((client) => client.clear());
}

const input = () => screen.getByLabelText('메시지 입력');
const sendButton = () => screen.getByRole('button', { name: '메시지 전송' });

beforeEach(() => {
  jest.spyOn(storage, 'getDraftStorage').mockReturnValue(local);
});
afterEach(async () => {
  await closeApp();
  // 화면을 닫아도 남은 0.5초 보관 예약이 다음 테스트의 저장소에 쓰지 않게 끝까지 기다린다.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 600)));
  entries.clear();
  jest.restoreAllMocks();
});

it('CHAT-US-03-AC05·AC06: 입력을 멈추면 계정·대화방별로 기기에 보관하고, 앱을 다시 열면 그 대화방에만 복원한다', async () => {
  const server = fakeServer();
  await openApp('19');
  await fireEvent.changeText(input(), '윤슬에게 할 말');
  await fireEvent.press(screen.getByRole('button', { name: /^발화자 바꾸기/ }));
  await fireEvent.press(screen.getByRole('button', { name: '발화자 윤슬 선택' }));
  await fireEvent.changeText(input(), '윤슬의 대사');
  // 저장 버튼·팝업 없이, 바로가 아니라 입력이 멈춘 뒤에 보관한다(AC06).
  expect(entries.has(chatDraftKey('8', '19')!)).toBe(false);
  expect(screen.queryByRole('button', { name: /저장/ })).not.toBeOnTheScreen();
  await waitFor(() => expect(entries.get(chatDraftKey('8', '19')!)).toContain('윤슬의 대사'), { timeout: 2000 });

  await openApp('20');
  await fireEvent.changeText(input(), '다른 방 입력');
  await waitFor(() => expect(entries.get(chatDraftKey('8', '20')!)).toContain('다른 방 입력'), { timeout: 2000 });
  await closeApp();

  // 앱을 닫았다 열면 각 대화방에 그 방의 마지막 보관분만 복원한다(AC05).
  await openApp('19');
  await waitFor(() => expect(input()).toHaveDisplayValue('윤슬의 대사'));
  expect(screen.getByText('윤슬에게 할 말')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '발화자 바꾸기, 현재 윤슬' })).toBeOnTheScreen();
  await closeApp();
  await openApp('20');
  await waitFor(() => expect(input()).toHaveDisplayValue('다른 방 입력'));
  expect(screen.queryByText('윤슬에게 할 말')).not.toBeOnTheScreen();
  await closeApp();

  // 다른 계정에는 보이지 않는다.
  jest.spyOn(identity, 'getConversationOwnerId').mockReturnValue('9');
  await openApp('19');
  expect(input()).toHaveDisplayValue('');
  expect(screen.queryByText('윤슬에게 할 말')).not.toBeOnTheScreen();

  // 작성 중 입력은 서버 요청에 실리지 않는다.
  expect(server.postBodies()).toHaveLength(0);
  expect(JSON.stringify(server.calls)).not.toMatch(/윤슬의 대사|다른 방 입력/);
});

it('CHAT-US-03-AC07: 유효한 메시지를 보내면 그 대화방 보관분만 지우고 다시 열어도 되살아나지 않는다', async () => {
  const server = fakeServer();
  entries.set(chatDraftKey('8', '19')!, encodeDraft({ parts: [], speaker: { kind: 'user' }, text: '보낼 메시지' }));
  entries.set(chatDraftKey('8', '20')!, encodeDraft({ parts: [], speaker: { kind: 'user' }, text: '다른 방 보관분' }));
  await openApp('19');
  await waitFor(() => expect(input()).toHaveDisplayValue('보낼 메시지'));
  server.state.turns = { ...emptyTurns, messages: [userMessage], active_generation: generation() };
  await fireEvent.press(sendButton());
  await waitFor(() => expect(server.postBodies()).toHaveLength(1));
  expect(input()).toHaveDisplayValue('');
  expect(draftOf('8', '19')).toBe('');
  expect(draftOf('8', '20')).toContain('다른 방 보관분');
  // 접수가 확정되면 요청 ID 기록도 지운다.
  await waitFor(() => expect(entries.has(sendAttemptKey('8', '19')!)).toBe(false));
  await closeApp();

  server.state.turns = emptyTurns;
  await openApp('19');
  expect(input()).toHaveDisplayValue('');
});

it('CHAT-US-03-AC07: 입력을 모두 지우면 바로 보관분을 지운다', async () => {
  fakeServer();
  await openApp('19');
  await fireEvent.changeText(input(), '지울 내용');
  await waitFor(() => expect(entries.get(chatDraftKey('8', '19')!)).toContain('지울 내용'), { timeout: 2000 });
  await fireEvent.changeText(input(), '');
  expect(draftOf('8', '19')).toBe('');
  await closeApp();
  await openApp('19');
  expect(input()).toHaveDisplayValue('');
});

it.each([
  ['완료', generation({ status: 'completed', text: '@윤슬: 응답', next_offset: 7 })],
  ['실패', generation({ status: 'failed', error_code: 'PROVIDER_ERROR', retryable: true })],
])('CHAT-US-03-AC08: 앞 응답이 %s돼도 쓰던 다음 메시지는 입력창과 기기 보관분에 남는다', async (_label, finished) => {
  const server = fakeServer();
  await openApp('19');
  await fireEvent.changeText(input(), '먼저 보낼 말');
  server.state.turns = { ...emptyTurns, messages: [userMessage], active_generation: generation() };
  await fireEvent.press(sendButton());
  await screen.findByLabelText('응답 생성 중');
  await fireEvent.changeText(input(), '다음에 보낼 말');
  await waitFor(() => expect(draftOf('8', '19')).toContain('다음에 보낼 말'), { timeout: 2000 });

  server.state.turns =
    finished.status === 'completed'
      ? { ...emptyTurns, messages: [userMessage] }
      : { ...emptyTurns, messages: [userMessage], last_failed_generation: finished };
  await server.answerPoll(finished);
  await waitFor(() => expect(screen.queryByLabelText('응답 생성 중')).not.toBeOnTheScreen());
  expect(input()).toHaveDisplayValue('다음에 보낼 말');
  expect(draftOf('8', '19')).toContain('다음에 보낼 말');
});

it('CHAT-US-03-AC09·AC10: 다시 열면 남은 요청 ID로 조회만 하고, 접수돼 생성 중이면 새 요청 없이 이어 받는다', async () => {
  const server = fakeServer();
  const parts = [{ speaker_kind: 'user', character_id: null, body: '사라진 응답' }];
  entries.set(sendAttemptKey('8', '19')!, JSON.stringify({ requestId: 'msg-lost-0001', parts }));
  const streaming = generation({ status: 'streaming', text: '@윤슬: 나간 동안', next_offset: 11 });
  server.state.lookup = { generations: [streaming] };
  server.state.turns = { ...emptyTurns, messages: [userMessage], active_generation: streaming };
  await openApp('19');

  await waitFor(() => expect(server.lookups()).toEqual([`${BASE}/sessions/19/generations?request_id=msg-lost-0001`]));
  await waitFor(() => expect(entries.has(sendAttemptKey('8', '19')!)).toBe(false));
  expect(await screen.findByLabelText('응답 생성 중')).toBeOnTheScreen();
  await waitFor(() => expect(server.pollUrls()[0]).toBe(`${BASE}/generations/9?offset=0&wait=10`));
  await server.answerPoll(generation({ status: 'streaming', text: '@윤슬: 나간 동안 만든 말', next_offset: 15 }));
  expect(await screen.findByTestId('chat-streaming-bubble')).toHaveTextContent('윤슬나간 동안 만든 말');
  expect(server.postBodies()).toHaveLength(0);
  expect(screen.queryByRole('button', { name: '보낸 메시지 접수 확인' })).not.toBeOnTheScreen();
});

it('CHAT-US-03-AC09: 조회로 찾지 못하면 새로 보내지 않고, 누를 때만 같은 요청 ID·내용으로 확인한다', async () => {
  const server = fakeServer();
  const parts = [{ speaker_kind: 'user', character_id: null, body: '접수 모름' }];
  entries.set(sendAttemptKey('8', '19')!, JSON.stringify({ requestId: 'msg-unknown-01', parts }));
  await openApp('19');
  const confirm = await screen.findByRole('button', { name: '보낸 메시지 접수 확인' });
  expect(screen.getByTestId('chat-pending-bubble')).toHaveTextContent('여행자접수 모름');
  await fireEvent.changeText(input(), '새 메시지');
  expect(sendButton()).toBeDisabled();
  expect(server.postBodies()).toHaveLength(0);

  server.state.turns = { ...emptyTurns, messages: [userMessage], active_generation: generation() };
  await fireEvent.press(confirm);
  await waitFor(() => expect(server.postBodies()).toEqual([{ request_id: 'msg-unknown-01', parts }]));
  await waitFor(() => expect(entries.has(sendAttemptKey('8', '19')!)).toBe(false));
  expect(input()).toHaveDisplayValue('새 메시지');
});

/** 앱 기기 저장소(AsyncStorage)처럼 비동기로 읽고 쓴다. 특정 키의 읽기를 늦추거나 쓰기를 실패시킬 수 있다. */
function nativeStorage({
  beforeGet,
  failSet,
}: { beforeGet?: (key: string) => Promise<void> | undefined; failSet?: (key: string) => boolean } = {}) {
  const native: NativeDraftStorage = {
    kind: 'native',
    getItem: async (key) => {
      await beforeGet?.(key);
      return entries.get(key) ?? null;
    },
    setItem: async (key, value) => {
      if (failSet?.(key)) throw new Error('quota');
      entries.set(key, value);
    },
    removeItem: async (key) => void entries.delete(key),
  };
  return native;
}

/** 앱은 켜 둔 채 대화방만 나간다(메모리 캐시와 진행 중인 요청은 남는다). */
async function leaveRoom() {
  await act(async () => {
    views.forEach((view) => view.unmount());
  });
  views = [];
}

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 600)));

it('CHAT-US-03-AC09: 이전 전송 기록을 읽는 동안에는 입력만 받고, 새 전송은 막아 이전 요청 ID를 덮어쓰지 않는다', async () => {
  const server = fakeServer();
  const recordKey = sendAttemptKey('8', '19')!;
  const parts = [{ speaker_kind: 'user', character_id: null, body: '이전 전송' }];
  entries.set(recordKey, JSON.stringify({ requestId: 'msg-earlier-01', parts }));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  jest
    .spyOn(storage, 'getDraftStorage')
    .mockReturnValue(nativeStorage({ beforeGet: (key) => (key === recordKey ? gate : undefined) }));
  // 대화 이력이 기기 저장소보다 먼저 도착한 상태.
  await openApp('19');
  await fireEvent.changeText(input(), '새 메시지');
  expect(input()).toHaveDisplayValue('새 메시지');
  expect(screen.getByText('이전 전송 기록을 확인하는 중입니다.')).toBeOnTheScreen();
  expect(sendButton()).toBeDisabled();
  await fireEvent.press(sendButton());
  expect(server.postBodies()).toHaveLength(0);
  expect(JSON.parse(entries.get(recordKey)!).requestId).toBe('msg-earlier-01');

  await act(async () => release());
  await waitFor(() => expect(server.lookups()).toEqual([`${BASE}/sessions/19/generations?request_id=msg-earlier-01`]));
  expect(await screen.findByRole('button', { name: '보낸 메시지 접수 확인' })).toBeOnTheScreen();
  expect(server.postBodies()).toHaveLength(0);
  expect(JSON.parse(entries.get(recordKey)!).requestId).toBe('msg-earlier-01');
  expect(input()).toHaveDisplayValue('새 메시지');
});

it('CHAT-US-03-AC09: 이전 전송 기록이 없으면 확인이 끝난 뒤 바로 보낼 수 있다', async () => {
  const server = fakeServer();
  jest.spyOn(storage, 'getDraftStorage').mockReturnValue(nativeStorage());
  await openApp('19');
  await fireEvent.changeText(input(), '바로 보낼 말');
  await waitFor(() => expect(sendButton()).toBeEnabled());
  expect(screen.queryByText('이전 전송 기록을 확인하는 중입니다.')).not.toBeOnTheScreen();
  await fireEvent.press(sendButton());
  await waitFor(() => expect(server.postBodies()).toHaveLength(1));
  expect(server.lookups()).toHaveLength(0);
});

it('CHAT-US-03-AC05·AC09: 전송 복구 기록을 남기지 못하면 결과를 모르는 동안 기기의 초안을 지우지 않는다', async () => {
  const server = fakeServer();
  const recordKey = sendAttemptKey('8', '19')!;
  jest.spyOn(storage, 'getDraftStorage').mockReturnValue(nativeStorage({ failSet: (key) => key === recordKey }));
  server.onPost.mockImplementationOnce(() => Promise.reject(new TypeError('network lost')));
  await openApp('19');
  await fireEvent.changeText(input(), '잃으면 안 되는 말');
  await waitFor(() => expect(entries.get(chatDraftKey('8', '19')!)).toContain('잃으면 안 되는 말'), {
    timeout: 2000,
  });
  await fireEvent.press(sendButton());
  await screen.findByRole('button', { name: '보낸 메시지 접수 확인' });
  // 전송은 막지 않고 입력창은 비우지만, 기기의 초안은 남긴다.
  expect(server.postBodies()).toHaveLength(1);
  expect(input()).toHaveDisplayValue('');
  await settle();
  expect(entries.has(recordKey)).toBe(false);
  expect(entries.get(chatDraftKey('8', '19')!)).toContain('잃으면 안 되는 말');

  await closeApp();
  await openApp('19');
  await waitFor(() => expect(input()).toHaveDisplayValue('잃으면 안 되는 말'));
});

it('CHAT-US-03-AC07: 전송 복구 기록을 남기지 못해도 접수가 확인되면 기기의 초안을 지운다', async () => {
  const server = fakeServer();
  const recordKey = sendAttemptKey('8', '19')!;
  jest.spyOn(storage, 'getDraftStorage').mockReturnValue(nativeStorage({ failSet: (key) => key === recordKey }));
  await openApp('19');
  await fireEvent.changeText(input(), '접수될 말');
  await waitFor(() => expect(entries.get(chatDraftKey('8', '19')!)).toContain('접수될 말'), { timeout: 2000 });
  server.state.turns = { ...emptyTurns, messages: [userMessage], active_generation: generation() };
  await fireEvent.press(sendButton());
  await waitFor(() => expect(server.postBodies()).toHaveLength(1));
  await waitFor(() => expect(entries.has(chatDraftKey('8', '19')!)).toBe(false));
  await closeApp();
  server.state.turns = emptyTurns;
  await openApp('19');
  await settle();
  expect(input()).toHaveDisplayValue('');
});

it('CHAT-US-03-AC05: 방을 나간 뒤 전송이 거절되면 입력이 비어 있을 때 원문을 기기에 되돌리고 전송 기록을 지운다', async () => {
  const server = fakeServer();
  const recordKey = sendAttemptKey('8', '19')!;
  let answer!: (response: Response) => void;
  server.onPost.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        answer = resolve;
      }),
  );
  await openApp('19');
  await fireEvent.changeText(input(), '거절될 말');
  await fireEvent.press(sendButton());
  await waitFor(() => expect(server.postBodies()).toHaveLength(1));
  await waitFor(() => expect(entries.has(recordKey)).toBe(true));
  await waitFor(() => expect(draftOf('8', '19')).toBe(''));

  await leaveRoom();
  await act(async () => answer(json({ code: 'MESSAGE_INVALID_SPEAKER', detail: 'invalid speaker' }, 422)));
  await waitFor(() => expect(entries.has(recordKey)).toBe(false));
  expect(draftOf('8', '19')).toContain('거절될 말');

  await closeApp();
  await openApp('19');
  // 되돌린 원문은 기존 거절 처리와 같이 발화자별 부분으로 입력창에 들어온다.
  expect(await screen.findByText('거절될 말')).toBeOnTheScreen();
  expect(screen.queryByTestId('chat-pending-bubble')).not.toBeOnTheScreen();
  expect(server.lookups()).toHaveLength(0);
  expect(sendButton()).toBeEnabled();
});

it('CHAT-US-03-AC05: 방을 나간 뒤 거절돼도 새로 쓴 초안은 덮어쓰지 않고, 거절된 원문은 다시 열었을 때 보인다', async () => {
  const server = fakeServer();
  const recordKey = sendAttemptKey('8', '19')!;
  let answer!: (response: Response) => void;
  server.onPost.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        answer = resolve;
      }),
  );
  await openApp('19');
  await fireEvent.changeText(input(), '거절될 말');
  await fireEvent.press(sendButton());
  await waitFor(() => expect(entries.has(recordKey)).toBe(true));
  await fireEvent.changeText(input(), '새로 쓴 말');
  await waitFor(() => expect(draftOf('8', '19')).toContain('새로 쓴 말'), { timeout: 2000 });

  await leaveRoom();
  await act(async () => answer(json({ code: 'MESSAGE_INVALID_SPEAKER', detail: 'invalid speaker' }, 422)));
  await waitFor(() => expect(JSON.parse(entries.get(recordKey) ?? '{}').rejected).toBeTruthy());
  expect(draftOf('8', '19')).toContain('새로 쓴 말');

  await closeApp();
  await openApp('19');
  await waitFor(() => expect(input()).toHaveDisplayValue('새로 쓴 말'));
  expect(screen.getByTestId('chat-pending-bubble')).toHaveTextContent('여행자거절될 말');
  expect(screen.getByText(/선택한 발화자를 이 대화에서 쓸 수 없습니다/)).toBeOnTheScreen();
  expect(server.lookups()).toHaveLength(0);
  expect(sendButton()).toBeEnabled();

  // 안내를 닫으면 그때 전송 기록을 정리한다.
  await fireEvent.press(screen.getByRole('button', { name: '전송 실패 안내 닫기' }));
  await waitFor(() => expect(entries.has(recordKey)).toBe(false));
  await closeApp();
  await openApp('19');
  await settle();
  expect(screen.queryByTestId('chat-pending-bubble')).not.toBeOnTheScreen();
});

it('CHAT-US-03-AC05: 기기 저장소를 쓸 수 없어도 입력은 계속하고 안내한다', async () => {
  fakeServer();
  jest.spyOn(storage, 'getDraftStorage').mockReturnValue({
    ...local,
    setItem: () => {
      throw new Error('quota');
    },
  });
  await openApp('19');
  await fireEvent.changeText(input(), '메모리 입력');
  expect(
    await screen.findByText(
      '이 기기에 작성 중인 내용을 보관하지 못했습니다. 입력은 계속할 수 있습니다.',
      {},
      { timeout: 2000 },
    ),
  ).toBeOnTheScreen();
  expect(input()).toHaveDisplayValue('메모리 입력');
});
