// CHAT-US-02 메시지 전송: 전송 시도마다 요청 ID 하나, 결과를 모르면 같은 ID로만 다시 확인한다
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { sendChatMessage } from '@/features/chat/api';
import {
  acceptGeneration,
  draftKey,
  isDefiniteRejection,
  refreshTurns,
  sendAttemptKey,
} from '@/features/chat/hooks/chatCache';
import { fromMessageParts, isDraftEmpty, type MessageDraft } from '@/features/chat/messageDraft';
import { newRequestId } from '@/features/chat/requestId';
import type { ChatGeneration, ChatMessagePartInput } from '@/shared/story-types';

type AttemptBase = { requestId: string; parts: ChatMessagePartInput[] };

export type SendAttempt =
  | (AttemptBase & { status: 'posting' | 'uncertain' })
  | (AttemptBase & { status: 'accepted'; generation: ChatGeneration })
  | (AttemptBase & { status: 'rejected'; message: string; restored: boolean });

const REJECTION_MESSAGES: Record<string, string> = {
  MESSAGE_EMPTY: '보낼 내용을 입력하세요.',
  MESSAGE_TOO_LONG: '메시지는 모든 발화자를 합해 5,000자까지 보낼 수 있습니다.',
  MESSAGE_INVALID_SPEAKER: '선택한 발화자를 이 대화에서 쓸 수 없습니다.',
  GENERATION_IN_PROGRESS: '다른 응답이 아직 생성 중이라 보내지 못했습니다.',
  CONVERSATION_READ_ONLY: '읽기 전용 대화라 보낼 수 없습니다.',
};

export function useSendMessage(sessionId: string) {
  const client = useQueryClient();
  const key = sendAttemptKey(sessionId);
  const { data: attempt } = useQuery<SendAttempt | null>({ queryKey: key, queryFn: skipToken, gcTime: Infinity });
  const setAttempt = (value: SendAttempt | null) => client.setQueryData<SendAttempt | null>(key, () => value);

  const mutation = useMutation({
    mutationFn: ({ requestId, parts }: AttemptBase) => sendChatMessage(sessionId, { request_id: requestId, parts }),
    retry: false,
    onSuccess: (generation, sent) => {
      setAttempt({ ...sent, status: 'accepted', generation });
      acceptGeneration(client, sessionId, generation);
    },
    onError: (error, sent) => {
      if (isDefiniteRejection(error)) {
        // 거절된 내용은 잃지 않는다. 입력창이 비어 있을 때만 되돌려 새로 쓴 내용을 덮어쓰지 않는다(AC05).
        const current = client.getQueryData<MessageDraft>(draftKey(sessionId));
        const restored = !current || isDraftEmpty(current);
        if (restored) client.setQueryData<MessageDraft>(draftKey(sessionId), fromMessageParts(sent.parts));
        setAttempt({
          ...sent,
          status: 'rejected',
          restored,
          message: REJECTION_MESSAGES[error.code] ?? error.detail,
        });
      } else {
        // 접수 여부를 모른다. 새 요청을 만들지 않고 같은 요청 ID로만 다시 확인한다(AC14·AC15).
        setAttempt({ ...sent, status: 'uncertain' });
      }
      void refreshTurns(client, sessionId);
    },
  });

  const current = () => client.getQueryData<SendAttempt | null>(key);
  const isBusy = (value: SendAttempt | null | undefined) =>
    value?.status === 'posting' || value?.status === 'uncertain';

  return {
    attempt,
    isBusy: isBusy(attempt),
    /** 새 메시지 전송. 앞 전송의 결과가 정해지기 전이면 보내지 않는다(연속 탭 포함, AC10). */
    send: (parts: ChatMessagePartInput[]) => {
      if (isBusy(current())) return false;
      const next: AttemptBase = { requestId: newRequestId(), parts };
      setAttempt({ ...next, status: 'posting' });
      mutation.mutate(next);
      return true;
    },
    /** 결과를 모르는 전송을 같은 요청 ID·내용으로 다시 확인한다. 서버는 기존 생성을 돌려준다. */
    confirm: () => {
      const previous = current();
      if (previous?.status !== 'uncertain') return;
      const { requestId, parts } = previous;
      setAttempt({ requestId, parts, status: 'posting' });
      mutation.mutate({ requestId, parts });
    },
    dismiss: () => setAttempt(null),
  };
}
