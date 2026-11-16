import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/Text';
import { MinTouchSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TopTabsProps = {
  tabs: readonly string[];
  /** 선택된 탭의 인덱스 */
  activeIndex: number;
  onChange: (index: number) => void;
};

/** 목업 .tabs: 가로 스크롤, 선택 탭은 초록 글자 + 아래 3px 막대 */
export function TopTabs({ tabs, activeIndex, onChange }: TopTabsProps) {
  const c = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
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
            onPress={() => onChange(index)}
            style={[styles.tab, { borderBottomColor: active ? c.accent : 'transparent' }]}
          >
            <Text
              variant="body"
              color={active ? 'accent' : 'textSecondary'}
              style={[styles.label, active && styles.labelActive]}
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
  content: { paddingHorizontal: Spacing.four, gap: Spacing.four },
  tab: {
    minHeight: MinTouchSize,
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 3,
  },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  labelActive: { fontWeight: '700' },
});
