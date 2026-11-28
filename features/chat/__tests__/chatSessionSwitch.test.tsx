// CHAT-US-09 여러 세션으로 이야기 나누기: 대화방 ☰ 메뉴, 새로하기(보관 체크·인트로 카드·원본 삭제 순서),
// 이어하기 목록(같은 스토리·지금 방 제외·미리보기·빈 상태), 방 전환(캐시·입력 섞임 없음), 대화 삭제 확인·정리
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import SessionRoute from '@/app/chat-session/[sessionId]';
import { isSessionChatDeviceKey } from '@/features/chat/deviceDataCleanup';
import * as storage from '@/features/chat/draftStorage';
import type { DraftStorage } from '@/features/chat/draftStorage.types';
import { conversationSessionKey, draftKey, turnsKey } from '@/features/chat/hooks/chatCache';
import { sessionName } from '@/features/chat/hooks/useSessions';
import type { ConversationRoom, StorySessionSummary } from '@/features/chat/types';
import type { ChatTurns, ConversationStory } from '@/shared/story-types';

const mockParams = { sessionId: '19' };
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    dismissTo: jest.fn(),
    replace: mockReplace,
  }),
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
const room = (id: number, intro: string, overrides: Partial<ConversationRoom> = {}): ConversationRoom => ({
  id,
  story_id: 3,
  story_title: '달빛 정원',
  model: '루나',
  read_only: false,
  play_name: '여행자',
  messages: [{ speaker_kind: 'narrator', speaker_name: null, body: intro }],
  characters: [{ id: 2, name: '윤슬' }],
  ...overrides,
});
const turns = (reply: string | null): ChatTurns => ({
  messages: reply
    ? [
        {
          id: 5,
          role: 'user',
          parts: [{ speaker_kind: 'user', character_id: null, speaker_name: '여행자', body: '안녕' }],
          created_at: '2026-11-22T00:00:00Z',
        },
        {
          id: 6,
          role: 'assistant',
          parts: [{ speaker_kind: 'character', character_id: 2, speaker_name: '윤슬', body: reply }],
          created_at: '2026-11-22T00:00:01Z',
          info: null,
        },
      ]
    : [],
  active_generation: null,
  last_failed_generation: null,
  model: '루나',
  model_id: 1,
  current_scene: null,
});
const story: ConversationStory = {
  id: 3,
  title: '달빛 정원',
  subtitle: '',
  world_description: '',
  effective_rating: null,
  characters: [{ id: 2, name: '윤슬', description: '' }],
  intros: [
    {
      id: 11,
      title: '첫 만남',
      messages: [{ speaker_kind: 'narrator', speaker_name: null, body: '벚꽃이 흩날린다.' }],
    },
    { id: 12, title: '재회', messages: [{ speaker_kind: 'narrator', speaker_name: null, body: '비 오는 밤이다.' }] },
  ],
  profiles: [],
  existing_session_id: 19,
  tags: [],
};
const summary = (overrides: Partial<StorySessionSummary>): StorySessionSummary => ({
  id: 7,
  story_id: 3,
  story_title: '달빛 정원',
  read_only: false,
  model: '루나',
  play_name: '여행자',
  generating: false,
  last_message_preview: '지난번 약속 기억해?',
  last_activity_at: '2026-11-22T05:08:00Z',
  intro_title: '첫 만남',
  ...overrides,
});

type Call = { url: string; method: string; body: Record<string, unknown> | null };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const noContent = () => new Response(null, { status: 204 });
const problem = (status: number, code: string, detail: string) => json({ code, title: code, detail }, status);

/** 각 호출에 새 Response를 준다. 경로별 응답은 테스트마다 바꿔 끼운다. */
function fakeServer() {
  const calls: Call[] = [];
  const rooms: Record<string, ConversationRoom> = {
    '19': room(19, '문이 열렸다.'),
    '31': room(31, '새벽 바다가 보인다.'),
  };
  const roomTurns: Record<string, ChatTurns> = { '19': turns('A방에서 한 약속'), '31': turns(null) };
  const handlers = {
    restart: jest.fn<Response | Promise<Response>, [Call]>(() => json({ id: 31 }, 201)),
    session: jest.fn<Response | Promise<Response>, [string]>((id) =>
      rooms[id] ? json(rooms[id]) : problem(404, 'NOT_FOUND', '없는 대화방'),
    ),
    list: jest.fn<Response | Promise<Response>, [URLSearchParams]>((query) =>
      json({
        sessions: query.get('exclude_session_id') === '19' ? [summary({})] : [],
        next_before_id: null,
      }),
    ),
    remove: jest.fn<Response | Promise<Response>, [string]>(() => noContent()),
  };
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const call = { url, method, body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    const path = url.slice(BASE.length);
    order.push(`${method} ${path}`);
    let match: RegExpMatchArray | null;
    if (path === '/stories/3') return json(story);
    if (path.startsWith('/sessions?')) return handlers.list(new URLSearchParams(path.slice('/sessions?'.length)));
    if ((match = path.match(/^\/sessions\/(\d+)\/restart$/)) && method === 'POST') return handlers.restart(call);
    if ((match = path.match(/^\/sessions\/(\d+)\/turns$/))) return json(roomTurns[match[1]] ?? turns(null));
    if ((match = path.match(/^\/sessions\/(\d+)$/))) {
      return method === 'DELETE' ? handlers.remove(match[1]) : handlers.session(match[1]);
    }
    return problem(404, 'NOT_FOUND', '없는 경로');
  });
  return {
    calls,
    handlers,
    rooms,
    restartBodies: () => calls.filter(({ url }) => url.endsWith('/restart')).map(({ body }) => body),
    deletes: () => calls.filter(({ method }) => method === 'DELETE').map(({ url }) => url.slice(BASE.length)),
    posts: () => calls.filter(({ method }) => method === 'POST'),
  };
}

// 같은 origin의 localStorage처럼 남는 기기 저장소(웹 모양, 키를 훑을 수 있다)
const entries = new Map<string, string>();
const local: DraftStorage & { readonly length: number; key(index: number): string | null } = {
  get length() {
    return entries.size;
  },
  key: (index) => [...entries.keys()][index] ?? null,
  getItem: (key) => entries.get(key) ?? null,
  setItem: (key, value) => void entries.set(key, value),
  removeItem: (key) => void entries.delete(key),
};

/** 서버 호출과 화면 전환이 일어난 순서 */
const order: string[] = [];
let client: QueryClient;
const ui = () => (
  <QueryClientProvider client={client}>
    <SessionRoute />
  </QueryClientProvider>
);

async function openRoom(sessionId = '19') {
  mockParams.sessionId = sessionId;
  const view = await render(ui());
  await screen.findByRole('button', { name: '대화 메뉴' });
  return view;
}
async function switchTo(view: Awaited<ReturnType<typeof render>>, sessionId: string) {
  mockParams.sessionId = sessionId;
  await view.rerender(ui());
}
const press = async (name: string | RegExp, role: 'button' | 'radio' | 'checkbox' = 'button') =>
  fireEvent.press(await screen.findByRole(role, { name }));

async function openRestartIntro({ keep }: { keep: boolean }) {
  await press('대화 메뉴');
  await press('새로하기');
  if (!keep) await press('기존 대화 보관', 'checkbox');
  await press('새로하기 확인');
  await screen.findByRole('radio', { name: '첫 만남 인트로' });
}

beforeEach(() => {
  order.length = 0;
  mockReplace.mockReset();
  mockReplace.mockImplementation(({ params }: { params: { sessionId: string } }) =>
    order.push(`replace ${params.sessionId}`),
  );
  jest.spyOn(storage, 'getDraftStorage').mockReturnValue(local);
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } } });
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
  entries.clear();
});

it('CHAT-US-09-AC01: ☰를 누르면 오른쪽 메뉴에 새로하기·이어하기가 나오고, 새로하기 확인 팝업의 「기존 대화 보관」은 기본으로 체크돼 있다', async () => {
  const server = fakeServer();
  await openRoom();
  // 상태 보기 토글 옆 헤더 오른쪽의 ☰ 버튼
  expect(screen.getByRole('button', { name: '대화 메뉴' })).toBeCollapsed();
  await press('대화 메뉴');
  expect(screen.getByRole('header', { name: '대화 메뉴' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '새로하기' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '이어하기' })).toBeOnTheScreen();

  await press('새로하기');
  expect(screen.getByText('새로운 이야기를 시작할까요?')).toBeOnTheScreen();
  expect(screen.getByRole('checkbox', { name: '기존 대화 보관' })).toBeChecked();
  await press('기존 대화 보관', 'checkbox');
  expect(screen.getByRole('checkbox', { name: '기존 대화 보관' })).not.toBeChecked();
  expect(screen.getByText(/새 대화방이 열린 뒤에 지금 대화방을 삭제해요/)).toBeOnTheScreen();
  await press('새로하기 취소');
  expect(screen.queryByText('새로운 이야기를 시작할까요?')).not.toBeOnTheScreen();

  // 다시 열면 보관 체크는 기본값(체크)으로 돌아온다.
  await press('대화 메뉴');
  await press('새로하기');
  expect(screen.getByRole('checkbox', { name: '기존 대화 보관' })).toBeChecked();
  expect(server.posts()).toHaveLength(0);
  expect(server.deletes()).toHaveLength(0);
});

it('CHAT-US-09-AC01: 스토리 번호를 주지 않는 옛 서버에서는 ☰ 버튼을 그리지 않는다', async () => {
  const server = fakeServer();
  const { story_id: _omit, ...oldRoom } = server.rooms['19'];
  server.rooms['19'] = oldRoom;
  mockParams.sessionId = '19';
  await render(ui());
  expect(await screen.findByText('A방에서 한 약속')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '대화 메뉴' })).not.toBeOnTheScreen();
});

it('CHAT-US-09-AC03: 인트로 카드는 첫 카드가 선택된 채 본문을 보이고, 다른 카드를 누르면 선택과 본문만 바뀌며, 「새 대화 시작」을 눌러야 그 인트로로 새 방을 연다', async () => {
  const server = fakeServer();
  await openRoom();
  await openRestartIntro({ keep: true });
  expect(screen.getByRole('radio', { name: '첫 만남 인트로' })).toBeChecked();
  expect(screen.getByRole('radio', { name: '재회 인트로' })).not.toBeChecked();
  expect(screen.getByText('벚꽃이 흩날린다.')).toBeOnTheScreen();

  await press('재회 인트로', 'radio');
  expect(screen.getByRole('radio', { name: '재회 인트로' })).toBeChecked();
  expect(screen.getByRole('radio', { name: '첫 만남 인트로' })).not.toBeChecked();
  expect(screen.getByText('비 오는 밤이다.')).toBeOnTheScreen();
  expect(screen.queryByText('벚꽃이 흩날린다.')).not.toBeOnTheScreen();
  // 카드만 바꿔서는 방을 만들지 않는다.
  expect(server.posts()).toHaveLength(0);
  expect(mockReplace).not.toHaveBeenCalled();

  await press('새 대화 시작');
  await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
  expect(server.restartBodies()).toEqual([
    { intro_id: 12, request_id: expect.stringMatching(/^[A-Za-z0-9_-]{8,64}$/) },
  ]);
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/chat-session/[sessionId]', params: { sessionId: '31' } });
  // 새 방이 실제로 열리는지(상세 조회) 확인한 뒤 전환한다. 보관을 켰으므로 원본은 지우지 않는다(AC02).
  expect(order.filter((step) => !step.endsWith('/turns'))).toEqual([
    'GET /sessions/19',
    'GET /stories/3',
    'POST /sessions/19/restart',
    'GET /sessions/31',
    'replace 31',
  ]);
  expect(server.deletes()).toEqual([]);

  // 다음 새로하기는 새 request_id로 보낸다(다른 요청은 매번 새 방).
  await press('대화 메뉴');
  await press('새로하기');
  await press('새로하기 확인');
  await press('새 대화 시작');
  await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(2));
  const [firstRequest, secondRequest] = server.restartBodies();
  expect(secondRequest).toEqual({ intro_id: 11, request_id: expect.any(String) });
  expect(secondRequest?.request_id).not.toBe(firstRequest?.request_id);
});

it('CHAT-US-09-AC03: 결과를 모르는 실패 뒤 다시 누르면 결과가 정해질 때까지 같은 request_id로 확인한다', async () => {
  const server = fakeServer();
  server.handlers.restart
    .mockImplementationOnce(() => json({}, 503))
    .mockImplementationOnce(() => Promise.reject(new TypeError('Network request failed')))
    .mockImplementationOnce(() => json({ id: 31 }, 201));
  await openRoom();
  await openRestartIntro({ keep: true });
  await press('새 대화 시작');
  expect(await screen.findByText(/새 대화방을 만들었는지 확인하지 못했어요/)).toBeOnTheScreen();
  await press('새 대화 시작');
  await waitFor(() => expect(server.restartBodies()).toHaveLength(2));
  expect(await screen.findByText(/새 대화방을 만들었는지 확인하지 못했어요/)).toBeOnTheScreen();
  expect(mockReplace).not.toHaveBeenCalled();
  // 팝업을 닫았다 다시 열어도 결과를 모르는 요청은 같은 ID로 확인한다.
  await press('새 대화 시작 취소');
  await openRestartIntro({ keep: true });
  await press('새 대화 시작');
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ params: { sessionId: '31' } })),
  );
  const ids = server.restartBodies().map((body) => body?.request_id);
  expect(ids).toHaveLength(3);
  expect(new Set(ids).size).toBe(1);
});

it('CHAT-US-09-AC03: 서버가 확실히 거절하면 서버 안내를 보이고, 다음 시도는 새 request_id로 보낸다', async () => {
  const server = fakeServer();
  server.handlers.restart.mockImplementationOnce(() =>
    problem(422, 'VALIDATION_ERROR', '이 스토리의 인트로가 아닙니다.'),
  );
  await openRoom();
  await openRestartIntro({ keep: false });
  await press('새 대화 시작');
  expect(await screen.findByText('이 스토리의 인트로가 아닙니다.')).toBeOnTheScreen();
  // 실패한 새로하기는 원본을 지우지 않는다(AC04).
  expect(server.deletes()).toEqual([]);
  await press('새 대화 시작');
  await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
  const [first, second] = server.restartBodies();
  expect(second?.request_id).not.toBe(first?.request_id);
});

it('CHAT-US-09-AC04: 보관을 해제하면 새 방이 정상으로 열린 뒤에만 원본 방을 DELETE한다', async () => {
  const server = fakeServer();
  await openRoom();
  await openRestartIntro({ keep: false });
  expect(screen.getByText(/새 대화방이 열리면 지금 대화방을 삭제해요/)).toBeOnTheScreen();
  // 체크를 해제한 그 자리에서는 지우지 않는다.
  expect(server.deletes()).toEqual([]);
  await press('새 대화 시작');
  await waitFor(() => expect(server.deletes()).toEqual(['/sessions/19']));
  expect(order.filter((step) => !step.endsWith('/turns') && !step.startsWith('GET /stories'))).toEqual([
    'GET /sessions/19',
    'POST /sessions/19/restart',
    'GET /sessions/31',
    'replace 31',
    'DELETE /sessions/19',
  ]);
});

it('CHAT-US-09-AC04: 보관 해제 후 인트로 선택을 취소하거나 새 방을 열지 못하면 원본 방을 지우지 않는다', async () => {
  const server = fakeServer();
  await openRoom();
  // 1) 인트로 카드에서 취소
  await openRestartIntro({ keep: false });
  await press('새 대화 시작 취소');
  expect(screen.queryByRole('radio', { name: '첫 만남 인트로' })).not.toBeOnTheScreen();
  expect(server.posts()).toHaveLength(0);

  // 2) 새 방은 만들어졌지만 열리지 않음(상세 조회 실패): 전환·삭제 없음
  let failNewRoom = true;
  const opened = server.handlers.session.getMockImplementation()!;
  server.handlers.session.mockImplementation((id) => {
    if (id !== '31' || !failNewRoom) return opened(id);
    failNewRoom = false;
    return problem(500, 'INTERNAL', '서버 오류');
  });
  await openRestartIntro({ keep: false });
  await press('새 대화 시작');
  expect(await screen.findByText(/새 대화방을 열지 못했어요/)).toBeOnTheScreen();
  expect(mockReplace).not.toHaveBeenCalled();
  expect(server.deletes()).toEqual([]);
  // 원본 방 화면은 그대로다.
  expect(screen.getByText('A방에서 한 약속')).toBeOnTheScreen();

  // 3) 다시 누르면 같은 요청으로 같은 새 방을 확인하고, 열린 뒤에야 원본을 지운다.
  await press('새 대화 시작');
  await waitFor(() => expect(server.deletes()).toEqual(['/sessions/19']));
  const [first, second] = server.restartBodies();
  expect(second?.request_id).toBe(first?.request_id);
  expect(order.indexOf('replace 31')).toBeLessThan(order.indexOf('DELETE /sessions/19'));
});

it('CHAT-US-09-AC02/AC06: 이어하기 목록은 같은 스토리에서 지금 방을 뺀 방을 읽고, 항목마다 제목·마지막 메시지 미리보기·시각을 보인다', async () => {
  const server = fakeServer();
  const saved = summary({});
  const other = summary({
    id: 4,
    intro_title: null,
    last_message_preview: null,
    last_activity_at: '2026-11-20T01:02:00Z',
    generating: true,
  });
  server.handlers.list.mockImplementation(() => json({ sessions: [saved, other], next_before_id: null }));
  await openRoom();
  await press('대화 메뉴');
  await press('이어하기');
  expect(await screen.findByRole('button', { name: `${sessionName(saved)} 대화 이어하기` })).toBeOnTheScreen();
  expect(server.calls.filter(({ url }) => url.includes('/sessions?')).map(({ url }) => url)).toEqual([
    `${BASE}/sessions?story_id=3&exclude_session_id=19`,
  ]);
  expect(screen.getByText('첫 만남')).toBeOnTheScreen();
  expect(screen.getByText('지난번 약속 기억해?')).toBeOnTheScreen();
  // 인트로 제목이 없으면 기본 이름, 미리보기가 없으면 안내 문구
  expect(screen.getByRole('button', { name: `${sessionName(other)} 대화 이어하기` })).toBeOnTheScreen();
  expect(sessionName(other)).toMatch(/^저장된 대화, 2026\.11\.\d\d \d\d:\d\d$/);
  expect(screen.getByText('아직 주고받은 메시지가 없어요.')).toBeOnTheScreen();
  expect(screen.getByText('응답 생성 중')).toBeOnTheScreen();
  // 항목별 ⋮ 메뉴는 항목 이름으로 구분한다.
  expect(screen.getByRole('button', { name: `${sessionName(saved)} 대화 메뉴` })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: `${sessionName(other)} 대화 메뉴` })).toBeOnTheScreen();
});

it('CHAT-US-09-AC05: 저장된 다른 방이 없으면 빈 목록과 함께 새 대화 시작 방법을 안내하고, 버튼으로 새로하기 팝업을 연다', async () => {
  const server = fakeServer();
  server.handlers.list.mockImplementation(() => json({ sessions: [], next_before_id: null }));
  await openRoom();
  await press('대화 메뉴');
  await press('이어하기');
  expect(await screen.findByText('저장된 다른 대화가 없어요.')).toBeOnTheScreen();
  expect(screen.getByText(/「새로하기」로 이 스토리의 새 대화를 시작할 수 있어요/)).toBeOnTheScreen();
  await press('새로하기로 새 대화 시작');
  expect(screen.getByText('새로운 이야기를 시작할까요?')).toBeOnTheScreen();
  expect(screen.getByRole('checkbox', { name: '기존 대화 보관' })).toBeChecked();
});

it('CHAT-US-09-AC07/AC08/AC09: 목록에서 고른 방으로 새 방 없이 replace하고, 바뀐 화면에는 그 방의 메시지·입력만 보이며, 목록은 늘 지금 방만 뺀다', async () => {
  const server = fakeServer();
  const roomA = summary({ id: 19, intro_title: '첫 만남', last_message_preview: 'A방에서 한 약속' });
  const roomB = summary({ id: 31, intro_title: '재회', last_message_preview: null });
  server.handlers.list.mockImplementation((query) =>
    json({ sessions: query.get('exclude_session_id') === '19' ? [roomB] : [roomA], next_before_id: null }),
  );
  const view = await openRoom('19');
  expect(screen.getByText('A방에서 한 약속')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('메시지 입력'), 'A에서 쓰던 글');

  // A → B
  await press('대화 메뉴');
  await press('이어하기');
  expect(screen.queryByRole('button', { name: `${sessionName(roomA)} 대화 이어하기` })).not.toBeOnTheScreen();
  await press(`${sessionName(roomB)} 대화 이어하기`);
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/chat-session/[sessionId]', params: { sessionId: '31' } });
  // 이어하기는 기존 방으로만 바꾼다. 새 방·새 생성 요청을 만들지 않는다(AC07).
  expect(server.posts()).toHaveLength(0);
  await switchTo(view, '31');
  expect(await screen.findByText('새벽 바다가 보인다.')).toBeOnTheScreen();
  expect(screen.queryByText('A방에서 한 약속')).not.toBeOnTheScreen();
  expect(screen.queryByText('문이 열렸다.')).not.toBeOnTheScreen();
  expect(screen.getByLabelText('메시지 입력')).toHaveProp('value', '');

  // B에서 연 목록: B는 빠지고 A는 고를 수 있다(AC08).
  await press('대화 메뉴');
  await press('이어하기');
  expect(await screen.findByRole('button', { name: `${sessionName(roomA)} 대화 이어하기` })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: `${sessionName(roomB)} 대화 이어하기` })).not.toBeOnTheScreen();
  expect(server.calls.filter(({ url }) => url.includes('/sessions?')).map(({ url }) => url)).toEqual([
    `${BASE}/sessions?story_id=3&exclude_session_id=19`,
    `${BASE}/sessions?story_id=3&exclude_session_id=31`,
  ]);
  await fireEvent.changeText(screen.getByLabelText('메시지 입력'), 'B에서 쓰던 글');

  // B → A: A의 기록과 입력 중이던 글이 그대로, B 것은 섞이지 않는다.
  await press(`${sessionName(roomA)} 대화 이어하기`);
  expect(mockReplace).toHaveBeenLastCalledWith({ pathname: '/chat-session/[sessionId]', params: { sessionId: '19' } });
  await switchTo(view, '19');
  expect(await screen.findByText('A방에서 한 약속')).toBeOnTheScreen();
  expect(screen.queryByText('새벽 바다가 보인다.')).not.toBeOnTheScreen();
  expect(screen.getByLabelText('메시지 입력')).toHaveProp('value', 'A에서 쓰던 글');
  // 방별 캐시 키가 따로라 두 방의 입력이 서로 덮어쓰지 않는다.
  expect(client.getQueryData(draftKey('31'))).toEqual(expect.objectContaining({ text: 'B에서 쓰던 글' }));
  expect(client.getQueryData(draftKey('19'))).toEqual(expect.objectContaining({ text: 'A에서 쓰던 글' }));
  expect(server.posts()).toHaveLength(0);
  expect(server.deletes()).toEqual([]);
});

it('CHAT-US-09-AC13: ⋮ → 대화 삭제는 바로 지우지 않고 제목·삭제 범위·복구 불가를 보이며, 취소하면 아무것도 바뀌지 않는다', async () => {
  const server = fakeServer();
  const saved = summary({});
  await openRoom();
  await press('대화 메뉴');
  await press('이어하기');
  await press(`${sessionName(saved)} 대화 메뉴`);
  expect(screen.getByRole('button', { name: `${sessionName(saved)} 대화 메뉴` })).toBeExpanded();
  await press(`${sessionName(saved)} 대화 삭제`);
  expect(screen.getByText('대화방을 삭제할까요?')).toBeOnTheScreen();
  expect(screen.getByText('「첫 만남」')).toBeOnTheScreen();
  expect(screen.getByText('이 대화방의 대화 기록·장면·관계가 모두 삭제되고 되돌릴 수 없어요.')).toBeOnTheScreen();
  expect(server.deletes()).toEqual([]);

  await press('첫 만남 대화방 삭제 취소');
  expect(screen.queryByText('대화방을 삭제할까요?')).not.toBeOnTheScreen();
  expect(screen.getByRole('button', { name: `${sessionName(saved)} 대화 이어하기` })).toBeOnTheScreen();
  expect(server.deletes()).toEqual([]);
});

it('CHAT-US-09-AC14: 「대화방 삭제」를 눌러야 DELETE하고, 목록에서 빼며 그 방의 화면 캐시와 기기 보관분만 지운다', async () => {
  const server = fakeServer();
  const saved = summary({});
  const draft7 = 'charchat:chat-draft:v1:8:7';
  const removed = [
    draft7,
    'charchat:chat-send:v1:8:7',
    `charchat:chat-draft-clear:v1:${draft7}`,
    `charchat:chat-draft-data:v1:${JSON.stringify([draft7, 'g1'])}`,
  ];
  const kept = [
    'charchat:chat-draft:v1:8:70',
    'charchat:chat-send:v1:8:70',
    'charchat:chat-draft:v1:12:7',
    `charchat:chat-draft-data:v1:${JSON.stringify(['charchat:chat-draft:v1:8:70', 'g1'])}`,
  ];
  [...removed, ...kept].forEach((key) => entries.set(key, 'x'));
  client.setQueryData(conversationSessionKey('7'), room(7, '옛 장면'));
  client.setQueryData(turnsKey('7'), turns('7번 방 대화'));
  client.setQueryData(draftKey('7'), { text: '7번 방 입력' });
  client.setQueryData(turnsKey('70'), turns('70번 방 대화'));
  await openRoom();
  await press('대화 메뉴');
  await press('이어하기');
  await press(`${sessionName(saved)} 대화 메뉴`);
  await press(`${sessionName(saved)} 대화 삭제`);
  await press('첫 만남 대화방 삭제');
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: `${sessionName(saved)} 대화 이어하기` })).not.toBeOnTheScreen(),
  );
  expect(server.deletes()).toEqual(['/sessions/7']);
  expect(screen.queryByText('대화방을 삭제할까요?')).not.toBeOnTheScreen();
  await waitFor(() => removed.forEach((key) => expect(entries.has(key)).toBe(false)));
  kept.forEach((key) => expect(entries.has(key)).toBe(true));
  expect(client.getQueryData(conversationSessionKey('7'))).toBeUndefined();
  expect(client.getQueryData(turnsKey('7'))).toBeUndefined();
  expect(client.getQueryData(draftKey('7'))).toBeUndefined();
  // 같은 계정의 다른 방과 지금 방은 그대로다.
  expect(client.getQueryData(turnsKey('70'))).toBeDefined();
  expect(client.getQueryData(turnsKey('19'))).toBeDefined();
  expect(screen.getByText('A방에서 한 약속')).toBeOnTheScreen();
});

it('CHAT-US-09-AC13: 응답 생성 중이라 409 GENERATION_IN_PROGRESS로 거절되면 서버 문구를 보이고 방을 남긴다', async () => {
  const server = fakeServer();
  const saved = summary({ generating: true });
  server.handlers.list.mockImplementation(() => json({ sessions: [saved], next_before_id: null }));
  server.handlers.remove.mockImplementation(() =>
    problem(409, 'GENERATION_IN_PROGRESS', '응답이 끝난 뒤 삭제할 수 있어요.'),
  );
  entries.set('charchat:chat-draft:v1:8:7', 'x');
  client.setQueryData(turnsKey('7'), turns('7번 방 대화'));
  await openRoom();
  await press('대화 메뉴');
  await press('이어하기');
  await press(`${sessionName(saved)} 대화 메뉴`);
  await press(`${sessionName(saved)} 대화 삭제`);
  await press('첫 만남 대화방 삭제');
  expect(await screen.findByText('응답이 끝난 뒤 삭제할 수 있어요.')).toBeOnTheScreen();
  expect(screen.getByText('대화방을 삭제할까요?')).toBeOnTheScreen();
  expect(server.deletes()).toEqual(['/sessions/7']);
  expect(entries.has('charchat:chat-draft:v1:8:7')).toBe(true);
  expect(client.getQueryData(turnsKey('7'))).toBeDefined();
  await press('첫 만남 대화방 삭제 취소');
  expect(screen.getByRole('button', { name: `${sessionName(saved)} 대화 이어하기` })).toBeOnTheScreen();
});

it('CHAT-US-09-AC14: 방 하나의 기기 보관 키만 고른다(다른 계정·다른 방·번호 앞부분이 같은 방은 제외)', () => {
  const draft = 'charchat:chat-draft:v1:8:7';
  expect(isSessionChatDeviceKey(draft, '8', '7')).toBe(true);
  expect(isSessionChatDeviceKey('charchat:chat-send:v1:8:7', '8', '7')).toBe(true);
  expect(isSessionChatDeviceKey(`charchat:chat-draft-clear:v1:${draft}`, '8', '7')).toBe(true);
  expect(isSessionChatDeviceKey(`charchat:chat-draft-data:v1:${JSON.stringify([draft, 'a'])}`, '8', '7')).toBe(true);
  expect(isSessionChatDeviceKey('charchat:chat-draft:v1:8:70', '8', '7')).toBe(false);
  expect(isSessionChatDeviceKey('charchat:chat-send:v1:8:70', '8', '7')).toBe(false);
  expect(isSessionChatDeviceKey('charchat:chat-draft:v1:18:7', '8', '7')).toBe(false);
  expect(
    isSessionChatDeviceKey(
      `charchat:chat-draft-data:v1:${JSON.stringify(['charchat:chat-draft:v1:8:70', 'a'])}`,
      '8',
      '7',
    ),
  ).toBe(false);
  expect(isSessionChatDeviceKey(draft, 'x', '7')).toBe(false);
});
