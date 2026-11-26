// CREATE-US-12 편집기 머리글: 목업 v15 renderEditor의 .top (압축 제목 줄 + 상태 + 가로 스크롤 탭 줄)
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/ui/Badge';
import { CreationIcon } from '@/components/ui/CreationIcon';
import { Text } from '@/components/ui/Text';
import { TopTabs } from '@/components/ui/TopTabs';
import { ContentInset, CreationShell, MinTouchSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** TopTabs가 늘린 터치 영역을 담으려고 탭 줄 위아래에 두는 여백 */
const TAB_ROW_INSET = (MinTouchSize - CreationShell.tabHeight) / 2;
/** 목업 v15 .icon svg 21px */
const BACK_ICON_SIZE = 21;

export type EditorHeaderProps = {
  title: string;
  /** 있으면 왼쪽에 뒤로 가기 아이콘 버튼을 둔다 */
  onBack?: () => void;
  backLabel?: string;
  /** 제목 오른쪽 상태 배지 (예: 임시 저장·비공개·공개) */
  badge?: string;
  /** 제목 아래 한 줄 상태 안내 (목업 .sub#saveState) */
  status?: string;
  tabs: readonly string[];
  activeIndex: number;
  onTabChange: (index: number) => void;
};

/**
 * 표시만 하는 머리글. 탭을 눌렀을 때 무엇을 할지(같은 화면 전환·다른 화면 넘기기·막기)는 호출하는 쪽이 정한다.
 * 화면이 바뀌어도 같은 모양·같은 탭 순서로 보이도록 제작 화면 두 곳이 함께 쓴다.
 */
export function EditorHeader({
  title,
  onBack,
  backLabel = '뒤로',
  badge,
  status,
  tabs,
  activeIndex,
  onTabChange,
}: EditorHeaderProps) {
  const c = useTheme();

  return (
    <SafeAreaView
      testID="editor-header"
      edges={['top']}
      style={[styles.safe, { backgroundColor: c.background, borderBottomColor: c.divider }]}
    >
      <View testID="editor-header-row" style={styles.row}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            onPress={onBack}
            style={({ pressed }) => [styles.back, pressed && { backgroundColor: c.actionFill }]}
          >
            <CreationIcon testID="editor-back-icon" name="back" size={BACK_ICON_SIZE} color={c.headerIcon} />
          </Pressable>
        ) : null}
        <Text variant="title" numberOfLines={1} accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {badge ? <Badge label={badge} /> : null}
      </View>
      {status ? (
        <Text variant="caption" style={styles.status} accessibilityLiveRegion="polite">
          {status}
        </Text>
      ) : null}
      <View testID="editor-tabs-row" style={styles.tabs}>
        <TopTabs testID="editor-tabs" tabs={tabs} activeIndex={activeIndex} onChange={onTabChange} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { borderBottomWidth: 1 },
  // .unified-theme .head: padding 12px 16px 4px, gap 7px, min-height 60px → 뒤로 가기 버튼이 x16·y12
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: CreationShell.headGap,
    minHeight: CreationShell.headMinHeight,
    paddingTop: CreationShell.headPaddingTop,
    paddingBottom: CreationShell.headPaddingBottom,
    paddingHorizontal: ContentInset.horizontal,
  },
  // .icon: 44x44 원형
  back: {
    width: CreationShell.iconSize,
    height: CreationShell.iconSize,
    borderRadius: CreationShell.iconSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // #editTitle: flex 1, 17px, 말줄임
  title: { flex: 1, minWidth: 0, fontSize: 17, lineHeight: 24, fontWeight: '600', letterSpacing: -0.4 },
  // .unified-theme .sub: padding 0 20px 13px 22px, 11px. 탭 줄이 hitSlop용 위 여백을 가지므로 그만큼 뺀다(탭 알약 위쪽 y90).
  status: {
    fontSize: CreationShell.subFontSize,
    lineHeight: CreationShell.subLineHeight,
    paddingLeft: 22,
    paddingRight: Spacing.four,
    paddingBottom: CreationShell.subGap - TAB_ROW_INSET,
  },
  // .unified-theme .tabs: padding 0 16px 12px. 알약 아래 12px = 탭 줄 아래 여백 + 이 여백
  tabs: { paddingBottom: CreationShell.tabRowBottom - TAB_ROW_INSET },
});
