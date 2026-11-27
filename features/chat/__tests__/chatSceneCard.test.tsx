// CHAT-US-08 (KAN-22·KAN-40) 대화방 상태 카드: 가장 뒤 AI 응답 아래 현재 장면, 상태 보기 ON/OFF(기기 보관), 장면 정보 수정
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import SessionRoute from '@/app/chat-session/[sessionId]';
import * as storage from '@/features/chat/draftStorage';
import type { DraftStorage, NativeDraftStorage } from '@/features/chat/draftStorage.types';
import { SCENE_CARD_PREFERENCE_KEY } from '@/features/chat/scene/sceneCardPreference';
import type {
  ChatGeneration,
  ChatMessage,
  ChatTurns,
  ConversationSession,
  CurrentScene,
  SceneDate,
  SceneInfoUpdateResult,
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
const INFO_URL = `${BASE}/sessions/19/messages/6/info`;
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
const userMessage: ChatMessage = {
  id: 5,
  role: 'user',
  parts: [{ speaker_kind: 'user', character_id: null, speaker_name: '여행자', body: '안녕' }],
  created_at: '2026-11-22T00:00:00Z',
};
const reply: ChatMessage = {
  id: 6,
  role: 'assistant',
  parts: [{ speaker_kind: 'character', character_id: 2, speaker_name: '윤슬', body: '어서 와.' }],
  created_at: '2026-11-22T00:00:01Z',
  info: null,
};
const date = (overrides: Partial<SceneDate>): SceneDate => ({
  mode: 'calendar',
  era: null,
  year: null,
  month: null,
  day: null,
  reference_event: null,
  elapsed_day: null,
  ...overrides,
});
const scene: CurrentScene = {
  date: date({ year: 2026, month: 11, day: 23 }),
  time: { hour: 19, minute: 30 },
  place: '정원 입구',
  characters: [
    { name: '윤슬', clothing: '하얀 원피스', inner_thought: '반갑다' },
    { name: '서윤', clothing: null, inner_thought: null },
  ],
};
const turnsWith = (overrides: Partial<ChatTurns> = {}): ChatTurns => ({
  messages: [userMessage, reply],
  active_generation: null,
  last_failed_generation: null,
  model: 'fake-echo',
  model_id: 1,
  current_scene: scene,
  ...overrides,
});
const generation = (overrides: Partial<ChatGeneration> = {}): ChatGeneration => ({
  id: 9,
  session_id: 19,
  status: 'streaming',
  user_message_id: 7,
  assistant_message: null,
  text: '',
  next_offset: 0,
  error_code: null,
  retryable: false,
  model: 'fake-echo',
  ...overrides,
});

type Call = { url: string; method: string; body: unknown };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fakeServer(turns: ChatTurns = turnsWith(), sessionBody: ConversationSession = session) {
  const calls: Call[] = [];
  const polls: ((value: Response) => void)[] = [];
  const state = { turns };
  const onInfo = jest.fn<Response, [Call]>(() => json({}, 500));
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const call = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    if (url === `${BASE}/sessions/19`) return json(sessionBody);
    if (url === `${BASE}/sessions/19/turns`) return json(state.turns);
    if (url === INFO_URL) return onInfo(call);
    if (url.startsWith(`${BASE}/generations/`))
      return new Promise<Response>((resolve, reject) => {
        polls.push(resolve);
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    return json({}, 404);
  });
  return {
    calls,
    state,
    onInfo,
    polls,
    turnsReads: () => calls.filter(({ url }) => url.endsWith('/turns')).length,
    infoBodies: () => calls.filter(({ url }) => url === INFO_URL).map(({ body }) => body),
  };
}

// 앱을 다시 열어도 남는 기기 저장소(웹 localStorage 모양)
const entries = new Map<string, string>();
const local: DraftStorage = {
  getItem: (key) => entries.get(key) ?? null,
  setItem: (key, value) => void entries.set(key, value),
  removeItem: (key) => void entries.delete(key),
};

const clients: QueryClient[] = [];
let views: { unmount: () => unknown }[] = [];
/** 새 QueryClient로 열면 앱을 새로 연 것과 같다(메모리 캐시 없음). */
async function openRoom() {
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
  await screen.findByText('어서 와.');
  return view;
}
async function closeRoom() {
  await act(async () => views.forEach((view) => view.unmount()));
  views = [];
  clients.splice(0).forEach((client) => client.clear());
}

const card = () => screen.getByTestId('chat-scene-card');
const queryCard = () => screen.queryByTestId('chat-scene-card');
const toggle = () => screen.getByRole('switch', { name: '상태 보기' });
const pencil = () => screen.getByRole('button', { name: '장면 정보 수정' });
const saveButton = () => screen.getByRole('button', { name: '장면 정보 저장' });

beforeEach(() => {
  jest.spyOn(storage, 'getDraftStorage').mockReturnValue(local);
});
afterEach(async () => {
  await closeRoom();
  jest.restoreAllMocks();
  entries.clear();
});

it('CHAT-US-08: 가장 뒤 AI 응답 아래에 날짜·시간·장소와 캐릭터별 착장·속마음을 보이고, 빈 줄과 빈 캐릭터는 뺀다', async () => {
  fakeServer(turnsWith({ current_scene: { ...scene, place: null } }));
  await openRoom();
  const view = within(card());
  expect(view.getByText('📅 날짜 · 2026년 11월 23일')).toBeOnTheScreen();
  expect(view.getByText('⏰ 시간 · 19:30')).toBeOnTheScreen();
  expect(view.queryByText(/장소/)).toBeNull();
  expect(view.getByText('윤슬')).toBeOnTheScreen();
  expect(view.getByText('👔 착장 · 하얀 원피스')).toBeOnTheScreen();
  expect(view.getByText('💭 속마음 · 반갑다')).toBeOnTheScreen();
  // 착장·속마음이 모두 없는 서윤은 카드에 줄이 없다.
  expect(view.queryByText('서윤')).toBeNull();
  expect(toggle()).toBeChecked();
});

it.each<[string, SceneDate, CurrentScene['time'], string, string]>([
  [
    'world',
    date({ mode: 'world', era: '광무', year: 2, month: 3, day: 3 }),
    { hour: 19, minute: null },
    '광무 2년 3월 3일',
    '19시',
  ],
  [
    'elapsed',
    date({ mode: 'elapsed', reference_event: '전학', elapsed_day: 3 }),
    { hour: 7, minute: 5 },
    '전학 3일째',
    '07:05',
  ],
])('CHAT-US-08: 날짜 방식 %s도 그 방식대로 보인다', async (_mode, value, time, dateText, timeText) => {
  fakeServer(turnsWith({ current_scene: { ...scene, date: value, time } }));
  await openRoom();
  expect(within(card()).getByText(`📅 날짜 · ${dateText}`)).toBeOnTheScreen();
  expect(within(card()).getByText(`⏰ 시간 · ${timeText}`)).toBeOnTheScreen();
});

it('CHAT-US-08: 카드는 가장 뒤 AI 응답 바로 아래에 있고, 그 뒤의 내 메시지(실패한 턴)는 카드 아래에 보인다', async () => {
  const later: ChatMessage = { ...userMessage, id: 8, parts: [{ ...userMessage.parts[0], body: '다음 말' }] };
  fakeServer(turnsWith({ messages: [userMessage, reply, later] }));
  await openRoom();
  expect(card()).toBeOnTheScreen();
  // 그려진 순서: 가장 뒤 AI 응답 → 상태 카드 → 그 뒤의 내 메시지
  const tree = JSON.stringify(screen.toJSON());
  expect(tree.indexOf('어서 와.')).toBeLessThan(tree.indexOf('🌿 지금 상태'));
  expect(tree.indexOf('🌿 지금 상태')).toBeLessThan(tree.indexOf('다음 말'));
});

it('CHAT-US-08: 서버가 current_scene을 주지 않거나(옛 서버) AI 응답이 아직 없으면 카드와 토글이 없다', async () => {
  const { current_scene: _omitted, ...oldServer } = turnsWith();
  fakeServer(oldServer);
  await openRoom();
  expect(queryCard()).toBeNull();
  expect(screen.queryByRole('switch', { name: '상태 보기' })).toBeNull();
  await closeRoom();

  fakeServer(turnsWith({ messages: [] }));
  const client = new QueryClient();
  clients.push(client);
  views.push(
    await render(
      <QueryClientProvider client={client}>
        <SessionRoute />
      </QueryClientProvider>,
    ),
  );
  await screen.findByText('문이 열렸다.');
  await waitFor(() => expect(screen.queryByText('대화 이력을 불러오는 중…')).toBeNull());
  expect(queryCard()).toBeNull();
});

it('CHAT-US-08: 응답을 만드는 중에는 카드를 숨기고, 응답이 끝나면 새 장면으로 다시 보인다', async () => {
  const server = fakeServer(turnsWith({ active_generation: generation() }));
  await openRoom();
  await waitFor(() => expect(server.polls.length).toBeGreaterThan(0));
  expect(queryCard()).toBeNull();

  const next: ChatMessage = { ...reply, id: 10, parts: [{ ...reply.parts[0], body: '들어와.' }] };
  server.state.turns = turnsWith({
    messages: [userMessage, reply, { ...userMessage, id: 7 }, next],
    current_scene: { ...scene, place: '온실' },
  });
  await act(async () =>
    server.polls.shift()?.(json(generation({ status: 'completed', assistant_message: next, text: '@윤슬: 들어와.' }))),
  );
  expect(await within(await screen.findByTestId('chat-scene-card')).findByText('📍 장소 · 온실')).toBeOnTheScreen();
});

it('CHAT-US-08: 상태 보기를 끄면 카드만 숨기고, 이 기기에 보관해 다시 들어와도 꺼져 있다', async () => {
  fakeServer();
  await openRoom();
  await fireEvent.press(toggle());
  await waitFor(() => expect(queryCard()).toBeNull());
  expect(toggle()).not.toBeChecked();
  expect(screen.getByText('어서 와.')).toBeOnTheScreen();
  expect(entries.get(SCENE_CARD_PREFERENCE_KEY)).toBe('off');

  await closeRoom();
  await openRoom();
  expect(queryCard()).toBeNull();
  expect(toggle()).not.toBeChecked();

  await fireEvent.press(toggle());
  expect(await screen.findByTestId('chat-scene-card')).toBeOnTheScreen();
  expect(entries.get(SCENE_CARD_PREFERENCE_KEY)).toBe('on');
  await closeRoom();
  await openRoom();
  expect(card()).toBeOnTheScreen();
});

it('CHAT-US-08: 네이티브(AsyncStorage)에서도 꺼 둔 값을 다시 들어올 때 복원하고, 읽기 전에는 카드를 잠깐도 보이지 않는다', async () => {
  const saved = new Map<string, string>([[SCENE_CARD_PREFERENCE_KEY, 'off']]);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const native: NativeDraftStorage = {
    kind: 'native',
    getItem: async (key) => {
      if (key === SCENE_CARD_PREFERENCE_KEY) await gate;
      return saved.get(key) ?? null;
    },
    setItem: async (key, value) => void saved.set(key, value),
    removeItem: async (key) => void saved.delete(key),
  };
  jest.spyOn(storage, 'getDraftStorage').mockReturnValue(native);
  fakeServer();
  await openRoom();
  expect(queryCard()).toBeNull();
  await act(async () => release());
  await waitFor(() => expect(toggle()).not.toBeChecked());
  expect(queryCard()).toBeNull();
});

it('CHAT-US-08: 연필로 시트를 열어 바뀐 칸만 보내고, 응답의 current_scene으로 카드를 바로 바꾼다', async () => {
  const server = fakeServer();
  const updated: CurrentScene = {
    ...scene,
    place: '온실',
    characters: [scene.characters[0], { name: '서윤', clothing: null, inner_thought: '긴장된다' }],
  };
  server.onInfo.mockImplementation(() =>
    json({ message_id: 6, info: { ...updated, text: '…' }, current_scene: updated } satisfies SceneInfoUpdateResult),
  );
  await openRoom();
  await fireEvent.press(pencil());
  expect(screen.getByLabelText('장소').props.value).toBe('정원 입구');
  await fireEvent.changeText(screen.getByLabelText('장소'), ' 온실 ');
  await fireEvent.changeText(screen.getByLabelText('서윤 속마음'), '긴장된다');
  const reads = server.turnsReads();
  await fireEvent.press(saveButton());

  await waitFor(() => expect(screen.queryByRole('button', { name: '장면 정보 저장' })).toBeNull());
  expect(server.infoBodies()).toEqual([{ place: '온실', characters: [{ name: '서윤', inner_thought: '긴장된다' }] }]);
  expect(server.calls.find(({ url }) => url === INFO_URL)?.method).toBe('PUT');
  const view = within(card());
  expect(view.getByText('📍 장소 · 온실')).toBeOnTheScreen();
  expect(view.getByText('💭 속마음 · 긴장된다')).toBeOnTheScreen();
  // 이력을 다시 읽지 않고 응답 값으로 바꾼다.
  expect(server.turnsReads()).toBe(reads);
});

it('CHAT-US-08: 아무것도 바꾸지 않고 저장하면 요청 없이 닫고, 앱에서 막는 값(장소 30자 초과)은 칸 옆에 안내하고 보내지 않는다', async () => {
  const server = fakeServer();
  await openRoom();
  await fireEvent.press(pencil());
  await fireEvent.press(saveButton());
  expect(screen.queryByRole('button', { name: '장면 정보 저장' })).toBeNull();

  await fireEvent.press(pencil());
  await fireEvent.changeText(screen.getByLabelText('장소'), '가'.repeat(31));
  await fireEvent.press(saveButton());
  expect(screen.getByText('장소는 30자까지 쓸 수 있어요.')).toBeOnTheScreen();
  expect(server.infoBodies()).toEqual([]);
});

it.each([
  ['SCENE_INFO_NOT_LATEST_REPLY', { latest_message_id: 12 }, '새 응답이 있어 다시 열어 주세요.'],
  [
    'GENERATION_IN_PROGRESS',
    { active_generation_id: 9 },
    '응답을 만드는 중에는 고칠 수 없어요. 응답이 끝난 뒤 다시 열어 주세요.',
  ],
])('CHAT-US-08: 409 %s는 시트에 한국어로 안내하고 이력을 다시 읽는다', async (code, extra, message) => {
  const server = fakeServer();
  server.onInfo.mockImplementation(() => json({ status: 409, code, detail: 'conflict', ...extra }, 409));
  await openRoom();
  await fireEvent.press(pencil());
  await fireEvent.changeText(screen.getByLabelText('장소'), '온실');
  const reads = server.turnsReads();
  await fireEvent.press(saveButton());
  expect(await screen.findByText(message)).toBeOnTheScreen();
  await waitFor(() => expect(server.turnsReads()).toBeGreaterThan(reads));
  // 실패하면 카드는 그대로다.
  expect(within(card()).getByText('📍 장소 · 정원 입구')).toBeOnTheScreen();
});

it('CHAT-US-08: 422 field는 그 칸 옆에 서버 안내를 보이고 시트를 닫지 않는다(캐릭터는 보낸 순서로 찾는다)', async () => {
  const server = fakeServer();
  server.onInfo.mockImplementation(() =>
    json(
      {
        status: 422,
        code: 'SCENE_INFO_INVALID_VALUE',
        field: 'characters[0].clothing',
        detail: '착장 값이 올바르지 않습니다.',
      },
      422,
    ),
  );
  await openRoom();
  await fireEvent.press(pencil());
  await fireEvent.changeText(screen.getByLabelText('서윤 착장'), '미정');
  await fireEvent.press(saveButton());
  const person = within(screen.getByLabelText('서윤의 상태 수정'));
  expect(await person.findByText('착장 값이 올바르지 않습니다.')).toBeOnTheScreen();
  expect(within(screen.getByLabelText('윤슬의 상태 수정')).queryByText('착장 값이 올바르지 않습니다.')).toBeNull();
  expect(server.infoBodies()).toEqual([{ characters: [{ name: '서윤', clothing: '미정' }] }]);
  expect(saveButton()).toBeOnTheScreen();
});

it('CHAT-US-08: 읽기 전용 대화는 카드는 보이지만 연필(수정)이 없다', async () => {
  fakeServer(turnsWith(), { ...session, read_only: true });
  await openRoom();
  expect(card()).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '장면 정보 수정' })).toBeNull();
});
