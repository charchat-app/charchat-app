// CHAT-US-03 내 대화 목록
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { Button, Notice, Text } from '@/components/ui';
import { ConversationFrame, ConversationLoadState } from '@/features/chat/components/ConversationFrame';
import { getConversationOwnerId, positiveConversationId } from '@/features/chat/conversationIdentity';
import { isConversationAccessDenied, useConversationSessions } from '@/features/chat/hooks/useConversation';

export function ChatListScreen() {
  const router = useRouter();
  const ownerId = getConversationOwnerId();
  const query = useConversationSessions(ownerId);
  const { refetch } = query;
  const accessDenied = isConversationAccessDenied(query.error);
  const pages = accessDenied ? undefined : query.data?.pages;
  const rows = new Map(pages?.flatMap((page) => page.sessions.map((session) => [session.id, session] as const)));

  useFocusEffect(
    useCallback(() => {
      if (ownerId !== null) void refetch({ cancelRefetch: false });
    }, [ownerId, refetch]),
  );

  return (
    <ConversationFrame title="대화">
      {ownerId === null ? (
        <Notice tone="alert" message="사용자를 확인할 수 없어 대화 목록을 불러올 수 없습니다." />
      ) : !pages ? (
        <ConversationLoadState
          loading={query.isPending || query.isFetching}
          loadingMessage="대화 목록을 불러오는 중…"
          errorMessage="대화 목록을 불러오지 못했습니다."
          onRetry={accessDenied ? undefined : () => void refetch()}
        />
      ) : (
        <>
          {rows.size === 0 ? <Text variant="caption">아직 시작한 대화가 없습니다.</Text> : null}
          {[...rows.values()].map(({ id, story_title, read_only }) => {
            const sessionId = positiveConversationId(String(id));
            return sessionId ? (
              <Button
                key={sessionId}
                label={read_only ? `${story_title} · 읽기 전용` : story_title}
                variant="secondary"
                onPress={() => router.push({ pathname: '/chat-session/[sessionId]', params: { sessionId } })}
              />
            ) : null;
          })}
          {query.isFetchNextPageError ? <Notice tone="alert" message="다음 대화 목록을 불러오지 못했습니다." /> : null}
          {query.isRefetchError && !query.isFetchNextPageError ? (
            <>
              <Notice tone="alert" message="대화 목록을 새로 불러오지 못했습니다." />
              <Button label="다시 시도" variant="secondary" onPress={() => void refetch()} />
            </>
          ) : null}
          {query.hasNextPage ? (
            <Button
              label={
                query.isFetchingNextPage ? '더 불러오는 중…' : query.isFetchNextPageError ? '다시 더 보기' : '더 보기'
              }
              variant="secondary"
              disabled={query.isFetching}
              onPress={() => void query.fetchNextPage({ cancelRefetch: false })}
            />
          ) : null}
        </>
      )}
    </ConversationFrame>
  );
}
