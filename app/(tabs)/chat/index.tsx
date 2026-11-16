import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Surface } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';

/** 대화 목록. 목업 범위 밖이므로 features/chat은 생성 완료 후 구현한다. */
export default function ChatListScreen() {
  return (
    <Surface style={styles.container}>
      <SafeAreaView style={styles.inner}>
        <Text variant="title">대화</Text>
        <Text variant="caption">대화 기능은 생성 완료 후 구현합니다.</Text>
      </SafeAreaView>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, padding: Spacing.four, gap: Spacing.two },
});
