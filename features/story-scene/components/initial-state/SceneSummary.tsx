import { StyleSheet, View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatSceneDate, formatSceneTime, type FewshotCharacter, type IntroScene } from '@/shared/story-types';

const or = (value: string | null) => (value && value.length ? value : '미지정');

/**
 * CREATE-US-04-AC18 인트로 하단 초기 상태창.
 * 공통 장면(날짜·시간·장소)과 등장 캐릭터별 착장·속마음을 서로 다른 영역으로 나누고 각 영역에 인물을 표시한다.
 * 비운 항목은 미지정으로만 표시하고 값을 채우지 않는다. 유저 캐릭터의 착장·속마음은 제작 입력 대상이 아니라 표시하지 않는다.
 */
export function SceneSummary({ scene, characters }: { scene: IntroScene; characters: FewshotCharacter[] }) {
  return (
    <View accessibilityLabel="이 인트로의 초기 상태" style={styles.wrap}>
      <Card tone="state" accessibilityLabel="공통 장면">
        <Text variant="subheading">🌿 공통 장면</Text>
        <View style={styles.rows}>
          <Text>📅 날짜 · {or(formatSceneDate(scene))}</Text>
          <Text>⏰ 시각 · {or(formatSceneTime(scene))}</Text>
          <Text>📍 장소 · {or(scene.place)}</Text>
        </View>
      </Card>
      <Card tone="state" accessibilityLabel="캐릭터별 상태">
        <Text variant="subheading">👥 캐릭터별 상태</Text>
        {characters.length === 0 ? <Text variant="caption">등록된 등장 캐릭터가 없어요.</Text> : null}
        {characters.map((person, index) => {
          const name = person.name || `캐릭터 ${index + 1}`;
          const state = scene.characters.find((c) => c.characterId === person.id);
          return (
            <Card key={person.id} accessibilityLabel={`${name}의 상태`} style={styles.person}>
              <Text variant="caption">👤 {name}</Text>
              <Text>👔 착장 · {or(state?.clothing ?? null)}</Text>
              <Text>💭 속마음 · {or(state?.innerThought ?? null)}</Text>
            </Card>
          );
        })}
      </Card>
      <Text variant="caption">호감도·관계는 스토리 공통 시작값을 사용해요. 초기 상태 탭에서 설정해요.</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { gap: Spacing.half },
  rows: { gap: Spacing.half, marginTop: Spacing.two },
  person: { gap: Spacing.half },
});
