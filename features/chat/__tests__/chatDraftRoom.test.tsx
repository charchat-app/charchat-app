// CHAT-US-03 대화방 입력 임시 저장
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';

import { ChatSessionScreen } from '@/features/chat/components/ChatSessionScreen';
import * as identity from '@/features/chat/conversationIdentity';
import { chatDraftKey, persistDraft, readDraft } from '@/features/chat/draftPersistence';
import * as storage from '@/features/chat/draftStorage';
import type { DraftStorage } from '@/features/chat/draftStorage.types';
import { useChatDraft } from '@/features/chat/hooks/useChatDraft';

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

const room = { id: 19, story_title: '숲', model: null, read_only: false, messages: [], characters: [] };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const input = '보내지 않은 메시지';
const entries = new Map<string, string>();
const local = {
  getItem: jest.fn((key: string) => entries.get(key) ?? null),
  setItem: jest.fn((key: string, value: string) => {
    entries.set(key, value);
  }),
  removeItem: jest.fn((key: string) => {
    entries.delete(key);
  }),
};
const clients: QueryClient[] = [];
let owner: string | null;

beforeEach(() => {
  owner = '8';
  jest.spyOn(identity, 'getConversationOwnerId').mockImplementation(() => owner);
  jest.spyOn(storage, 'getDraftStorage').mockReturnValue(local);
});
afterEach(async () => {
  await act(async () => jest.runOnlyPendingTimers());
  jest.useRealTimers();
  clients.splice(0).forEach((client) => client.clear());
  entries.clear();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

const show = async (id = '19', client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })) => {
  clients.push(client);
  const view = await render(
    <QueryClientProvider client={client}>
      <ChatSessionScreen sessionId={id} />
    </QueryClientProvider>,
  );
  return { view, client };
};
const tick = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });
const change = (text: string) => fireEvent.changeText(screen.getByLabelText(input), text);

it.each([null, '기존 저장본'])(
  'CHAT-US-03-AC08: 다른 탭에서 지우면 이전 저장본(%s)과 아직 예약 중인 입력을 복원하지 않는다',
  (saved) => {
    jest.useFakeTimers();
    // 탭마다 별도 Storage 객체와 예약 작업을 가지지만, 같은 origin의 데이터는 공유한다.
    const tabA = { ...local };
    const tabB = { ...local };
    const key = chatDraftKey('8', '19')!;
    const otherRoom = chatDraftKey('8', '20')!;
    const otherOwner = chatDraftKey('9', '19')!;
    if (saved !== null) entries.set(key, saved);
    entries.set(otherRoom, '다른 방');
    entries.set(otherOwner, '다른 계정');
    expect(readDraft(tabA, key)).toBe(saved ?? '');
    const edit = (tab: DraftStorage, text: string) => persistDraft(tab, key, text, () => true, jest.fn());

    edit(tabA, '아직 저장하지 않은 입력');
    edit(tabB, '');
    if (saved !== null) expect(readDraft(tabA, key)).toBe('');
    jest.advanceTimersByTime(500);
    expect(readDraft(tabB, key)).toBe('');

    edit(tabA, '지운 뒤 새 입력');
    jest.advanceTimersByTime(499);
    expect(readDraft(tabB, key)).toBe('');
    jest.advanceTimersByTime(1);
    expect(readDraft(tabB, key)).toBe('지운 뒤 새 입력');
    expect(readDraft(tabB, otherRoom)).toBe('다른 방');
    expect(readDraft(tabB, otherOwner)).toBe('다른 계정');
  },
);

it('CHAT-US-03-AC08: 쓰기 직전에 다른 탭이 지우면 늦게 기록된 원문도 복원하지 않는다', () => {
  jest.useFakeTimers();
  const key = chatDraftKey('8', '19')!;
  const tabB = { ...local };
  let duringWrite: string | undefined;
  const tabA = {
    ...local,
    setItem: (itemKey: string, text: string) => {
      persistDraft(tabB, key, '', () => true, jest.fn());
      local.setItem(itemKey, text);
      duringWrite = readDraft(tabB, key);
    },
  };
  persistDraft(tabA, key, '경합 중인 초안', () => true, jest.fn());
  jest.advanceTimersByTime(500);
  expect(duringWrite).toBe('');
  expect(readDraft(tabB, key)).toBe('');
  expect(Array.from(entries.values())).not.toContain('경합 중인 초안');
});

it('CHAT-US-03-AC05/AC06/AC07: 마지막 편집 500ms 후 저장하며 새로 열린 같은 대화방에만 원문을 복원한다', async () => {
  jest.useFakeTimers();
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (url) => response({ ...room, id: String(url).endsWith('/20') ? 20 : 19 }));
  const first = await show();
  await screen.findByLabelText(input);
  expect(screen.getByText('지금은 메시지를 전송할 수 없습니다.')).toBeOnTheScreen();
  await change('이전 입력');
  await tick(300);
  await change('  남긴 입력\n다음 줄  ');
  await tick(499);
  expect(local.setItem).not.toHaveBeenCalled();
  await first.view.unmount();
  await tick(1);
  expect(local.setItem).toHaveBeenCalledTimes(1);
  expect(local.setItem).toHaveBeenLastCalledWith(expect.any(String), '  남긴 입력\n다음 줄  ');

  const same = await show();
  expect(await screen.findByLabelText(input)).toHaveDisplayValue('  남긴 입력\n다음 줄  ');
  await same.view.unmount();
  const otherRoom = await show('20');
  expect(await screen.findByLabelText(input)).toHaveDisplayValue('');
  await otherRoom.view.unmount();
  owner = '9';
  await show();
  expect(await screen.findByLabelText(input)).toHaveDisplayValue('');
  expect(fetchMock.mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true);
});

it('CHAT-US-03-AC08: 완전히 지우면 그 방의 임시 저장만 삭제하고 예약된 예전 쓰기를 취소한다', async () => {
  jest.useFakeTimers();
  jest.spyOn(globalThis, 'fetch').mockImplementation(async () => response(room));
  const original = await show();
  await screen.findByLabelText(input);
  await change('저장한 내용');
  await tick(500);
  entries.set('another-scope', '유지');
  await change('예약 내용');
  await change('');
  await tick(500);
  expect(entries.has(chatDraftKey('8', '19')!)).toBe(false);
  expect(Array.from(entries.values())).not.toContain('예약 내용');
  expect(entries.get('another-scope')).toBe('유지');
  await original.view.unmount();
  await show();
  expect(await screen.findByLabelText(input)).toHaveDisplayValue('');
});

it.each([401, 403, 404, 'read_only'] as const)(
  'CHAT-US-03-AC07: %s 응답은 표시 중인 초안과 예정된 저장을 중단하고 캐시에서 재표시하지 않는다',
  async (revocation) => {
    jest.useFakeTimers();
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(room));
    const current = await show();
    await screen.findByLabelText(input);
    await change('저장하지 않을 내용');
    local.getItem.mockClear();
    fetchMock
      .mockResolvedValueOnce(
        revocation === 'read_only' ? response({ ...room, read_only: true }) : response({}, revocation),
      )
      .mockResolvedValueOnce(response({}, 503));
    await act(async () => {
      await current.client.invalidateQueries({ queryKey: ['conversation', 'session', '19'] });
    });
    await waitFor(() => expect(screen.queryByLabelText(input)).not.toBeOnTheScreen());
    await tick(500);
    expect(local.setItem).not.toHaveBeenCalled();
    await act(async () => {
      await current.client.invalidateQueries({ queryKey: ['conversation', 'session', '19'] });
    });
    expect(screen.queryByLabelText(input)).not.toBeOnTheScreen();
    expect(local.getItem).not.toHaveBeenCalled();
  },
);

it('CHAT-US-03-AC07: 저장소 없는 대화방에서 503은 입력을 유지하지만 뒤이은 403은 숨긴다', async () => {
  jest.useFakeTimers();
  jest.mocked(storage.getDraftStorage).mockReturnValue(null);
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(room));
  const { client } = await show();
  await screen.findByLabelText(input);
  await change('메모리에만 남은 입력');

  const refetch = async (status: number) => {
    fetchMock.mockResolvedValueOnce(response({}, status));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['conversation', 'session', '19'] });
    });
    await tick(500);
  };
  await refetch(503);
  expect(screen.getByLabelText(input)).toHaveDisplayValue('메모리에만 남은 입력');
  await change('503 뒤에도 입력 가능');
  expect(screen.getByLabelText(input)).toHaveDisplayValue('503 뒤에도 입력 가능');
  await refetch(403);
  expect(screen.queryByLabelText(input)).not.toBeOnTheScreen();
  await refetch(503);
  expect(screen.queryByLabelText(input)).not.toBeOnTheScreen();
  expect(local.setItem).not.toHaveBeenCalled();
});

it.each(['방', '계정'])('CHAT-US-03-AC07: 화면에서 %s 변경 후 이전 범위의 예약을 저장하지 않는다', async (scope) => {
  jest.useFakeTimers();
  jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (url) => response({ ...room, id: String(url).endsWith('/20') ? 20 : 19 }));
  const { client, view } = await show();
  await screen.findByLabelText(input);
  await change('이전 범위의 예약');

  if (scope === '계정') owner = '9';
  await view.rerender(
    <QueryClientProvider client={client}>
      <ChatSessionScreen sessionId={scope === '방' ? '20' : '19'} />
    </QueryClientProvider>,
  );
  expect(await screen.findByLabelText(input)).toHaveDisplayValue('');
  await tick(500);
  expect(local.setItem).not.toHaveBeenCalled();
});

it.each([
  ['읽기 전용', { ...room, read_only: true }],
  ['다른 방 ID', { ...room, id: 20 }],
])('CHAT-US-03-AC07: %s 응답은 초안 저장소를 읽지 않는다', async (_label, data) => {
  jest.useFakeTimers();
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(data));
  await show();
  await screen.findByText('숲');
  expect(screen.queryByLabelText(input)).not.toBeOnTheScreen();
  expect(local.getItem).not.toHaveBeenCalled();
});

it('CHAT-US-03-AC07: 소유자를 모르거나 저장소가 없는 환경에서는 입력만 가능하고 저장하지 않는다', async () => {
  jest.useFakeTimers();
  jest.spyOn(globalThis, 'fetch').mockImplementation(async () => response(room));
  owner = null;
  const unknown = await show();
  await screen.findByLabelText(input);
  await change('소유자 미확인');
  await tick(500);
  expect(local.getItem).not.toHaveBeenCalled();
  expect(local.setItem).not.toHaveBeenCalled();
  await unknown.view.unmount();

  owner = '8';
  jest.mocked(storage.getDraftStorage).mockReturnValue(null);
  await show();
  await screen.findByText('이 환경에서는 임시 저장을 사용할 수 없습니다.');
  await change('저장소 없음');
  expect(screen.getByLabelText(input)).toHaveDisplayValue('저장소 없음');
  await tick(500);
  expect(local.setItem).not.toHaveBeenCalled();
});

it.each([403, 503])(
  'CHAT-US-03-AC07: 새로 열린 방에서 캐시가 있어도 새 조회가 %s이면 저장소를 읽지 않는다',
  async (status) => {
    jest.useFakeTimers();
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(room));
    const original = await show();
    await screen.findByLabelText(input);
    await change('저장한 내용');
    await tick(500);
    await original.view.unmount();
    local.getItem.mockClear();

    let complete!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    await show('19', original.client);
    expect(screen.queryByLabelText(input)).not.toBeOnTheScreen();
    expect(local.getItem).not.toHaveBeenCalled();
    await act(async () => complete(response({}, status)));
    await tick(0);
    expect(original.client.getQueryState(['conversation', 'session', '19', '8'])?.status).toBe('error');
    expect(screen.queryByLabelText(input)).not.toBeOnTheScreen();
    expect(local.getItem).not.toHaveBeenCalled();
    expect(entries.size).toBe(1);
    fetchMock.mockResolvedValueOnce(response(room));
    await act(async () => {
      await original.client.invalidateQueries({ queryKey: ['conversation', 'session', '19'] });
    });
    expect(await screen.findByLabelText(input)).toHaveDisplayValue('저장한 내용');
  },
);

it('CHAT-US-03-AC08: 같은 원문을 다시 입력해도 이전 성공은 무시하고 최신 스냅샷 성공일 때만 지운다', async () => {
  jest.useFakeTimers();
  const canPersist = () => true;
  const { result } = await renderHook(() => useChatDraft('test-scope', canPersist));
  await act(async () => result.current.setText('원문'));
  const old = result.current.snapshotForSend()!;
  await act(async () => {
    result.current.setText('다른 내용');
    result.current.setText('원문');
  });
  await act(async () => result.current.clearAfterSendSuccess(old));
  expect(result.current.text).toBe('원문');
  expect(local.removeItem).not.toHaveBeenCalled();

  const latest = result.current.snapshotForSend()!;
  await act(async () => result.current.clearAfterSendSuccess(latest));
  expect(result.current.text).toBe('');
  expect(local.removeItem).toHaveBeenCalledWith('test-scope');
  await tick(500);
  expect(Array.from(entries.values())).not.toContain('원문');
});
