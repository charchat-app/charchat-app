import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, ChipGroup, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  newFewshotKey,
  SCENE_LIMITS,
  type FewshotCharacter,
  type InitialRelation,
  type PersonKind,
} from '@/shared/story-types';
import { LimitedField } from './fields';
import { people, personKey } from './people';

/** CREATE-US-04-AC10 스토리 공통 방향별 관계. 카드가 없는 조합은 관계 미지정이다. 호감도는 AffinityEditor가 맡는다. */
export function RelationEditor({
  relations,
  characters,
  onChange,
}: {
  relations: InitialRelation[];
  characters: FewshotCharacter[];
  /** 최신 목록을 받아 바꾸는 업데이트 함수. 화면에 그려진 시점의 목록으로 덮어쓰지 않게 한다. */
  onChange: (update: (relations: InitialRelation[]) => InitialRelation[]) => void;
}) {
  const everyone = people(characters);
  const name = (kind: PersonKind, id: string | null) =>
    everyone.find((p) => p.key === personKey(kind, id))?.label ?? '삭제된 인물';
  const [source, setSource] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const taken = new Set(
    relations
      .filter((r) => personKey(r.sourceKind, r.sourceCharacterId) === source)
      .map((r) => personKey(r.targetKind, r.targetCharacterId)),
  );
  // 한쪽에서 고른 인물은 반대쪽에 없고, 이미 있는 같은 방향 관계도 다시 만들 수 없다.
  const targets = everyone.filter((p) => p.key !== source && !taken.has(p.key));
  const sources = everyone.filter((p) => p.key !== target);
  const update = (key: string, patch: Partial<InitialRelation>) =>
    onChange((current) => current.map((r) => (r.clientKey === key ? { ...r, ...patch } : r)));
  return (
    <View style={styles.wrap}>
      <Text variant="subheading">🤝 초기 관계</Text>
      <Text variant="caption">
        누가 누구를 어떻게 여기는지 정해요. 인트로와 관계없이 같은 시작값을 써요. 모든 조합을 채울 필요는 없고, 카드가
        없는 조합은 관계 미지정으로 시작해요.
      </Text>
      {relations.map((r, index) => {
        const title = `${name(r.sourceKind, r.sourceCharacterId)} → ${name(r.targetKind, r.targetCharacterId)}`;
        return (
          <Card key={r.clientKey} tone="state" style={styles.wrap}>
            <Text variant="subheading">
              관계 {index + 1} · {title}
            </Text>
            <LimitedField
              label="🤝 관계명 · 선택"
              accessibilityLabel={`관계 ${index + 1} 관계명`}
              value={r.label}
              limit={SCENE_LIMITS.relationLabel}
              placeholder="친구, 라이벌, 짝사랑"
              onChange={(label) => update(r.clientKey, { label })}
            />
            <Button
              label={`관계 ${index + 1} 삭제`}
              variant="danger"
              onPress={() => onChange((current) => current.filter((item) => item.clientKey !== r.clientKey))}
            />
          </Card>
        );
      })}
      <Card tone="item" style={styles.wrap}>
        <Text variant="subheading">+ 인물 사이 관계 추가</Text>
        <Text variant="caption">시작 캐릭터</Text>
        <ChipGroup
          accessibilityLabel="시작 캐릭터"
          options={sources.map((p) => p.label)}
          value={everyone.filter((p) => p.key === source).map((p) => p.label)}
          onChange={(next) => setSource(everyone.find((p) => p.label === next[0])?.key ?? null)}
        />
        <Text variant="caption">대상 캐릭터</Text>
        <ChipGroup
          accessibilityLabel="대상 캐릭터"
          options={targets.map((p) => p.label)}
          value={everyone.filter((p) => p.key === target).map((p) => p.label)}
          onChange={(next) => setTarget(everyone.find((p) => p.label === next[0])?.key ?? null)}
        />
        <Text variant="caption">같은 인물은 양쪽에 고를 수 없어요. 반대 방향은 따로 추가해요.</Text>
        <Button
          label="관계 추가"
          disabled={!source || !target || source === target || taken.has(target)}
          onPress={() => {
            const from = everyone.find((p) => p.key === source);
            const to = everyone.find((p) => p.key === target);
            if (!from || !to || from.key === to.key) return;
            const relation: InitialRelation = {
              clientKey: newFewshotKey('relation'),
              sourceKind: from.kind,
              sourceCharacterId: from.characterId,
              targetKind: to.kind,
              targetCharacterId: to.characterId,
              label: '',
            };
            // 같은 방향 관계가 그사이 생겼으면 다시 만들지 않는다.
            onChange((current) =>
              current.some(
                (r) =>
                  personKey(r.sourceKind, r.sourceCharacterId) === from.key &&
                  personKey(r.targetKind, r.targetCharacterId) === to.key,
              )
                ? current
                : [...current, relation],
            );
            setSource(null);
            setTarget(null);
          }}
        />
      </Card>
    </View>
  );
}
const styles = StyleSheet.create({ wrap: { gap: Spacing.two } });
