import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Text } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  affinityIssue,
  affinityValue,
  newFewshotKey,
  SCENE_LIMITS,
  setAffinity,
  type FewshotCharacter,
  type InitialAffinity,
  type InitialRelation,
} from '@/shared/story-types';
import { FieldLabel, Hint, IconButton, ItemHeader } from '../SceneParts';
import { LimitedField } from './fields';
import { people, personKey, type Person } from './people';
import { SceneDropdown, type SceneDropdownOption } from './SceneDropdown';

const sourceKey = (r: InitialRelation) => personKey(r.sourceKind, r.sourceCharacterId);
const targetKey = (r: InitialRelation) => personKey(r.targetKind, r.targetCharacterId);
/** 같은 방향(시작→대상) 관계가 이미 있는지. except는 지금 고치는 카드 자신. */
const hasDirection = (relations: InitialRelation[], source: string, target: string, except?: string) =>
  relations.some((r) => r.clientKey !== except && sourceKey(r) === source && targetKey(r) === target);

/**
 * 한쪽 드롭다운의 선택지. 등록된 인물 전체를 보여 주되, 반대쪽과 같은 인물과
 * 다른 카드와 같은 방향이 되는 인물은 이유와 함께 고를 수 없게 한다(목업 option:disabled).
 */
function personOptions(
  everyone: Person[],
  other: string | null,
  duplicates: (key: string) => boolean,
): SceneDropdownOption<string>[] {
  return everyone.map((p) => {
    if (p.key === other) return { key: p.key, label: p.label, disabled: true, note: '반대쪽에서 선택됨' };
    if (duplicates(p.key)) return { key: p.key, label: p.label, disabled: true, note: '이미 있는 관계' };
    return { key: p.key, label: p.label };
  });
}

type Draft = { source: string | null; target: string | null };

/**
 * CREATE-US-04-AC09·AC10 스토리 공통 방향별 관계 (CREATE-US-12 목업 v15 relationCards()).
 * 카드: 머리글(관계 N + 삭제) · 방향 표시(시작 → 대상) · 시작/대상 드롭다운 · 안내 · 관계명 · 초기 호감도.
 * - 호감도는 캐릭터가 시작인 카드에서만 입력하고, 그 방향의 호감도 목록(affinities)에 저장한다. 유저가 시작이면 안내만 둔다.
 * - 관계 카드가 없는 조합은 관계 미지정이다. 목업은 빈 카드를 바로 목록에 넣지만, 실제 관계는 시작·대상이 모두 있어야 하므로
 *   새 카드는 두 인물을 고르는 순간 관계가 되고 그 전에는 화면에만 있다.
 */
export function RelationEditor({
  relations,
  affinities,
  characters,
  onChange,
  onAffinitiesChange,
}: {
  relations: InitialRelation[];
  affinities: InitialAffinity[];
  characters: FewshotCharacter[];
  /** 최신 목록을 받아 바꾸는 업데이트 함수. 화면에 그려진 시점의 목록으로 덮어쓰지 않게 한다. */
  onChange: (update: (relations: InitialRelation[]) => InitialRelation[]) => void;
  onAffinitiesChange: (update: (affinities: InitialAffinity[]) => InitialAffinity[]) => void;
}) {
  const everyone = people(characters);
  const find = (key: string | null) => everyone.find((p) => p.key === key) ?? null;
  const [draft, setDraft] = useState<Draft | null>(null);
  // 고른 뒤 삭제된 인물은 선택으로 남기지 않는다(목록이 바뀌면 매번 다시 확인한다).
  const draftSource = find(draft?.source ?? null);
  const draftTarget = find(draft?.target ?? null);

  const changePerson = (key: string, side: 'source' | 'target', next: string) => {
    const person = find(next);
    if (!person) return;
    onChange((current) => {
      const relation = current.find((r) => r.clientKey === key);
      if (!relation) return current;
      const changed =
        side === 'source'
          ? { ...relation, sourceKind: person.kind, sourceCharacterId: person.characterId }
          : { ...relation, targetKind: person.kind, targetCharacterId: person.characterId };
      // 자기 자신 관계나 같은 방향 중복은 최신 목록 기준으로 다시 막는다.
      if (sourceKey(changed) === targetKey(changed)) return current;
      if (hasDirection(current, sourceKey(changed), targetKey(changed), key)) return current;
      return current.map((r) => (r.clientKey === key ? changed : r));
    });
  };
  /** 새 카드에서 인물을 고른다. 시작·대상이 모두 정해지면 관계로 추가하고 새 카드를 닫는다. */
  const chooseDraft = (side: 'source' | 'target', key: string) => {
    if (!draft) return;
    // 지금 목록에 없는 인물(삭제됨)로 고른 값은 버리고 다시 고르게 한다.
    const kept: Draft = { ...draft, source: draftSource?.key ?? null, target: draftTarget?.key ?? null };
    const next: Draft = side === 'source' ? { ...kept, source: key } : { ...kept, target: key };
    const from = find(next.source);
    const to = find(next.target);
    if (!from || !to || from.key === to.key) {
      setDraft(next);
      return;
    }
    const relation: InitialRelation = {
      clientKey: newFewshotKey('relation'),
      sourceKind: from.kind,
      sourceCharacterId: from.characterId,
      targetKind: to.kind,
      targetCharacterId: to.characterId,
      label: '',
    };
    onChange((current) => (hasDirection(current, from.key, to.key) ? current : [...current, relation]));
    setDraft(null);
  };

  const helpText =
    '같은 인물은 양쪽에 선택할 수 없어요.\n시작 캐릭터가 대상을 바라보는 관계예요. 반대 방향은 따로 설정해요.';
  const labelTitle = `🤝 관계명 · 선택 · 최대 ${SCENE_LIMITS.relationLabel}자`;

  return (
    // 구역 제목·안내는 InitialStateView의 RELATIONSHIPS 구역이 맡는다(같은 설명을 반복하지 않는다).
    <View style={styles.wrap}>
      {relations.map((r, index) => {
        const source = find(sourceKey(r));
        const target = find(targetKey(r));
        const from = source?.label ?? '삭제된 인물';
        const to = target?.label ?? '삭제된 인물';
        const title = `관계 ${index + 1}`;
        const direction =
          source?.kind === 'character' && source.characterId && target
            ? {
                sourceCharacterId: source.characterId,
                targetKind: target.kind,
                targetCharacterId: target.characterId,
              }
            : null;
        const affinity = direction ? affinityValue(affinities, direction) : null;
        return (
          <Card key={r.clientKey} tone="state" accessibilityLabel={`${title} · ${from} → ${to}`} style={styles.card}>
            <ItemHeader
              title={
                <Text variant="caption" color="text" style={styles.cardTitle}>
                  {title}
                </Text>
              }
            >
              <IconButton
                icon="trash"
                tone="danger"
                label={`${title} 삭제`}
                onPress={() => onChange((current) => current.filter((item) => item.clientKey !== r.clientKey))}
              />
            </ItemHeader>
            <DirectionPair from={from} to={to} />
            <FieldLabel first>시작 캐릭터</FieldLabel>
            <SceneDropdown
              label={`${title} 시작 캐릭터`}
              options={personOptions(everyone, targetKey(r), (key) =>
                hasDirection(relations, key, targetKey(r), r.clientKey),
              )}
              value={source?.key ?? null}
              onChange={(key) => changePerson(r.clientKey, 'source', key)}
            />
            <FieldLabel>대상 캐릭터</FieldLabel>
            <SceneDropdown
              label={`${title} 대상 캐릭터`}
              options={personOptions(everyone, sourceKey(r), (key) =>
                hasDirection(relations, sourceKey(r), key, r.clientKey),
              )}
              value={target?.key ?? null}
              onChange={(key) => changePerson(r.clientKey, 'target', key)}
            />
            <Hint>{helpText}</Hint>
            <LimitedField
              label={labelTitle}
              accessibilityLabel={`${title} 관계명`}
              value={r.label}
              limit={SCENE_LIMITS.relationLabel}
              placeholder="예: 친구, 라이벌, 짝사랑"
              onChange={(label) =>
                onChange((current) =>
                  current.map((item) => (item.clientKey === r.clientKey ? { ...item, label } : item)),
                )
              }
            />
            {direction && affinity !== null ? (
              // 목업: 캐릭터가 시작인 관계 카드 안의 「💗 초기 호감도」. 값은 관계가 아니라 그 방향의 호감도로 저장한다.
              <LimitedField
                label="💗 초기 호감도 · -100~100 정수"
                accessibilityLabel={`${from}→${to} 호감도`}
                value={affinity}
                error={affinityIssue(affinity)}
                keyboardType="numbers-and-punctuation"
                onChange={(value) => onAffinitiesChange((current) => setAffinity(current, { ...direction, value }))}
              />
            ) : source?.kind === 'user' ? (
              <Hint>
                {'유저가 시작인 관계를 설정하고 있어요.\n유저가 느끼는 호감도 입력은 아직 설계하지 않았어요.'}
              </Hint>
            ) : null}
          </Card>
        );
      })}
      {draft ? (
        // 목업에서 「+ 인물 사이 관계 추가」로 생기는 빈 카드. 두 인물을 고르면 위 목록의 관계 카드가 된다.
        <Card tone="state" accessibilityLabel="새 관계" style={styles.card}>
          <ItemHeader
            title={
              <Text variant="caption" color="text" style={styles.cardTitle}>
                {`관계 ${relations.length + 1}`}
              </Text>
            }
          >
            <IconButton icon="trash" tone="danger" label="새 관계 삭제" onPress={() => setDraft(null)} />
          </ItemHeader>
          <DirectionPair from={draftSource?.label ?? '시작 캐릭터'} to={draftTarget?.label ?? '대상 캐릭터'} />
          <FieldLabel first>시작 캐릭터</FieldLabel>
          <SceneDropdown
            label="새 관계 시작 캐릭터"
            options={personOptions(everyone, draftTarget?.key ?? null, (key) =>
              draftTarget ? hasDirection(relations, key, draftTarget.key) : false,
            )}
            value={draftSource?.key ?? null}
            onChange={(key) => chooseDraft('source', key)}
          />
          <FieldLabel>대상 캐릭터</FieldLabel>
          <SceneDropdown
            label="새 관계 대상 캐릭터"
            options={personOptions(everyone, draftSource?.key ?? null, (key) =>
              draftSource ? hasDirection(relations, draftSource.key, key) : false,
            )}
            value={draftTarget?.key ?? null}
            onChange={(key) => chooseDraft('target', key)}
          />
          {/* 관계명은 두 인물을 모두 골라 관계가 된 뒤 그 카드에서 입력한다. 새 카드에서 받은 이름은
              관계가 되지 못하고 닫히면 사라지므로 여기서는 받지 않는다. */}
          <Hint>{`${helpText}\n두 인물을 모두 고르면 관계가 추가되고, 관계명을 입력할 수 있어요.`}</Hint>
        </Card>
      ) : null}
      <Button
        variant="secondary"
        fullWidth
        label="+ 인물 사이 관계 추가"
        // 고르는 중인 새 카드가 있으면 하나만 둔다.
        disabled={!!draft}
        onPress={() => setDraft({ source: null, target: null })}
      />
    </View>
  );
}

/**
 * 목업 .state-pair: 가운데 정렬 「시작 → 대상」 표시만 한다. 화살표는 누르는 버튼이 아니며,
 * 방향은 아래 시작·대상 드롭다운으로 바꾼다(CREATE-US-12 목업에 없는 맞바꾸기 버튼은 두지 않는다).
 */
function DirectionPair({ from, to }: { from: string; to: string }) {
  const c = useTheme();
  return (
    <View
      accessibilityLabel={`방향: ${from} → ${to}`}
      style={[styles.pair, { backgroundColor: c.actionFill, borderColor: c.actionBorder }]}
    >
      <Text variant="caption" color="badgeText" numberOfLines={2} style={styles.pairName}>
        {from}
      </Text>
      <Text variant="caption" color="accentText" style={styles.arrow}>
        →
      </Text>
      <Text variant="caption" color="badgeText" numberOfLines={2} style={styles.pairName}>
        {to}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  // 목업 .state-card: radius 14, padding 16
  card: { gap: Spacing.two, marginVertical: 0, borderRadius: Radius.state, padding: Spacing.three },
  // 목업 .item-header: 13px 굵게
  cardTitle: { fontWeight: '600' },
  // 목업 .state-pair: margin 8px 0 18px, padding 10px, radius 9~10, 12px, 가운데 정렬 시작 → 대상
  pair: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.two + 2,
    marginBottom: Spacing.two + 2,
    borderRadius: Radius.control,
    borderWidth: 1,
  },
  pairName: { flex: 1, textAlign: 'center', fontSize: 12 },
  arrow: { fontWeight: '700' },
});
