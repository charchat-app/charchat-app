// CHAT-US-01 대화방 조회 · CHAT-US-02 메시지 전송·응답 · CHAT-US-04 접근 불가 안내
import { ConversationAccessDenied } from '@/features/chat/components/ConversationAccessDenied';
import { ConversationFrame, ConversationLoadState } from '@/features/chat/components/ConversationFrame';
import { ChatRoom } from '@/features/chat/components/room/ChatRoom';
import {
  isConversationAccessDenied,
  isConversationForbidden,
  useConversationSession,
} from '@/features/chat/hooks/useConversation';

export function ChatSessionScreen({
  sessionId,
  onBack,
  onHome,
}: {
  sessionId: string;
  onBack?: () => void;
  onHome: () => void;
}) {
  const query = useConversationSession(sessionId);
  const accessDenied = isConversationAccessDenied(query.error);
  const session = accessDenied ? undefined : query.data;

  if (session) return <ChatRoom key={session.id} session={session} onBack={onBack} />;
  // CHAT-US-04-AC04: 서버가 내 대화방이 아니라고 거절하면(남의 방이거나 없는 방) 공통 안내와 홈 이동을 보인다.
  // 로그인 만료(401)는 로그인 처리에서 다루므로 같은 안내로 묶지 않는다.
  if (isConversationForbidden(query.error)) {
    return <ConversationAccessDenied title="대화방" onBack={onBack} onHome={onHome} />;
  }
  return (
    <ConversationFrame title="대화방" onBack={onBack}>
      <ConversationLoadState
        loading={query.isFetching || query.isPending}
        loadingMessage="대화방을 불러오는 중…"
        errorMessage="대화방을 불러오지 못했습니다."
        onRetry={accessDenied ? undefined : () => void query.refetch()}
      />
    </ConversationFrame>
  );
}
