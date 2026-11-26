import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { Colors } from '@/constants/theme';
import { AuthLoadingScreen, useAuthBootstrap, useAuthGate, useSessionQueryClient } from '@/features/auth';

SplashScreen.preventAutoHideAsync();

/**
 * 네비게이션 테마는 라이트로 고정한다. 디자인 시스템에 다크 모드가 아직 없고(constants/theme.ts),
 * 웹 서버 렌더링은 기기의 다크 모드를 알 수 없어 기기 설정을 따르면 hydration 불일치가 난다.
 * 다크 모드를 설계하면 이 고정을 풀고 서버·클라이언트가 같은 값을 쓰도록 바꾼다.
 */
const NAV_THEME: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.light.accent,
    background: Colors.light.background,
    card: Colors.light.background,
    text: Colors.light.text,
    border: Colors.light.border,
  },
};

// 서버 상태 캐시. 저장(mutation)은 실패해도 자동 재시도하지 않고 사용자가 다시 누른다.
const createQueryClient = () => new QueryClient({ defaultOptions: { mutations: { retry: false } } });

export default function RootLayout() {
  // BASE-03: 기기에 남은 로그인 세션을 복원하고, 로그인 상태에 따라 열 수 있는 화면을 나눈다.
  useAuthBootstrap();
  const { gate, sessionKey } = useAuthGate();
  // 로그인 세션마다 새 캐시를 쓴다. 이전 계정의 늦은 응답이 다음 계정 화면에 보이지 않는다.
  const queryClient = useSessionQueryClient(sessionKey, createQueryClient);

  // 로그인 상태 확인이 끝나 첫 화면이 그려지면 시작 화면(스플래시)을 닫는다. 닫지 않으면 실기기에서 스플래시가
  // 계속 남아 조작할 수 없다. 웹에는 스플래시가 없어 실패해도 무시한다.
  useEffect(() => {
    if (gate !== 'loading') SplashScreen.hideAsync().catch(() => {});
  }, [gate]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={NAV_THEME}>
        {gate === 'loading' ? (
          // 보관된 세션 확인 중. 기기에서는 스플래시가 덮고 있고, 확인이 끝나면 요청한 주소의 화면을 연다.
          <AuthLoadingScreen />
        ) : (
          <Stack screenOptions={{ headerShown: false }}>
            {/* 새 최상위 라우트를 추가하면 아래 보호 묶음 중 하나에 넣는다. 넣지 않으면 로그인 없이 열린다. */}
            <Stack.Protected guard={gate === 'active'}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="story/[storyId]" />
              <Stack.Screen name="chat-session/[sessionId]" />
            </Stack.Protected>
            <Stack.Protected guard={gate === 'signed-out'}>
              <Stack.Screen name="login" />
            </Stack.Protected>
            <Stack.Protected guard={gate === 'pending'}>
              <Stack.Screen name="onboarding" />
            </Stack.Protected>
          </Stack>
        )}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
