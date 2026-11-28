// BASE-03 리뷰: 메시지를 보내는 사이 로그아웃·계정 전환이 있으면 이전 계정의 초안 복구·전송 기록 정리를 하지 않는다
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { chatDraftKey, readDraft } from '@/features/chat/draftPersistence';
import * as storage from '@/features/chat/draftStorage';
import type { DraftStorage } from '@/features/chat/draftStorage.types';
import { draftKey } from '@/features/chat/hooks/chatCache';
import { useSendMessage } from '@/features/chat/hooks/useSendMessage';
import { sendAttemptKey } from '@/features/chat/sendAttemptStorage';
import { applyGrant, finishSignOut, resetAuthSession } from '@/lib/authSession';
import type { ChatGeneration, ChatMessagePartInput } from '@/shared/story-types';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 5,
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('@/lib/api-client', () => {
  const saved = { ...process.env };
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
  process.env.EXPO_PUBLIC_DEV_AUTH = 'token';
  delete process.env.EXPO_PUBLIC_DEV_USER_ID;
  try {
    return jest.requireActual('@/lib/api-client');
  } finally {
    process.env = saved;
  }
});

const SESSION = '19';
const PARTS: ChatMessagePartInput[] = [{ speaker_kind: 'user', character_id: null, body: '거절될 말' }];
const generation: ChatGeneration = {
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
};

// 같은 origin의 localStorage처럼 남는 저장소
const entries = new Map<string, string>();
const local: DraftStorage = {
  getItem: (key) => entries.get(key) ?? null,
  setItem: (key, value) => void entries.set(key, value),
  removeItem: (key) => void entries.delete(key),
};
const draftOf = (owner: string) => readDraft(local, chatDraftKey(owner, SESSION)!);
const keysOf = (owner: string) => [...entries.keys()].filter((key) => key.includes(`:${owner}:${SESSION}`));

const clients: QueryClient[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function signIn(userId: string) {
  applyGrant({ accessToken: `cca_${userId}`, refreshToken: `ccr_${userId}`, userId, onboardingRequired: false });
}

async function switchAccount(userId: string) {
  await act(async () => {
    await finishSignOut();
    signIn(userId);
  });
}

/** 메시지 전송 응답을 테스트가 정한다. 그 밖의 요청은 빈 성공. */
function fakeServer() {
  let answer!: (response: Response) => void;
  const posts: (string | null)[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input).endsWith(`/sessions/${SESSION}/messages`) && init?.method === 'POST') {
      posts.push(new Headers(init.headers).get('Authorization'));
      return new Promise<Response>((resolve) => {
        answer = resolve;
      });
    }
    return json({ messages: [], active_generation: null, last_failed_generation: null, model: '루나', model_id: 1 });
  });
  return { posts, answer: (response: Response) => answer(response) };
}

async function startSending() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity } },
  });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = await renderHook(() => useSendMessage(SESSION, { playName: '여행자', characters: [] }), { wrapper });
  await waitFor(() => expect(hook.result.current.checking).toBe(false));
  await act(async () => {
    hook.result.current.send(PARTS);
  });
  return { client, hook };
}

/** 응답 뒤 남은 비동기 보관(초안 복구·기록 정리)이 끝날 때까지 기다린다. */
const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 50)));

beforeEach(() => {
  resetAuthSession();
  jest.spyOn(storage, 'getDraftStorage').mockReturnValue(local);
});
afterEach(async () => {
  await flush();
  clients.splice(0).forEach((client) => client.clear());
  entries.clear();
  jest.restoreAllMocks();
  resetAuthSession();
});

describe('BASE-03 전송 중 계정 전환', () => {
  it('BASE-03 전송 중 다른 계정으로 바뀌면 거절 응답이 와도 새 계정 키에 초안을 쓰지 않고 이전 계정 기록도 정리하지 않는다', async () => {
    signIn('1');
    const server = fakeServer();
    const { client, hook } = await startSending();
    await waitFor(() => expect(server.posts).toEqual(['Bearer cca_1']));
    await waitFor(() => expect(entries.has(sendAttemptKey('1', SESSION)!)).toBe(true));

    await switchAccount('2');
    await act(async () => server.answer(json({ code: 'MESSAGE_INVALID_SPEAKER', detail: 'invalid speaker' }, 422)));
    await flush();

    // 새 계정(2) 키에는 아무것도 쓰지 않는다.
    expect(keysOf('2')).toEqual([]);
    expect(draftOf('2')).toBe('');
    // 이전 계정(1)의 전송 기록은 거절 표시 없이 그대로 남아, 1로 다시 들어오면 같은 요청 ID로 조회한다.
    expect(JSON.parse(entries.get(sendAttemptKey('1', SESSION)!) ?? 'null')).toMatchObject({ parts: PARTS });
    expect(JSON.parse(entries.get(sendAttemptKey('1', SESSION)!) ?? '{}').rejected).toBeUndefined();
    expect(draftOf('1')).toBe('');
    // 메모리 캐시의 입력창 초안도 되돌리지 않는다.
    expect(client.getQueryData(draftKey(SESSION))).toBeUndefined();
    expect(hook.result.current.attempt?.status).toBe('posting');
  });

  it('BASE-03 같은 계정이면 거절된 원문을 기존대로 입력창과 기기 초안에 되돌리고 전송 기록을 지운다', async () => {
    signIn('1');
    const server = fakeServer();
    const { client, hook } = await startSending();
    await waitFor(() => expect(entries.has(sendAttemptKey('1', SESSION)!)).toBe(true));

    await act(async () => server.answer(json({ code: 'MESSAGE_INVALID_SPEAKER', detail: 'invalid speaker' }, 422)));
    await waitFor(() => expect(entries.has(sendAttemptKey('1', SESSION)!)).toBe(false));

    expect(draftOf('1')).toContain('거절될 말');
    expect(client.getQueryData(draftKey(SESSION))).toBeDefined();
    // 화면 상태 갱신은 react-query 알림 타이머 뒤에 온다. 느린 CI에서는 기기 기록 정리가 먼저 끝날 수 있다.
    await waitFor(() => expect(hook.result.current.attempt).toMatchObject({ status: 'rejected', restored: true }));
    expect(keysOf('2')).toEqual([]);
  });

  it('BASE-03 전송 중 다른 계정으로 바뀌면 접수 응답이 와도 이전 계정의 전송 기록을 지우지 않는다', async () => {
    signIn('1');
    const server = fakeServer();
    const { hook } = await startSending();
    await waitFor(() => expect(entries.has(sendAttemptKey('1', SESSION)!)).toBe(true));

    await switchAccount('2');
    await act(async () => server.answer(json(generation, 202)));
    await flush();

    expect(entries.has(sendAttemptKey('1', SESSION)!)).toBe(true);
    expect(keysOf('2')).toEqual([]);
    expect(hook.result.current.attempt?.status).toBe('posting');
  });

  it('BASE-03 같은 계정이 로그아웃 뒤 다시 로그인해도(새 로그인 세션) 이전 세션의 거절 응답으로 초안을 되돌리지 않는다', async () => {
    signIn('1');
    const server = fakeServer();
    const { client } = await startSending();
    await waitFor(() => expect(entries.has(sendAttemptKey('1', SESSION)!)).toBe(true));

    await switchAccount('1');
    await act(async () => server.answer(json({ code: 'MESSAGE_INVALID_SPEAKER', detail: 'invalid speaker' }, 422)));
    await flush();

    expect(draftOf('1')).toBe('');
    expect(entries.has(sendAttemptKey('1', SESSION)!)).toBe(true);
    expect(client.getQueryData(draftKey(SESSION))).toBeUndefined();
  });
});
