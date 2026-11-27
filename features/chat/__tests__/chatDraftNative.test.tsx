// CHAT-US-03 네이티브(AsyncStorage) 작성 중 입력·요청 ID 보관
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import * as identity from '@/features/chat/conversationIdentity';
import { decodeDraft } from '@/features/chat/draftCodec';
import { chatDraftKey } from '@/features/chat/draftPersistence';
import { useChatDraft } from '@/features/chat/hooks/useChatTurns';
import type { MessageDraft, SpeakerNames } from '@/features/chat/messageDraft';
import { clearSendAttempt, loadSendAttempt, saveSendAttempt, sendAttemptKey } from '@/features/chat/sendAttemptStorage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
}));

const storage = jest.mocked(AsyncStorage);
const key = chatDraftKey('8', '19')!;
const entries = new Map<string, string>();
const clients: QueryClient[] = [];
const draft = (text: string): MessageDraft => ({ text });
const names: SpeakerNames = { playName: '여행자', characters: [] };
const tick = (ms: number) => act(async () => jest.advanceTimersByTime(ms));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** 새 QueryClient = 앱을 새로 실행한 것과 같다. */
function open(sessionId = '19') {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useChatDraft(sessionId, names, true), { wrapper });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(identity, 'getConversationOwnerId').mockReturnValue('8');
  storage.getItem.mockImplementation(async (k) => entries.get(k) ?? null);
  storage.setItem.mockImplementation(async (k, value) => void entries.set(k, value));
  storage.removeItem.mockImplementation(async (k) => void entries.delete(k));
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  clients.splice(0).forEach((client) => client.clear());
  jest.restoreAllMocks();
  jest.resetAllMocks();
  entries.clear();
});

it('CHAT-US-03-AC05·AC06: 네이티브에서도 0.5초 뒤 계정·대화방 키에 보관하고 앱을 다시 열면 복원한다', async () => {
  const first = await open();
  expect(storage.getItem).toHaveBeenCalledWith(key);
  await act(async () => first.result.current.update(() => draft('  원문\n다음 줄  ')));
  await tick(499);
  expect(storage.setItem).not.toHaveBeenCalled();
  await first.unmount();
  // 화면을 떠나도 예약한 보관은 끝까지 한다.
  await tick(1);
  expect(decodeDraft(entries.get(key)!, names)).toEqual(draft('  원문\n다음 줄  '));

  expect((await open('20')).result.current.draft.text).toBe('');
  const again = await open();
  await act(async () => {});
  expect(again.result.current.draft).toEqual(draft('  원문\n다음 줄  '));
});

it('CHAT-US-03-AC06: 늦게 읽힌 보관분은 그동안 고친 입력을 덮어쓰지 않는다', async () => {
  const read = deferred<string | null>();
  entries.set(key, JSON.stringify({ v: 1, parts: [], speaker: { kind: 'user' }, text: '이전 보관분' }));
  storage.getItem.mockReturnValueOnce(read.promise);
  const { result } = await open();
  await act(async () => result.current.update(() => draft('새 입력')));
  await act(async () => read.resolve(entries.get(key)!));
  expect(result.current.draft.text).toBe('새 입력');
  await tick(500);
  expect(decodeDraft(entries.get(key)!, names)?.text).toBe('새 입력');
});

it('CHAT-US-03-AC07: 보관 중에 모두 지우면 그 쓰기가 끝난 뒤 지우고 다시 열어도 복원하지 않는다', async () => {
  const write = deferred<void>();
  storage.setItem.mockImplementationOnce(async (k, value) => {
    await write.promise;
    entries.set(k, value);
  });
  const other = chatDraftKey('8', '20')!;
  entries.set(other, 'other');
  const first = await open();
  await act(async () => first.result.current.update(() => draft('늦게 저장되는 입력')));
  await tick(500);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  await act(async () => first.result.current.update(() => draft('')));
  expect(storage.removeItem).not.toHaveBeenCalled();
  await first.unmount();
  const reopened = await open();
  await act(async () => write.resolve());
  expect(storage.removeItem).toHaveBeenCalledWith(key);
  expect(entries.has(key)).toBe(false);
  expect(reopened.result.current.draft.text).toBe('');
  expect(entries.get(other)).toBe('other');
});

it('CHAT-US-03-AC05: 기기 보관이 실패해도 입력을 유지하고 안내 상태를 알린다', async () => {
  storage.setItem.mockRejectedValueOnce(new Error('write failed'));
  const { result } = await open();
  await act(async () => result.current.update(() => draft('메모리 입력')));
  await tick(500);
  expect(result.current.draft.text).toBe('메모리 입력');
  expect(result.current.deviceUnavailable).toBe(true);
  await act(async () => result.current.update(() => draft('다시 시도')));
  await tick(500);
  expect(result.current.deviceUnavailable).toBe(false);
  expect(decodeDraft(entries.get(key)!, names)?.text).toBe('다시 시도');
});

it('CHAT-US-03-AC09: 요청 ID 기록·삭제는 시작한 순서대로 처리하고 다른 요청 ID의 기록은 지우지 않는다', async () => {
  const write = deferred<void>();
  storage.setItem.mockImplementationOnce(async (k, value) => {
    await write.promise;
    entries.set(k, value);
  });
  const parts = [{ speaker_kind: 'user' as const, character_id: null, body: '보냄' }];
  const saving = saveSendAttempt('19', { requestId: 'msg-first-001', parts });
  // 빠른 응답으로 삭제가 기록보다 먼저 요청돼도, 기록이 끝난 뒤 지운다.
  const clearing = clearSendAttempt('19', 'msg-first-001');
  await act(async () => write.resolve());
  await act(async () => Promise.all([saving, clearing]));
  expect(entries.has(sendAttemptKey('8', '19')!)).toBe(false);

  await saveSendAttempt('19', { requestId: 'msg-second-01', parts });
  await clearSendAttempt('19', 'msg-first-001');
  expect(await loadSendAttempt('19')).toEqual({ requestId: 'msg-second-01', parts });
  entries.set(sendAttemptKey('8', '19')!, '{"requestId":"bad id","parts":[]}');
  expect(await loadSendAttempt('19')).toBeNull();
});
