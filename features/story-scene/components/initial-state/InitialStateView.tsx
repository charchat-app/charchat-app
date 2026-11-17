import { useState, type Dispatch, type SetStateAction } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ChipGroup, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { FewshotCharacter, InitialAffinity, InitialRelation, IntroItem } from '@/shared/story-types';
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
              onChange={(scene) =>
                setIntros((items) =>
                  items.map((intro) => (intro.clientKey === active.clientKey ? { ...intro, scene } : intro)),
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
        <AffinityEditor affinities={affinities} characters={characters} onChange={setAffinities} />
        <RelationEditor relations={relations} characters={characters} onChange={setRelations} />
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
});
