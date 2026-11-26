// BASE-03 로그인 세션 보관(네이티브): 리프레시 토큰과 계정 번호만 Keychain·Keystore에 둔다.
// 액세스 토큰은 기기에 쓰지 않고 메모리(lib/authSession.ts)에만 둔다. 웹은 authStorage.web.ts를 쓴다.
import * as SecureStore from 'expo-secure-store';

import { decodeStoredAuth, type StoredAuth } from '@/lib/authStorage.types';

export type { StoredAuth } from '@/lib/authStorage.types';

/** SecureStore 키는 영문·숫자·`.`·`-`·`_`만 허용한다. */
export const AUTH_STORAGE_KEY = 'charchat.auth.v1';

// 백업·기기 이전으로 토큰이 다른 기기에 복원되지 않게 이 기기에만 둔다.
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export async function loadStoredAuth(): Promise<StoredAuth | null> {
  try {
    return decodeStoredAuth(await SecureStore.getItemAsync(AUTH_STORAGE_KEY, OPTIONS));
  } catch {
    // 잠금 해제 전이거나 저장소를 쓸 수 없으면 로그인 화면에서 다시 시작한다.
    return null;
  }
}

export async function saveStoredAuth(value: StoredAuth): Promise<void> {
  try {
    await SecureStore.setItemAsync(AUTH_STORAGE_KEY, JSON.stringify(value), OPTIONS);
  } catch {
    // 보관하지 못해도 이번 실행 동안은 메모리의 세션으로 계속 쓴다.
  }
}

export async function clearStoredAuth(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY, OPTIONS);
  } catch {
    // 지우지 못한 토큰은 서버에서 이미 폐기됐거나 다음 시작 때 리프레시가 거절된다.
  }
}
