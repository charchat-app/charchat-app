// CHAT-US-01 대화방 조회
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { Badge, Section, Text } from '@/components/ui';
import { ChatComposer } from '@/features/chat/components/ChatComposer';
import { ConversationBubbles } from '@/features/chat/components/ConversationBubbles';
import { ConversationFrame, ConversationLoadState } from '@/features/chat/components/ConversationFrame';
import { getConversationOwnerId, positiveConversationId } from '@/features/chat/conversationIdentity';
import { cancelPendingDraft, chatDraftKey } from '@/features/chat/draftPersistence';
import { getDraftStorage } from '@/features/chat/draftStorage';
import {
  conversationSessionKey,
  isConversationAccessDenied,
  useConversationSession,
} from '@/features/chat/hooks/useConversation';
import type { ConversationSession } from '@/shared/story-types';

function canCompose(session: ConversationSession | null | undefined, sessionId: string) {
  return session?.read_only === false && positiveConversationId(sessionId) !== null && String(session.id) === sessionId;
}

export function ChatSessionScreen({ sessionId, onBack }: { sessionId: string; onBack?: () => void }) {
  const ownerId = getConversationOwnerId();
  const draftKey = chatDraftKey(ownerId, sessionId);
  const previousDraftKey = useRef(draftKey);
  useLayoutEffect(() => {
    const previous = previousDraftKey.current;
    previousDraftKey.current = draftKey;
    // 같은 화면에서 범위가 바뀌면 취소한다. 일반적인 화면 이탈은 500ms 저장을 유지한다.
    if (previous !== null && previous !== draftKey) {
      const storage = getDraftStorage();
      if (storage) cancelPendingDraft(storage, previous);
    }
  }, [draftKey]);

  return (
    <ScopedChatSession
      key={JSON.stringify([ownerId, sessionId])}
      ownerId={ownerId}
      sessionId={sessionId}
      draftKey={draftKey}
      onBack={onBack}
    />
  );
}

function ScopedChatSession({
  ownerId,
  sessionId,
  draftKey,
  onBack,
}: {
  ownerId: string | null;
  sessionId: string;
  draftKey: string | null;
  onBack?: () => void;
}) {
  const client = useQueryClient();
  const query = useConversationSession(sessionId, ownerId);
  const accessDenied = isConversationAccessDenied(query.error);
  const session = accessDenied ? undefined : query.data;
  const [authorized, setAuthorized] = useState(false);
  // 새 범위에서는 캐시만으로 열지 않는다. 확인된 범위의 일시적 오류는 입력을 언마운트하지 않는다.
  const showComposer = canCompose(session, sessionId) && (authorized || (query.isFetchedAfterMount && query.isSuccess));
  if (showComposer !== authorized) setAuthorized(showComposer);
  const canPersist = useCallback(() => {
    if (ownerId === null || ownerId !== getConversationOwnerId()) return false;
    const cached = client.getQueryState<ConversationSession | null>(conversationSessionKey(sessionId, ownerId));
    return !isConversationAccessDenied(cached?.error) && canCompose(cached?.data, sessionId);
  }, [client, ownerId, sessionId]);

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
          {showComposer ? <ChatComposer draftKey={draftKey} canPersist={canPersist} /> : null}
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
