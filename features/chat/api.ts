// CHAT-US-01 대화 진입 API
import { ApiError, apiRequest } from '@/lib/api-client';
import type {
  ConversationSession,
  ConversationSessionCreated,
  ConversationSessionPage,
  ConversationStory,
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

export const getConversationSessions = (beforeId: number | null, signal: AbortSignal) =>
  apiRequest<ConversationSessionPage>(
    `/conversation/sessions${beforeId === null ? '' : `?before_id=${idSegment(String(beforeId))}`}`,
    { signal },
  );
