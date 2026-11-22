// CHAT-US-01 대화 진입 API · CHAT-US-02 메시지 전송·응답 API
import { ApiError, apiRequest } from '@/lib/api-client';
import type {
  ChatGeneration,
  ChatTurns,
  ConversationSession,
  ConversationSessionCreated,
  ConversationStory,
  SendChatMessageInput,
  StartConversationInput,
} from '@/shared/story-types';

function idSegment(id: string) {
  if (typeof id !== 'string' || !/^[1-9][0-9]*$/.test(id)) {
    throw new ApiError(0, 'INVALID_CONVERSATION_ID', '주소의 ID가 올바르지 않습니다.');
  }
  return id;
}

const storyPath = (id: string) => `/conversation/stories/${idSegment(id)}`;

export const getConversationStory = (id: string, signal: AbortSignal) =>
  apiRequest<ConversationStory>(storyPath(id), { signal });

export const startConversation = (id: string, input: StartConversationInput) =>
  apiRequest<ConversationSessionCreated>(`${storyPath(id)}/sessions`, { method: 'POST', body: JSON.stringify(input) });

export const getConversationSession = (id: string, signal: AbortSignal) =>
  apiRequest<ConversationSession>(`/conversation/sessions/${idSegment(id)}`, { signal });

const sessionPath = (id: string) => `/conversation/sessions/${idSegment(id)}`;

function generationPath(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ApiError(0, 'INVALID_GENERATION_ID', '응답 생성 ID가 올바르지 않습니다.');
  }
  return `/conversation/generations/${id}`;
}

/** 저장된 대화 이력과 진행 중·마지막 실패 생성 상태 (CHAT-US-02) */
export const getChatTurns = (sessionId: string, signal: AbortSignal) =>
  apiRequest<ChatTurns>(`${sessionPath(sessionId)}/turns`, { signal });

/** 같은 request_id로 다시 보내면 서버는 기존 생성을 돌려준다(AC10·AC15). */
export const sendChatMessage = (sessionId: string, input: SendChatMessageInput) =>
  apiRequest<ChatGeneration>(`${sessionPath(sessionId)}/messages`, { method: 'POST', body: JSON.stringify(input) });

/** 롱 폴링. 서버가 최대 `wait`초 기다리므로 시간 제한은 그보다 넉넉하게 둔다. */
export const pollGeneration = (id: number, offset: number, wait: number, signal: AbortSignal) =>
  apiRequest<ChatGeneration>(`${generationPath(id)}?offset=${offset}&wait=${wait}`, {
    signal,
    timeoutMs: (wait + 15) * 1000,
  });

/** 실패한 생성을 이용자가 누를 때만 다시 요청한다. 자동 재시도는 없다(AC15). */
export const retryGeneration = (id: number, requestId: string) =>
  apiRequest<ChatGeneration>(`${generationPath(id)}/retry`, {
    method: 'POST',
    body: JSON.stringify({ request_id: requestId }),
  });
