// CHAT-US-03 내 대화 목록: 이어갈 대화를 찾아 기존 대화방을 연다
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Notice, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { ConversationFrame, ConversationLoadState } from '@/features/chat/components/ConversationFrame';
import { getConversationOwnerId, positiveConversationId } from '@/features/chat/conversationIdentity';
import { isConversationAccessDenied, useConversationSessions } from '@/features/chat/hooks/useConversation';
import type { ConversationSessionSummary } from '@/shared/story-types';

function SessionRow({ session, onOpen }: { session: ConversationSessionSummary; onOpen: () => void }) {
  const title = session.story_title || '제목 없는 스토리';
  const states = [session.generating ? '응답 생성 중' : null, session.read_only ? '읽기 전용' : null].filter(Boolean);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title} 대화 열기${states.length ? `, ${states.join(', ')}` : ''}`}
      onPress={onOpen}
    >
      <Card style={styles.row}>
        <Text variant="subheading">{title}</Text>
        <Text variant="caption">
          {session.play_name} · {session.model}
        </Text>
        <Text numberOfLines={2} variant="caption">
          {session.last_message_preview ?? '아직 주고받은 메시지가 없습니다.'}
        </Text>
        {session.generating || session.read_only ? (
          <View style={styles.badges}>
            {session.generating ? <Badge label="응답 생성 중" tone="alert" /> : null}
            {session.read_only ? <Badge label="읽기 전용" /> : null}
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

export function ChatListScreen() {
  const router = useRouter();
  const ownerId = getConversationOwnerId();
  const query = useConversationSessions(ownerId);
  const { refetch } = query;
  const accessDenied = isConversationAccessDenied(query.error);
  const pages = accessDenied ? undefined : query.data?.pages;
  // 다음 페이지를 읽는 사이 새 대화가 생겨도 같은 세션을 두 번 보이지 않는다.
  const rows = new Map(pages?.flatMap((page) => page.sessions.map((session) => [session.id, session] as const)));

  // 대화방에서 돌아오면 생성 중 표시와 미리보기를 다시 읽는다(AC11).
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
          {[...rows.values()].map((session) => {
            const sessionId = positiveConversationId(String(session.id));
            // 기존 세션 ID로만 이동한다. 새 세션이나 새 생성 요청을 만들지 않는다(AC02·AC11).
            return sessionId ? (
              <SessionRow
                key={sessionId}
                session={session}
                onOpen={() => router.push({ pathname: '/chat-session/[sessionId]', params: { sessionId } })}
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

const styles = StyleSheet.create({
  row: { gap: Spacing.one },
  badges: { flexDirection: 'row', gap: Spacing.one },
});
