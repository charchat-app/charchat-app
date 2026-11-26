import { StyleSheet, View, type ViewProps } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type CardProps = ViewProps & {
  /**
   * item: 목록 항목 카드 (목업 .item)
   * state: 장면·관계 같은 묶음 카드 (목업 .state-card)
   * section: 화면 안의 큰 구역 카드 (목업 다크 .section)
   */
  tone?: 'item' | 'state' | 'section';
};

export function Card({ tone = 'item', style, ...rest }: CardProps) {
  const c = useTheme();
  const isSection = tone === 'section';

  return (
    <View
      style={[
        styles.base,
        styles[tone],
        isSection
          ? { backgroundColor: c.backgroundElement, borderColor: c.border }
          : { backgroundColor: c.surface, borderColor: c.surfaceBorder },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    marginVertical: Spacing.three - 2,
  },
  item: { padding: Spacing.three, borderRadius: Radius.item },
  state: { paddingVertical: Spacing.four, paddingHorizontal: Spacing.three, borderRadius: Radius.lg },
  // .unified-theme .section: padding 18px 16px, radius 15, margin-bottom 16
  section: {
    paddingVertical: 18,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.section,
    marginVertical: 0,
    marginBottom: Spacing.three,
    gap: Spacing.three,
  },
});
