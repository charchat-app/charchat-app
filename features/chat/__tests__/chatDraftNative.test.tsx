// CHAT-US-03 네이티브 대화방 임시 저장
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';

import { chatDraftKey } from '@/features/chat/draftPersistence';
import { useChatDraft } from '@/features/chat/hooks/useChatDraft';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
}));

const storage = jest.mocked(AsyncStorage);
const key = chatDraftKey('8', '19')!;
const otherKey = chatDraftKey('9', '19')!;
const allowed = () => true;
const show = (scope = key, canPersist = allowed) => renderHook(() => useChatDraft(scope, canPersist));
const tick = (ms: number) => act(async () => jest.advanceTimersByTime(ms));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const entries = new Map<string, string>();
beforeEach(() => {
  jest.useFakeTimers();
  storage.getItem.mockImplementation(async (key) => entries.get(key) ?? null);
  storage.setItem.mockImplementation(async (key, value) => void entries.set(key, value));
  storage.removeItem.mockImplementation(async (key) => void entries.delete(key));
});

afterEach(() => {
  jest.useRealTimers();
  jest.resetAllMocks();
  entries.clear();
});

it('CHAT-US-03-AC05/AC06/AC07: 네이티브에서도 500ms 뒤 같은 계정과 대화방 키에 저장하고 다시 읽는다', async () => {
  const first = await show();
  expect(storage.getItem).toHaveBeenCalledWith(key);
  await act(async () => first.result.current.setText('  원문\n다음 줄  '));
  await tick(499);
  expect(storage.setItem).not.toHaveBeenCalled();
  await first.unmount();
  await tick(1);
  expect(storage.setItem).toHaveBeenCalledWith(key, '  원문\n다음 줄  ');

  expect((await show(otherKey)).result.current.text).toBe('');
  expect((await show(chatDraftKey('8', '20')!)).result.current.text).toBe('');
  expect((await show()).result.current.text).toBe('  원문\n다음 줄  ');
});

it('CHAT-US-03-AC06: 늦게 읽은 저장본이 읽는 동안 편집하고 비운 입력을 복원하지 않는다', async () => {
  const read = deferred<string | null>();
  entries.set(key, '이전 저장본');
  storage.getItem.mockReturnValueOnce(read.promise);
  const { result } = await show();
  expect(storage.getItem).toHaveBeenCalledWith(key);
  expect(result.current.ready).toBe(true);
  await act(async () => result.current.setText('새 입력'));
  await act(async () => result.current.setText(''));
  await act(async () => read.resolve('이전 저장본'));
  expect(result.current.text).toBe('');
  await tick(500);
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(entries.has(key)).toBe(false);
});

it('CHAT-US-03-AC07: 읽기가 끝나기 전에 계정 키가 바뀌면 이전 계정의 초안을 표시하지 않는다', async () => {
  const read = deferred<string | null>();
  storage.getItem.mockReturnValueOnce(read.promise);
  entries.set(otherKey, '새 계정의 초안');
  const { result, rerender } = await renderHook(({ scope }: { scope: string }) => useChatDraft(scope, allowed), {
    initialProps: { scope: key },
  });
  expect(storage.getItem).toHaveBeenCalledWith(key);
  await rerender({ scope: otherKey });
  await act(async () => read.resolve('이전 계정의 초안'));
  expect(result.current.text).toBe('새 계정의 초안');
});

it('CHAT-US-03-AC07: 읽기가 끝나기 전에 권한이 없어지면 저장본을 표시하지 않는다', async () => {
  const read = deferred<string | null>();
  storage.getItem.mockReturnValueOnce(read.promise);
  let authorized = true;
  const { result } = await show(key, () => authorized);
  expect(storage.getItem).toHaveBeenCalledWith(key);
  authorized = false;
  await act(async () => read.resolve('권한 철회된 초안'));
  expect(result.current.text).toBe('');
});

it('CHAT-US-03-AC08: 저장 중에 지우면 그 쓰기가 완료된 뒤 삭제하고 재진입해도 복원하지 않는다', async () => {
  const write = deferred<void>();
  storage.setItem.mockImplementationOnce(async (key, value) => {
    await write.promise;
    entries.set(key, value);
  });
  entries.set(otherKey, '다른 계정의 초안');
  const first = await show();
  await act(async () => first.result.current.setText('늦게 저장되는 초안'));
  await tick(500);
  expect(storage.setItem).toHaveBeenCalledWith(key, '늦게 저장되는 초안');
  await act(async () => first.result.current.setText(''));
  expect(storage.removeItem).not.toHaveBeenCalled();
  await first.unmount();
  const reopened = await show();
  await act(async () => write.resolve());
  expect(storage.removeItem).toHaveBeenCalledWith(key);
  expect(reopened.result.current.text).toBe('');
  expect(entries.has(key)).toBe(false);
  expect(entries.get(otherKey)).toBe('다른 계정의 초안');
});

it('CHAT-US-03-AC07: 큐에서 기다리는 쓰기는 실행 직전에 권한을 다시 확인한다', async () => {
  const write = deferred<void>();
  storage.setItem.mockReturnValueOnce(write.promise);
  let authorized = true;
  const { result } = await show(key, () => authorized);
  await act(async () => result.current.setText('먼저 시작한 저장'));
  await tick(500);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  await act(async () => result.current.setText('아직 실행하지 않은 저장'));
  await tick(500);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  authorized = false;
  await act(async () => write.resolve());
  expect(storage.setItem).toHaveBeenCalledTimes(1);
});

it('CHAT-US-03-AC05: 네이티브 저장소가 실패해도 입력을 유지하고 다음 편집에서 다시 시도한다', async () => {
  storage.getItem.mockRejectedValueOnce(new Error('read failed'));
  storage.setItem.mockRejectedValueOnce(new Error('write failed'));
  const { result } = await show();
  expect(storage.getItem).toHaveBeenCalledWith(key);
  expect(result.current.persistenceAvailable).toBe(false);
  await act(async () => result.current.setText('메모리 입력'));
  await tick(500);
  expect(storage.setItem).toHaveBeenCalledWith(key, '메모리 입력');
  expect(result.current.text).toBe('메모리 입력');
  await act(async () => result.current.setText('다시 시도한 입력'));
  await tick(500);
  expect(entries.get(key)).toBe('다시 시도한 입력');
});
