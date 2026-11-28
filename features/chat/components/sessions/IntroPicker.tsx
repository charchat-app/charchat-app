// CHAT-US-09-AC03 새로하기 인트로 카드: 첫 카드가 선택된 채 본문을 보이고, 카드를 누르면 선택과 본문만 바뀐다.
// 「새 대화 시작」을 눌러야 고른 장면으로 별도 방을 만든다. 취소하면 지금 방은 그대로다(AC04).
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Notice, Text } from '@/components/ui';
import { MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { ConversationBubbles } from '@/features/chat/components/ConversationBubbles';
import { ConversationLoadState } from '@/features/chat/components/ConversationFrame';
import { Drawer, sessionStyles } from '@/features/chat/components/sessions/SessionMenuParts';
import { type RestartFailure, useRestartStory } from '@/features/chat/hooks/useSessions';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api-client';

export function IntroPicker({
  storyId,
  keep,
  posting,
  failure,
  onCancel,
  onStart,
}: {
  storyId: string;
  /** 기존 대화 보관 여부. 끄면 새 방이 열린 뒤 지금 방을 지운다는 안내를 보인다. */
  keep: boolean;
  posting: boolean;
  failure: RestartFailure | null;
  onCancel: () => void;
  onStart: (introId: number) => void;
}) {
  const c = useTheme();
  const query = useRestartStory(storyId);
  const intros = query.data?.intros ?? [];
  const [introId, setIntroId] = useState<number>();
  const intro = intros.find((item) => item.id === introId) ?? intros[0];
  const denied = query.error instanceof ApiError && [403, 404].includes(query.error.status);

  return (
    <Drawer
      wide
      title="인트로 선택"
      closeLabel="인트로 선택 닫기"
      onClose={posting ? undefined : onCancel}
      footer={
        <>
          {failure ? <Notice tone="alert" message={failure.message} /> : null}
          {!keep ? (
            <Text variant="caption">새 대화방이 열리면 지금 대화방을 삭제해요. 삭제하면 되돌릴 수 없어요.</Text>
          ) : null}
          <View style={sessionStyles.actions}>
            <Button
              label="취소"
              accessibilityLabel="새 대화 시작 취소"
              variant="secondary"
              disabled={posting}
              onPress={onCancel}
              style={sessionStyles.flex}
            />
            <Button
              label={posting ? '새 대화 여는 중…' : '새 대화 시작'}
              accessibilityLabel="새 대화 시작"
              disabled={posting || !intro}
              onPress={() => intro && onStart(intro.id)}
              style={sessionStyles.flex}
            />
          </View>
        </>
      }
    >
      {query.data ? (
        intros.length ? (
          <>
            <Text variant="caption">시작할 장면을 고르세요. 고른 장면으로 새 대화방이 열려요.</Text>
            <View style={styles.cards}>
              {intros.map((item) => {
                const checked = item.id === intro?.id;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="radio"
                    accessibilityLabel={`${item.title} 인트로`}
                    accessibilityState={{ checked, disabled: posting }}
                    aria-checked={checked}
                    disabled={posting}
                    onPress={() => setIntroId(item.id)}
                    style={[
                      styles.card,
                      checked
                        ? { backgroundColor: c.actionFill, borderColor: c.actionBorder }
                        : { backgroundColor: c.surface, borderColor: c.surfaceBorder },
                    ]}
                  >
                    <Text variant="body" color={checked ? 'actionText' : 'text'} numberOfLines={2}>
                      {item.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {intro ? <ConversationBubbles messages={intro.messages} testID="restart-intro-bubble" /> : null}
          </>
        ) : (
          <Text variant="caption">이 스토리에는 시작할 인트로가 없어요.</Text>
        )
      ) : (
        <ConversationLoadState
          loading={query.isPending || query.isFetching}
          loadingMessage="인트로를 불러오는 중…"
          errorMessage={denied ? '이 스토리로 새 대화를 시작할 수 없어요.' : '인트로를 불러오지 못했어요.'}
          onRetry={denied ? undefined : () => void query.refetch()}
        />
      )}
    </Drawer>
  );
}

const styles = StyleSheet.create({
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  card: {
    minHeight: MinTouchSize,
    minWidth: 120,
    maxWidth: '100%',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Radius.item,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
