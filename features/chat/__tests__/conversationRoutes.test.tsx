// CHAT-US-01 (KAN-16) 스토리 상세와 대화방 진입
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import SessionRoute from '@/app/chat-session/[sessionId]';
import StoryRoute from '@/app/story/[storyId]';

const mockParams = { storyId: '7', sessionId: '19' };
const mockRouter = { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };

jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => mockRouter }));
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

const STORY_PATH = 'http://localhost:8000/api/v1/conversation/stories/7';
const story = {
  id: 7,
  title: '달빛 정원',
  subtitle: '한밤의 초대',
  world_description: '밤이 오면 꽃이 말을 건넨다.',
  effective_rating: '15세',
  characters: [
    { id: 1, name: '서윤', description: '정원사' },
    { id: 2, name: '윤슬', description: '밤의 안내자' },
  ],
  intros: [
    {
      id: 11,
      title: '정원 입구',
      messages: [
        { speaker_kind: 'narrator', speaker_name: null, body: '문이 열렸다.' },
        { speaker_kind: 'character', speaker_name: '서윤', body: '어서 와.' },
        { speaker_kind: 'user', speaker_name: null, body: '실례합니다.' },
      ],
    },
    { id: 12, title: '온실', messages: [{ speaker_kind: 'narrator', speaker_name: null, body: '비가 내린다.' }] },
  ],
  profiles: [
    { id: 6, kind: 'preset', name: '여행자', description: '낯선 곳을 찾아다닌다.', initial_name: '여행' },
    { id: 5, kind: 'preset', name: '탐험가', description: '사라진 도시를 찾는다.', initial_name: null },
    { id: 6, kind: 'personal', name: '내 모험가', description: '나만의 모험가다.', initial_name: '모험' },
  ],
  existing_session_id: null,
  tags: ['판타지'],
};

const clients: QueryClient[] = [];
const show = (route: ReactElement) => {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{route}</QueryClientProvider>);
};

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const refetchConversation = (resource: 'story' | 'session', id: string) =>
  act(async () => {
    await clients[0].invalidateQueries({ queryKey: ['conversation', resource, id] });
    // React Query가 예약한 화면 갱신까지 기다린다.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.storyId = '7';
  mockParams.sessionId = '19';
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  jest.restoreAllMocks();
});

it('KAN-16: 상세를 모두 펼쳐 보여 주고 첫 인트로 말풍선을 순서대로 보여 준다', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(story));
  await show(<StoryRoute />);

  expect(await screen.findByText('달빛 정원')).toBeOnTheScreen();
  for (const text of [
    '한밤의 초대',
    '밤이 오면 꽃이 말을 건넨다.',
    '15세',
    '판타지',
    '서윤',
    '정원사',
    '윤슬',
    '밤의 안내자',
  ]) {
    expect(screen.getAllByText(text)[0]).toBeOnTheScreen();
  }
  expect(screen.getByRole('button', { name: '정원 입구', selected: true })).toBeOnTheScreen();
  const bubbles = screen.getAllByTestId('conversation-bubble');
  expect(bubbles).toHaveLength(3);
  expect(bubbles[0]).toHaveTextContent('나레이터문이 열렸다.');
  expect(bubbles[1]).toHaveTextContent('서윤어서 와.');
  expect(bubbles[2]).toHaveTextContent('유저실례합니다.');
  expect(screen.queryByText('비가 내린다.')).not.toBeOnTheScreen();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(STORY_PATH, expect.objectContaining({ signal: expect.anything() }));
});

it('KAN-16: 인트로와 프로필을 선택하고 이름 원문으로 대화방을 한 번만 만든다', async () => {
  let finishPost!: (result: Response) => void;
  const pendingPost = new Promise<Response>((resolve) => {
    finishPost = resolve;
  });
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(response(story))
    .mockReturnValueOnce(pendingPost);
  await show(<StoryRoute />);
  expect(await screen.findByRole('button', { name: '대화 시작' })).toBeDisabled();
  expect(screen.queryByLabelText('플레이 이름')).not.toBeOnTheScreen();
  expect(fetchMock).toHaveBeenCalledTimes(1);

  await fireEvent.press(screen.getByRole('button', { name: '온실' }));
  expect(screen.getByRole('button', { name: '온실', selected: true })).toBeOnTheScreen();
  expect(screen.queryByText('어서 와.')).not.toBeOnTheScreen();
  expect(screen.getByText('비가 내린다.')).toBeOnTheScreen();
  expect(screen.getAllByRole('radio').map((item) => item.props.accessibilityLabel)).toEqual([
    '여행자',
    '탐험가',
    '내 모험가',
  ]);
  await fireEvent.press(screen.getByRole('radio', { name: '여행자' }));
  expect(screen.getByLabelText('플레이 이름')).toHaveDisplayValue('여행');
  await fireEvent.press(screen.getByRole('radio', { name: '내 모험가' }));
  expect(screen.getByRole('radio', { name: '여행자', checked: false })).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: '내 모험가', checked: true })).toBeOnTheScreen();
  expect(screen.getByLabelText('플레이 이름')).toHaveDisplayValue('모험');
  await fireEvent.changeText(screen.getByLabelText('플레이 이름'), '  나의 별  ');

  const start = screen.getByRole('button', { name: '대화 시작' });
  await act(async () => {
    await fireEvent.press(start);
    await fireEvent.press(start);
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock).toHaveBeenLastCalledWith(
    `${STORY_PATH}/sessions`,
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ intro_id: 12, profile_kind: 'personal', profile_id: 6, play_name: '  나의 별  ' }),
    }),
  );
  expect(await screen.findByRole('button', { name: '대화 시작 중…' })).toBeDisabled();
  await act(async () => finishPost(response({ id: 19 }, 201)));
  await waitFor(() =>
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/chat-session/[sessionId]',
      params: { sessionId: '19' },
    }),
  );
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole('button', { name: '이어하기' })).toBeEnabled();
});

it('KAN-16: 서버가 반환한 기존 방은 POST 없이 이어한다', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response({ ...story, existing_session_id: 21 }));
  await show(<StoryRoute />);
  await fireEvent.press(await screen.findByRole('button', { name: '이어하기' }));
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/chat-session/[sessionId]', params: { sessionId: '21' } });
  expect(screen.queryByRole('button', { name: '대화 시작' })).not.toBeOnTheScreen();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('KAN-16: 플레이 이름 검증 실패를 보여 주고 입력을 수정해 다시 시작한다', async () => {
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(response(story))
    .mockResolvedValueOnce(response({ code: 'INVALID_PLAY_NAME', detail: '플레이 이름을 입력하세요.' }, 422))
    .mockResolvedValueOnce(response({ id: 19 }, 201));
  await show(<StoryRoute />);
  await fireEvent.press(await screen.findByRole('radio', { name: '탐험가' }));
  expect(screen.getByLabelText('플레이 이름')).toHaveDisplayValue('');
  await fireEvent.press(screen.getByRole('button', { name: '대화 시작' }));
  expect(await screen.findByText('플레이 이름을 입력하세요.')).toBeOnTheScreen();
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await fireEvent.changeText(screen.getByLabelText('플레이 이름'), '나');
  await fireEvent.press(screen.getByRole('button', { name: '대화 시작' }));
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(1));
  await screen.findByRole('button', { name: '이어하기' });
  expect(fetchMock.mock.calls.slice(1).map(([, options]) => JSON.parse(String(options?.body)))).toEqual([
    { intro_id: 11, profile_kind: 'preset', profile_id: 5, play_name: '' },
    { intro_id: 11, profile_kind: 'preset', profile_id: 5, play_name: '나' },
  ]);
});

it('KAN-16: 프로필이 없으면 추가가 필요함을 안내하고 대화나 프로필을 만들지 않는다', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
    response({
      ...story,
      profiles: [],
      effective_rating: null,
      rating: '19세',
    }),
  );
  await show(<StoryRoute />);
  const add = await screen.findByRole('button', { name: '프로필 추가' });
  expect(add).toBeDisabled();
  await fireEvent.press(add);
  expect(screen.getByRole('button', { name: '대화 시작' })).toBeDisabled();
  expect(screen.queryByText(/등급|19세|전체 이용가/)).not.toBeOnTheScreen();
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('KAN-16: 상세 조회 로딩을 표시하고 실패 후 다시 조회한다', async () => {
  let failGet!: (result: Response) => void;
  const pendingGet = new Promise<Response>((resolve) => {
    failGet = resolve;
  });
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockReturnValueOnce(pendingGet)
    .mockResolvedValueOnce(response(story));
  await show(<StoryRoute />);
  expect(screen.getByText('스토리를 불러오는 중…')).toBeOnTheScreen();
  await act(async () => failGet(response({}, 503)));
  await fireEvent.press(await screen.findByRole('button', { name: '다시 시도' }));
  expect(await screen.findByText('달빛 정원')).toBeOnTheScreen();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('KAN-16: 인트로가 없으면 대화를 시작할 수 없다', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response({ ...story, intros: [] }));
  await show(<StoryRoute />);
  await fireEvent.press(await screen.findByRole('radio', { name: '여행자' }));
  expect(screen.getByText('등록된 인트로가 없습니다.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '대화 시작' })).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('KAN-16: 상세 헤더의 뒤로 버튼을 누르면 이전 화면으로 돌아간다', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(story));
  await show(<StoryRoute />);
  await screen.findByText('달빛 정원');
  await fireEvent.press(screen.getByRole('button', { name: '뒤로' }));
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
});

const session = {
  id: 19,
  story_title: '달빛 정원',
  model: 'applied-model',
  read_only: false,
  messages: story.intros[0].messages,
  characters: [{ id: 2, name: '윤슬' }],
};

it('KAN-16: 대화방에 서버의 말풍선, 등장 캐릭터, 적용된 모델만 보여 준다', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(session));
  await show(<SessionRoute />);
  expect(await screen.findByText('달빛 정원')).toBeOnTheScreen();
  expect(screen.getByText('윤슬')).toBeOnTheScreen();
  expect(screen.getByText('적용 모델: applied-model')).toBeOnTheScreen();
  expect(screen.getAllByTestId('conversation-bubble')).toHaveLength(3);
  expect(screen.getAllByTestId('conversation-bubble')[0]).toHaveTextContent('나레이터문이 열렸다.');
  expect(screen.getAllByTestId('conversation-bubble')[2]).toHaveTextContent('유저실례합니다.');
  expect(screen.queryByText('읽기 전용')).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: /모델|전송/ })).not.toBeOnTheScreen();
  expect(fetchMock).toHaveBeenCalledWith(
    'http://localhost:8000/api/v1/conversation/sessions/19',
    expect.objectContaining({ signal: expect.anything() }),
  );
  await fireEvent.press(screen.getByRole('button', { name: '뒤로' }));
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
});

it('KAN-16: 읽기 전용 방은 빈 대화 상태를 표시하고 모델 값이 없으면 숨긴다', async () => {
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(response({ ...session, read_only: true, model: null, messages: [], characters: [] }));
  await show(<SessionRoute />);
  expect(await screen.findByText('읽기 전용')).toBeOnTheScreen();
  expect(screen.getByText('표시할 대화가 없습니다.')).toBeOnTheScreen();
  expect(screen.queryByText(/모델/)).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: /전송/ })).not.toBeOnTheScreen();
});

it('KAN-16: 대화방 재조회가 읽기 전용 응답을 반환하면 대화 내용을 계속 표시한다', async () => {
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(response(session))
    .mockResolvedValueOnce(response({ ...session, read_only: true }));
  await show(<SessionRoute />);
  expect(await screen.findByText('달빛 정원')).toBeOnTheScreen();
  expect(screen.queryByText('읽기 전용')).not.toBeOnTheScreen();

  await refetchConversation('session', '19');
  expect(await screen.findByText('읽기 전용')).toBeOnTheScreen();
  expect(screen.getByText('문이 열렸다.')).toBeOnTheScreen();
});

describe.each([
  ['스토리 상세', StoryRoute, 'story', '7', story, '스토리를 불러오지 못했습니다.'],
  ['대화방', SessionRoute, 'session', '19', session, '대화방을 불러오지 못했습니다.'],
] as const)('KAN-16: %s 재조회', (_label, Route, resource, id, data, errorMessage) => {
  it.each([401, 403, 404])('%i 응답이면 캐시된 내용을 숨기고 다시 시도하지 않는다', async (status) => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(data))
      .mockImplementation(async () => response({}, status));
    await show(<Route />);
    expect(await screen.findByText('달빛 정원')).toBeOnTheScreen();
    expect(screen.getByText('문이 열렸다.')).toBeOnTheScreen();

    await refetchConversation(resource, id);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('달빛 정원')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('conversation-bubble')).not.toBeOnTheScreen();
    expect(screen.getByText(errorMessage)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeOnTheScreen();
  });

  it('503 응답이면 캐시된 내용을 계속 표시한다', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(data));
    await show(<Route />);
    expect(await screen.findByText('달빛 정원')).toBeOnTheScreen();

    fetchMock.mockResolvedValueOnce(response({}, 503));
    await refetchConversation(resource, id);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText('달빛 정원')).toBeOnTheScreen();
    expect(screen.getByText('문이 열렸다.')).toBeOnTheScreen();
  });

  it('접근 거부 후 503 응답이 와도 이전 내용을 다시 표시하지 않는다', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(data))
      .mockResolvedValueOnce(response({}, 403))
      .mockResolvedValueOnce(response({}, 503));
    await show(<Route />);
    expect(await screen.findByText('달빛 정원')).toBeOnTheScreen();

    await refetchConversation(resource, id);
    await refetchConversation(resource, id);
    expect(screen.queryByText('달빛 정원')).not.toBeOnTheScreen();
    expect(screen.getByText(errorMessage)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeOnTheScreen();
  });
});

it('KAN-16: 대화방 조회가 실패하면 다시 시도할 수 있다', async () => {
  let failGet!: (result: Response) => void;
  const pendingGet = new Promise<Response>((resolve) => {
    failGet = resolve;
  });
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockReturnValueOnce(pendingGet)
    .mockResolvedValueOnce(response(session));
  await show(<SessionRoute />);
  expect(screen.getByText('대화방을 불러오는 중…')).toBeOnTheScreen();
  await act(async () => failGet(response({}, 503)));
  await fireEvent.press(await screen.findByRole('button', { name: '다시 시도' }));
  expect(await screen.findByText('달빛 정원')).toBeOnTheScreen();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it.each([
  ['storyId', StoryRoute, '스토리를 불러오지 못했습니다.'],
  ['sessionId', SessionRoute, '대화방을 불러오지 못했습니다.'],
] as const)('CHAT-US-01: 잘못된 %s로 API 요청을 보내지 않는다', async (param, Route, message) => {
  mockParams[param] = '../wrong';
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response({}, 404));
  await show(<Route />);
  expect(await screen.findByText(message)).toBeOnTheScreen();
  expect(fetchMock).not.toHaveBeenCalled();
});
