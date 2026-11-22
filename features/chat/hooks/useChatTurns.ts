// CHAT-US-02 저장된 대화 이력·진행 중 생성·입력창 작성 내용
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getChatTurns } from '@/features/chat/api';
import { draftKey, turnsKey } from '@/features/chat/hooks/chatCache';
import { emptyDraft, type MessageDraft } from '@/features/chat/messageDraft';

/** 화면에 들어올 때마다 다시 읽어 진행 중인 생성을 이어서 표시한다(AC13·AC14). */
export function useChatTurns(sessionId: string, enabled: boolean) {
  return useQuery({
    queryKey: turnsKey(sessionId),
    queryFn: ({ signal }) => getChatTurns(sessionId, signal),
    retry: false,
    enabled,
  });
}

const EMPTY_DRAFT = emptyDraft();

/**
 * 보내지 않은 작성 내용. 같은 앱 실행 안에서 대화방을 나갔다 돌아와도 남도록 Query 캐시에 둔다.
 * 기기 보관은 CHAT-US-03(KAN-24)에서 다룬다. 응답 완료·실패·재시도는 이 값을 건드리지 않는다(AC05·AC16).
 */
export function useChatDraft(sessionId: string) {
  const client = useQueryClient();
  const key = draftKey(sessionId);
  // 입력창은 제어 컴포넌트라 화면 상태로 바로 그리고, 캐시는 보관용으로만 따라 쓴다.
  const [draft, setDraft] = useState<MessageDraft>(() => client.getQueryData<MessageDraft>(key) ?? EMPTY_DRAFT);
  // 이 화면이 쓴 값. 늦게 도착한 캐시 알림이 더 최신 입력을 되돌리지 않게 구분한다.
  const written = useRef(new WeakSet<MessageDraft>([draft]));
  const { data } = useQuery<MessageDraft>({
    queryKey: key,
    queryFn: skipToken,
    gcTime: Infinity,
    staleTime: Infinity,
    structuralSharing: false,
  });

  useEffect(() => {
    written.current.add(draft);
    client.setQueryData<MessageDraft>(draftKey(sessionId), draft);
  }, [client, sessionId, draft]);

  // 거절된 전송 내용을 되돌리는 등 캐시가 밖에서 바뀌면 화면에도 반영한다.
  useEffect(() => {
    if (data && !written.current.has(data)) {
      written.current.add(data);
      setDraft(data);
    }
  }, [data]);

  const update = useCallback((change: (draft: MessageDraft) => MessageDraft) => setDraft(change), []);
  return { draft, update };
}
