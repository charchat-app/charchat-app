/**
 * 서버 호출의 공통 래퍼. 인증 헤더와 에러 형식을 한 곳에서 다룬다.
 * 기본 주소는 EXPO_PUBLIC_API_URL에서 읽는다. 값이 없으면 호출하지 않는다.
 *
 * 인증: 계정 설계 전까지 서버의 임시 인증에 맞춰 개발용 `X-User-Id` 헤더를 붙인다.
 * 값은 EXPO_PUBLIC_DEV_USER_ID에서 읽는다. 로그인이 생기면 authHeaders()만 토큰으로 바꾼다.
 *
 * 요청 취소(signal)와 시간 제한을 지원한다. 시간 제한은 기본 15초이고, 이미지 업로드처럼 오래 걸리는 호출은
 * `timeoutMs`로 호출별로 바꾼다. 실패해도 자동으로 다시 호출하지 않는다.
 */

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const DEV_USER_ID = process.env.EXPO_PUBLIC_DEV_USER_ID ?? '';
/** 호출 측이 `timeoutMs`를 넘기지 않을 때의 시간 제한 */
export const DEFAULT_TIMEOUT_MS = 15000;

/** fetch 옵션에 호출별 시간 제한(ms)을 더한 요청 옵션. 양의 유한한 값만 쓰고, 그 밖의 값은 기본값을 쓴다. */
export type ApiRequestInit = RequestInit & { timeoutMs?: number };

/** 서버가 필드 단위로 알려 주는 입력 문제. 예: { field: 'title', code: 'REQUIRED' } */
export type FieldIssue = {
  field: string;
  code: string;
  message: string;
  /** 문제가 된 대상의 값(선택). 예: 이미지가 없는 캐릭터의 id */
  value?: string | null;
};

/**
 * 서버 에러(RFC 9457 Problem Details). 화면 분기는 `code`로 하고 `detail`은 안내 문구로 쓴다.
 * 네트워크 실패·시간 초과처럼 응답이 없으면 status 0, code 'NETWORK_ERROR'다.
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

/**
 * 호출 측 헤더(객체·배열·Headers)를 기본 헤더 위에 덮어쓴다. 같은 이름은 호출 측 값이 이긴다.
 * 본문이 FormData(파일 업로드)면 Content-Type을 넣지 않는다. 경계(boundary)는 fetch가 직접 붙인다.
 */
function mergeHeaders(extra: HeadersInit | undefined, json = true): Record<string, string> {
  const merged: Record<string, string> = { ...(json ? { 'Content-Type': 'application/json' } : {}), ...authHeaders() };
  if (!extra) return merged;
  new Headers(extra).forEach((value, name) => {
    for (const key of Object.keys(merged)) if (key.toLowerCase() === name) delete merged[key];
    merged[name] = value;
  });
  return merged;
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

/** `baseUrl`은 저장소별로 다른 주소를 쓸 때만 넘긴다. 기본은 EXPO_PUBLIC_API_URL. */
export async function apiRequest<T>(path: string, options: ApiRequestInit = {}, baseUrl = BASE_URL): Promise<T> {
  if (!baseUrl) {
    throw new ApiError(0, 'API_URL_MISSING', 'EXPO_PUBLIC_API_URL이 설정되지 않았습니다.');
  }

  const { timeoutMs, ...init } = options;
  const limit =
    typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, limit);
  try {
    let response: Response;
    try {
      response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
        ...init,
        headers: mergeHeaders(init.headers, !(typeof FormData !== 'undefined' && init.body instanceof FormData)),
        signal: controller.signal,
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
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  }
}
