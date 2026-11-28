// CHAT-US-09 이어하기 목록: 같은 스토리의 내 방 중 지금 방만 뺀 목록(AC02·AC08), 미리보기(AC06), 빈 상태 안내(AC05).
// 항목을 누르면 새 방을 만들지 않고 그 방으로 바꾼다(AC07). ⋮ → 대화 삭제(AC13).
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, Notice, Text } from '@/components/ui';
import { MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { ConversationLoadState } from '@/features/chat/components/ConversationFrame';
import { Drawer } from '@/features/chat/components/sessions/SessionMenuParts';
import { positiveConversationId } from '@/features/chat/conversationIdentity';
import { formatActivity, sessionName, sessionTitle, useStorySessions } from '@/features/chat/hooks/useSessions';
import type { StorySessionSummary } from '@/features/chat/types';
import { useTheme } from '@/hooks/use-theme';

function SessionRow({
  session,
  expanded,
  onOpen,
  onToggleMenu,
  onDelete,
}: {
  session: StorySessionSummary;
  expanded: boolean;
  onOpen: () => void;
  onToggleMenu: () => void;
  onDelete: () => void;
}) {
  const c = useTheme();
  const title = sessionTitle(session);
  const name = sessionName(session);
  const time = formatActivity(session.last_activity_at);
  const preview = session.last_message_preview?.trim() || '아직 주고받은 메시지가 없어요.';
  return (
    <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.surfaceBorder }]}>
      <View style={styles.rowHead}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${name} 대화 이어하기`}
          accessibilityHint={preview}
          onPress={onOpen}
          style={styles.open}
        >
          <Text variant="subheading" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="caption" numberOfLines={2}>
            {preview}
          </Text>
          <Text variant="caption" color="eyebrow">
            {[time, session.play_name].filter(Boolean).join(' · ')}
          </Text>
          {session.generating ? <Badge label="응답 생성 중" tone="alert" /> : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${name} 대화 메뉴`}
          accessibilityState={{ expanded }}
          aria-expanded={expanded}
          onPress={onToggleMenu}
          style={styles.more}
        >
          <Text variant="subheading" color="headerIcon">
            ⋮
          </Text>
        </Pressable>
      </View>
      {expanded ? (
        <View style={styles.menu}>
          <Button label="대화 삭제" accessibilityLabel={`${name} 대화 삭제`} variant="danger" onPress={onDelete} />
        </View>
      ) : null}
    </View>
  );
}

export function SessionList({
  storyId,
  sessionId,
  onClose,
  onOpen,
  onRestart,
  onDelete,
  covered = false,
}: {
  storyId: string;
  /** 지금 방. 목록에서 뺀다. */
  sessionId: string;
  onClose: () => void;
  onOpen: (sessionId: string) => void;
  /** 빈 상태에서 새로하기 확인 팝업으로 간다(AC05). */
  onRestart: () => void;
  onDelete: (session: StorySessionSummary) => void;
  /** 삭제 확인 팝업이 위에 떠 있다. */
  covered?: boolean;
}) {
  const query = useStorySessions(storyId, sessionId, true);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const pages = query.data?.pages;
  // 다음 페이지를 읽는 사이 목록이 바뀌어도 같은 방을 두 번 보이지 않는다. 서버가 빼지 못했어도 지금 방은 뺀다.
  const rows = [
    ...new Map(
      pages?.flatMap((page) =>
        page.sessions
          .filter((session) => String(session.id) !== sessionId)
          .map((session) => [session.id, session] as const),
      ),
    ).values(),
  ];

  return (
    <Drawer wide modal={!covered} title="이어하기" closeLabel="이어하기 닫기" onClose={onClose}>
      {!pages ? (
        <ConversationLoadState
          loading={query.isPending && query.fetchStatus !== 'idle'}
          loadingMessage="저장된 대화를 불러오는 중…"
          errorMessage="저장된 대화를 불러오지 못했어요."
          onRetry={() => void query.refetch()}
        />
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="subheading">저장된 다른 대화가 없어요.</Text>
          <Text variant="caption">☰ 메뉴의 「새로하기」로 이 스토리의 새 대화를 시작할 수 있어요.</Text>
          <Button label="새로하기" accessibilityLabel="새로하기로 새 대화 시작" onPress={onRestart} />
        </View>
      ) : (
        <>
          {rows.map((session) => {
            const id = positiveConversationId(String(session.id));
            return id ? (
              <SessionRow
                key={id}
                session={session}
                expanded={menuFor === session.id}
                // 기존 방 ID로만 바꾼다. 새 방이나 인트로를 만들지 않는다(AC07).
                onOpen={() => onOpen(id)}
                onToggleMenu={() => setMenuFor((open) => (open === session.id ? null : session.id))}
                onDelete={() => {
                  setMenuFor(null);
                  onDelete(session);
                }}
              />
            ) : null;
          })}
          {query.isRefetchError || query.isFetchNextPageError ? (
            <Notice tone="alert" message="저장된 대화를 새로 불러오지 못했어요." />
          ) : null}
          {query.hasNextPage ? (
            <Button
              label={query.isFetchingNextPage ? '더 불러오는 중…' : '더 보기'}
              accessibilityLabel="저장된 대화 더 보기"
              variant="secondary"
              disabled={query.isFetching}
              onPress={() => void query.fetchNextPage({ cancelRefetch: false })}
            />
          ) : null}
        </>
      )}
    </Drawer>
  );
}

const styles = StyleSheet.create({
  row: { borderWidth: 1, borderRadius: Radius.item, padding: Spacing.three, gap: Spacing.two },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  open: { flex: 1, minWidth: 0, minHeight: MinTouchSize, gap: Spacing.one },
  more: { minWidth: MinTouchSize, minHeight: MinTouchSize, alignItems: 'center', justifyContent: 'center' },
  menu: { alignItems: 'flex-end', gap: Spacing.two },
  empty: { gap: Spacing.two, paddingVertical: Spacing.five },
});
