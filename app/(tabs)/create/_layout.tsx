import { Stack } from 'expo-router';

/** 제작 탭 안의 화면 쌓기: 목록 → 편집 */
export default function CreateLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
