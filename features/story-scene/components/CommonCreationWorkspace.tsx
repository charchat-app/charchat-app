import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Notice, ScreenHeader, Surface, Text, TopTabs } from '@/components/ui';
import {
  completionIssues,
  useCommonSave,
  type CommonSaveRepository,
  type FewshotRepository,
} from '@/features/story-publish';
import { useUnsavedCreationGuard } from '../hooks/useUnsavedCreationGuard';
import { Spacing } from '@/constants/theme';
import {
  applyAllocatedIds,
  sameAffinities,
  type CreationSaveDocument,
  type CreationSaveState,
  type ExpressionSettings as Expression,
  type FewshotsDocument,
  type InitialAffinity,
  type InitialRelation,
  type IntroItem,
} from '@/shared/story-types';
import { removeMissingFromAffinities, removeMissingFromIntros, removeMissingFromRelations } from '../characterSync';
import { useFewshotEditor } from '../hooks/useFewshotEditor';
import { FewshotEditorView } from './FewshotScreen';
import type { PendingInput } from './FewshotGroupEditor';
import { ExpressionSettings } from './ExpressionSettings';
import { IntroEditorView } from './IntroEditorView';
import { InitialStateView } from './initial-state/InitialStateView';

const idle: PendingInput = { active: false, lengthDelta: 0 };

export function CommonCreationWorkspace({
  repository,
  storyId,
}: {
  repository: CommonSaveRepository;
  storyId: string;
}) {
  const [tab, setTab] = useState(0),
    [loaded, setLoaded] = useState<CreationSaveDocument | null>(null);
  const [speech, setSpeech] = useState<Expression | null>(null),
    [target, setTarget] = useState<CreationSaveState>('draft');
  const [fewPending, setFewPending] = useState<PendingInput>(idle);
  const [introPending, setIntroPending] = useState<PendingInput>(idle);
  const [intros, setIntros] = useState<IntroItem[]>([]),
    [savedIntros, setSavedIntros] = useState<IntroItem[]>([]);
  const [relations, setRelations] = useState<InitialRelation[]>([]),
    [savedRelations, setSavedRelations] = useState<InitialRelation[]>([]);
  const [affinities, setAffinities] = useState<InitialAffinity[]>([]),
    [savedAffinities, setSavedAffinities] = useState<InitialAffinity[]>([]);
  const [confirmReload, setConfirmReload] = useState(false);
  const [loadCycle, setLoadCycle] = useState(0);
  const projection = useMemo<FewshotRepository>(
    () => ({
      load: async (id, signal) => {
        const data = await repository.load(id, signal);
        if (!signal?.aborted) {
          setLoaded(data);
          setSpeech(data.speech);
          setIntros(data.intros);
          setSavedIntros(data.intros);
          setRelations(data.relations);
          setSavedRelations(data.relations);
          setAffinities(data.affinities);
          setSavedAffinities(data.affinities);
          setTarget(data.saveState);
          setLoadCycle((cycle) => cycle + 1);
        }
        return data;
      },
      save: async () => {
        throw new Error('7번 공통 저장을 사용해 주세요.');
      },
    }),
    [repository],
  );
  const few = useFewshotEditor(projection, storyId);
  const characters = few.snapshot?.characters;
  useEffect(() => {
    // 캐릭터 이름 변경은 이름표에만 반영되고, 삭제된 인물의 인트로 말풍선·착장·속마음과
    // 그 인물이 출발/도착인 관계·호감도만 제거한다. 저장본에도 같게 적용해 변경으로 보지 않는다.
    if (!characters) return;
    setIntros((value) => removeMissingFromIntros(value, characters));
    setSavedIntros((value) => removeMissingFromIntros(value, characters));
    setRelations((value) => removeMissingFromRelations(value, characters));
    setSavedRelations((value) => removeMissingFromRelations(value, characters));
    setAffinities((value) => removeMissingFromAffinities(value, characters));
    setSavedAffinities((value) => removeMissingFromAffinities(value, characters));
  }, [characters]);
  const pendingInput: PendingInput = {
    active: fewPending.active || introPending.active,
    lengthDelta: 0,
  };
  const document =
    few.snapshot && speech ? { ...few.snapshot, speech, fewshots: few.groups, intros, relations, affinities } : null;
  const dirty =
    few.dirty ||
    (!!loaded && JSON.stringify(speech) !== JSON.stringify(loaded.speech)) ||
    JSON.stringify(intros) !== JSON.stringify(savedIntros) ||
    JSON.stringify(relations) !== JSON.stringify(savedRelations) ||
    // 호감도는 값을 바꾸면 행이 끝으로 옮겨지므로 순서와 무관하게 비교한다.
    !sameAffinities(affinities, savedAffinities);
  const common = useCommonSave(repository, {
    document,
    dirty,
    loading: few.loading,
    pendingInput: pendingInput.active,
    captureCommit: () => {
      const commitFew = few.captureCommit();
      return (result, submitted) => {
        commitFew(result as FewshotsDocument);
        setLoaded(result);
        setSpeech((current) =>
          JSON.stringify(current) === JSON.stringify(submitted.speech) ? result.speech : current,
        );
        // 저장 중 바뀐 인트로 입력·순서는 유지하고 새로 발급된 ID만 합친다.
        setSavedIntros(result.intros);
        setIntros((current) => applyAllocatedIds(current, result.intros));
        // 관계는 ID 없이 전체 교체한다. 저장 중 바뀐 입력은 그대로 남아 변경으로 표시된다.
        setSavedRelations(result.relations);
        setSavedAffinities(result.affinities);
      };
    },
  });
  const completed = !!few.snapshot && few.snapshot.saveState !== 'draft';
  useUnsavedCreationGuard(!!few.snapshot && completed && (dirty || pendingInput.active || common.pendingSave));
  const issues = document ? completionIssues(document) : [];
  return (
    <Surface style={styles.screen}>
      <ScreenHeader eyebrow="CHAR / CHAT" title="제작" />
      <TopTabs
        tabs={['말투·서술', '대화 예시', '인트로', '초기 상태', '저장·공개']}
        activeIndex={tab}
        onChange={(index) => {
          if (index !== tab && few.snapshot?.saveState === 'draft') void common.save('draft', 'auto');
          setTab(index);
        }}
      />
      {/* 상태 안내도 본문과 같은 좌우 여백을 둔다(화면 가장자리에 붙지 않게). */}
      <View style={styles.status}>
        {few.loading ? <Text accessibilityRole="progressbar">제작 설정을 불러오는 중입니다.</Text> : null}
        {few.error ? <Notice tone="alert" message={few.error} /> : null}
        {common.error ? <Notice tone="alert" message={common.error} /> : null}
        {common.pendingSave ? (
          // 재시도를 기다리는 동안 자동 저장이 멈추므로 어느 탭에서든 바로 다시 시도할 수 있게 한다.
          <Button
            label="실패한 저장 다시 시도"
            variant="secondary"
            disabled={common.saving || few.loading}
            onPress={() => void common.save(target)}
          />
        ) : null}
        <Text variant="caption" accessibilityLiveRegion="polite">
          {common.saving
            ? '공통 저장 중입니다.'
            : dirty || pendingInput.active
              ? '저장하지 않은 변경이 있습니다.'
              : '저장한 설정과 같습니다.'}
        </Text>
        {few.snapshot ? (
          <Text variant="caption">마지막 저장: {new Date(few.snapshot.updatedAt).toLocaleString('ko-KR')}</Text>
        ) : null}
      </View>
      <ScrollView
        style={[styles.screen, tab !== 0 && styles.hidden]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {speech && !few.loading ? <ExpressionSettings value={speech} onChange={setSpeech} /> : null}
      </ScrollView>
      <View style={[styles.screen, tab !== 1 && styles.hidden]}>
        <FewshotEditorView key={loadCycle} editor={few} hideHeader hideSaveControls onPendingChange={setFewPending} />
      </View>
      <View style={[styles.screen, tab !== 2 && styles.hidden]}>
        {few.snapshot && !few.loading ? (
          <IntroEditorView
            key={loadCycle}
            intros={intros}
            setIntros={setIntros}
            characters={few.snapshot.characters}
            onPendingChange={setIntroPending}
          />
        ) : null}
      </View>
      <View style={[styles.screen, tab !== 3 && styles.hidden]}>
        {few.snapshot && !few.loading ? (
          <InitialStateView
            key={loadCycle}
            intros={intros}
            setIntros={setIntros}
            relations={relations}
            setRelations={setRelations}
            affinities={affinities}
            setAffinities={setAffinities}
            characters={few.snapshot.characters}
            onAddIntro={() => setTab(2)}
          />
        ) : null}
      </View>
      <ScrollView style={[styles.screen, tab !== 4 && styles.hidden]} contentContainerStyle={styles.content}>
        <Text variant="heading">저장·공개</Text>
        <Text>표현 설정·대화 예시·인트로·초기 상태를 함께 저장합니다.</Text>
        <TopTabs
          tabs={['임시 저장', '비공개', '공개']}
          activeIndex={(['draft', 'private', 'public'] as const).indexOf(target)}
          onChange={(index) => {
            if (!common.saving && !common.pendingSave) setTarget((['draft', 'private', 'public'] as const)[index]);
          }}
        />
        {(completed && target === 'draft') || (few.snapshot?.saveState === 'public' && target === 'private') ? (
          <Notice tone="alert" message="완성 저장은 임시 저장으로, 공개는 비공개로 되돌릴 수 없습니다." />
        ) : null}
        {target !== 'draft' ? issues.map((message) => <Notice key={message} tone="alert" message={message} />) : null}
        {pendingInput.active ? (
          <Notice message="작성 중인 말풍선은 추가 또는 수정 완료·취소로 확정해 주세요. 자동 저장은 확정된 설정만 저장합니다." />
        ) : null}
        <Button
          label={
            common.pendingSave
              ? '공통 저장 재시도'
              : target === 'draft'
                ? '전체 임시 저장'
                : target === 'private'
                  ? '비공개 저장'
                  : '공개 저장'
          }
          disabled={
            common.saving ||
            few.loading ||
            !document ||
            (!common.pendingSave &&
              (pendingInput.active ||
                (target !== 'draft' && issues.length > 0) ||
                (completed && target === 'draft') ||
                (few.snapshot?.saveState === 'public' && target === 'private')))
          }
          onPress={() => void common.save(target)}
        />
        <Text variant="caption">
          초안의 확정된 변경만 1분마다, 탭을 바꿀 때 자동 저장합니다. 공개·비공개는 직접 저장해야 합니다.
        </Text>
        <Button
          label="저장한 전체 설정 다시 불러오기"
          variant="secondary"
          disabled={common.saving || common.pendingSave || few.loading}
          onPress={() => (dirty || pendingInput.active ? setConfirmReload(true) : void few.reload())}
        />
        {confirmReload ? (
          <View style={styles.content}>
            <Notice tone="alert" message="저장하지 않은 변경 내용이 사라집니다." />
            <Button label="변경 유지" onPress={() => setConfirmReload(false)} />
            <Button
              label="변경 버리고 전체 불러오기"
              onPress={() => {
                setConfirmReload(false);
                void few.reload();
              }}
            />
          </View>
        ) : null}
      </ScrollView>
    </Surface>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  hidden: { display: 'none' },
  content: { padding: Spacing.three, gap: Spacing.three },
  status: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.one },
});
