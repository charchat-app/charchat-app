// CHAT-US-03 네이티브 임시 저장 어댑터 (웹에서는 draftStorage.web.ts를 사용한다.)
import type { ChatDraftStorage, NativeDraftStorage } from '@/features/chat/draftStorage.types';

let storage: NativeDraftStorage | undefined;

export function getDraftStorage(): ChatDraftStorage | null {
  if (storage) return storage;
  try {
    // 모듈을 포함하지 않은 네이티브 빌드에서도 입력 자체는 계속할 수 있다.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: asyncStorage } =
      require('@react-native-async-storage/async-storage') as typeof import('@react-native-async-storage/async-storage');
    storage = {
      kind: 'native',
      getItem: (key) => asyncStorage.getItem(key),
      setItem: (key, value) => asyncStorage.setItem(key, value),
      removeItem: (key) => asyncStorage.removeItem(key),
      getAllKeys: () => asyncStorage.getAllKeys(),
      multiRemove: (keys) => asyncStorage.multiRemove([...keys]),
    };
    return storage;
  } catch {
    return null;
  }
}
