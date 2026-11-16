import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';

export type EmptyStateProps = {
  title: string;
  description?: string;
  /** 있으면 아래에 주 행동 버튼을 둔다 */
  actionLabel?: string;
  onAction?: () => void;
};

/** 목업 .empty: 가운데 정렬, 위아래 여백이 넓은 빈 상태 */
export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <Text variant="subheading" style={styles.center}>
        {title}
      </Text>
      {description ? (
        <Text variant="caption" style={styles.center}>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 60,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    gap: Spacing.two,
  },
  center: { textAlign: 'center' },
});
