import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

/** 제작 탭 안의 화면 쌓기: 목록 → 편집. 화면 전환 중 비는 배경도 다크 테마 색으로 칠한다(CREATE-US-12). */
export default function CreateLayout() {
  const c = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }} />;
}
