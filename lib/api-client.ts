/**
 * 서버 호출의 공통 래퍼. 인증 헤더와 에러 형식을 한 곳에서 다룬다.
 * 기본 주소는 EXPO_PUBLIC_API_URL에서 읽는다. 값이 없으면 호출하지 않는다.
 *
 * 인증: 계정 설계 전까지 서버의 임시 인증에 맞춰 개발용 `X-User-Id` 헤더를 붙인다.
 * 값은 EXPO_PUBLIC_DEV_USER_ID에서 읽는다. 로그인이 생기면 authHeaders()만 토큰으로 바꾼다.
 */

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const DEV_USER_ID = process.env.EXPO_PUBLIC_DEV_USER_ID ?? '';

/** 서버가 필드 단위로 알려 주는 입력 문제. 예: { field: 'title', code: 'REQUIRED' } */
export type FieldIssue = {
  field: string;
  code: string;
  message: string;
};

/**
 * 서버 에러(RFC 9457 Problem Details). 화면 분기는 `code`로 하고 `detail`은 안내 문구로 쓴다.
 * 네트워크 실패처럼 응답이 없으면 status 0, code 'NETWORK_ERROR'다.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly issues: FieldIssue[];

  constructor(status: number, code: string, detail: string, issues: FieldIssue[] = []) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.issues = issues;
  }
}

function authHeaders(): Record<string, string> {
  return DEV_USER_ID ? { 'X-User-Id': DEV_USER_ID } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toIssues(value: unknown): FieldIssue[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is FieldIssue =>
      isRecord(v) && typeof v.field === 'string' && typeof v.code === 'string' && typeof v.message === 'string',
  );
}

/** 실패 응답을 ApiError로 바꾼다. 본문이 Problem Details가 아니어도 상태 코드는 남긴다. */
async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // 본문이 JSON이 아니면 상태 코드만 사용한다.
  }
  if (isRecord(body)) {
    const code = typeof body.code === 'string' ? body.code : 'HTTP_ERROR';
    const detail = typeof body.detail === 'string' ? body.detail : `요청 실패: ${response.status}`;
    return new ApiError(response.status, code, detail, toIssues(body.issues));
  }
  return new ApiError(response.status, 'HTTP_ERROR', `요청 실패: ${response.status}`);
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!BASE_URL) {
    throw new ApiError(0, 'API_URL_MISSING', 'EXPO_PUBLIC_API_URL이 설정되지 않았습니다.');
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결하지 못했습니다. 네트워크를 확인하세요.');
  }

  if (!response.ok) {
    throw await toApiError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
