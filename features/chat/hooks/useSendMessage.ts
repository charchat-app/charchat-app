// CHAT-US-02 메시지 전송: 전송 시도마다 요청 ID 하나, 결과를 모르면 같은 ID로만 다시 확인한다
// CHAT-US-03 결과를 모르는 요청 ID는 기기에 남겨, 다시 열면 서버에 조회만 해서 이어 간다(AC09)
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { findGenerationsByRequest, sendChatMessage } from '@/features/chat/api';
import { getConversationOwnerId } from '@/features/chat/conversationIdentity';
import { encodeDraft } from '@/features/chat/draftCodec';
import { chatDraftKey, writeDraftNow } from '@/features/chat/draftPersistence';
import { getDraftStorage } from '@/features/chat/draftStorage';
import {
  acceptGeneration,
  draftKey,
  isDefiniteRejection,
  refreshTurns,
  sendAttemptKey,
} from '@/features/chat/hooks/chatCache';
import { fromMessageParts, isDraftEmpty, type MessageDraft } from '@/features/chat/messageDraft';
import { newRequestId } from '@/features/chat/requestId';
import {
  clearSendAttempt,
  loadSendAttempt,
  markSendAttemptRejected,
  saveSendAttempt,
} from '@/features/chat/sendAttemptStorage';
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

// 요청 ID별 접수 확정 여부. 화면을 떠나도 전달되도록 훅 밖에 둔다.
// 결과를 모르는 동안에는 정하지 않고, 같은 요청 ID의 확인이 접수되면 그때 true가 된다.
const settlements = new Map<string, (accepted: boolean) => void>();
const settle = (requestId: string, accepted: boolean) => {
  settlements.get(requestId)?.(accepted);
  settlements.delete(requestId);
};

/** 거절된 원문을 방이 닫혀 있어도 기기의 작성 중 입력으로 바로 되돌린다. */
async function restoreDraftOnDevice(sessionId: string, draft: MessageDraft) {
  const ownerId = getConversationOwnerId();
  const key = chatDraftKey(ownerId, sessionId);
  const storage = key ? getDraftStorage() : null;
  if (!key || !storage) return false;
  return writeDraftNow(storage, key, encodeDraft(draft), () => getConversationOwnerId() === ownerId);
}

export function useSendMessage(sessionId: string) {
  const client = useQueryClient();
  const key = sendAttemptKey(sessionId);
  const { data: attempt } = useQuery<SendAttempt | null>({ queryKey: key, queryFn: skipToken, gcTime: Infinity });
  const setAttempt = (value: SendAttempt | null) => client.setQueryData<SendAttempt | null>(key, () => value);
  // 기기에 남은 이전 전송 기록을 다 읽은 대화방. 읽기 전에는 새 전송이 그 요청 ID를 덮어쓰지 못하게 막는다.
  const [checkedFor, setCheckedFor] = useState<string | null>(null);
  const checked = useRef<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ requestId, parts }: AttemptBase) => sendChatMessage(sessionId, { request_id: requestId, parts }),
    retry: false,
    onSuccess: (generation, sent) => {
      settle(sent.requestId, true);
      setAttempt({ ...sent, status: 'accepted', generation });
      acceptGeneration(client, sessionId, generation);
      void clearSendAttempt(sessionId, sent.requestId);
    },
    onError: (error, sent) => {
      if (isDefiniteRejection(error)) {
        settle(sent.requestId, false);
        // 거절된 내용은 잃지 않는다. 입력창이 비어 있을 때만 되돌려 새로 쓴 내용을 덮어쓰지 않는다(AC05).
        const current = client.getQueryData<MessageDraft>(draftKey(sessionId));
        const restored = !current || isDraftEmpty(current);
        const message = REJECTION_MESSAGES[error.code] ?? error.detail;
        if (restored) client.setQueryData<MessageDraft>(draftKey(sessionId), fromMessageParts(sent.parts));
        setAttempt({ ...sent, status: 'rejected', restored, message });
        // 방이 닫혀 있어도 원문을 기기에서 되찾을 수 있게 한 뒤에만 전송 기록을 정리한다(CHAT-US-03-AC05).
        // 입력창으로 되돌렸으면 기기의 작성 중 입력에, 새로 쓴 내용이 있으면 거절 표시를 단 전송 기록에 남긴다.
        void (async () => {
          if (restored && (await restoreDraftOnDevice(sessionId, fromMessageParts(sent.parts)))) {
            await clearSendAttempt(sessionId, sent.requestId);
          } else {
            await markSendAttemptRejected(sessionId, sent.requestId, message);
          }
        })();
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

  // 앱·브라우저를 닫았다 열어 이 실행에 기록이 없으면, 기기에 남은 요청 ID로 서버 상태를 조회만 한다.
  // 찾으면 접수된 생성으로 이어 가고, 없으면 같은 요청 ID로만 다시 확인할 수 있게 둔다(새 요청 없음).
  useEffect(() => {
    let active = true;
    let checking: SendAttempt | null = null;
    const controller = new AbortController();
    const markChecked = () => {
      checked.current = sessionId;
      setCheckedFor(sessionId);
    };
    checked.current = null;
    void (async () => {
      if (current() != null) return markChecked();
      const stored = await loadSendAttempt(sessionId);
      if (!active) return;
      if (!stored || current() != null) return markChecked();
      if (stored.rejected !== undefined) {
        // 방을 나간 사이 거절된 전송. 조회 없이 원문과 거절 안내를 다시 보여 준다.
        setAttempt({
          requestId: stored.requestId,
          parts: stored.parts,
          status: 'rejected',
          restored: false,
          message: stored.rejected,
        });
        return markChecked();
      }
      // 여기부터는 '보내는 중' 상태가 새 전송을 막는다.
      checking = { requestId: stored.requestId, parts: stored.parts, status: 'posting' };
      setAttempt(checking);
      markChecked();
      try {
        const { generations } = await findGenerationsByRequest(sessionId, stored.requestId, controller.signal);
        if (!active) return;
        const found = generations.find((generation) => generation.session_id === Number(sessionId));
        if (found) {
          setAttempt({ requestId: stored.requestId, parts: stored.parts, status: 'accepted', generation: found });
          acceptGeneration(client, sessionId, found);
          void clearSendAttempt(sessionId, stored.requestId);
          return;
        }
      } catch {
        if (!active) return;
      }
      setAttempt({ requestId: stored.requestId, parts: stored.parts, status: 'uncertain' });
    })();
    return () => {
      active = false;
      controller.abort();
      // 확인 도중 나가면 다음에 들어올 때 다시 확인하도록 표시를 거둔다.
      if (checking && current() === checking) setAttempt(null);
    };
    // 대화방에 들어올 때 한 번만 확인한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, sessionId]);

  return {
    attempt,
    isBusy: isBusy(attempt),
    /** 기기에 남은 이전 전송 기록을 아직 읽는 중이다. 입력은 받되 새 전송은 막는다. */
    checking: checkedFor !== sessionId,
    /**
     * 새 메시지 전송. 이전 기록을 읽는 중이거나 앞 전송의 결과가 정해지기 전이면 보내지 않고 null(연속 탭 포함, AC10).
     * 보냈으면 기기의 초안을 지워도 되는지 알려 주는 Promise를 돌려준다.
     * 전송 복구 기록을 남겼거나 서버 접수가 확인되면 true, 기록 없이 거절되면 false.
     */
    send: (parts: ChatMessagePartInput[]): Promise<boolean> | null => {
      if (checked.current !== sessionId || isBusy(current())) return null;
      const next: AttemptBase = { requestId: newRequestId(), parts };
      const accepted = new Promise<boolean>((resolve) => settlements.set(next.requestId, resolve));
      setAttempt({ ...next, status: 'posting' });
      const secured = saveSendAttempt(sessionId, next).then((saved) => saved || accepted);
      mutation.mutate(next);
      return secured;
    },
    /** 결과를 모르는 전송을 같은 요청 ID·내용으로 다시 확인한다. 서버는 기존 생성을 돌려준다. */
    confirm: () => {
      const previous = current();
      if (previous?.status !== 'uncertain') return;
      const { requestId, parts } = previous;
      setAttempt({ requestId, parts, status: 'posting' });
      mutation.mutate({ requestId, parts });
    },
    /** 안내를 닫는다. 거절된 전송이면 기기에 남긴 기록도 그때 정리한다. */
    dismiss: () => {
      const previous = current();
      setAttempt(null);
      if (previous?.status === 'rejected') void clearSendAttempt(sessionId, previous.requestId);
    },
  };
}
