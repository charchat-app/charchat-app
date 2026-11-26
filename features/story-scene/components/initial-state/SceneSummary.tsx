import { StyleSheet, View } from 'react-native';
import { Button, Card, Text } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatSceneDate, formatSceneTime, type FewshotCharacter, type IntroScene } from '@/shared/story-types';

const or = (value: string | null) => (value && value.length ? value : '미지정');

/**
 * CREATE-US-04-AC18 인트로 하단 초기 상태창 (CREATE-US-12 목업 initialPreview(): .initial-preview).
 * 한 장의 카드 안에서 공통 장면(장소·날짜·시각)과 등장 캐릭터별 착장·속마음을 구분선으로 나눈 다른 영역에 둔다.
 * 비운 항목은 미지정으로만 표시하고 값을 채우지 않는다. 유저 캐릭터의 착장·속마음은 제작 입력 대상이 아니라 표시하지 않는다.
 */
export function SceneSummary({
  scene,
  characters,
  onOpenState,
  openDisabled = false,
}: {
  scene: IntroScene;
  characters: FewshotCharacter[];
  /** 있으면 목업처럼 카드 끝에 「초기 상태 설정하기」(초기 상태 탭으로 이동)를 둔다. */
  onOpenState?: () => void;
  openDisabled?: boolean;
}) {
  const c = useTheme();
  const row = [styles.row, { borderBottomColor: c.surfaceBorder }];
  return (
    <Card accessibilityLabel="이 인트로의 초기 상태" style={styles.card}>
      <Text variant="subheading" style={styles.title}>
        🌿 초기 상태
      </Text>
      <View accessibilityLabel="공통 장면">
        <Text style={row}>📍 장소 · {or(scene.place)}</Text>
        <Text style={row}>📅 날짜 · {or(formatSceneDate(scene))}</Text>
        <Text style={row}>⏰ 시각 · {or(formatSceneTime(scene))}</Text>
      </View>
      <View accessibilityLabel="캐릭터별 상태">
        {characters.length === 0 ? (
          <Text variant="caption" style={row}>
            등록된 등장 캐릭터가 없어요.
          </Text>
        ) : null}
        {characters.map((person, index) => {
          const name = person.name || `캐릭터 ${index + 1}`;
          const state = scene.characters.find((s) => s.characterId === person.id);
          return (
            <View key={person.id} accessibilityLabel={`${name}의 상태`} style={row}>
              <Text style={styles.name}>{name}</Text>
              <Text>👔 착장 · {or(state?.clothing ?? null)}</Text>
              <Text>💭 속마음 · {or(state?.innerThought ?? null)}</Text>
            </View>
          );
        })}
      </View>
      <Text variant="caption" style={styles.note}>
        호감도·관계는 스토리 공통 시작값을 사용해요.
      </Text>
      {onOpenState ? (
        <Button
          label="초기 상태 설정하기"
          variant="secondary"
          fullWidth
          disabled={openDisabled}
          onPress={onOpenState}
        />
      ) : null}
    </Card>
  );
}
const styles = StyleSheet.create({
  // .initial-preview: radius 13~16, padding 16, margin-top 20
  card: { borderRadius: Radius.state, padding: Spacing.three, marginTop: Spacing.four, marginBottom: 0 },
  title: { fontSize: 16, marginBottom: Spacing.one },
  // .initial-preview p: padding 7px 0, 아래 구분선
  row: { paddingVertical: Spacing.one + 3, borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.half },
  name: { fontWeight: '600' },
  note: { marginTop: Spacing.two, marginBottom: Spacing.two },
});
