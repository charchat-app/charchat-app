// CHAT-US-04 (KAN-26) 내 대화가 아닌 대화방 주소의 접근 불가 안내와 홈 이동
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import SessionRoute from '@/app/chat-session/[sessionId]';

const mockRouter = { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => false) };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ sessionId: '19' }),
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

const clients: QueryClient[] = [];
const show = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <SessionRoute />
    </QueryClientProvider>,
  );
};
const response = (body: unknown, status: number) => new Response(JSON.stringify(body), { status });
const problem = (status: number) => response({ code: 'CONVERSATION_SESSION_NOT_FOUND', message: '없음' }, status);

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.canGoBack.mockReturnValue(false);
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  jest.restoreAllMocks();
});

it.each([404, 403])(
  'CHAT-US-04-AC04: 주소로 바로 연 남의 대화방(%i)은 안내를 보이고 이전 화면 없이도 홈으로 간다',
  async (status) => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => problem(status));
    await show();

    expect(await screen.findByText('접속할 수 없습니다')).toBeOnTheScreen();
    expect(screen.getByText('이 대화방은 열 수 없어요. 내 대화만 볼 수 있습니다.')).toBeOnTheScreen();
    // 대화 내용·오류 재시도 대신 공통 안내만 보인다.
    expect(screen.queryByTestId('conversation-bubble')).not.toBeOnTheScreen();
    expect(screen.queryByText('대화방을 불러오지 못했습니다.')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeOnTheScreen();
    // 이전 화면이 없으니 뒤로 버튼은 없고, 홈 이동만으로 빠져나간다.
    expect(screen.queryByRole('button', { name: '뒤로' })).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: '홈으로 이동' }));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/');
    expect(mockRouter.back).not.toHaveBeenCalled();
  },
);

it('CHAT-US-04-AC04: 이전 화면이 있으면 뒤로와 홈 이동을 모두 쓸 수 있다', async () => {
  mockRouter.canGoBack.mockReturnValue(true);
  jest.spyOn(globalThis, 'fetch').mockImplementation(async () => problem(404));
  await show();

  expect(await screen.findByText('접속할 수 없습니다')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: '뒤로' }));
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: '홈으로 이동' }));
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/');
});

it.each([
  [401, false],
  [503, true],
])('CHAT-US-04-AC04: %i 응답은 접근 불가 안내로 묶지 않는다', async (status, retryable) => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async () => problem(status));
  await show();

  expect(await screen.findByText('대화방을 불러오지 못했습니다.')).toBeOnTheScreen();
  expect(screen.queryByText('접속할 수 없습니다')).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '홈으로 이동' })).not.toBeOnTheScreen();
  if (retryable) expect(screen.getByRole('button', { name: '다시 시도' })).toBeOnTheScreen();
  else expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeOnTheScreen();
});
