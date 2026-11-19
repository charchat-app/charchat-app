import { StyleSheet, View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatSceneDate, formatSceneTime, type FewshotCharacter, type IntroScene } from '@/shared/story-types';

const or = (value: string | null) => (value && value.length ? value : '미지정');

/** CREATE-US-04-AC18 인트로 하단 초기 상태창. 비운 항목은 미지정으로만 표시하고 값을 채우지 않는다. */
export function SceneSummary({ scene, characters }: { scene: IntroScene; characters: FewshotCharacter[] }) {
  return (
    <Card tone="state" accessibilityLabel="이 인트로의 초기 상태">
      <Text variant="subheading">🌿 초기 상태</Text>
      <View style={styles.rows}>
        <Text>📍 장소 · {or(scene.place)}</Text>
        <Text>📅 날짜 · {or(formatSceneDate(scene))}</Text>
        <Text>⏰ 시각 · {or(formatSceneTime(scene))}</Text>
      </View>
      {characters.map((person, index) => {
        const state = scene.characters.find((c) => c.characterId === person.id);
        return (
          <View key={person.id} style={styles.person}>
            <Text variant="caption">{person.name || `캐릭터 ${index + 1}`}</Text>
            <Text>👔 착장 · {or(state?.clothing ?? null)}</Text>
            <Text>💭 속마음 · {or(state?.innerThought ?? null)}</Text>
          </View>
        );
      })}
      <Text variant="caption">호감도·관계는 스토리 공통 시작값을 사용해요. 초기 상태 탭에서 설정해요.</Text>
    </Card>
  );
}
const styles = StyleSheet.create({
  rows: { gap: Spacing.half },
  person: { gap: Spacing.half, marginTop: Spacing.two },
});
