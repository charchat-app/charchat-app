// CHAT-US-01 대화방 라우트 · CHAT-US-04 접근 불가 시 홈 이동 · CHAT-US-09 새로하기·이어하기 방 전환
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ChatSessionScreen } from '@/features/chat';

export default function SessionRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  return (
    <ChatSessionScreen
      // 방을 바꾸면 이전 방의 화면 상태(입력 중인 글·열린 시트)를 남기지 않고 새로 그린다(CHAT-US-09-AC09).
      key={sessionId}
      sessionId={sessionId}
      onBack={router.canGoBack() ? () => router.back() : undefined}
      // 홈이 스택에 있으면 그곳까지 닫고, 주소로 바로 열어 이전 화면이 없으면 홈으로 바꾼다.
      onHome={() => router.dismissTo('/')}
      // 방 전환은 뒤로 가기 기록을 쌓지 않는다. 뒤로 가면 대화방에 들어오기 전 화면으로 간다.
      onOpenSession={(id) => router.replace({ pathname: '/chat-session/[sessionId]', params: { sessionId: id } })}
    />
  );
}
