import { useRef, type Dispatch, type SetStateAction } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Text } from '@/components/ui';
import { ContentInset, Radius, Spacing } from '@/constants/theme';
import { Eyebrow, FieldLabel, Hint } from '../SceneParts';
import type { FewshotCharacter, InitialAffinity, InitialRelation, IntroItem } from '@/shared/story-types';
import { removeMissingFromAffinities, removeMissingFromIntros, removeMissingFromRelations } from '../../characterSync';
import { AffinityEditor } from './AffinityEditor';
import { RelationEditor } from './RelationEditor';
import { SceneDropdown } from './SceneDropdown';
import { SceneEditor } from './SceneEditor';

/** 목업 state(): 제목, 비어 있으면 「인트로 N」 */
const introLabel = (intro: IntroItem, index: number) => intro.title.trim() || `인트로 ${index + 1}`;

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
  selected,
  onSelect,
}: {
  intros: IntroItem[];
  setIntros: Dispatch<SetStateAction<IntroItem[]>>;
  relations: InitialRelation[];
  setRelations: Dispatch<SetStateAction<InitialRelation[]>>;
  affinities: InitialAffinity[];
  setAffinities: Dispatch<SetStateAction<InitialAffinity[]>>;
  characters: FewshotCharacter[];
  onAddIntro: () => void;
  /**
   * CREATE-US-12 장면을 편집할 인트로의 clientKey. 호스트가 가진다: 인트로 본문 편집의 「초기 상태 설정하기」가
   * 그 인트로를 고른 채 이 탭을 열고, 칩으로 고른 인트로는 탭을 오가도 유지된다. null이면 첫 번째(기본) 인트로.
   */
  selected: string | null;
  onSelect: (introKey: string) => void;
}) {
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
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* CREATE-US-12 목업 state() 첫 구역: 제목 · 편집할 인트로 카드 · SCENE 카드 · CHARACTERS 카드들 */}
        <Card tone="section" style={styles.section}>
          <View style={styles.heading}>
            <Text variant="heading" accessibilityRole="header">
              장면의 시작 상태 ✨
            </Text>
            <Text variant="caption">장면은 인트로별, 관계·호감도는 스토리 공통이에요.</Text>
          </View>
          {active ? (
            <>
              {/* 목업 .state-intro: 편집할 인트로 고르기 */}
              <Card tone="state" style={[styles.stateCard, styles.introCard]}>
                <FieldLabel first>🎬 편집할 인트로</FieldLabel>
                {/* 제목이 겹쳐도 인트로의 clientKey로 고른다. */}
                <SceneDropdown
                  label="편집할 인트로"
                  options={intros.map((intro, i) => ({ key: intro.clientKey, label: introLabel(intro, i) }))}
                  value={active.clientKey}
                  onChange={onSelect}
                />
              </Card>
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
            </>
          ) : (
            // 목업: 인트로가 없으면 .item 안내와 「인트로 작성」
            <Card style={styles.empty}>
              <Text>먼저 인트로를 추가해 주세요.</Text>
              <Text variant="caption">장면은 인트로마다 정해요.</Text>
              <Button label="인트로 작성하러 가기" variant="secondary" onPress={onAddIntro} />
            </Card>
          )}
        </Card>
        {/*
          CREATE-US-12 목업 RELATIONSHIPS / 스토리 공통 구역(relationCards()). 캐릭터가 시작인 관계 카드는 목업처럼
          카드 안에서 그 방향의 호감도를 입력한다. 저장은 관계(relations)·호감도(affinities) 두 목록으로 그대로 나뉜다.
          관계 카드가 없는 방향의 호감도는 관계를 만들지 않고 아래 「관계 없이 호감도만」에서 고쳐 쓴다.
        */}
        <Card tone="section" accessibilityLabel="초기 관계·호감도" style={styles.section}>
          <View style={styles.heading}>
            <Eyebrow>RELATIONSHIPS / 스토리 공통</Eyebrow>
            <Text variant="subheading" accessibilityRole="header">
              🤝 초기 관계 · 호감도
            </Text>
            <Text variant="caption">
              {'누가 누구를 어떻게 여기는지 정해 주세요.\n인트로에 관계없이 같은 시작값을 사용해요.'}
            </Text>
          </View>
          <RelationEditor
            relations={relations}
            affinities={affinities}
            characters={characters}
            onChange={updateRelations}
            onAffinitiesChange={updateAffinities}
          />
          <Hint>{'유저가 시작인 관계도 입력할 수 있어요.\n유저가 시작인 호감도는 아직 설계하지 않았어요.'}</Hint>
          <AffinityEditor
            affinities={affinities}
            relations={relations}
            characters={characters}
            onChange={updateAffinities}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingTop: ContentInset.top,
    paddingHorizontal: ContentInset.horizontal,
    paddingBottom: ContentInset.bottom,
  },
  section: { gap: Spacing.two },
  heading: { gap: Spacing.one },
  // 목업 .state-card: radius 14, padding 16
  stateCard: { borderRadius: Radius.state, padding: Spacing.three, gap: Spacing.two, marginVertical: 0 },
  introCard: { marginTop: Spacing.two },
  empty: { gap: Spacing.two, marginVertical: 0 },
});
