// BASE-03 로그인 세션의 동기 스냅샷. api-client의 인증 헤더, 라우트 보호, 기기 보관 키가 같은 값을 읽는다.
// 액세스 토큰은 메모리에만 두고, 리프레시 토큰과 계정 번호는 lib/authStorage(네이티브 SecureStore, 웹 sessionStorage)에 둔다.
import { clearStoredAuth, saveStoredAuth } from '@/lib/authStorage';

/**
 * loading: 시작 시 보관된 세션 확인 중 / signed-out: 로그인 전·로그아웃·만료 /
 * signing-out: 로그아웃 정리 중(기기 보관 쓰기 중단) / pending: 온보딩 전 / active: 이용 가능
 */
export type AuthStatus = 'loading' | 'signed-out' | 'signing-out' | 'pending' | 'active';

export type AuthSnapshot = Readonly<{
  status: AuthStatus;
  userId: string | null;
  accessToken: string | null;
  /** 로그인 세션 번호. 로그인·로그아웃·만료 때 바뀌며, 바뀌면 서버 상태 캐시(QueryClient)를 새로 만든다. */
  sessionKey: number;
  /** 로그인 화면에 보일 안내. 예: 세션 만료 후 '다시 로그인해 주세요' */
  notice: string | null;
  /**
   * 서버가 개발용 헤더(X-User-Id)를 거절했다. 이번 실행 동안 개발용 헤더 모드를 쓰지 않는다.
   * 라우트 보호가 이 값을 스냅샷에서 읽어야 화면이 바뀐다(React Compiler는 스냅샷 밖 값의 변화를 모른다).
   */
  devHeaderRejected: boolean;
}>;

/** 토큰 응답에서 세션에 필요한 값만 뽑은 것 */
export type SessionGrant = { accessToken: string; refreshToken: string; userId: string; onboardingRequired: boolean };

export const SESSION_EXPIRED_NOTICE = '다시 로그인해 주세요';

const INITIAL: AuthSnapshot = {
  status: 'loading',
  userId: null,
  accessToken: null,
  sessionKey: 0,
  notice: null,
  devHeaderRejected: false,
};

let snapshot: AuthSnapshot = INITIAL;
// 개발용 헤더 거절 여부. 로그인·로그아웃으로 스냅샷을 새로 만들어도 이번 실행 동안 유지한다.
let devHeaderRejected = false;
let refreshToken: string | null = null;
const listeners = new Set<() => void>();
// 보관·삭제를 시작한 순서대로 실행해 늦게 끝난 보관이 로그아웃 삭제를 되살리지 않게 한다.
let storageQueue: Promise<void> = Promise.resolve();

function persist(run: () => Promise<void>): Promise<void> {
  storageQueue = storageQueue.then(run, run);
  return storageQueue;
}

function publish(next: Omit<AuthSnapshot, 'devHeaderRejected'>) {
  snapshot = { ...next, devHeaderRejected };
  listeners.forEach((listener) => listener());
}

export function getAuthSnapshot(): AuthSnapshot {
  return snapshot;
}

/** 서버 렌더링에서는 항상 확인 중으로 그린다(브라우저 저장소를 읽을 수 없다). */
export function getServerAuthSnapshot(): AuthSnapshot {
  return INITIAL;
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

/** 시작할 때 기기에 남은 리프레시 토큰을 메모리로 올린다. 리프레시가 성공하기 전에는 상태를 바꾸지 않는다. */
export function seedRefreshToken(token: string) {
  refreshToken = token;
}

function isSignedIn(value: AuthSnapshot) {
  return value.accessToken !== null && (value.status === 'active' || value.status === 'pending');
}

/** 로그인·리프레시 성공. 같은 계정의 토큰 회전이면 세션 번호를 유지하고, 새 로그인이면 바꾼다. */
export function applyGrant(grant: SessionGrant): void {
  const sameSession = isSignedIn(snapshot) && snapshot.userId === grant.userId;
  refreshToken = grant.refreshToken;
  publish({
    status: grant.onboardingRequired ? 'pending' : 'active',
    userId: grant.userId,
    accessToken: grant.accessToken,
    sessionKey: sameSession ? snapshot.sessionKey : snapshot.sessionKey + 1,
    notice: null,
  });
  void persist(() => saveStoredAuth({ refreshToken: grant.refreshToken, userId: grant.userId }));
}

/** 온보딩 완료(PATCH /me) 또는 서버의 403 ONBOARDING_REQUIRED를 반영한다. 로그인 중일 때만 바꾼다. */
export function setOnboardingRequired(required: boolean): void {
  if (!isSignedIn(snapshot)) return;
  const status: AuthStatus = required ? 'pending' : 'active';
  if (snapshot.status !== status) publish({ ...snapshot, status });
}

/**
 * 로그아웃 1단계: 즉시 signing-out으로 바꿔 대화 초안 등 기기 보관 쓰기를 멈춘다.
 * 서버 세션 폐기(DELETE /auth/sessions/current)에 쓰도록 액세스 토큰은 끝날 때까지 남긴다.
 * 로그인 중이 아니면 null.
 */
export function beginSignOut(): { userId: string | null } | null {
  if (!isSignedIn(snapshot)) return null;
  const { userId } = snapshot;
  publish({ ...snapshot, status: 'signing-out' });
  return { userId };
}

/**
 * 로그아웃·만료 마무리: 메모리 토큰을 버리고 로그인 화면으로 보낸다. 세션 번호를 바꿔 이전 계정 캐시를 버린다.
 * `keepStoredAuth`는 시작 시 서버에 닿지 못했을 때만 쓴다(다음 실행에서 다시 확인).
 */
export function finishSignOut(options: { notice?: string | null; keepStoredAuth?: boolean } = {}): Promise<void> {
  if (!options.keepStoredAuth) refreshToken = null;
  publish({
    status: 'signed-out',
    userId: null,
    accessToken: null,
    sessionKey: snapshot.sessionKey + 1,
    notice: options.notice ?? null,
  });
  return options.keepStoredAuth ? storageQueue : persist(clearStoredAuth);
}

/**
 * 비자발적 종료(리프레시 실패, AUTH_TOKEN_INVALID, UNAUTHENTICATED). '다시 로그인해 주세요'를 보인다.
 * 기기의 대화 초안은 지우지 않는다. 같은 계정으로 다시 로그인하면 이어서 쓴다.
 */
export function expireSession(): void {
  if (snapshot.status === 'signed-out' || snapshot.status === 'signing-out') return;
  void finishSignOut({ notice: SESSION_EXPIRED_NOTICE });
}

/**
 * 서버가 개발용 헤더를 거절했다(401 UNAUTHENTICATED). 이번 실행 동안 헤더 모드를 끄고,
 * 로그인 세션이 없으면 안내와 함께 로그인 화면으로 보낸다(세션 번호가 바뀌어 이전 사용자 번호의 캐시도 버린다).
 */
export function markDevHeaderRejected(notice: string): void {
  if (devHeaderRejected) return;
  devHeaderRejected = true;
  if (snapshot.status === 'signed-out') void finishSignOut({ notice, keepStoredAuth: true });
  else publish(snapshot);
}

/** 로그인 화면의 안내를 지운다(입력을 다시 시작할 때). */
export function clearAuthNotice(): void {
  if (snapshot.notice !== null) publish({ ...snapshot, notice: null });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** POST /auth/tokens 응답(TokenResponse)에서 세션 값을 읽는다. 형식이 다르면 null. */
export function grantFromTokenResponse(body: unknown): SessionGrant | null {
  if (!isRecord(body) || !isRecord(body.user)) return null;
  const { access_token: accessToken, refresh_token: token, user } = body;
  const userId =
    typeof user.user_id === 'number' && Number.isSafeInteger(user.user_id) && user.user_id > 0
      ? String(user.user_id)
      : typeof user.user_id === 'string' && /^[1-9][0-9]*$/.test(user.user_id)
        ? user.user_id
        : null;
  if (typeof accessToken !== 'string' || accessToken === '') return null;
  if (typeof token !== 'string' || token === '' || userId === null) return null;
  return { accessToken, refreshToken: token, userId, onboardingRequired: user.onboarding_required === true };
}

/** 테스트·개발 재시작용: 메모리 상태를 처음으로 되돌린다(기기 보관분은 건드리지 않는다). */
export function resetAuthSession(): void {
  refreshToken = null;
  storageQueue = Promise.resolve();
  devHeaderRejected = false;
  publish(INITIAL);
}
