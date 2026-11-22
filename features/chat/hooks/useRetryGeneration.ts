// CHAT-US-02 실패한 생성 재시도: 이용자가 누를 때만, 결과를 모르면 같은 요청 ID로 확인한다
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { retryGeneration } from '@/features/chat/api';
import { acceptGeneration, isDefiniteRejection, refreshTurns, retryAttemptKey } from '@/features/chat/hooks/chatCache';
import { newRequestId } from '@/features/chat/requestId';

export type RetryAttempt = {
  generationId: number;
  requestId: string;
  status: 'posting' | 'uncertain' | 'rejected';
  message?: string;
};

export function useRetryGeneration(sessionId: string) {
  const client = useQueryClient();
  const key = retryAttemptKey(sessionId);
  const { data: attempt } = useQuery<RetryAttempt | null>({ queryKey: key, queryFn: skipToken, gcTime: Infinity });
  const setAttempt = (value: RetryAttempt | null) => client.setQueryData<RetryAttempt | null>(key, () => value);

  const mutation = useMutation({
    mutationFn: ({ generationId, requestId }: Pick<RetryAttempt, 'generationId' | 'requestId'>) =>
      retryGeneration(generationId, requestId),
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

  return {
    attempt,
    isBusy: attempt?.status === 'posting' || attempt?.status === 'uncertain',
    retry: (generationId: number) => {
      const previous = client.getQueryData<RetryAttempt | null>(key);
      if (previous?.status === 'posting') return;
      // 결과를 모르는 재시도는 같은 요청 ID로 다시 보내 중복 생성을 막는다(AC10·AC15).
      const requestId =
        previous?.status === 'uncertain' && previous.generationId === generationId
          ? previous.requestId
          : newRequestId();
      setAttempt({ generationId, requestId, status: 'posting' });
      mutation.mutate({ generationId, requestId });
    },
  };
}
