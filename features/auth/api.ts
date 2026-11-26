// BASE-03 로그인·내 계정 API. 화면은 fetch를 직접 쓰지 않고 이 파일을 거친다.
import type {
  AuthProvidersResponse,
  ClientPlatform,
  DevTokenRequest,
  MePatch,
  MeResponse,
  PasswordTokenRequest,
  SignupRequest,
  TokenResponse,
} from '@/features/auth/types';
import { apiRequest } from '@/lib/api-client';

/** 로그아웃 때 서버 세션 폐기를 오래 기다리지 않는다(최선 노력). */
const SIGN_OUT_TIMEOUT_MS = 5000;

export const getAuthProviders = (signal?: AbortSignal) =>
  apiRequest<AuthProvidersResponse>('/auth/providers', { signal });

/** 개발용 로그인(서버 AUTH_DEV_LOGIN_ENABLED일 때만). 로그인 키는 서버의 dev 제공자 사용자 식별값이다. */
export const createDevTokens = (devUserKey: string, clientPlatform: ClientPlatform) =>
  apiRequest<TokenResponse>('/auth/tokens', {
    method: 'POST',
    body: JSON.stringify({
      grant_type: 'dev',
      dev_user_key: devUserKey,
      client_platform: clientPlatform,
    } satisfies DevTokenRequest),
  });

/** 이메일·비밀번호 회원가입. 응답은 로그인과 같은 TokenResponse다. */
export const signUp = (request: SignupRequest) =>
  apiRequest<TokenResponse>('/auth/signup', { method: 'POST', body: JSON.stringify(request) });

/** 이메일·비밀번호 로그인. */
export const signInWithPassword = ({ email, password, client_platform }: Omit<PasswordTokenRequest, 'grant_type'>) =>
  apiRequest<TokenResponse>('/auth/tokens', {
    method: 'POST',
    body: JSON.stringify({ grant_type: 'password', email, password, client_platform } satisfies PasswordTokenRequest),
  });

export const deleteCurrentSession = () =>
  apiRequest<void>('/auth/sessions/current', { method: 'DELETE', timeoutMs: SIGN_OUT_TIMEOUT_MS });

export const getMe = (signal?: AbortSignal) => apiRequest<MeResponse>('/me', { signal });

export const updateMe = (patch: MePatch) =>
  apiRequest<MeResponse>('/me', { method: 'PATCH', body: JSON.stringify(patch) });
