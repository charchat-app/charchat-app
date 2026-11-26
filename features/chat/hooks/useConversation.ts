// CHAT-US-01 대화 진입 조회 · CHAT-US-03 내 대화 목록
import {
  type QueryClient,
  type QueryFunctionContext,
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useLayoutEffect, useRef, useState } from 'react';

import {
  getConversationSession,
  getConversationSessions,
  getConversationStory,
  startConversation,
} from '@/features/chat/api';
import { conversationSessionKey } from '@/features/chat/hooks/chatCache';
import { ApiError } from '@/lib/api-client';
import type { ConversationStory, StartConversationInput } from '@/shared/story-types';

const storyKey = (id: string) => ['conversation', 'story', id] as const;
const attemptKey = (id: string) => ['conversation', 'start-attempt', id] as const;

type StartAttempt =
  | { status: 'posting'; input: StartConversationInput }
  | { status: 'uncertain'; input: StartConversationInput }
  | { status: 'rejected' };

function getCurrentStory(client: QueryClient, id: string) {
  const current = client.getQueryState<ConversationStory | null>(storyKey(id));
  if (current?.status === 'success' && current.fetchStatus === 'idle' && !current.isInvalidated) return current.data;
}

export function isDefiniteStartRejection(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    ([400, 422].includes(error.status) ||
      isConversationAccessDenied(error) ||
      ['API_URL_MISSING', 'INVALID_CONVERSATION_ID'].includes(error.code))
  );
}

export function isConversationAccessDenied(error: unknown) {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}

/** CHAT-US-04-AC04: 서버가 이 계정의 대화가 아니라고 거절했다(남의 방은 404로 숨긴다). 로그인 문제(401)는 뺀다. */
export function isConversationForbidden(error: unknown) {
  return error instanceof ApiError && [403, 404].includes(error.status);
}

async function fetchConversation<T>(
  { client, queryKey, signal }: QueryFunctionContext,
  fetchData: (signal: AbortSignal) => Promise<T>,
) {
  try {
    return await fetchData(signal);
  } catch (error) {
    // 접근 거부 뒤 일시적인 오류가 발생해도 이전 내용을 다시 표시하지 않는다.
    if (!signal.aborted && isConversationAccessDenied(error)) {
      client.setQueryData<T | null>(queryKey, null);
    }
    throw error;
  }
}

export function useStartConversation(id: string) {
  const client = useQueryClient();
  const key = attemptKey(id);
  // 화면을 닫고 다시 열어도 같은 QueryClient·스토리의 미확정 요청을 유지한다.
  const { data: attempt } = useQuery<StartAttempt | null>({ queryKey: key, queryFn: skipToken, gcTime: Infinity });
  const setAttempt = (value: StartAttempt | null) => client.setQueryData<StartAttempt | null>(key, () => value);
  const storyFilter = { queryKey: storyKey(id), exact: true };
  const reconcile = () => client.invalidateQueries({ ...storyFilter, refetchType: 'all' });
  const mutation = useMutation({
    mutationFn: async ({ input }: { input: StartConversationInput; replay: boolean }) => {
      const session = await startConversation(id, input);
      if (!Number.isSafeInteger(session?.id) || session.id <= 0) throw new Error('대화방 ID를 확인할 수 없습니다.');
      return session;
    },
    retry: false,
    onSuccess: async (session, { input }) => {
      const current = getCurrentStory(client, id);
      // 진행 중인 조회를 덮어쓰거나 실패한 조회를 성공으로 바꾸지 않는다.
      if (current) {
        if (current.existing_session_id == null) {
          client.setQueryData<ConversationStory>(storyKey(id), { ...current, existing_session_id: session.id });
        }
        setAttempt(null);
      } else {
        setAttempt({ status: 'uncertain', input });
        if (!isConversationAccessDenied(client.getQueryState(storyKey(id))?.error)) await reconcile();
      }
    },
    onError: async (error, { input, replay }) => {
      if (isConversationAccessDenied(error)) {
        await client.cancelQueries(storyFilter);
        client.setQueryData(storyKey(id), null);
      }
      if (!replay && isDefiniteStartRejection(error)) {
        setAttempt(null);
        return;
      }
      if (replay && error instanceof ApiError && [400, 422].includes(error.status)) {
        // 서버는 같은 잠금 안에서 이전 요청의 fingerprint를 먼저 확인한 뒤 입력을 검증한다.
        // 검증 오류 전에 시작한 조회는 근거가 될 수 없다. 이전 조회를 취소하고
        // 새 조회가 성공할 때까지 무효화된 캐시로는 시작할 수 없게 한다.
        await client.cancelQueries(storyFilter);
        const refresh = reconcile();
        setAttempt({ status: 'rejected' });
        await refresh;
        return;
      }
      setAttempt({ status: 'uncertain', input });
      if (!isDefiniteStartRejection(error)) await reconcile();
    },
  });

  return {
    attempt,
    error: mutation.error,
    isPosting: attempt?.status === 'posting',
    hasPendingPost: () => client.getQueryData<StartAttempt>(key)?.status === 'posting',
    submit: (input: StartConversationInput | undefined, onSuccess: (id: number) => void) => {
      const previous = client.getQueryData<StartAttempt>(key);
      // 입력이 없으면 명시적인 재전송이다. 서버는 같은 payload를 같은 방으로 처리한다.
      if (input && previous) {
        const current = getCurrentStory(client, id);
        if (previous.status !== 'rejected' || !current || current.existing_session_id != null) return;
      }
      const payload = input ?? (previous?.status === 'uncertain' ? previous.input : undefined);
      if (!payload) return;
      // 첫 렌더 갱신 전에 연속으로 탭해도 POST는 한 번만 시작한다.
      setAttempt({ status: 'posting', input: payload });
      mutation.mutate({ input: payload, replay: !input }, { onSuccess: ({ id }) => onSuccess(id) });
    },
  };
}

export function useConversationStory(id: string) {
  const client = useQueryClient();
  const focused = useIsFocused();
  const focusReadFinished = useRef(false);
  const [focusChecked, setFocusChecked] = useState(false);
  const query = useQuery({
    queryKey: storyKey(id),
    queryFn: (context) => fetchConversation(context, (signal) => getConversationStory(id, signal)),
    retry: false,
    refetchOnMount: false,
  });
  const { refetch } = query;

  useLayoutEffect(() => {
    if (!focused) return;
    let active = true;
    const filter = { queryKey: storyKey(id), exact: true };
    setFocusChecked(false);
    void refetch().then(() => {
      if (!active) return;
      focusReadFinished.current = true;
      setFocusChecked(true);
    });
    return () => {
      active = false;
      focusReadFinished.current = false;
      // 캐시가 없으면 refetch가 기존 요청에 합류하므로, 떠날 때 미완료 첫 조회를 취소한다.
      const current = client.getQueryState(filter.queryKey);
      if (current && current.data === undefined && current.fetchStatus !== 'idle') {
        void client.cancelQueries(filter);
      }
    };
  }, [client, focused, id, refetch]);

  const getActionStory = () => {
    // 렌더와 탭 사이에 시작된 조회나 새 응답도 액션을 막는다.
    if (focusReadFinished.current) return getCurrentStory(client, id);
  };

  return {
    ...query,
    getActionStory,
    canAct: focused && focusChecked && query.isSuccess && query.fetchStatus === 'idle' && !!getCurrentStory(client, id),
  };
}

export function useConversationSession(id: string) {
  return useQuery({
    queryKey: conversationSessionKey(id),
    queryFn: (context) => fetchConversation(context, (signal) => getConversationSession(id, signal)),
    retry: false,
  });
}

/** 목록에 생성 중인 대화가 있으면 이 간격으로 다시 읽어 표시를 갱신한다(CHAT-US-03-AC11). */
export const SESSION_LIST_REFRESH_MS = 3000;

export const sessionsKey = (ownerId: string | null) => ['conversation', 'sessions', ownerId] as const;

export function useConversationSessions(ownerId: string | null) {
  return useInfiniteQuery({
    queryKey: sessionsKey(ownerId),
    queryFn: (context) => fetchConversation(context, (signal) => getConversationSessions(context.pageParam, signal)),
    initialPageParam: null as number | null,
    getNextPageParam: ({ next_before_id }, _pages, lastCursor) =>
      next_before_id !== null &&
      Number.isSafeInteger(next_before_id) &&
      next_before_id > 0 &&
      (lastCursor === null || next_before_id < lastCursor)
        ? next_before_id
        : undefined,
    enabled: ownerId !== null,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) => page.sessions.some((session) => session.generating))
        ? SESSION_LIST_REFRESH_MS
        : false,
  });
}
