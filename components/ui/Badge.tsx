import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useTheme } from '@/hooks/use-theme';

export type BadgeProps = {
  label: string;
  /** neutral: 상태 표시(임시 저장·비공개·공개), alert: 주의 필요 */
  tone?: 'neutral' | 'alert';
};

/** 목업 .badge: 작은 둥근 라벨 */
export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const c = useTheme();
  const colors =
    tone === 'alert'
      ? { backgroundColor: c.alertBackground, color: c.alertText }
      : { backgroundColor: c.badgeBackground, color: c.badgeText };

  return (
    <View style={[styles.badge, { backgroundColor: colors.backgroundColor }]}>
      <Text variant="caption" style={[styles.label, { color: colors.color }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 5,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  label: { fontSize: 10, lineHeight: 14, fontWeight: '600' },
});
