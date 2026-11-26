import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  AFFINITY_DEFAULT,
  affinityIssue,
  affinityValue,
  setAffinity,
  type FewshotCharacter,
  type InitialAffinity,
  type InitialRelation,
} from '@/shared/story-types';
import { FieldLabel } from '../SceneParts';
import { LimitedField } from './fields';
import { people, personKey, type Person } from './people';
import { SceneDropdown } from './SceneDropdown';

const pairKey = (source: string, target: string) => `${source}>${target}`;

/**
 * CREATE-US-04-AC09 관계 카드가 없는 방향의 초기 호감도 (CREATE-US-12 목업 v15에는 없는 보조 구역).
 * 목업은 호감도를 관계 카드 안에서만 받지만, 실제 저장은 관계와 독립인 방향별 호감도 목록이라
 * 관계 없이 정한 값(관계 삭제·인물 변경 뒤 남은 값 포함)도 고쳐 쓸 수 있어야 한다. 관계를 새로 만들지 않는다.
 * - 출발 캐릭터·상대를 드롭다운으로 골라 한 칸에서 입력한다. 관계 카드(캐릭터 시작)가 있는 방향은 그 카드에서 입력하므로 고를 수 없다.
 * - 0이 아닌 값(빈 값·범위 밖 값 포함)은 목록으로 보여 주고, 누르면 그 방향을 고른다.
 * - 유저가 출발점인 호감도는 미정이라 다루지 않는다.
 */
export function AffinityEditor({
  affinities,
  relations,
  characters,
  onChange,
}: {
  affinities: InitialAffinity[];
  relations: InitialRelation[];
  characters: FewshotCharacter[];
  /** 최신 목록을 받아 바꾸는 업데이트 함수. 화면에 그려진 시점의 목록으로 덮어쓰지 않게 한다. */
  onChange: (update: (affinities: InitialAffinity[]) => InitialAffinity[]) => void;
}) {
  const c = useTheme();
  const everyone = people(characters);
  const sources = everyone.filter((p) => p.kind === 'character');
  const covered = new Set(
    relations
      .filter((r) => r.sourceKind === 'character')
      .map((r) => pairKey(personKey(r.sourceKind, r.sourceCharacterId), personKey(r.targetKind, r.targetCharacterId))),
  );
  const freeTargets = (source: Person) =>
    everyone.filter((t) => t.key !== source.key && !covered.has(pairKey(source.key, t.key)));

  const [picked, setPicked] = useState<{ source: string | null; target: string | null }>({
    source: null,
    target: null,
  });
  // 고른 값이 삭제됐거나 관계 카드가 생겨 고를 수 없게 되면, 남은 첫 방향으로 넘어간다(이전 선택을 붙잡지 않는다).
  const source =
    sources.find((p) => p.key === picked.source && freeTargets(p).length > 0) ??
    sources.find((p) => freeTargets(p).length > 0) ??
    null;
  const targets = source ? freeTargets(source) : [];
  const target = targets.find((t) => t.key === picked.target) ?? targets[0] ?? null;

  const directionOf = (s: Person, t: Person) => ({
    sourceCharacterId: s.characterId ?? '',
    targetKind: t.kind,
    targetCharacterId: t.characterId,
  });
  // 관계 카드 밖에서 기본값(0)이 아닌 방향. 인물 순서대로 보여 준다.
  const setValues = sources.flatMap((s) =>
    freeTargets(s)
      .map((t) => ({ s, t, value: affinityValue(affinities, directionOf(s, t)) }))
      .filter((item) => item.value !== AFFINITY_DEFAULT),
  );
  const value = source && target ? affinityValue(affinities, directionOf(source, target)) : null;

  return (
    <Card tone="state" accessibilityLabel="관계 없이 정한 호감도" style={styles.card}>
      <Text variant="caption" color="text" style={styles.title} accessibilityRole="header">
        💗 관계 없이 호감도만
      </Text>
      <Text variant="caption">
        {'관계 카드가 없는 방향의 호감도예요. 정하지 않으면 0으로 시작해요.\nA→B와 B→A는 따로 정해요.'}
      </Text>
      {sources.length === 0 ? (
        <Text variant="caption">등장 캐릭터를 먼저 등록해 주세요.</Text>
      ) : !source || !target || value === null ? (
        <Text variant="caption">모든 방향의 호감도를 관계 카드에서 정하고 있어요.</Text>
      ) : (
        <>
          {setValues.length ? (
            <View accessibilityLabel="정한 호감도" style={styles.list}>
              {setValues.map(({ s, t, value: current }) => {
                const issue = affinityIssue(current);
                const chosen = s.key === source.key && t.key === target.key;
                const shown = current === '' ? '비어 있음' : current;
                return (
                  <Pressable
                    key={pairKey(s.key, t.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`${s.label} → ${t.label} · ${shown}`}
                    accessibilityHint="이 방향의 호감도를 고쳐 써요"
                    accessibilityState={{ selected: chosen }}
                    onPress={() => setPicked({ source: s.key, target: t.key })}
                    style={[
                      styles.row,
                      { borderColor: chosen ? c.actionBorder : c.inputBorder, backgroundColor: c.inputSurface },
                    ]}
                  >
                    <Text variant="caption" color="text" numberOfLines={1} style={styles.rowName}>
                      {`${s.label} → ${t.label}`}
                    </Text>
                    <Text variant="caption" color={issue ? 'danger' : 'accentText'}>
                      {issue ? `${shown} · 확인 필요` : shown}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View style={styles.pickers}>
            <View style={styles.picker}>
              <FieldLabel first>출발 캐릭터</FieldLabel>
              <SceneDropdown
                label="호감도 출발 캐릭터"
                options={sources.map((p) =>
                  freeTargets(p).length
                    ? { key: p.key, label: p.label }
                    : { key: p.key, label: p.label, disabled: true, note: '모두 관계 카드에서 입력' },
                )}
                value={source.key}
                onChange={(key) => setPicked({ source: key, target: null })}
              />
            </View>
            <View style={styles.picker}>
              <FieldLabel first>상대</FieldLabel>
              <SceneDropdown
                label="호감도 상대"
                options={everyone
                  .filter((t) => t.key !== source.key)
                  .map((t) =>
                    covered.has(pairKey(source.key, t.key))
                      ? { key: t.key, label: t.label, disabled: true, note: '관계 카드에서 입력' }
                      : { key: t.key, label: t.label },
                  )}
                value={target.key}
                onChange={(key) => setPicked({ source: source.key, target: key })}
              />
            </View>
          </View>
          <LimitedField
            label="💗 초기 호감도 · -100~100 정수"
            accessibilityLabel={`${source.label}→${target.label} 호감도`}
            value={value}
            error={affinityIssue(value)}
            keyboardType="numbers-and-punctuation"
            onChange={(next) =>
              onChange((current) => setAffinity(current, { ...directionOf(source, target), value: next }))
            }
          />
        </>
      )}
    </Card>
  );
}
const styles = StyleSheet.create({
  // 목업 .state-card: radius 14, padding 16
  card: { gap: Spacing.two, marginVertical: 0, borderRadius: Radius.state, padding: Spacing.three },
  title: { fontSize: 14, fontWeight: '600' },
  list: { gap: Spacing.one },
  row: {
    minHeight: MinTouchSize,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.two + Spacing.one,
  },
  rowName: { flex: 1, minWidth: 0 },
  pickers: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  picker: { flexGrow: 1, flexBasis: 140, gap: Spacing.one },
});
