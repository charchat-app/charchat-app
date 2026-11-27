// CHAT-US-08 상태 카드: 보기 ON/OFF(기기 보관)와 최신 AI 응답의 장면 정보 수정
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { updateSceneInfo } from '@/features/chat/api';
import { conversationSessionKey, recheckSessionAccess, refreshTurns, turnsKey } from '@/features/chat/hooks/chatCache';
import { readSceneCardVisible, writeSceneCardVisible } from '@/features/chat/scene/sceneCardPreference';
import { ApiError } from '@/lib/api-client';
import type { ChatTurns, SceneInfoUpdateInput } from '@/shared/story-types';

const sceneCardVisibleKey = ['conversation', 'scene-card-visible'] as const;

/**
 * 상태 보기 ON/OFF. 기본 ON이고 이 기기에 보관해 다시 들어와도 유지한다.
 * `ready`가 false인 동안(네이티브 저장소를 읽는 중)은 OFF로 둔 이용자에게 카드가 잠깐 보이지 않게 카드를 그리지 않는다.
 */
export function useSceneCardVisible() {
  const client = useQueryClient();
  const { data } = useQuery({
    queryKey: sceneCardVisibleKey,
    queryFn: async () => {
      const stored = await readSceneCardVisible();
      // 읽는 동안 이용자가 고른 값이 있으면 늦게 읽은 보관값으로 덮어쓰지 않는다.
      return client.getQueryData<boolean>(sceneCardVisibleKey) ?? stored;
    },
    // 웹 저장소는 바로 읽히므로 첫 화면부터 보관값으로 그린다.
    initialData: () => {
      const stored = readSceneCardVisible();
      return typeof stored === 'boolean' ? stored : undefined;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
  const setVisible = useCallback(
    (visible: boolean) => {
      client.setQueryData(sceneCardVisibleKey, visible);
      void writeSceneCardVisible(visible);
    },
    [client],
  );
  return { visible: data ?? true, ready: data !== undefined, setVisible };
}

export type SceneInfoUpdateVariables = { messageId: number; input: SceneInfoUpdateInput };

/**
 * 가장 뒤 완료 AI 응답의 info를 고친다. 성공하면 이력 캐시의 current_scene과 그 메시지 info를 응답 값으로 바꾼다.
 * 새 응답·진행 중 생성·읽기 전용 거절(409)은 이력(·세션)을 다시 읽어 화면을 서버 상태에 맞춘다.
 */
export function useUpdateSceneInfo(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, input }: SceneInfoUpdateVariables) => updateSceneInfo(sessionId, messageId, input),
    retry: false,
    onSuccess: (result) => {
      client.setQueryData<ChatTurns>(turnsKey(sessionId), (old) =>
        old
          ? {
              ...old,
              current_scene: result.current_scene,
              messages: old.messages.map((message) =>
                message.id === result.message_id ? { ...message, info: result.info } : message,
              ),
            }
          : old,
      );
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) return;
      if (error.status === 409) {
        if (error.code === 'CONVERSATION_READ_ONLY') {
          void client.invalidateQueries({ queryKey: conversationSessionKey(sessionId), exact: true });
        }
        void refreshTurns(client, sessionId);
      }
      recheckSessionAccess(client, sessionId, error);
    },
  });
}
