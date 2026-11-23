// CHAT-US-02 저장된 대화 이력·진행 중 생성·입력창 작성 내용 · CHAT-US-03 작성 중 입력 기기 보관
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { getChatTurns } from '@/features/chat/api';
import { getConversationOwnerId } from '@/features/chat/conversationIdentity';
import { decodeDraft, encodeDraft } from '@/features/chat/draftCodec';
import { chatDraftKey, persistDraft, readDraft } from '@/features/chat/draftPersistence';
import { getDraftStorage } from '@/features/chat/draftStorage';
import { draftKey, turnsKey } from '@/features/chat/hooks/chatCache';
import { emptyDraft, isDraftEmpty, type MessageDraft } from '@/features/chat/messageDraft';

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
 * 보내지 않은 작성 내용. 같은 앱 실행 안에서는 Query 캐시에, 앱·브라우저를 닫았다 열어도 남도록
 * 계정·대화방별로 이 기기에도 보관한다(CHAT-US-03-AC05~AC08). 서버에는 보내지 않는다.
 * 응답 완료·실패·재시도는 이 값을 건드리지 않는다(CHAT-US-02-AC05·AC16, CHAT-US-03-AC08).
 */
export function useChatDraft(sessionId: string, persist = false) {
  const client = useQueryClient();
  const key = draftKey(sessionId);
  const ownerId = getConversationOwnerId();
  const storageKey = persist ? chatDraftKey(ownerId, sessionId) : null;
  // 입력창은 제어 컴포넌트라 화면 상태로 바로 그리고, 캐시는 보관용으로만 따라 쓴다.
  const [draft, setDraft] = useState<MessageDraft>(() => client.getQueryData<MessageDraft>(key) ?? EMPTY_DRAFT);
  // 이 화면이 쓴 값. 늦게 도착한 캐시 알림이 더 최신 입력을 되돌리지 않게 구분한다.
  const written = useRef(new WeakSet<MessageDraft>([draft]));
  // 이용자가 고치거나 거절된 내용이 되돌아온 뒤에만 기기 보관분을 바꾼다. 처음 빈 화면이 보관분을 지우지 않는다.
  const touched = useRef(false);
  const [deviceUnavailable, setDeviceUnavailable] = useState(false);
  const { data } = useQuery<MessageDraft>({
    queryKey: key,
    queryFn: skipToken,
    gcTime: Infinity,
    staleTime: Infinity,
    structuralSharing: false,
  });
  const canPersist = useCallback(
    () => storageKey !== null && getConversationOwnerId() === ownerId,
    [ownerId, storageKey],
  );

  // 이 실행에 작성 중인 내용이 없을 때만 기기 보관분을 읽는다(앱·브라우저 재실행, AC05).
  useLayoutEffect(() => {
    if (storageKey === null) return;
    const storage = getDraftStorage();
    const cached = client.getQueryData<MessageDraft>(key);
    if (!storage || (cached && !isDraftEmpty(cached))) return;
    let active = true;
    const apply = (stored: string) => {
      // 읽는 동안 이용자가 고쳤거나 화면을 떠났으면 늦게 읽은 보관분을 덮어쓰지 않는다.
      if (!active || touched.current || !canPersist()) return;
      const restored = decodeDraft(stored);
      if (!restored) return;
      written.current.add(restored);
      setDraft(restored);
    };
    try {
      const stored = readDraft(storage, storageKey, canPersist);
      if (typeof stored === 'string') apply(stored);
      else void stored.then(apply, () => active && setDeviceUnavailable(true));
    } catch {
      setDeviceUnavailable(true);
    }
    return () => {
      active = false;
    };
  }, [canPersist, client, key, storageKey]);

  useEffect(() => {
    written.current.add(draft);
    client.setQueryData<MessageDraft>(draftKey(sessionId), draft);
    if (!touched.current || storageKey === null) return;
    const storage = getDraftStorage();
    if (!storage) return;
    // 마지막 변경 뒤 약 0.5초 멈추면 보관하고, 모두 지우면 바로 지운다(AC06·AC07).
    persistDraft(
      storage,
      storageKey,
      encodeDraft(draft),
      canPersist,
      () => setDeviceUnavailable(true),
      () => setDeviceUnavailable(false),
    );
  }, [canPersist, client, sessionId, draft, storageKey]);

  // 거절된 전송 내용을 되돌리는 등 캐시가 밖에서 바뀌면 화면에도 반영한다.
  useEffect(() => {
    if (data && !written.current.has(data)) {
      written.current.add(data);
      touched.current = true;
      setDraft(data);
    }
  }, [data]);

  const update = useCallback((change: (draft: MessageDraft) => MessageDraft) => {
    touched.current = true;
    setDraft(change);
  }, []);
  return { draft, update, deviceUnavailable };
}
