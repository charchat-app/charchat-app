// CHAT-US-01 대화방 라우트
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ChatSessionScreen } from '@/features/chat';

export default function SessionRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  return <ChatSessionScreen sessionId={sessionId} onBack={router.canGoBack() ? () => router.back() : undefined} />;
}
