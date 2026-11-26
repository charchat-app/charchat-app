/**
 * 서버 호출의 공통 래퍼. 인증 헤더와 에러 형식을 한 곳에서 다룬다.
 * 기본 주소는 EXPO_PUBLIC_API_URL에서 읽는다. 값이 없으면 호출하지 않는다.
 *
 * 인증(BASE-03): 로그인하면 `Authorization: Bearer <액세스 토큰>`을 붙인다(lib/authSession).
 * 로그인하지 않았을 때는 개발용 헤더 모드에서만 `X-User-Id`(EXPO_PUBLIC_DEV_USER_ID)를 붙인다.
 * 개발용 헤더 모드: EXPO_PUBLIC_DEV_AUTH=header. 값이 없으면 기존 개발 설정 호환을 위해
 * EXPO_PUBLIC_DEV_USER_ID가 있을 때 헤더 모드로 본다. 로그인 화면을 쓰려면 EXPO_PUBLIC_DEV_AUTH=token으로 둔다.
 *
 * 요청 취소(signal)와 시간 제한을 지원한다. 시간 제한은 기본 15초이고, 이미지 업로드처럼 오래 걸리는 호출은
 * `timeoutMs`로 호출별로 바꾼다. 실패해도 자동으로 다시 호출하지 않는다.
 * 예외(BASE-03): 401 AUTH_TOKEN_EXPIRED는 리프레시를 한 번(동시 요청은 하나를 공유) 한 뒤 원 요청을 1회만 다시 보낸다.
 * 인증 실패는 서버 핸들러 실행 전에 나므로 메시지 전송 같은 POST도 다시 보내도 부작용이 없다.
 */

import {
  expireSession,
  getAuthSnapshot,
  getRefreshToken,
  grantFromTokenResponse,
  applyGrant,
  setOnboardingRequired,
} from '@/lib/authSession';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const DEV_USER_ID = process.env.EXPO_PUBLIC_DEV_USER_ID ?? '';
const DEV_AUTH = process.env.EXPO_PUBLIC_DEV_AUTH ?? '';
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

/**
 * 개발용 헤더 모드의 사용자 번호. 모드가 꺼져 있으면 null.
 * EXPO_PUBLIC_DEV_AUTH=header면 켜고, =token(그 밖의 값)이면 끈다. 비어 있으면 DEV_USER_ID가 있을 때 켠다(기존 설정 호환).
 */
export function devHeaderUserId(): string | null {
  if (!DEV_USER_ID) return null;
  return DEV_AUTH === 'header' || DEV_AUTH === '' ? DEV_USER_ID : null;
}

/**
 * 인증 헤더. 이미지처럼 apiRequest를 거치지 않는 요청(소유자 전용 이미지 미리보기)에도 같은 값을 붙인다.
 * 호출할 때마다 현재 세션을 읽으므로 토큰이 바뀌면 다음 요청부터 새 값을 쓴다.
 */
export function authHeaders(): Record<string, string> {
  const { accessToken } = getAuthSnapshot();
  if (accessToken) return { Authorization: `Bearer ${accessToken}` };
  const devUserId = devHeaderUserId();
  return devUserId ? { 'X-User-Id': devUserId } : {};
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
function mergeHeaders(
  extra: HeadersInit | undefined,
  json = true,
  auth: Record<string, string> = authHeaders(),
): Record<string, string> {
  const merged: Record<string, string> = { ...(json ? { 'Content-Type': 'application/json' } : {}), ...auth };
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

type SendResult<T> = { data: T; bearer: string | null };

const sentTokens = new WeakMap<ApiError, string>();

/** 한 번 보낸다. `bearer`는 실제로 붙인 세션 액세스 토큰(호출 측이 Authorization을 바꿨으면 null). */
async function send<T>(
  path: string,
  options: ApiRequestInit,
  baseUrl: string,
  withAuth = true,
): Promise<SendResult<T>> {
  if (!baseUrl) {
    throw new ApiError(0, 'API_URL_MISSING', 'EXPO_PUBLIC_API_URL이 설정되지 않았습니다.');
  }

  const { timeoutMs, ...init } = options;
  const limit =
    typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
  const { accessToken } = getAuthSnapshot();
  const headers = mergeHeaders(
    init.headers,
    !(typeof FormData !== 'undefined' && init.body instanceof FormData),
    withAuth ? authHeaders() : {},
  );
  const bearer = accessToken && headers.Authorization === `Bearer ${accessToken}` ? accessToken : null;

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, limit);
  try {
    let response: Response;
    try {
      response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, { ...init, headers, signal: controller.signal });
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결하지 못했습니다. 네트워크를 확인하세요.');
    }

    if (!response.ok) {
      const error = await toApiError(response);
      if (bearer) sentTokens.set(error, bearer);
      throw error;
    }
    if (response.status === 204) {
      return { data: undefined as T, bearer };
    }
    return { data: (await response.json()) as T, bearer };
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  }
}

/** 실패 응답이 어느 세션 토큰으로 보낸 요청인지. 토큰이 에러 객체·로그에 드러나지 않게 따로 둔다. */
function sentBearer(error: ApiError): string | null {
  return sentTokens.get(error) ?? null;
}

/** 리프레시 결과. unavailable(네트워크·서버 오류)이면 세션을 유지하고 원 요청의 실패만 알린다. */
export type RefreshResult = 'refreshed' | 'invalid' | 'unavailable';

let refreshing: Promise<RefreshResult> | null = null;

async function runRefresh(): Promise<RefreshResult> {
  const token = getRefreshToken();
  if (!token) return 'invalid';
  const { sessionKey } = getAuthSnapshot();
  try {
    const { data } = await send<unknown>(
      '/auth/tokens',
      { method: 'POST', body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: token }) },
      BASE_URL,
      false,
    );
    // 기다리는 사이 로그아웃·다른 로그인이 있었으면 결과를 버린다.
    if (getAuthSnapshot().sessionKey !== sessionKey || getAuthSnapshot().status === 'signing-out') return 'invalid';
    const grant = grantFromTokenResponse(data);
    if (grant) {
      applyGrant(grant);
      return 'refreshed';
    }
    // 서버는 이미 토큰을 회전했을 수 있어 이전 토큰으로는 이어갈 수 없다.
    expireSession();
    return 'invalid';
  } catch (error) {
    if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) return 'unavailable';
    // 401 AUTH_REFRESH_INVALID, 409 AUTH_REFRESH_CONFLICT 등: 이 리프레시 토큰으로는 더 이어갈 수 없다.
    if (getAuthSnapshot().sessionKey === sessionKey) expireSession();
    return 'invalid';
  }
}

/**
 * 단일 비행 리프레시. 동시에 들어온 호출은 진행 중인 하나의 Promise를 공유한다.
 * `staleToken`을 넘기면, 그 토큰이 이미 다른 리프레시로 바뀐 뒤에는 다시 리프레시하지 않는다.
 * 실패(invalid)하면 세션을 만료 처리해 로그인 화면으로 보낸다.
 */
export function refreshAccessToken(staleToken?: string): Promise<RefreshResult> {
  if (refreshing) return refreshing;
  const current = getAuthSnapshot().accessToken;
  if (staleToken && current && current !== staleToken) return Promise.resolve('refreshed');
  const run = runRefresh().finally(() => {
    if (refreshing === run) refreshing = null;
  });
  refreshing = run;
  return run;
}

/** 인증 실패가 아직 같은 세션에서 난 것이면 로그인·온보딩 화면으로 보낸다. */
function handleAuthFailure(error: ApiError) {
  const bearer = sentBearer(error);
  if (!bearer || getAuthSnapshot().accessToken !== bearer) return;
  if (getAuthSnapshot().status === 'signing-out') return;
  if (error.status === 401) {
    if (['AUTH_TOKEN_EXPIRED', 'AUTH_TOKEN_INVALID', 'UNAUTHENTICATED'].includes(error.code)) expireSession();
  } else if (error.status === 403 && error.code === 'ONBOARDING_REQUIRED') {
    setOnboardingRequired(true);
  }
}

/** `baseUrl`은 저장소별로 다른 주소를 쓸 때만 넘긴다. 기본은 EXPO_PUBLIC_API_URL. */
export async function apiRequest<T>(path: string, options: ApiRequestInit = {}, baseUrl = BASE_URL): Promise<T> {
  try {
    return (await send<T>(path, options, baseUrl)).data;
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const bearer = sentBearer(error);
    // 로그아웃 정리 중(서버 세션 폐기 요청 등)에는 리프레시하지 않는다.
    const recoverable = bearer && getAuthSnapshot().status !== 'signing-out' && !options.signal?.aborted;
    if (recoverable && error.status === 401 && error.code === 'AUTH_TOKEN_EXPIRED') {
      const result = await refreshAccessToken(bearer);
      if (result !== 'refreshed' || options.signal?.aborted) throw error;
      try {
        return (await send<T>(path, options, baseUrl)).data;
      } catch (retryError) {
        // 다시 보낸 요청은 더 재시도하지 않는다. 또 만료면 세션을 끝낸다.
        if (retryError instanceof ApiError) handleAuthFailure(retryError);
        throw retryError;
      }
    }
    handleAuthFailure(error);
    throw error;
  }
}
