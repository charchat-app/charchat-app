// CHAT-US-02 대화 이력·생성 상태의 Query 캐시 키와 갱신
import type { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api-client';
import type { ChatGeneration, ChatGenerationStatus, ChatTurns } from '@/shared/story-types';

/** 대화방 세션 상세(useConversationSession). 모델 변경·접근 재확인이 같은 키를 무효화한다. */
export const conversationSessionKey = (sessionId: string) => ['conversation', 'session', sessionId] as const;
export const turnsKey = (sessionId: string) => ['conversation', 'turns', sessionId] as const;
export const draftKey = (sessionId: string) => ['conversation', 'draft', sessionId] as const;
export const sendAttemptKey = (sessionId: string) => ['conversation', 'send-attempt', sessionId] as const;
export const retryAttemptKey = (sessionId: string) => ['conversation', 'retry-attempt', sessionId] as const;
export const streamKey = (generationId: number) => ['conversation', 'generation', generationId] as const;

export const isActiveStatus = (status: ChatGenerationStatus) => status === 'pending' || status === 'streaming';

/** 서버가 요청을 확실히 거절했다(같은 요청을 다시 보내도 결과가 같다). 그 밖의 실패는 결과를 모르는 상태다. */
export function isDefiniteRejection(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    ((error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) ||
      ['API_URL_MISSING', 'INVALID_CONVERSATION_ID', 'INVALID_GENERATION_ID'].includes(error.code))
  );
}

export const refreshTurns = (client: QueryClient, sessionId: string) =>
  client.invalidateQueries({ queryKey: turnsKey(sessionId), exact: true });

/**
 * CHAT-US-04-AC04: 방을 연 채로 이력·생성 조회가 403·404로 거절되면(스토리가 비공개·삭제되어 방에 더 들어갈 수 없게 됨 등)
 * 대화방 조회를 다시 해서, 서버가 같은 거절을 주면 대화방 화면이 접근 불가 안내로 바뀌게 한다.
 */
export function recheckSessionAccess(client: QueryClient, sessionId: string, error: unknown) {
  if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
    void client.invalidateQueries({ queryKey: conversationSessionKey(sessionId), exact: true });
  }
}

/** 전송·재시도가 접수된 생성을 바로 진행 중으로 표시하고, 저장된 이력은 서버에서 다시 읽는다. */
export function acceptGeneration(client: QueryClient, sessionId: string, generation: ChatGeneration) {
  client.setQueryData<ChatTurns>(turnsKey(sessionId), (old) =>
    old && isActiveStatus(generation.status)
      ? { ...old, active_generation: generation, last_failed_generation: null }
      : old,
  );
  void refreshTurns(client, sessionId);
}

/** 생성이 끝나면 진행 표시를 내리고, 완료 응답은 저장된 이력으로, 실패는 마지막 실패로 옮긴다. */
export function finishGeneration(client: QueryClient, sessionId: string, generation: ChatGeneration) {
  client.setQueryData<ChatTurns>(turnsKey(sessionId), (old) => {
    if (!old) return old;
    const reply = generation.status === 'completed' ? generation.assistant_message : null;
    return {
      ...old,
      active_generation: old.active_generation?.id === generation.id ? null : old.active_generation,
      messages:
        reply && !old.messages.some((message) => message.id === reply.id) ? [...old.messages, reply] : old.messages,
      last_failed_generation: generation.status === 'completed' ? old.last_failed_generation : generation,
    };
  });
  void refreshTurns(client, sessionId);
}
