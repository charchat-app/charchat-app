import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ChipGroup, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { FewshotCharacter, InitialAffinity, InitialRelation, IntroItem } from '@/shared/story-types';
import { removeMissingFromAffinities, removeMissingFromIntros, removeMissingFromRelations } from '../../characterSync';
import { AffinityEditor } from './AffinityEditor';
import { RelationEditor } from './RelationEditor';
import { SceneEditor } from './SceneEditor';
import { SceneSummary } from './SceneSummary';

const introLabel = (intro: IntroItem, index: number) => `${index + 1}. ${intro.title.trim() || `인트로 ${index + 1}`}`;

/** CREATE-US-04 초기 상태 탭. 장면은 인트로별, 관계·호감도는 스토리 공통. 저장은 7번 공통 저장이 담당한다. */
export function InitialStateView({
  intros,
  setIntros,
  relations,
  setRelations,
  affinities,
  setAffinities,
  characters,
  onAddIntro,
}: {
  intros: IntroItem[];
  setIntros: Dispatch<SetStateAction<IntroItem[]>>;
  relations: InitialRelation[];
  setRelations: Dispatch<SetStateAction<InitialRelation[]>>;
  affinities: InitialAffinity[];
  setAffinities: Dispatch<SetStateAction<InitialAffinity[]>>;
  characters: FewshotCharacter[];
  onAddIntro: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  // 변경은 모두 최신 상태를 받는 업데이트 함수로 반영한다. 캐릭터 삭제 정리와 겹쳐도 삭제된 인물의 행이
  // 되살아나지 않도록, 반영할 때의 최신 캐릭터 목록으로 한 번 더 정리한다.
  const people = useRef(characters);
  people.current = characters;
  const updateAffinities = (update: (current: InitialAffinity[]) => InitialAffinity[]) =>
    setAffinities((current) => removeMissingFromAffinities(update(current), people.current));
  const updateRelations = (update: (current: InitialRelation[]) => InitialRelation[]) =>
    setRelations((current) => removeMissingFromRelations(update(current), people.current));
  // 고른 인트로가 삭제되면 첫 번째(기본) 인트로를 편집한다.
  const index = Math.max(
    0,
    intros.findIndex((intro) => intro.clientKey === selected),
  );
  const active = intros[index];
  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text variant="heading">장면의 시작 상태</Text>
        <Text variant="caption">장면은 인트로별, 관계·호감도는 스토리 공통이에요. 모든 항목은 비워 둘 수 있어요.</Text>
        {active ? (
          <>
            <Text variant="subheading">🎬 편집할 인트로</Text>
            <ChipGroup
              accessibilityLabel="편집할 인트로"
              options={intros.map(introLabel)}
              value={[introLabel(active, index)]}
              onChange={(next) => {
                const at = intros.findIndex((intro, i) => introLabel(intro, i) === next[0]);
                if (at >= 0) setSelected(intros[at].clientKey);
              }}
            />
            <SceneEditor
              key={active.clientKey}
              scene={active.scene}
              characters={characters}
              onChange={(update) =>
                setIntros((items) =>
                  removeMissingFromIntros(
                    items.map((intro) =>
                      intro.clientKey === active.clientKey ? { ...intro, scene: update(intro.scene) } : intro,
                    ),
                    people.current,
                  ),
                )
              }
            />
            <SceneSummary scene={active.scene} characters={characters} />
          </>
        ) : (
          <View style={styles.content}>
            <Text>먼저 인트로를 추가해 주세요. 장면은 인트로마다 정해요.</Text>
            <Button label="인트로 작성하러 가기" variant="secondary" onPress={onAddIntro} />
          </View>
        )}
        <AffinityEditor affinities={affinities} characters={characters} onChange={updateAffinities} />
        <RelationEditor relations={relations} characters={characters} onChange={updateRelations} />
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
});
