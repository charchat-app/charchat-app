// BASE-03 로그인 세션 보관(웹): 리프레시 토큰은 탭을 닫으면 사라지는 sessionStorage에 둔다.
// 웹은 팀 테스트용 표면이다. XSS로 토큰이 노출될 수 있는 위험은 감수하고, 제품 표면이 되면 HttpOnly 쿠키로 바꾼다.
// localStorage는 쓰지 않는다. 서버 렌더링(web.output: "server")에서는 window가 없어 아무것도 하지 않는다.
import { decodeStoredAuth, type StoredAuth } from '@/lib/authStorage.types';

export type { StoredAuth } from '@/lib/authStorage.types';

export const AUTH_STORAGE_KEY = 'charchat:auth:v1';

function sessionStore(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : (window.sessionStorage ?? null);
  } catch {
    // 브라우저 설정이 사이트 저장소 접근을 막을 수 있다.
    return null;
  }
}

export async function loadStoredAuth(): Promise<StoredAuth | null> {
  try {
    return decodeStoredAuth(sessionStore()?.getItem(AUTH_STORAGE_KEY) ?? null);
  } catch {
    return null;
  }
}

export async function saveStoredAuth(value: StoredAuth): Promise<void> {
  try {
    sessionStore()?.setItem(AUTH_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // 보관하지 못해도 이번 탭이 열려 있는 동안은 메모리의 세션으로 계속 쓴다.
  }
}

export async function clearStoredAuth(): Promise<void> {
  try {
    sessionStore()?.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // 저장소를 쓸 수 없으면 남은 값도 없다.
  }
}
