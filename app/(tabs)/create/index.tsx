import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Surface } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';

/** 제작 → 내 스토리 목록. 편집기 연결은 story-setup / story-scene / story-publish 구현 후 추가한다. */
export default function CreateListScreen() {
  return (
    <Surface style={styles.container}>
      <SafeAreaView style={styles.inner}>
        <Text variant="eyebrow">CHAR / CHAT</Text>
        <Text variant="title">내 스토리</Text>
        <Text variant="caption">스토리 목록은 다음 작업에서 구현합니다.</Text>
      </SafeAreaView>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, padding: Spacing.four, gap: Spacing.two },
});
