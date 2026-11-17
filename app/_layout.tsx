import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';

import { Colors } from '@/constants/theme';

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

export default function RootLayout() {
  // 서버 상태 캐시. 저장(mutation)은 실패해도 자동 재시도하지 않고 사용자가 다시 누른다.
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { mutations: { retry: false } } }));

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={NAV_THEME}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
