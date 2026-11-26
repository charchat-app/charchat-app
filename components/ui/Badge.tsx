import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useTheme } from '@/hooks/use-theme';

export type BadgeProps = {
  label: string;
  /** neutral: 상태 표시(임시 저장·비공개·공개), alert: 주의 필요 */
  tone?: 'neutral' | 'alert';
};

/** 목업 .badge: 작은 둥근 라벨. 다크 테마는 파랑 채움 + 테두리(Palette 06). */
export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const c = useTheme();
  const colors =
    tone === 'alert'
      ? { backgroundColor: c.alertBackground, borderColor: c.alertBorder, color: c.alertText }
      : { backgroundColor: c.badgeBackground, borderColor: c.badgeBorder, color: c.badgeText };

  return (
    <View style={[styles.badge, { backgroundColor: colors.backgroundColor, borderColor: colors.borderColor }]}>
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
    borderWidth: 1,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  label: { fontSize: 10, lineHeight: 14, fontWeight: '600' },
});
