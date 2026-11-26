import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type NoticeProps = {
  message: string;
  /** info: 화면 상단 안내(예: 목업 전용 표시), alert: 입력 오류·경고 */
  tone?: 'info' | 'alert';
};

/** 목업 .notice(info)와 .alert(alert). 다크 테마는 테두리로 카드 위에서도 구분한다. */
export function Notice({ message, tone = 'info' }: NoticeProps) {
  const c = useTheme();
  const isAlert = tone === 'alert';

  return (
    <View
      accessibilityRole={isAlert ? 'alert' : 'text'}
      style={[
        styles.base,
        isAlert ? styles.alert : styles.info,
        isAlert
          ? { backgroundColor: c.alertBackground, borderColor: c.alertBorder }
          : { backgroundColor: c.noticeBackground, borderColor: c.noticeBorder },
      ]}
    >
      <Text variant={isAlert ? 'error' : 'caption'} style={{ color: isAlert ? c.alertText : c.noticeText }}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: Radius.control, borderWidth: 1 },
  info: { paddingVertical: Spacing.half * 2, paddingHorizontal: Spacing.four },
  alert: { padding: Spacing.three - 4, marginVertical: Spacing.three - 4 },
});
