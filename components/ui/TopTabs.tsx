import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/Text';
import { ContentInset, CreationShell, MinTouchSize, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TopTabsProps = {
  tabs: readonly string[];
  /** 선택된 탭의 인덱스 */
  activeIndex: number;
  onChange: (index: number) => void;
  /**
   * 가로 스크롤 탭 줄(ScrollView)의 testID. ScrollView는 접근성 요소가 아니라서(탭을 하나로 묶지 않으려고
   * accessible을 켜지 않는다) 테스트가 role로 찾을 수 없으므로 이 값으로 찾는다.
   */
  testID?: string;
};

/** 알약은 목업대로 36px, 위아래로 늘린 터치 영역까지 합쳐 앱 기준 44px을 지킨다. */
const TAB_SLOP = (MinTouchSize - CreationShell.tabHeight) / 2;
const TAB_HIT_SLOP = { top: TAB_SLOP, bottom: TAB_SLOP, left: 0, right: 0 } as const;

/**
 * 목업 v15 다크 .tabs: 가로 스크롤, 둥근 알약 모양 탭. 선택 탭은 action 파랑 채움·테두리, 나머지는 흐린 글자.
 * (.unified-theme .tabs: gap 5px, 좌우 16px, button min-height 36px·radius 8px / Palette 06 .tabs button.active)
 */
export function TopTabs({ tabs, activeIndex, onChange, testID }: TopTabsProps) {
  const c = useTheme();

  return (
    <ScrollView
      testID={testID}
      horizontal
      style={styles.scroller}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
      accessibilityRole="tablist"
    >
      {tabs.map((tab, index) => {
        const active = index === activeIndex;

        return (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            aria-selected={active}
            onPress={() => onChange(index)}
            hitSlop={TAB_HIT_SLOP}
            style={[
              styles.tab,
              active
                ? { backgroundColor: c.actionFill, borderColor: c.actionBorder }
                : { backgroundColor: 'transparent', borderColor: 'transparent' },
            ]}
          >
            <Text
              variant="caption"
              style={[styles.label, active && styles.labelActive, { color: active ? c.selectedText : c.tabText }]}
            >
              {tab}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // 본문과 남는 세로 공간을 나누지 않고 글자·터치 영역의 자연 높이만 사용한다.
  scroller: { flexGrow: 0, flexShrink: 0 },
  // 위아래 여백은 늘린 터치 영역(hitSlop)을 스크롤 줄 안에 담는다. 안드로이드는 부모 밖 터치를 받지 않는다.
  content: {
    paddingHorizontal: ContentInset.horizontal,
    paddingVertical: TAB_SLOP,
    gap: CreationShell.tabGap,
    alignItems: 'center',
  },
  tab: {
    minHeight: CreationShell.tabHeight,
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  label: { fontSize: 12, lineHeight: 18, fontWeight: '500' },
  labelActive: { fontWeight: '700' },
});
