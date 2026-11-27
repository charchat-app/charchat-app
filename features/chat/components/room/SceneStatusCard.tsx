// CHAT-US-08 대화방 상태 카드: 가장 뒤 AI 응답 아래에 누적 현재 장면(날짜·시간·장소·캐릭터별 착장·속마음)을 보인다.
// 모양은 제작 쪽 인트로 초기 상태창(story-scene SceneSummary, CREATE-US-04-AC18)의 이모지 + 카드 줄을 따른다.
// 그 화면과 달리 값이 없는 줄은 「미지정」으로 두지 않고 줄을 뺀다.
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { isSceneCardEmpty, sceneCardLines } from '@/features/chat/scene/sceneFormat';
import { useTheme } from '@/hooks/use-theme';
import type { CurrentScene } from '@/shared/story-types';

export function SceneStatusCard({ scene, onEdit }: { scene: CurrentScene; onEdit?: () => void }) {
  const c = useTheme();
  const lines = sceneCardLines(scene);
  const row = [styles.row, { borderBottomColor: c.surfaceBorder }];
  const common = [
    lines.date ? `📅 날짜 · ${lines.date}` : null,
    lines.time ? `⏰ 시간 · ${lines.time}` : null,
    lines.place ? `📍 장소 · ${lines.place}` : null,
  ].filter((line): line is string => line !== null);

  return (
    // 컨테이너에는 이름표를 달지 않는다(accessible 없이 단 이름표는 iOS에서 무시되고 TalkBack은 안의 줄을 건너뛸 수 있다).
    // 제목을 header로 두고 줄마다 그대로 읽게 한다.
    <Card tone="state" testID="chat-scene-card" style={styles.card}>
      <View style={styles.head}>
        <Text variant="subheading" accessibilityRole="header" style={styles.title}>
          🌿 지금 상태
        </Text>
        {onEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="장면 정보 수정"
            onPress={onEdit}
            hitSlop={4}
            style={[styles.edit, { borderColor: c.chipBorder }]}
          >
            <Text variant="caption">✏️ 수정</Text>
          </Pressable>
        ) : null}
      </View>
      {isSceneCardEmpty(lines) ? <Text variant="caption">아직 정해진 장면 정보가 없어요.</Text> : null}
      {common.length ? (
        <View>
          {common.map((line) => (
            <Text key={line} style={row}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
      {lines.characters.map(({ name, clothing, innerThought }) => (
        <View key={name} testID={`chat-scene-card-person-${name}`} style={row}>
          <Text style={styles.name}>{name}</Text>
          {clothing ? <Text>👔 착장 · {clothing}</Text> : null}
          {innerThought ? <Text>💭 속마음 · {innerThought}</Text> : null}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  // SceneSummary(.initial-preview)와 같은 둥근 정도·안쪽 여백
  card: { borderRadius: Radius.state, padding: Spacing.three, marginVertical: 0 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  title: { flexShrink: 1 },
  edit: {
    minHeight: MinTouchSize,
    minWidth: MinTouchSize,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Radius.lg,
  },
  // .initial-preview p: padding 7px 0, 아래 구분선
  row: { paddingVertical: Spacing.one + 3, borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.half },
  name: { fontWeight: '600' },
});
