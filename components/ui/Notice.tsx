import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type NoticeProps = {
  message: string;
  /** info: 화면 상단 안내(예: 목업 전용 표시), alert: 입력 오류·경고 */
  tone?: 'info' | 'alert';
};

/** 목업 .notice(info)와 .alert(alert) */
export function Notice({ message, tone = 'info' }: NoticeProps) {
  const c = useTheme();
  const isAlert = tone === 'alert';

  return (
    <View
      accessibilityRole={isAlert ? 'alert' : 'text'}
      style={[
        styles.base,
        isAlert ? styles.alert : styles.info,
        { backgroundColor: isAlert ? c.alertBackground : c.noticeBackground },
      ]}
    >
      <Text variant={isAlert ? 'error' : 'caption'} style={{ color: isAlert ? c.alertText : c.noticeText }}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: Radius.md },
  info: { paddingVertical: Spacing.half * 2, paddingHorizontal: Spacing.four },
  alert: { padding: Spacing.three - 4, marginVertical: Spacing.three - 4 },
});
