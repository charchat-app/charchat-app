// CHAT-US-03 내 대화 목록
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import ChatRoute from '@/app/(tabs)/chat/index';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useFocusEffect: jest.fn() }));
jest.mock('@/lib/api-client', () => {
  const { EXPO_PUBLIC_API_URL: url, EXPO_PUBLIC_DEV_USER_ID: id } = process.env;
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
  process.env.EXPO_PUBLIC_DEV_USER_ID = '8';
  try {
    return jest.requireActual('@/lib/api-client');
  } finally {
    if (url === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = url;
    if (id === undefined) delete process.env.EXPO_PUBLIC_DEV_USER_ID;
    else process.env.EXPO_PUBLIC_DEV_USER_ID = id;
  }
});

const listUrl = 'http://localhost:8000/api/v1/conversation/sessions';
const first = { id: 47, story_id: 3, story_title: '밤의 정원', read_only: false };
const second = { id: 19, story_id: 2, story_title: '달의 호수', read_only: true };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
let client: QueryClient;

beforeEach(() => {
  mockPush.mockClear();
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

const show = () =>
  render(
    <QueryClientProvider client={client}>
      <ChatRoute />
    </QueryClientProvider>,
  );

it('CHAT-US-03-AC01/AC02: 내 목록을 읽고 선택한 세션 ID로 POST 없이 이동한다', async () => {
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(response({ sessions: [first, second], next_before_id: null }));
  await show();
  expect(await screen.findByRole('button', { name: first.story_title })).toBeOnTheScreen();
  expect(screen.getByText('달의 호수 · 읽기 전용')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: /달의 호수/ }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/chat-session/[sessionId]', params: { sessionId: '19' } });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(
    listUrl,
    expect.objectContaining({ headers: expect.objectContaining({ 'X-User-Id': '8' }) }),
  );
  expect(fetchMock.mock.calls[0][1]?.method ?? 'GET').toBe('GET');
});

it('CHAT-US-03-AC01: 초기 로딩과 오류를 보여 주고 재시도 후 빈 목록을 알린다', async () => {
  let complete!: (result: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    complete = resolve;
  });
  jest
    .spyOn(globalThis, 'fetch')
    .mockReturnValueOnce(pending)
    .mockResolvedValueOnce(response({ sessions: [], next_before_id: null }));
  await show();
  expect(screen.getByText('대화 목록을 불러오는 중…')).toBeOnTheScreen();
  await act(async () => complete(response({}, 503)));
  await fireEvent.press(await screen.findByRole('button', { name: '다시 시도' }));
  expect(await screen.findByText('아직 시작한 대화가 없습니다.')).toBeOnTheScreen();
});

it('CHAT-US-03-AC01: 다음 페이지 오류 뒤 같은 커서로 재시도하고 기존 목록에 이어 붙인다', async () => {
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(response({ sessions: [first], next_before_id: 47 }))
    .mockResolvedValueOnce(response({}, 503))
    .mockResolvedValueOnce(response({ sessions: [second], next_before_id: null }));
  await show();
  await fireEvent.press(await screen.findByRole('button', { name: '더 보기' }));
  expect(await screen.findByText('다음 대화 목록을 불러오지 못했습니다.')).toBeOnTheScreen();
  expect(screen.getByText(first.story_title)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: '다시 더 보기' }));
  expect(await screen.findByText('달의 호수 · 읽기 전용')).toBeOnTheScreen();
  expect(screen.getByText(first.story_title)).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeOnTheScreen();
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    listUrl,
    `${listUrl}?before_id=47`,
    `${listUrl}?before_id=47`,
  ]);
});

it('CHAT-US-03-AC01: 다음 페이지가 접근을 거부하면 이전 목록을 숨기며 일시적 오류 뒤에도 복원하지 않는다', async () => {
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(response({ sessions: [first], next_before_id: 47 }))
    .mockResolvedValueOnce(response({}, 403))
    .mockResolvedValueOnce(response({}, 503));
  await show();
  await fireEvent.press(await screen.findByRole('button', { name: '더 보기' }));
  expect(await screen.findByText('대화 목록을 불러오지 못했습니다.')).toBeOnTheScreen();
  expect(screen.queryByText(first.story_title)).not.toBeOnTheScreen();
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['conversation', 'sessions'] });
  });
  expect(await screen.findByRole('button', { name: '다시 시도' })).toBeOnTheScreen();
  expect(screen.queryByText(first.story_title)).not.toBeOnTheScreen();
});
