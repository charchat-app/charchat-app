// CHAT-US-13 대화 중 모델 변경: 모델 목록 조회와 세션 모델 변경
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { changeSessionModel, listChatModels } from '@/features/chat/api';
import { conversationSessionKey as sessionKey, refreshTurns, turnsKey } from '@/features/chat/hooks/chatCache';
import { ApiError } from '@/lib/api-client';
import type { ChatTurns, ConversationSession } from '@/shared/story-types';

export const chatModelsKey = ['conversation', 'models'] as const;
/** 내 대화 목록(모든 계정·페이지). 목록에 세션 모델 이름이 보인다. */
const sessionListPrefix = ['conversation', 'sessions'] as const;

/** 목록을 펼칠 때만 읽는다. 자동 재시도는 하지 않고 이용자가 다시 불러온다. */
export function useChatModels(enabled: boolean) {
  return useQuery({
    queryKey: chatModelsKey,
    queryFn: ({ signal }) => listChatModels(signal),
    retry: false,
    enabled,
  });
}

/**
 * 세션의 다음 응답부터 쓸 모델을 바꾼다. 진행 중 생성은 서버가 기존 모델로 끝까지 만들므로
 * 이력 캐시의 진행 중 생성은 건드리지 않고 세션 모델(model·model_id)만 바꾼다(CHAT-US-13-AC02).
 */
export function useChangeSessionModel(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (modelId: number) => changeSessionModel(sessionId, modelId),
    retry: false,
    onSuccess: (change) => {
      client.setQueryData<ChatTurns>(turnsKey(sessionId), (old) =>
        old ? { ...old, model: change.model, model_id: change.model_id } : old,
      );
      // 대화방을 다시 열 때 옛 모델 이름이 잠깐 보이지 않게 세션 상세도 맞춘다.
      client.setQueryData<ConversationSession>(sessionKey(sessionId), (old) =>
        old ? { ...old, model: change.model } : old,
      );
      // 변경 전에 시작한 이력 조회가 옛 모델을 덮어써도 서버 값으로 다시 맞춘다.
      void refreshTurns(client, sessionId);
      void client.invalidateQueries({ queryKey: sessionListPrefix });
    },
    onError: (error) => {
      // 404(접근 불가)·409(읽기 전용이 됨)는 다시 눌러도 안 되므로 대화방 상태를 새로 읽어 보여 준다.
      if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
        void client.invalidateQueries({ queryKey: sessionKey(sessionId) });
        void refreshTurns(client, sessionId);
      }
    },
  });
}
