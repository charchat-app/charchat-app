// BASE-03 로그인 세션 흐름: 시작 시 복원, 이메일 회원가입·로그인, 개발용 로그인, 온보딩 완료, 로그아웃
import { Platform } from 'react-native';

import { createDevTokens, deleteCurrentSession, signInWithPassword, signUp, updateMe } from '@/features/auth/api';
import type { ClientPlatform, EmailCredentials, MePatch, MeResponse, TokenResponse } from '@/features/auth/types';
import { clearChatDeviceData } from '@/features/chat';
import { ApiError, refreshAccessToken } from '@/lib/api-client';
import {
  applyGrant,
  beginSignOut,
  finishSignOut,
  getAuthSnapshot,
  grantFromTokenResponse,
  seedRefreshToken,
  setOnboardingRequired,
} from '@/lib/authSession';
import { loadStoredAuth } from '@/lib/authStorage';

export const SERVER_UNAVAILABLE_NOTICE = '서버에 연결하지 못했습니다. 잠시 후 앱을 다시 열어 주세요.';
export const UNDERAGE_NOTICE = '만 14세 미만은 가입할 수 없어요.';

export function clientPlatform(): ClientPlatform {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
}

let restoring: Promise<void> | null = null;

/**
 * 앱 시작 시 한 번: 기기에 남은 리프레시 토큰이 있으면 새 토큰을 받아 이어서 로그인한다.
 * 토큰이 없거나 거절되면 로그인 화면으로 간다. 서버에 닿지 못하면 보관값은 남기고 안내만 한다.
 */
export function restoreSession(): Promise<void> {
  if (getAuthSnapshot().status !== 'loading') return Promise.resolve();
  if (!restoring) {
    const run = (async () => {
      const stored = await loadStoredAuth();
      if (getAuthSnapshot().status !== 'loading') return;
      if (!stored) {
        await finishSignOut();
        return;
      }
      seedRefreshToken(stored.refreshToken);
      const result = await refreshAccessToken();
      // invalid는 refreshAccessToken이 이미 '다시 로그인해 주세요'로 끝냈다.
      if (result === 'unavailable' && getAuthSnapshot().status === 'loading') {
        await finishSignOut({ notice: SERVER_UNAVAILABLE_NOTICE, keepStoredAuth: true });
      }
    })().finally(() => {
      if (restoring === run) restoring = null;
    });
    restoring = run;
  }
  return restoring;
}

/** 로그인·가입 응답(TokenResponse)으로 세션을 시작한다. 액세스 토큰은 형식을 보지 않는 문자열로만 다룬다. */
function startSession(tokens: TokenResponse): MeResponse {
  const grant = grantFromTokenResponse(tokens);
  if (!grant) throw new ApiError(0, 'AUTH_RESPONSE_INVALID', '로그인 응답을 확인하지 못했습니다. 다시 시도해 주세요.');
  applyGrant(grant);
  return tokens.user;
}

/** 이메일 앞뒤 공백만 지운다. 소문자 변환과 형식 검사는 서버가 한다. 비밀번호는 그대로 보낸다(앞뒤 공백 허용). */
const emailRequest = ({ email, password }: EmailCredentials) => ({
  email: email.trim(),
  password,
  client_platform: clientPlatform(),
});

/** 이메일·비밀번호로 가입한다. 새 계정은 온보딩 전(pending)이라 가입 마무리 화면으로 이어진다. */
export async function signUpWithEmail(credentials: EmailCredentials): Promise<MeResponse> {
  return startSession(await signUp(emailRequest(credentials)));
}

/** 이메일·비밀번호로 로그인한다. */
export async function signInWithEmail(credentials: EmailCredentials): Promise<MeResponse> {
  return startSession(await signInWithPassword(emailRequest(credentials)));
}

/** 개발용 로그인 키로 로그인한다(EXPO_PUBLIC_DEV_LOGIN=1 + 서버 AUTH_DEV_LOGIN_ENABLED). */
export async function signInWithDevKey(devUserKey: string): Promise<MeResponse> {
  return startSession(await createDevTokens(devUserKey.trim(), clientPlatform()));
}

/** 필수 동의·기본 플레이 이름을 보내고, 서버가 온보딩 완료로 답하면 이용 가능 상태로 바꾼다. */
export async function completeOnboarding(patch: MePatch): Promise<MeResponse> {
  const me = await updateMe(patch);
  setOnboardingRequired(me.onboarding_required);
  return me;
}

/**
 * 사용자가 직접 로그아웃한다.
 * 1) 즉시 signing-out(기기 보관 쓰기 중단) 2) `onSigningOut`(진행 중 조회 취소) 3) 서버 세션 폐기(최선 노력)
 * 4) 이 계정의 기기 대화 초안·전송 기록 삭제 5) 토큰 보관값 삭제 후 로그인 화면(세션 캐시 교체).
 * 세션 만료(비자발적 종료)는 이 함수를 거치지 않아 기기 초안이 남는다.
 */
export async function signOut(options: { notice?: string | null; onSigningOut?: () => void } = {}): Promise<void> {
  const started = beginSignOut();
  if (!started) {
    if (getAuthSnapshot().status !== 'signing-out') await finishSignOut({ notice: options.notice });
    return;
  }
  options.onSigningOut?.();
  try {
    await deleteCurrentSession();
  } catch {
    // 서버에 닿지 못해도 기기에서는 로그아웃한다. 서버 세션은 만료로 끝난다.
  }
  await clearChatDeviceData(started.userId);
  await finishSignOut({ notice: options.notice });
}
