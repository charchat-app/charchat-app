// CHAT-US-01 대화 진입 조회
import {
  type QueryFunctionContext,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import {
  getConversationSession,
  getConversationSessions,
  getConversationStory,
  startConversation,
} from '@/features/chat/api';
import { ApiError } from '@/lib/api-client';
import type { ConversationStory, StartConversationInput } from '@/shared/story-types';

const storyKey = (id: string) => ['conversation', 'story', id] as const;

export function isConversationAccessDenied(error: unknown) {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
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
  return useMutation({
    mutationFn: (input: StartConversationInput) => startConversation(id, input),
    retry: false,
    onSuccess: async (session) => {
      await client.cancelQueries({ queryKey: storyKey(id) });
      client.setQueryData<ConversationStory>(storyKey(id), (story) =>
        story ? { ...story, existing_session_id: session.id } : undefined,
      );
    },
  });
}

export function useConversationStory(id: string) {
  return useQuery({
    queryKey: storyKey(id),
    queryFn: (context) => fetchConversation(context, (signal) => getConversationStory(id, signal)),
    retry: false,
  });
}

export const conversationSessionKey = (id: string, ownerId: string | null) =>
  ['conversation', 'session', id, ownerId] as const;

export function useConversationSession(id: string, ownerId: string | null) {
  return useQuery({
    queryKey: conversationSessionKey(id, ownerId),
    queryFn: (context) => fetchConversation(context, (signal) => getConversationSession(id, signal)),
    retry: false,
  });
}

export function useConversationSessions(ownerId: string | null) {
  return useInfiniteQuery({
    queryKey: ['conversation', 'sessions', ownerId],
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
  });
}
