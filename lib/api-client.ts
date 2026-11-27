/**
 * 서버 호출의 공통 래퍼. 인증 헤더와 에러 형식을 한 곳에서 다룬다.
 * 기본 주소는 EXPO_PUBLIC_API_URL에서 읽는다. 값이 없으면 호출하지 않는다.
 *
 * 인증(BASE-03): 로그인하면 `Authorization: Bearer <액세스 토큰>`을 붙인다(lib/authSession).
 * 로그인하지 않았을 때는 개발용 헤더 모드에서만 `X-User-Id`(EXPO_PUBLIC_DEV_USER_ID)를 붙인다.
 * 개발용 헤더 모드는 EXPO_PUBLIC_DEV_AUTH=header로 직접 켤 때만 쓴다. EXPO_PUBLIC_DEV_USER_ID만 있으면
 * 쓰지 않고 로그인 화면으로 시작한다(앱·서버 설정이 어긋나 로그인 화면 없이 막히지 않게).
 * 헤더 모드에서 서버가 401 UNAUTHENTICATED로 거절하면(서버 AUTH_DEV_HEADER_ENABLED가 꺼짐)
 * 이번 실행 동안 헤더 모드를 끄고 안내와 함께 로그인 화면으로 보낸다.
 *
 * 요청 취소(signal)와 시간 제한을 지원한다. 시간 제한은 기본 15초이고, 이미지 업로드처럼 오래 걸리는 호출은
 * `timeoutMs`로 호출별로 바꾼다. 실패해도 자동으로 다시 호출하지 않는다.
 * 예외(BASE-03): 401 AUTH_TOKEN_EXPIRED는 리프레시를 한 번(같은 로그인 세션의 동시 요청은 하나를 공유) 한 뒤
 * 원 요청을 1회만 다시 보낸다. 다시 보내기 직전에 로그인 세션(sessionKey)이 처음 보낼 때와 같은지 확인하고,
 * 로그아웃·계정 전환으로 바뀌었으면 다시 보내지 않고 원래 오류로 끝낸다(이전 계정 요청이 새 토큰으로 나가지 않게).
 * 401 AUTH_TOKEN_INVALID는 다시 보내지 않고 로그아웃 처리한다(서버 계약: 회전은 이전 JWT를 무효화하지 않는다).
 * 인증 실패는 서버 핸들러 실행 전에 나므로 메시지 전송 같은 POST도 다시 보내도 부작용이 없다.
 */

import {
  expireSession,
  getAuthSnapshot,
  getRefreshToken,
  grantFromTokenResponse,
  markDevHeaderRejected,
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

/** 서버가 개발용 사용자 번호(X-User-Id)를 받지 않아 로그인 화면으로 보낼 때의 안내 */
export const DEV_HEADER_REJECTED_NOTICE = '서버가 개발용 사용자 번호를 받지 않아요. 로그인해 주세요.';

/**
 * 개발용 헤더 모드의 사용자 번호. 모드가 꺼져 있으면 null.
 * EXPO_PUBLIC_DEV_AUTH=header이고 DEV_USER_ID가 있을 때만 켠다. 비어 있거나 token(그 밖의 값)이면 끈다.
 * 서버가 헤더를 거절한 뒤에도 끈다.
 */
export function devHeaderUserId(): string | null {
  if (!DEV_USER_ID || DEV_AUTH !== 'header' || getAuthSnapshot().devHeaderRejected) return null;
  return DEV_USER_ID;
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

/** 실패한 요청을 보낼 때의 세션 액세스 토큰과 로그인 세션 번호 */
type SentAuth = { bearer: string; sessionKey: number };

const sentAuth = new WeakMap<ApiError, SentAuth>();

/**
 * 한 번 보낸다. `bearer`는 실제로 붙인 세션 액세스 토큰(호출 측이 Authorization을 바꿨으면 null).
 * `expectedSessionKey`를 넘기면 헤더를 만들기 직전에 현재 로그인 세션이 같은지 확인하고, 다르면 보내지 않는다.
 */
async function send<T>(
  path: string,
  options: ApiRequestInit,
  baseUrl: string,
  withAuth = true,
  expectedSessionKey?: number,
): Promise<SendResult<T>> {
  if (!baseUrl) {
    throw new ApiError(0, 'API_URL_MISSING', 'EXPO_PUBLIC_API_URL이 설정되지 않았습니다.');
  }

  const { timeoutMs, ...init } = options;
  const limit =
    typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
  const { accessToken, sessionKey } = getAuthSnapshot();
  if (expectedSessionKey !== undefined && sessionKey !== expectedSessionKey) throw new SessionChangedError();
  const auth = withAuth ? authHeaders() : {};
  const headers = mergeHeaders(init.headers, !(typeof FormData !== 'undefined' && init.body instanceof FormData), auth);
  const bearer = accessToken && headers.Authorization === `Bearer ${accessToken}` ? accessToken : null;
  // 개발용 헤더만으로 보낸 요청인지(호출 측이 X-User-Id·Authorization을 바꾸지 않았는지)
  const devHeaderOnly =
    auth['X-User-Id'] !== undefined &&
    headers['X-User-Id'] === auth['X-User-Id'] &&
    !Object.keys(headers).some((key) => key.toLowerCase() === 'authorization');

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
      if (bearer) sentAuth.set(error, { bearer, sessionKey });
      if (devHeaderOnly && error.status === 401 && error.code === 'UNAUTHENTICATED')
        markDevHeaderRejected(DEV_HEADER_REJECTED_NOTICE);
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

/** 다시 보내기 직전에 로그인 세션이 바뀐 것을 알린다. apiRequest 밖으로 나가지 않는다. */
class SessionChangedError extends Error {}

/** 실패 응답이 어느 세션 토큰·로그인 세션으로 보낸 요청인지. 토큰이 에러 객체·로그에 드러나지 않게 따로 둔다. */
function sentWith(error: ApiError): SentAuth | null {
  return sentAuth.get(error) ?? null;
}

/**
 * 리프레시 결과. unavailable(네트워크·서버 오류)이면 세션을 유지하고 원 요청의 실패만 알린다.
 * session-changed: 기다리는 사이 로그아웃·다른 계정 로그인으로 세션이 바뀌었다(새 세션은 건드리지 않는다).
 */
export type RefreshResult = 'refreshed' | 'invalid' | 'unavailable' | 'session-changed';

/** 로그인 세션(sessionKey)별 진행 중 리프레시. 다른 세션의 리프레시 결과는 공유하지 않는다. */
const refreshing = new Map<number, Promise<RefreshResult>>();

async function runRefresh(sessionKey: number): Promise<RefreshResult> {
  const token = getRefreshToken();
  if (!token) return 'invalid';
  try {
    const { data } = await send<unknown>(
      '/auth/tokens',
      { method: 'POST', body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: token }) },
      BASE_URL,
      false,
    );
    // 기다리는 사이 로그아웃·다른 로그인이 있었으면 결과를 버린다.
    if (getAuthSnapshot().sessionKey !== sessionKey || getAuthSnapshot().status === 'signing-out') {
      return 'session-changed';
    }
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
    if (getAuthSnapshot().sessionKey !== sessionKey) return 'session-changed';
    expireSession();
    return 'invalid';
  }
}

/**
 * 로그인 세션별 단일 비행 리프레시. 같은 세션(sessionKey)의 동시 호출만 진행 중인 하나의 Promise를 공유한다.
 * `sessionKey`는 원 요청을 보낼 때의 세션 번호다(기본: 현재 세션). 지금 세션과 다르면 리프레시하지 않는다.
 * `staleToken`을 넘기면, 같은 세션 안에서 그 토큰이 이미 다른 리프레시로 바뀐 뒤에는 다시 리프레시하지 않는다.
 * 실패(invalid)하면 세션을 만료 처리해 로그인 화면으로 보낸다.
 * 이미지 미리보기처럼 apiRequest를 거치지 않는 요청도 이 함수로 연장할 수 있다(BASE-03 리뷰: 공통 갱신 함수).
 */
export function refreshAccessToken(
  staleToken?: string,
  sessionKey: number = getAuthSnapshot().sessionKey,
): Promise<RefreshResult> {
  const current = getAuthSnapshot();
  if (current.sessionKey !== sessionKey) return Promise.resolve('session-changed');
  const inFlight = refreshing.get(sessionKey);
  if (inFlight) return inFlight;
  if (staleToken && current.accessToken && current.accessToken !== staleToken) return Promise.resolve('refreshed');
  const run = runRefresh(sessionKey).finally(() => {
    if (refreshing.get(sessionKey) === run) refreshing.delete(sessionKey);
  });
  refreshing.set(sessionKey, run);
  return run;
}

/** 인증 실패가 아직 같은 세션에서 난 것이면 로그인·온보딩 화면으로 보낸다. */
function handleAuthFailure(error: ApiError) {
  const sent = sentWith(error);
  const now = getAuthSnapshot();
  if (!sent || now.sessionKey !== sent.sessionKey || now.accessToken !== sent.bearer) return;
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
    const sent = sentWith(error);
    // 로그아웃 정리 중(서버 세션 폐기 요청 등)에는 리프레시하지 않는다.
    const recoverable = sent && getAuthSnapshot().status !== 'signing-out' && !options.signal?.aborted;
    // 만료(AUTH_TOKEN_EXPIRED)만 연장한다. AUTH_TOKEN_INVALID 등은 다시 보내지 않는다.
    if (recoverable && error.status === 401 && error.code === 'AUTH_TOKEN_EXPIRED') {
      const result = await refreshAccessToken(sent.bearer, sent.sessionKey);
      if (result !== 'refreshed' || options.signal?.aborted) throw error;
      try {
        // 토큰 값이 바뀐 것만으로 판단하지 않는다. 처음 보낸 로그인 세션 그대로일 때만 다시 보낸다.
        return (await send<T>(path, options, baseUrl, true, sent.sessionKey)).data;
      } catch (retryError) {
        if (retryError instanceof SessionChangedError) throw error;
        // 다시 보낸 요청은 더 재시도하지 않는다. 또 만료면 세션을 끝낸다.
        if (retryError instanceof ApiError) handleAuthFailure(retryError);
        throw retryError;
      }
    }
    handleAuthFailure(error);
    throw error;
  }
}
