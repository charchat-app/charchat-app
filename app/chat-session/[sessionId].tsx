// CHAT-US-01 대화방 라우트 · CHAT-US-04 접근 불가 시 홈 이동
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ChatSessionScreen } from '@/features/chat';

export default function SessionRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  return (
    <ChatSessionScreen
      sessionId={sessionId}
      onBack={router.canGoBack() ? () => router.back() : undefined}
      // 홈이 스택에 있으면 그곳까지 닫고, 주소로 바로 열어 이전 화면이 없으면 홈으로 바꾼다.
      onHome={() => router.dismissTo('/')}
    />
  );
}
