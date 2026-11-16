/**
 * 서버 호출의 공통 래퍼. 인증 헤더와 에러 형식을 한 곳에서 다룬다.
 * 기본 주소는 EXPO_PUBLIC_API_URL에서 읽는다. 값이 없으면 호출하지 않는다.
 * 계정·인증 방식은 아직 정하지 않았으므로 토큰 부착은 자리만 둔다.
 */

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!BASE_URL) {
    throw new ApiError(0, 'EXPO_PUBLIC_API_URL이 설정되지 않았습니다.');
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, `요청 실패: ${response.status}`);
  }

  return (await response.json()) as T;
}
