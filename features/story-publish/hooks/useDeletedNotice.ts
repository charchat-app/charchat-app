import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

/**
 * 삭제 성공 뒤 목록에 한 번만 보여 줄 안내 (CREATE-US-07-AC10).
 * 편집 화면이 삭제 후 이동할 때 남기고, 목록이 처음 받은 순간 소비한다.
 * QueryClient마다 따로 두어 앱(또는 테스트) 사이에 상태가 새지 않게 한다.
 */
type Store = { pending: boolean; listeners: Set<() => void> };

const stores = new WeakMap<QueryClient, Store>();

function storeOf(client: QueryClient): Store {
  let store = stores.get(client);
  if (!store) {
    store = { pending: false, listeners: new Set() };
    stores.set(client, store);
  }
  return store;
}

/** 삭제 성공 안내를 남긴다. 이미 열려 있는 목록이 있으면 바로 받는다. */
export function announceStoryDeleted(client: QueryClient): void {
  const store = storeOf(client);
  store.pending = true;
  store.listeners.forEach((listener) => listener());
}

/** 목록 화면용: 남겨진 안내를 한 번만 받아 보여 주고, dismiss로 지운다. */
export function useDeletedNotice(): { visible: boolean; dismiss: () => void } {
  const client = useQueryClient();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const store = storeOf(client);
    const take = () => {
      if (!store.pending) return;
      store.pending = false;
      setVisible(true);
    };
    take();
    store.listeners.add(take);
    return () => {
      store.listeners.delete(take);
    };
  }, [client]);

  const dismiss = useCallback(() => setVisible(false), []);
  return { visible, dismiss };
}
