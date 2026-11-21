// CHAT-US-01 스토리 상세 라우트
import { useLocalSearchParams, useRouter } from 'expo-router';

import { StoryDetailScreen } from '@/features/chat';

export default function StoryRoute() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  const router = useRouter();
  return (
    <StoryDetailScreen
      key={storyId}
      storyId={storyId}
      onBack={router.canGoBack() ? () => router.back() : undefined}
      onOpenSession={(id) => router.push({ pathname: '/chat-session/[sessionId]', params: { sessionId: String(id) } })}
    />
  );
}
