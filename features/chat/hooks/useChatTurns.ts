// CHAT-US-02 저장된 대화 이력·진행 중 생성·입력창 작성 내용 · CHAT-US-03 작성 중 입력 기기 보관
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { getChatTurns } from '@/features/chat/api';
import { getConversationOwnerId } from '@/features/chat/conversationIdentity';
import { decodeDraft, encodeDraft } from '@/features/chat/draftCodec';
import { chatDraftKey, persistDraft, readDraft } from '@/features/chat/draftPersistence';
import { getDraftStorage } from '@/features/chat/draftStorage';
import { draftKey, recheckSessionAccess, turnsKey } from '@/features/chat/hooks/chatCache';
import { emptyDraft, isDraftEmpty, type MessageDraft, type SpeakerNames } from '@/features/chat/messageDraft';

/** 화면에 들어올 때마다 다시 읽어 진행 중인 생성을 이어서 표시한다(AC13·AC14). */
export function useChatTurns(sessionId: string, enabled: boolean) {
  const client = useQueryClient();
  return useQuery({
    queryKey: turnsKey(sessionId),
    queryFn: async ({ signal }) => {
      try {
        return await getChatTurns(sessionId, signal);
      } catch (error) {
        // CHAT-US-04-AC04: 전송·재시도·생성 조회 거절도 이력 재조회를 거치므로 여기 한 곳에서 접근을 다시 확인한다.
        if (!signal.aborted) recheckSessionAccess(client, sessionId, error);
        throw error;
      }
    },
    retry: false,
    enabled,
  });
}

const EMPTY_DRAFT = emptyDraft();

/**
 * 보내지 않은 작성 내용. 같은 앱 실행 안에서는 Query 캐시에, 앱·브라우저를 닫았다 열어도 남도록
 * 계정·대화방별로 이 기기에도 보관한다(CHAT-US-03-AC05~AC08). 서버에는 보내지 않는다.
 * 응답 완료·실패·재시도는 이 값을 건드리지 않는다(CHAT-US-02-AC05·AC16, CHAT-US-03-AC08).
 * `names`(세션 화자 이름)는 이전 형식(v1) 보관분을 `@이름:` 줄 글자로 바꿔 복원할 때 쓴다.
 */
export function useChatDraft(sessionId: string, names: SpeakerNames, persist = false) {
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
  // 보낸 뒤 비운 입력은 전송 복구 기록이 확보될 때까지 기기 보관분을 지우지 않는다(CHAT-US-03-AC05·AC09).
  const sentHold = useRef<Promise<boolean> | null>(null);
  const latest = useRef(draft);
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
      const restored = decodeDraft(stored, names);
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
  }, [canPersist, client, key, names, storageKey]);

  useEffect(() => {
    written.current.add(draft);
    latest.current = draft;
    client.setQueryData<MessageDraft>(draftKey(sessionId), draft);
    const hold = sentHold.current;
    sentHold.current = null;
    if (!touched.current || storageKey === null) return;
    const storage = getDraftStorage();
    if (!storage) return;
    const persist = (text: string) =>
      persistDraft(
        storage,
        storageKey,
        text,
        canPersist,
        () => setDeviceUnavailable(true),
        () => setDeviceUnavailable(false),
      );
    if (hold) {
      // 기록이 확보되거나 접수가 확인된 뒤, 그 사이 새로 고친 내용이 없을 때만 지운다.
      void hold.then((secured) => {
        if (secured && latest.current === draft) persist('');
      });
      return;
    }
    // 마지막 변경 뒤 약 0.5초 멈추면 보관하고, 모두 지우면 바로 지운다(AC06·AC07).
    persist(encodeDraft(draft));
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
    sentHold.current = null;
    setDraft(change);
  }, []);
  /**
   * 보낸 내용을 입력창에서 비운다. 기기 보관분은 `secured`가 true가 될 때(전송 복구 기록 확보 또는
   * 접수 확인)까지 남겨, 응답이 사라져도 앱을 다시 열면 원문을 되찾을 수 있게 한다.
   */
  const clearSent = useCallback((secured: Promise<boolean>, next: MessageDraft) => {
    touched.current = true;
    sentHold.current = secured;
    setDraft(next);
  }, []);
  return { draft, update, clearSent, deviceUnavailable };
}
