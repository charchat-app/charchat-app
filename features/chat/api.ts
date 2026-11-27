// CHAT-US-01 대화 진입 API · CHAT-US-02 메시지 전송·응답 API · CHAT-US-03 내 대화 목록·요청 ID 확인
// CHAT-US-13 대화 중 모델 변경 · CHAT-US-08 최신 AI 응답의 장면 정보 수정
import { ApiError, apiRequest } from '@/lib/api-client';
import type {
  ChatGeneration,
  ChatGenerationLookup,
  ChatModelList,
  ChatTurns,
  ConversationSession,
  ConversationSessionCreated,
  ConversationSessionPage,
  ConversationStory,
  SceneInfoUpdateInput,
  SceneInfoUpdateResult,
  SendChatMessageInput,
  SessionModelChange,
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

/** 내 대화 목록. beforeId보다 작은 세션 ID를 최신순으로 읽는다(CHAT-US-03-AC01). */
export const getConversationSessions = (beforeId: number | null, signal: AbortSignal) =>
  apiRequest<ConversationSessionPage>(
    `/conversation/sessions${beforeId === null ? '' : `?before_id=${idSegment(String(beforeId))}`}`,
    { signal },
  );

/** 결과를 모르는 전송을 새로 만들지 않고 기존 request_id로 조회만 한다(CHAT-US-03-AC09). */
export const findGenerationsByRequest = (sessionId: string, requestId: string, signal?: AbortSignal) =>
  apiRequest<ChatGenerationLookup>(
    `${sessionPath(sessionId)}/generations?request_id=${encodeURIComponent(requestId)}`,
    { signal },
  );

/** 고를 수 있는 응답 모델 목록 (CHAT-US-13-AC01). */
export const listChatModels = (signal: AbortSignal) => apiRequest<ChatModelList>('/conversation/models', { signal });

/** 세션의 다음 응답부터 쓸 모델을 바꾼다. 진행 중인 생성은 기존 모델로 끝까지 만든다(CHAT-US-13-AC02). */
export const changeSessionModel = (sessionId: string, modelId: number) =>
  apiRequest<SessionModelChange>(`${sessionPath(sessionId)}/model`, {
    method: 'PUT',
    body: JSON.stringify({ model_id: modelId }),
  });

/**
 * 가장 뒤 완료 AI 응답의 장면 정보(info)를 고친다(CHAT-US-08, KAN-40 결정 C). 바뀐 칸만 보낸다.
 * 응답은 고친 info와 새 누적 장면(current_scene)이다. 모델은 다시 부르지 않는다.
 */
export function updateSceneInfo(sessionId: string, messageId: number, input: SceneInfoUpdateInput) {
  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    throw new ApiError(0, 'INVALID_MESSAGE_ID', '메시지 ID가 올바르지 않습니다.');
  }
  return apiRequest<SceneInfoUpdateResult>(`${sessionPath(sessionId)}/messages/${messageId}/info`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}
