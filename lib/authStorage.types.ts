// BASE-03 기기에 보관하는 로그인 세션 형식(네이티브·웹 공용)

/** 기기에 남기는 값. 액세스 토큰은 넣지 않는다. */
export type StoredAuth = { refreshToken: string; userId: string };

/** 보관된 문자열을 검사해 읽는다. 형식이 다르면 없는 것으로 본다. */
export function decodeStoredAuth(stored: string | null): StoredAuth | null {
  if (!stored) return null;
  try {
    const value = JSON.parse(stored) as Record<string, unknown>;
    if (typeof value.refreshToken !== 'string' || value.refreshToken === '') return null;
    if (typeof value.userId !== 'string' || value.userId === '') return null;
    return { refreshToken: value.refreshToken, userId: value.userId };
  } catch {
    return null;
  }
}
