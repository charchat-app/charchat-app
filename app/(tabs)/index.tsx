import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

import { Text } from '@/components/ui/Text';
import { Surface } from '@/components/ui/Surface';
import { Spacing } from '@/constants/theme';

/** 홈 → features/discover. 콘텐츠는 설계 후 구현한다. */
export default function HomeScreen() {
  return (
    <Surface style={styles.container}>
      <SafeAreaView style={styles.inner}>
        <Text variant="eyebrow">CHAR / CHAT</Text>
        <Text variant="heading">이야기를 만들고, 그 안으로.</Text>
        <Text variant="caption">홈 화면은 설계 후 구현합니다.</Text>
      </SafeAreaView>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, padding: Spacing.four, gap: Spacing.two, justifyContent: 'center' },
});
