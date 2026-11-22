// CHAT-US-01 대화방 조회 · CHAT-US-02 메시지 전송·응답
import { ConversationFrame, ConversationLoadState } from '@/features/chat/components/ConversationFrame';
import { ChatRoom } from '@/features/chat/components/room/ChatRoom';
import { isConversationAccessDenied, useConversationSession } from '@/features/chat/hooks/useConversation';

export function ChatSessionScreen({ sessionId, onBack }: { sessionId: string; onBack?: () => void }) {
  const query = useConversationSession(sessionId);
  const accessDenied = isConversationAccessDenied(query.error);
  const session = accessDenied ? undefined : query.data;

  if (session) return <ChatRoom key={session.id} session={session} onBack={onBack} />;
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
