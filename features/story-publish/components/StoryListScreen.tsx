import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, CreationIcon, EmptyState, Notice, ScreenHeader, Surface, Text } from '@/components/ui';
import { ContentInset, Fonts, MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api-client';

import { useDeletedNotice } from '../hooks/useDeletedNotice';
import { useCreateStory, useMyStories } from '../hooks/useStories';
import { formatSavedAt } from '../savedAt';

export type StoryListScreenProps = {
  /** 스토리 편집 화면으로 이동한다 */
  onOpen: (id: string) => void;
  /** 공개·비공개 저장본의 대화 상세로 이동한다 */
  onStartChat?: (id: string) => void;
};

/** 목업 v15 .fab: 58×58, 라운드 19 */
const FAB_SIZE = 58;
const FAB_RADIUS = 19;
/** 393px 기준 목업 v15 .fab 위치 x300·y700. 오른쪽 393-(300+58)=35, 아래는 탭 바(y804)까지 804-(700+58)=46 */
const FAB_RIGHT = 35;
const FAB_BOTTOM = 46;
/** 목업 v15 .cover: 75px 너비, 3:4 비율 */
const COVER_WIDTH = 75;
const COVER_HEIGHT = 100;
const COVER_FONT_SIZE = 25;
/** 목업 v15 article.story: gap 13·padding 15·카드 사이 13, small(저장 시각) 10px */
const CARD_GAP = 13;
const CARD_PADDING = 15;
const UPDATED_FONT_SIZE = 10;
/** 목업 v15 svg 21px(편집 아이콘), .fab svg 26px */
const ICON_SIZE = 21;
const FAB_ICON_SIZE = 26;

/** 제작 탭 첫 화면: 내 스토리 목록과 새 스토리 만들기 (CREATE-US-12 목업 v15 배치) */
export function StoryListScreen({ onOpen, onStartChat }: StoryListScreenProps) {
  const c = useTheme();
  const stories = useMyStories();
  const create = useCreateStory();

  const deleted = useDeletedNotice();
  const open = (id: string) => {
    deleted.dismiss();
    onOpen(id);
  };
  const startNew = () => create.mutate(undefined, { onSuccess: (story) => open(story.id) });
  const count = stories.isPending || stories.isError ? null : stories.data.length;

  return (
    <Surface style={styles.container}>
      <ScreenHeader eyebrow="CHAR / CHAT" title="내 스토리" />
      {deleted.visible ? <Notice message="스토리를 삭제했어요." /> : null}
      {create.error ? <Notice tone="alert" message={messageOf(create.error)} /> : null}
      {count !== null ? (
        <View style={styles.listHead}>
          <Text variant="caption">스토리 목록</Text>
          <Text variant="caption">{`${count}개`}</Text>
        </View>
      ) : null}
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
          title="첫 이야기를 만들어 보세요"
          description="오른쪽 아래 + 버튼으로 시작할 수 있어요."
          actionLabel="새 스토리 만들기"
          onAction={create.isPending ? undefined : startNew}
        />
      ) : (
        <FlatList
          testID="story-list"
          data={stories.data}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const title = item.title || '제목 없는 스토리';
            const canChat = onStartChat && (item.saveState === '공개' || item.saveState === '비공개');
            return (
              <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                {/* 목록 응답에 사진이 없어 목업의 순번 표지 자리를 쓴다 */}
                <View
                  style={[styles.cover, { backgroundColor: c.avatarBackground, borderColor: c.placeholderBorder }]}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <Text variant="heading" color="avatarText" style={styles.coverText}>
                    {String(index + 1).padStart(2, '0')}
                  </Text>
                </View>
                <View style={styles.body}>
                  <View style={styles.badgeRow}>
                    <Badge label={item.saveState} />
                  </View>
                  <Text variant="subheading" numberOfLines={2} style={styles.title}>
                    {title}
                  </Text>
                  {/* 목업의 한 줄 소개(p.muted)는 목록 응답에 없어 보이지 않는다(지어내지 않음) */}
                  <Text variant="caption" style={styles.updated}>
                    {formatSavedAt(item.updatedAt)}
                  </Text>
                  <View style={styles.actions}>
                    {canChat ? (
                      <Button
                        label="대화 시작"
                        accessibilityLabel={`${title} 대화 시작`}
                        variant="secondary"
                        onPress={() => onStartChat(item.id)}
                      />
                    ) : null}
                    {/* 목업 v15 .actions .icon: 테두리·채움 없는 44px 원형 아이콘. 「이용 현황」 아이콘은 집계 설계 전이라 두지 않는다. */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${title} 편집`}
                      onPress={() => open(item.id)}
                      style={({ pressed }) => [styles.edit, pressed && { backgroundColor: c.backgroundSelected }]}
                    >
                      <CreationIcon
                        testID={`story-edit-icon-${item.id}`}
                        name="edit"
                        size={ICON_SIZE}
                        color={c.headerIcon}
                      />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="새 스토리"
        accessibilityState={{ disabled: create.isPending }}
        disabled={create.isPending}
        onPress={startNew}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: c.accent, borderColor: c.accent },
          (pressed || create.isPending) && styles.pressed,
        ]}
      >
        <CreationIcon testID="story-new-icon" name="plus" size={FAB_ICON_SIZE} color={c.onAccent} />
      </Pressable>
    </Surface>
  );
}

function messageOf(error: Error): string {
  return error instanceof ApiError ? error.detail : '알 수 없는 오류가 발생했습니다.';
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  status: { padding: Spacing.four, gap: Spacing.two },
  listHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: ContentInset.horizontal,
    paddingTop: ContentInset.top,
  },
  list: {
    paddingHorizontal: ContentInset.horizontal,
    paddingTop: Spacing.three,
    // + 버튼(아래 46px + 58px)과 그 위 여백만큼 비워 마지막 카드가 가리지 않게 한다
    paddingBottom: FAB_BOTTOM + FAB_SIZE + Spacing.four,
    gap: CARD_GAP,
  },
  // 목업 v15 article.story: gap 13, padding 15, radius 14
  card: {
    flexDirection: 'row',
    gap: CARD_GAP,
    padding: CARD_PADDING,
    borderWidth: 1,
    borderRadius: Radius.state,
  },
  // .cover 글자: Georgia 25px → 앱 세리프 글꼴
  coverText: { fontFamily: Fonts?.serif, fontSize: COVER_FONT_SIZE, lineHeight: COVER_FONT_SIZE + Spacing.two },
  // .story h3 margin 6px 0 4px, small 10px
  title: { marginTop: Spacing.half },
  updated: { fontSize: UPDATED_FONT_SIZE },
  cover: {
    width: COVER_WIDTH,
    height: COVER_HEIGHT,
    borderWidth: 1,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0, gap: Spacing.one },
  badgeRow: { flexDirection: 'row' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: 'auto',
    paddingTop: Spacing.one,
  },
  edit: {
    width: MinTouchSize,
    height: MinTouchSize,
    borderRadius: MinTouchSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    right: FAB_RIGHT,
    bottom: FAB_BOTTOM,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
});
