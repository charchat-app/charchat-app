// BASE-03 로그인 상태 구독·라우트 보호 상태·로그인/온보딩/로그아웃 훅
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { getAuthProviders, getMe } from '@/features/auth/api';
import {
  completeOnboarding,
  restoreSession,
  signInWithDevKey,
  signInWithEmail,
  signOut,
  signUpWithEmail,
} from '@/features/auth/session';
import type { AuthProvidersResponse, EmailCredentials, MePatch } from '@/features/auth/types';
import { devHeaderUserId } from '@/lib/api-client';
import { getAuthSnapshot, getServerAuthSnapshot, subscribeAuth, type AuthSnapshot } from '@/lib/authSession';

/** 라우트 보호 기준. loading이면 시작 화면(스플래시)을 유지한다. */
export type AuthGate = 'loading' | 'signed-out' | 'pending' | 'active';

export const authQueryKeys = {
  providers: ['auth', 'providers'] as const,
  me: ['auth', 'me'] as const,
};

export function useAuthSnapshot(): AuthSnapshot {
  return useSyncExternalStore(subscribeAuth, getAuthSnapshot, getServerAuthSnapshot);
}

/**
 * 라우트 보호 상태. 로그아웃 정리 중은 이미 로그인 화면으로 보낸다.
 * 개발용 헤더 모드(EXPO_PUBLIC_DEV_AUTH=header + EXPO_PUBLIC_DEV_USER_ID)에서
 * 로그인 세션이 없으면 기존처럼 X-User-Id 사용자로 바로 이용한다. 서버가 헤더를 거절하면 로그인 화면으로 바뀐다.
 */
export function useAuthGate(): { gate: AuthGate; sessionKey: number; notice: string | null; signedIn: boolean } {
  const snapshot = useAuthSnapshot();
  const signedIn = snapshot.accessToken !== null && (snapshot.status === 'active' || snapshot.status === 'pending');
  const gate: AuthGate =
    snapshot.status === 'signing-out'
      ? 'signed-out'
      : snapshot.status === 'signed-out' && !snapshot.devHeaderRejected && devHeaderUserId()
        ? 'active'
        : snapshot.status;
  return { gate, sessionKey: snapshot.sessionKey, notice: snapshot.notice, signedIn };
}

/** 루트에서 한 번: 기기에 남은 세션을 복원한다. */
export function useAuthBootstrap() {
  useEffect(() => {
    void restoreSession();
  }, []);
}

export function useAuthProviders() {
  return useQuery({
    queryKey: authQueryKeys.providers,
    queryFn: ({ signal }) => getAuthProviders(signal),
    retry: false,
  });
}

/** 서버가 이메일·비밀번호 가입·로그인을 열어 두었는지(AUTH_PASSWORD_LOGIN_ENABLED). */
export function offersEmailPassword(data: AuthProvidersResponse | undefined): boolean {
  return data?.providers.some((item) => item.provider === 'email' && item.flows.includes('password')) ?? false;
}

export function useMe() {
  return useQuery({ queryKey: authQueryKeys.me, queryFn: ({ signal }) => getMe(signal), retry: false });
}

export function useDevLogin() {
  return useMutation({ mutationFn: (devUserKey: string) => signInWithDevKey(devUserKey) });
}

export function useEmailLogin() {
  return useMutation({ mutationFn: (credentials: EmailCredentials) => signInWithEmail(credentials) });
}

export function useEmailSignup() {
  return useMutation({ mutationFn: (credentials: EmailCredentials) => signUpWithEmail(credentials) });
}

export function useCompleteOnboarding() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: MePatch) => completeOnboarding(patch),
    onSuccess: (me) => client.setQueryData(authQueryKeys.me, me),
  });
}

/** 사용자가 직접 로그아웃한다. 진행 중인 서버 조회를 취소하고, 이 계정의 기기 대화 초안을 지운다. */
export function useSignOut() {
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const run = useCallback(
    async (notice?: string) => {
      setPending(true);
      try {
        await signOut({ notice, onSigningOut: () => void client.cancelQueries() });
      } finally {
        setPending(false);
      }
    },
    [client],
  );
  return { signOut: run, pending };
}
