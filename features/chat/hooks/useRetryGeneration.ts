// CHAT-US-02 실패한 생성 재시도: 이용자가 누를 때만, 결과를 모르면 같은 요청 ID로 확인한다
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { retryGeneration } from '@/features/chat/api';
import { acceptGeneration, isDefiniteRejection, refreshTurns, retryAttemptKey } from '@/features/chat/hooks/chatCache';
import { newRequestId } from '@/features/chat/requestId';
import type { ChatGeneration, ChatTurns } from '@/shared/story-types';

type RetryTarget = {
  /** 다시 시도한 실패 생성 */
  generationId: number;
  /** 그 생성의 유저 메시지. 재시도로 만든 새 생성도 같은 유저 메시지를 가리킨다. */
  userMessageId: number;
  requestId: string;
};

export type RetryAttempt = RetryTarget & {
  status: 'posting' | 'uncertain' | 'rejected';
  message?: string;
};

/**
 * 결과를 모르는 재시도가 이력으로 정리됐는지 본다. 같은 유저 메시지에 대해
 * - 다른 생성이 진행 중이거나(접수됨), 다른 생성이 마지막 실패로 끝났거나(접수 뒤 실패),
 * - 그 유저 메시지 뒤에 저장된 응답이 있으면(접수 뒤 완료) 확인할 것이 없다.
 * 그 밖에는 실패 안내가 사라졌어도 같은 요청 ID로 확인할 때까지 둔다.
 */
function isSettledByTurns(attempt: RetryTarget, turns: ChatTurns | undefined) {
  if (!turns) return false;
  const isNewer = (generation: ChatGeneration | null) =>
    !!generation && generation.user_message_id === attempt.userMessageId && generation.id !== attempt.generationId;
  if (isNewer(turns.active_generation) || isNewer(turns.last_failed_generation)) return true;
  const userIndex = turns.messages.findIndex(({ id }) => id === attempt.userMessageId);
  return userIndex >= 0 && turns.messages.slice(userIndex + 1).some(({ role }) => role === 'assistant');
}

export function useRetryGeneration(sessionId: string, turns: ChatTurns | undefined) {
  const client = useQueryClient();
  const key = retryAttemptKey(sessionId);
  const { data: attempt } = useQuery<RetryAttempt | null>({ queryKey: key, queryFn: skipToken, gcTime: Infinity });
  const setAttempt = (value: RetryAttempt | null) => client.setQueryData<RetryAttempt | null>(key, () => value);
  const current = () => client.getQueryData<RetryAttempt | null>(key);

  const mutation = useMutation({
    mutationFn: ({ generationId, requestId }: RetryTarget) => retryGeneration(generationId, requestId),
    retry: false,
    onSuccess: (generation) => {
      setAttempt(null);
      acceptGeneration(client, sessionId, generation);
    },
    onError: (error, sent) => {
      setAttempt(
        isDefiniteRejection(error)
          ? { ...sent, status: 'rejected', message: '이 응답은 다시 시도할 수 없습니다. 대화를 새로 불러왔습니다.' }
          : { ...sent, status: 'uncertain' },
      );
      void refreshTurns(client, sessionId);
    },
  });

  // 응답을 잃은 재시도: 서버가 접수했다면 이력에 새 생성이 보이므로 확인 버튼 없이도 풀어 준다(AC10·AC15).
  const settled = attempt?.status === 'uncertain' && isSettledByTurns(attempt, turns);
  useEffect(() => {
    if (settled && current()?.status === 'uncertain') setAttempt(null);
    // current·setAttempt는 같은 key의 캐시만 다룬다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

  const post = (target: RetryTarget) => {
    setAttempt({ ...target, status: 'posting' });
    mutation.mutate(target);
  };

  return {
    attempt,
    isBusy: !settled && (attempt?.status === 'posting' || attempt?.status === 'uncertain'),
    retry: (failed: Pick<ChatGeneration, 'id' | 'user_message_id'>) => {
      const previous = current();
      if (previous?.status === 'posting') return;
      // 결과를 모르는 재시도는 같은 요청 ID로 다시 보내 중복 생성을 막는다(AC10·AC15).
      const requestId =
        previous?.status === 'uncertain' && previous.generationId === failed.id ? previous.requestId : newRequestId();
      post({ generationId: failed.id, userMessageId: failed.user_message_id, requestId });
    },
    /** 실패 안내가 사라졌어도 결과를 모르는 재시도를 같은 생성·같은 요청 ID로 확인한다. 서버는 기존 생성을 돌려준다. */
    confirm: () => {
      const previous = current();
      if (previous?.status !== 'uncertain') return;
      const { generationId, userMessageId, requestId } = previous;
      post({ generationId, userMessageId, requestId });
    },
  };
}
