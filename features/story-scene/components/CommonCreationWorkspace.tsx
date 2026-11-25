import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Notice, ScreenHeader, Surface, Text, TopTabs } from '@/components/ui';
import {
  completionIssues,
  useCommonSave,
  type CommonSaveDocument,
  type CommonSaveRepository,
  type FewshotRepository,
} from '@/features/story-publish';
import { confirmUnsavedLeave, useUnsavedCreationGuard } from '../hooks/useUnsavedCreationGuard';
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

/**
 * CREATE-US-07-AC07/08 이 화면이 맡지 않는 영역(1번 기본 정보·5번 프리셋·6번 이미지)을 저장 문서에서 뺀다.
 * 조회 응답(few.snapshot)에는 불러온 시점의 presets 등이 그대로 남아 있어, 펼쳐서 보내면 기본 설정 화면에서
 * 그 뒤에 저장한 값을 이전 값으로 덮어쓸 수 있다. 빼면 요청에 키가 없어 서버가 기존 값을 유지한다.
 * 사진 임시 저장본 반영(imagesWorkingCopySavedAt)은 서버의 작업본 처리라 그대로 둔다.
 */
function withoutForeignAreas(snapshot: FewshotsDocument): FewshotsDocument {
  const {
    basic: _basic,
    presets: _presets,
    images: _images,
    ...scene
  } = snapshot as FewshotsDocument & Partial<Pick<CommonSaveDocument, 'basic' | 'presets' | 'images'>>;
  return scene;
}

export function CommonCreationWorkspace({
  repository,
  storyId,
  guardDraftLeave = false,
  onBack,
}: {
  repository: CommonSaveRepository;
  storyId: string;
  /** 스택 뒤로 가기로 제거될 수 있으면 작성 중 스토리의 미저장 편집도 이탈 확인을 거친다. */
  guardDraftLeave?: boolean;
  /** 있으면 머리글에 뒤로 가기 버튼을 보인다. 미저장 확인은 여기서 하고, 확정 뒤 가드를 끈 다음 부른다. */
  onBack?: () => void;
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
    few.snapshot && speech
      ? { ...withoutForeignAreas(few.snapshot), speech, fewshots: few.groups, intros, relations, affinities }
      : null;
  const dirty =
    few.dirty ||
    (!!loaded && JSON.stringify(speech) !== JSON.stringify(loaded.speech)) ||
    JSON.stringify(intros) !== JSON.stringify(savedIntros) ||
    JSON.stringify(relations) !== JSON.stringify(savedRelations) ||
    // 호감도는 값을 바꾸면 행이 끝으로 옮겨지므로 순서와 무관하게 비교한다.
    !sameAffinities(affinities, savedAffinities);
  const common = useCommonSave(repository, {
    storyId,
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
  const guarded =
    !!few.snapshot && (completed || guardDraftLeave) && (dirty || pendingInput.active || common.pendingSave);
  // 머리글 뒤로 가기에서 나가기를 확정했다. 가드를 먼저 끈 뒤(다음 커밋) onBack으로 화면을 닫는다.
  const [leaving, setLeaving] = useState(false);
  useUnsavedCreationGuard(guarded && !leaving);
  useEffect(() => {
    if (leaving) onBack?.();
    // 한 번만 닫는다. onBack 참조가 바뀌어도 다시 부르지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);
  const back = onBack
    ? () => {
        if (leaving) return;
        if (guarded) confirmUnsavedLeave(() => setLeaving(true));
        else onBack();
      }
    : undefined;
  const issues = document ? completionIssues(document) : [];
  // 직접 저장이 진행 중이거나 기다리는 중. 자동 임시 저장만 진행 중일 때는 저장 버튼을 막지 않고, 누르면 이어서 저장한다.
  const manualBusy = (common.saving && !common.autoSaving) || common.waiting;
  return (
    <Surface style={styles.screen}>
      <ScreenHeader eyebrow="CHAR / CHAT" title="제작" onBack={back} backLabel="기본 설정으로 돌아가기" />
      <TopTabs
        tabs={['말투·서술', '대화 예시', '인트로', '초기 상태', '저장·공개']}
        activeIndex={tab}
        onChange={(index) => {
          // 탭을 바꾸면 확정된 변경을 임시 저장한다. 비공개·공개 스토리는 임시 저장본에만 남는다.
          if (index !== tab) void common.save(target, 'auto');
          setTab(index);
        }}
      />
      {/* 상태 안내도 본문과 같은 좌우 여백을 둔다(화면 가장자리에 붙지 않게). */}
      <View style={styles.status}>
        {few.loading ? <Text accessibilityRole="progressbar">제작 설정을 불러오는 중입니다.</Text> : null}
        {few.error ? <Notice tone="alert" message={few.error} /> : null}
        {common.error ? <Notice tone="alert" message={common.error} /> : null}
        {completed && loaded?.workingCopySavedAt ? (
          <Notice
            message={`임시 저장한 내용이에요(${new Date(loaded.workingCopySavedAt).toLocaleString('ko-KR')}). 이용자는 아직 이전에 저장한 내용을 봐요. 저장을 눌러야 반영돼요.`}
          />
        ) : null}
        {completed && loaded?.imagesWorkingCopySavedAt ? (
          <Notice message="임시 저장한 사진이 있어요. 저장을 누르면 사진도 함께 확인하고 반영해요." />
        ) : null}
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
          {common.waiting
            ? '자동 임시 저장이 끝나면 이어서 저장합니다.'
            : common.saving
              ? '공통 저장 중입니다.'
              : dirty || pendingInput.active
                ? '저장하지 않은 변경이 있습니다.'
                : completed && (loaded?.workingCopySavedAt || loaded?.imagesWorkingCopySavedAt)
                  ? '임시 저장한 내용과 같습니다.'
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
        <Notice message={SAVE_SCOPE_MESSAGE} />
        <Text variant="caption">공개 상태</Text>
        <TopTabs
          tabs={['미등록', '비공개', '공개']}
          activeIndex={(['draft', 'private', 'public'] as const).indexOf(target)}
          onChange={(index) => {
            if (!manualBusy && !common.pendingSave) setTarget((['draft', 'private', 'public'] as const)[index]);
          }}
        />
        {(completed && target === 'draft') || (few.snapshot?.saveState === 'public' && target === 'private') ? (
          <Notice tone="alert" message="비공개·공개한 스토리는 미등록으로, 공개는 비공개로 되돌릴 수 없습니다." />
        ) : null}
        {target !== 'draft' ? issues.map((message) => <Notice key={message} tone="alert" message={message} />) : null}
        {pendingInput.active ? (
          <Notice message="작성 중인 말풍선은 추가 또는 수정 완료·취소로 확정해 주세요. 자동 저장은 확정된 설정만 저장합니다." />
        ) : null}
        {common.pendingSave ? (
          <Button
            label="공통 저장 재시도"
            disabled={common.saving || few.loading || !document}
            onPress={() => void common.save(target)}
          />
        ) : (
          <View style={styles.actions}>
            <Button
              label="임시 저장"
              variant="secondary"
              disabled={manualBusy || few.loading || !document || pendingInput.active}
              onPress={() => void common.save(target, 'manual', 'temporary')}
            />
            <Button
              label={target === 'draft' ? '저장' : target === 'private' ? '비공개로 저장' : '공개로 저장'}
              disabled={
                manualBusy ||
                few.loading ||
                !document ||
                pendingInput.active ||
                (target !== 'draft' && issues.length > 0) ||
                (completed && target === 'draft') ||
                (few.snapshot?.saveState === 'public' && target === 'private')
              }
              onPress={() => void common.save(target, 'manual', 'save')}
            />
          </View>
        )}
        <Text variant="caption">
          임시 저장은 나만 보는 저장이에요. 확정된 변경은 1분마다, 탭을 바꿀 때 자동으로 임시 저장해요. 비공개·공개
          스토리는 저장을 눌러야 이용자에게 반영돼요.
        </Text>
        <Text variant="caption">{RELOAD_MESSAGE}</Text>
        <Button
          label="최신 편집 내용 다시 불러오기"
          variant="secondary"
          disabled={common.saving || common.pendingSave || few.loading}
          onPress={() => (dirty || pendingInput.active ? setConfirmReload(true) : void few.reload())}
        />
        {confirmReload ? (
          <View style={styles.content}>
            <Notice tone="alert" message={`저장하지 않은 변경 내용이 사라집니다. ${RELOAD_MESSAGE}`} />
            <Button label="변경 유지" onPress={() => setConfirmReload(false)} />
            <Button
              label="변경 버리고 최신 편집 내용 불러오기"
              // 저장이 진행 중이거나 재시도를 기다리는 동안 다시 불러오면 늦게 도착한 조회가 저장 결과를 덮을 수 있다.
              disabled={common.saving || common.pendingSave || few.loading}
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
/** 저장 범위 안내. 이 화면의 저장은 2~4번 설정과 사진 임시 저장본을 함께 반영한다(안 B). 기본 정보는 따로 저장한다. */
const SAVE_SCOPE_MESSAGE =
  '여기서 저장하면 말투·서술, 대화 예시, 인트로, 초기 상태와 임시 저장한 사진이 함께 반영돼요. 캐릭터마다 사진이 1장 이상인지도 함께 확인해요. 기본 정보(제목·소개·캐릭터 등)는 포함되지 않아요. 기본 설정 화면에서 따로 저장해 주세요.';
/** 다시 불러오기 안내. 임시 저장본이 있으면 마지막으로 반영한 내용이 아니라 임시 저장본을 연다. */
const RELOAD_MESSAGE =
  '임시 저장한 내용이 있으면 그 내용을, 없으면 마지막으로 저장한 내용을 불러와요. 이전에 반영한 내용으로 되돌리는 기능은 아니에요.';
const styles = StyleSheet.create({
  screen: { flex: 1 },
  hidden: { display: 'none' },
  content: { padding: Spacing.three, gap: Spacing.three },
  status: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
});
