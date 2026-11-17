import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, EmptyState, Notice, ScreenHeader, Surface, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api-client';

import { useCreateStory, useMyStories } from '../hooks/useStories';
import { formatSavedAt } from '../savedAt';

export type StoryListScreenProps = {
  /** 스토리 편집 화면으로 이동한다 */
  onOpen: (id: string) => void;
};

/** 제작 탭 첫 화면: 내 스토리 목록과 새 스토리 만들기 */
export function StoryListScreen({ onOpen }: StoryListScreenProps) {
  const c = useTheme();
  const stories = useMyStories();
  const create = useCreateStory();

  const startNew = () => create.mutate(undefined, { onSuccess: (story) => onOpen(story.id) });
  const newButton = <Button label="새 스토리" onPress={startNew} disabled={create.isPending} />;

  return (
    <Surface style={styles.container}>
      <ScreenHeader eyebrow="CHAR / CHAT" title="내 스토리" right={newButton} />
      {create.error ? <Notice tone="alert" message={messageOf(create.error)} /> : null}
      {stories.isPending ? (
        <Text variant="caption" style={styles.status}>
          불러오는 중…
        </Text>
      ) : stories.isError ? (
        <View style={styles.status}>
          <Notice tone="alert" message={messageOf(stories.error)} />
          <Button label="다시 시도" variant="secondary" onPress={() => void stories.refetch()} />
        </View>
      ) : stories.data.length === 0 ? (
        <EmptyState
          title="아직 만든 스토리가 없어요"
          description="새 스토리를 만들고 세계관과 캐릭터를 설정해 보세요."
          actionLabel="새 스토리 만들기"
          onAction={startNew}
        />
      ) : (
        <FlatList
          data={stories.data}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.title || '제목 없는 스토리'} 편집`}
              onPress={() => onOpen(item.id)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: c.surface, borderColor: c.border },
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.rowText}>
                <Text variant="subheading" numberOfLines={1}>
                  {item.title || '제목 없는 스토리'}
                </Text>
                <Text variant="caption">{formatSavedAt(item.updatedAt)}</Text>
              </View>
              <Badge label={item.saveState} />
            </Pressable>
          )}
        />
      )}
    </Surface>
  );
}

function messageOf(error: Error): string {
  return error instanceof ApiError ? error.detail : '알 수 없는 오류가 발생했습니다.';
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  status: { padding: Spacing.four, gap: Spacing.two },
  list: { padding: Spacing.four, gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1,
    borderRadius: 10,
  },
  rowText: { flex: 1, minWidth: 0, gap: Spacing.half },
  pressed: { opacity: 0.85 },
});
