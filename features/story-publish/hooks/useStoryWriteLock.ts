import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';

type Write = 'save' | 'delete';
type Status = Write | 'deleted' | 'idle';
type Entry = { status: Exclude<Status, 'idle'> };
type Store = { entries: Map<string, Entry>; deleteErrors: Map<string, string>; listeners: Set<() => void> };

// 화면이 아니라 조회 캐시 수명에 맞춘다. 서로 다른 QueryClient의 상태는 공유하지 않는다.
const stores = new WeakMap<QueryClient, Store>();

export function useStoryWriteLock(id: string) {
  const client = useQueryClient();
  let state = stores.get(client);
  if (!state) {
    state = { entries: new Map(), deleteErrors: new Map(), listeners: new Set() };
    stores.set(client, state);
  }
  const store = state;
  const subscribe = useCallback(
    (listener: () => void) => {
      store.listeners.add(listener);
      return () => void store.listeners.delete(listener);
    },
    [store],
  );
  const getStatus = useCallback(() => store.entries.get(id)?.status ?? 'idle', [store, id]);
  const status = useSyncExternalStore(subscribe, getStatus, getStatus);

  function acquire(write: Write) {
    // 다시 렌더되기 전 동일한 틱에 눌러도 두 요청이 시작되지 않는다.
    if (store.entries.has(id)) return null;
    const entry: Entry = { status: write };
    store.entries.set(id, entry);
    if (write === 'delete') store.deleteErrors.delete(id);
    store.listeners.forEach((notify) => notify());
    return (deleted = false, error?: string) => {
      if (store.entries.get(id) !== entry) return;
      if (write === 'delete' && error) store.deleteErrors.set(id, error);
      if (deleted) entry.status = 'deleted';
      else store.entries.delete(id);
      store.listeners.forEach((notify) => notify());
    };
  }

  /** 렌더를 기다리지 않고 지금 잠금 상태를 읽는다. 잠금을 얻지 못한 이유를 안내할 때 쓴다. */
  const peek = (): Status => store.entries.get(id)?.status ?? 'idle';

  return { status, acquire, peek, deleteError: store.deleteErrors.get(id) };
}

/**
 * CREATE-US-07-AC03/07/09: 다른 화면의 저장·삭제가 같은 스토리 잠금을 쥐고 있어 직접 저장을 보내지 않았을 때의 안내.
 * 요청을 보내지 않았으므로 입력은 그대로이고, 잠금이 풀린 뒤 다시 저장하면 된다.
 */
export function writeBlockedMessage(status: Status): string {
  if (status === 'deleted') return '삭제된 스토리라 저장하지 않았어요.';
  if (status === 'delete') return '스토리를 삭제하는 중이라 저장하지 않았어요. 입력은 그대로예요.';
  return '다른 화면에서 이 스토리를 저장하는 중이라 저장하지 않았어요. 입력은 그대로예요. 저장이 끝난 뒤 다시 저장해 주세요.';
}
