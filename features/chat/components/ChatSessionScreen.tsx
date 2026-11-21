// CHAT-US-01 대화방 조회
import { Badge, Section, Text } from '@/components/ui';
import { ConversationBubbles } from '@/features/chat/components/ConversationBubbles';
import { ConversationFrame, ConversationLoadState } from '@/features/chat/components/ConversationFrame';
import { isConversationAccessDenied, useConversationSession } from '@/features/chat/hooks/useConversation';

export function ChatSessionScreen({ sessionId, onBack }: { sessionId: string; onBack?: () => void }) {
  const query = useConversationSession(sessionId);
  const accessDenied = isConversationAccessDenied(query.error);
  const session = accessDenied ? undefined : query.data;

  return (
    <ConversationFrame title="대화방" onBack={onBack}>
      {session ? (
        <>
          <Text variant="heading" accessibilityRole="header">
            {session.story_title}
          </Text>
          {session.read_only ? <Badge label="읽기 전용" /> : null}
          {session.model !== null ? <Text variant="caption">적용 모델: {session.model}</Text> : null}
          {session.characters.length ? (
            <Section title="등장 캐릭터" first>
              {session.characters.map(({ id, name }) => (
                <Text key={id}>{name}</Text>
              ))}
            </Section>
          ) : null}
          {session.messages.length ? (
            <ConversationBubbles messages={session.messages} />
          ) : (
            <Text variant="caption">표시할 대화가 없습니다.</Text>
          )}
        </>
      ) : (
        <ConversationLoadState
          loading={query.isFetching || query.isPending}
          loadingMessage="대화방을 불러오는 중…"
          errorMessage="대화방을 불러오지 못했습니다."
          onRetry={accessDenied ? undefined : () => void query.refetch()}
        />
      )}
    </ConversationFrame>
  );
}
