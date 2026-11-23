// CHAT-US-03 대화방 입력과 향후 전송 성공 연결점
import { useLayoutEffect, useRef, useState } from 'react';

import { cancelPendingDraft, persistDraft, readDraft } from '@/features/chat/draftPersistence';
import { getDraftStorage } from '@/features/chat/draftStorage';
import type { ChatDraftStorage } from '@/features/chat/draftStorage.types';

export type ChatDraftSnapshot = Readonly<{ text: string }>;

type DraftState = {
  key: string | null;
  snapshot: ChatDraftSnapshot;
  storage: ChatDraftStorage | null;
  persistenceAvailable: boolean;
};

export function useChatDraft(key: string | null, canPersist: () => boolean, getStorage = getDraftStorage) {
  const [state, setState] = useState<DraftState | null>(null);
  const current = useRef<DraftState | null>(null);

  useLayoutEffect(() => {
    const storage = key !== null && canPersist() ? getStorage() : null;
    let restored: string | Promise<string> = '';
    let persistenceAvailable = false;
    if (storage && key !== null) {
      try {
        restored = readDraft(storage, key, canPersist);
        persistenceAvailable = true;
      } catch {
        // 저장소가 막혀도 입력 자체는 계속할 수 있다.
      }
    }
    const next = {
      key,
      snapshot: { text: typeof restored === 'string' ? restored : '' },
      storage,
      persistenceAvailable,
    };
    current.current = next;
    setState(next);
    if (typeof restored !== 'string') {
      // 편집, 범위 변경, 권한 철회 뒤에는 이전 읽기 결과를 반영하지 않는다.
      const finish = (text: string, available: boolean) => {
        if (current.current !== next || !canPersist()) return;
        const hydrated = { ...next, snapshot: { text }, persistenceAvailable: available };
        current.current = hydrated;
        setState(hydrated);
      };
      void restored.then(
        (text) => finish(text, true),
        () => finish('', false),
      );
    }
    return () => {
      current.current = null;
      if (storage && key !== null && !canPersist()) cancelPendingDraft(storage, key);
    };
  }, [key, canPersist, getStorage]);

  function setText(text: string) {
    const draft = current.current;
    if (!draft || draft.key !== key || draft.snapshot.text === text) return;
    if (key !== null && !canPersist()) return;
    const next = { ...draft, snapshot: { text } };
    current.current = next;
    setState(next);
    if (key !== null && draft.storage) {
      const storage = draft.storage;
      const setAvailability = (available: boolean) => {
        const latest = current.current;
        if (latest?.snapshot !== next.snapshot || latest.persistenceAvailable === available) return;
        const updated = { ...latest, persistenceAvailable: available };
        current.current = updated;
        setState(updated);
      };
      persistDraft(
        storage,
        key,
        text,
        canPersist,
        () => setAvailability(false),
        () => setAvailability(true),
      );
    }
  }

  const snapshotForSend = () => (current.current?.key === key ? current.current.snapshot : undefined);

  // KAN-17: 전송 직전 스냅샷을 캡처하고 서버에서 성공을 확인한 경우에만 호출한다.
  // 같은 문자열을 다시 입력해도 새 스냅샷이므로 늦게 도착한 응답이 새 초안을 지우지 않는다.
  function clearAfterSendSuccess(sent: ChatDraftSnapshot) {
    if (snapshotForSend() === sent) setText('');
  }

  return {
    text: state?.key === key ? state.snapshot.text : '',
    ready: state?.key === key,
    persistenceAvailable: state?.key === key && state.persistenceAvailable,
    setText,
    snapshotForSend,
    clearAfterSendSuccess,
  };
}
