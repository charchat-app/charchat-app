// BASE-03 시작 시 보관된 로그인 세션을 확인하는 동안의 화면(기기에서는 스플래시 아래에 있다)
import { StyleSheet } from 'react-native';

import { Surface, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';

export function AuthLoadingScreen() {
  return (
    <Surface style={styles.fill}>
      <Text accessibilityLiveRegion="polite" variant="caption" style={styles.center}>
        로그인 상태를 확인하는 중…
      </Text>
    </Surface>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'center', padding: Spacing.four },
  center: { textAlign: 'center' },
});
