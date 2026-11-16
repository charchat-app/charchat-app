import { StyleSheet, View, type ViewProps } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type CardProps = ViewProps & {
  /** item: 목록 항목 카드 (목업 .item), state: 장면·관계 같은 묶음 카드 (목업 .state-card) */
  tone?: 'item' | 'state';
};

export function Card({ tone = 'item', style, ...rest }: CardProps) {
  const c = useTheme();
  const isState = tone === 'state';

  return (
    <View
      style={[
        styles.base,
        isState ? styles.state : styles.item,
        { backgroundColor: isState ? c.backgroundElement : c.surface, borderColor: c.border },
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
  item: { padding: Spacing.three, borderRadius: 12 },
  state: { paddingVertical: Spacing.four, paddingHorizontal: Spacing.three, borderRadius: 20 },
});
