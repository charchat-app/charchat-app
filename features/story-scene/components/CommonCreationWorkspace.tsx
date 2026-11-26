import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, EditorHeader, Notice, StickyFooter, Surface, Text } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import {
  CREATION_TAB_LABELS,
  ContentRatingSection,
  SAVE_STATE_LABEL,
  StoryDeleteSection,
  completionIssues,
  formatRatingReviewFeedback,
  saveStatusLine,
  sectionAt,
  sectionBusyMessage,
  sectionDirtyMessage,
  sectionIndex,
  useCommonSave,
  useStory,
  useStoryWriteLock,
  type EditorSection,
  type SceneSection,
  type CommonSaveDocument,
  type CommonSaveRepository,
  type ContentRatingSectionProps,
  type FewshotRepository,
} from '@/features/story-publish';
import { DEFAULT_CONTENT_RATING, type ContentRating } from '@/shared/rating';
import { confirmUnsavedLeave, useUnsavedCreationGuard } from '../hooks/useUnsavedCreationGuard';
import { ContentInset, MinTouchSize, Radius, Spacing } from '@/constants/theme';
import {
  applyAllocatedIds,
  sameAffinities,
  type CreationSaveKind,
  type CreationSaveMode,
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
/** CREATE-US-12 기본 설정·유저 프로필로 넘기기 전에 남길 저장 안내 */
const EDITOR_SAVE_HINT = '먼저 임시 저장해 주세요.';
const EDITOR_LOADING_MESSAGE = '제작 설정을 불러오는 중이에요. 불러온 뒤 다시 눌러 주세요.';
/** CREATE-US-12 공개 범위 탭의 삭제가 끝나기 전에 편집 화면 탭·뒤로 가기를 눌렀을 때의 안내 */
const DELETING_MESSAGE = '스토리를 삭제하는 중에는 다른 화면으로 이동할 수 없어요. 삭제가 끝난 뒤 다시 눌러 주세요.';

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

/**
 * CREATE-US-08-AC13 등급만 담긴 임시 저장본(ratingOnlyWorkingCopy)을 직접 「저장」으로 반영할 때만
 * finalizeRatingWorkingCopyAt(조회한 working_copy_saved_at)을 붙인다. 편집 화면(useStoryPresets)과 같은 계약이다.
 * - 장면을 바꾸지 않아 preserveScene을 실은 저장이어야 한다(서버가 임시본의 오래된 장면 대신 정본 장면을 유지).
 * - 완성된(비공개·공개) 스토리를 같은 공개 범위로 저장하거나 비공개→공개로 저장할 때만 쓴다. 미등록→공개 등
 *   그 밖의 범위 변경은 서버 처리가 달라 토큰을 싣지 않는다.
 * - 자동·직접 임시 저장(kind temporary)은 그대로 임시 저장으로 보낸다.
 * 소유·시각 최종 확인은 서버가 잠금 아래에서 한다.
 */
function withRatingFinalize(
  document: CommonSaveDocument,
  state: CreationSaveState,
  mode: CreationSaveMode,
  kind: CreationSaveKind | undefined,
): CommonSaveDocument {
  const stagedAt = document.workingCopySavedAt;
  const eligible =
    kind === 'save' &&
    mode === 'manual' &&
    document.preserveScene === true &&
    document.saveState !== 'draft' &&
    (state === document.saveState || (document.saveState === 'private' && state === 'public')) &&
    document.ratingOnlyWorkingCopy === true &&
    !!stagedAt &&
    !document.imagesWorkingCopySavedAt &&
    !document.stagedBasic &&
    !document.basic &&
    !document.presets &&
    !document.images &&
    !document.finalizeAutoRequestId;
  return eligible ? { ...document, finalizeRatingWorkingCopyAt: stagedAt } : document;
}

export function CommonCreationWorkspace({
  repository,
  storyId,
  guardDraftLeave = false,
  onBack,
  initialSection,
  onOpenEditor,
  onDeleted,
  isRouteFocused,
}: {
  repository: CommonSaveRepository;
  storyId: string;
  /** 스택 뒤로 가기로 제거될 수 있으면 작성 중 스토리의 미저장 편집도 이탈 확인을 거친다. */
  guardDraftLeave?: boolean;
  /** 있으면 머리글에 뒤로 가기 버튼을 보인다. 미저장 확인은 여기서 하고, 확정 뒤 가드를 끈 다음 부른다. */
  onBack?: () => void;
  /** CREATE-US-12 처음 보일 구역. 없으면 말투·서술. */
  initialSection?: SceneSection;
  /**
   * CREATE-US-12 기본 설정·유저 프로필 탭을 눌렀을 때 그 구역을 실어 편집 화면으로 넘긴다. 라우트가 이동을 맡는다.
   * 저장하지 않은 변경·작성 중 말풍선·저장 중·재시도 대기가 있으면 부르지 않고 안내한다(저장을 대신 보내지 않는다).
   */
  onOpenEditor?: (section: EditorSection) => void;
  /** 공개 범위 탭에서 스토리를 삭제한 뒤 부른다. 이탈 확인을 먼저 끈 다음 부른다. */
  onDeleted?: () => void;
  /**
   * 이 화면이 지금 포커스된 라우트인지. 삭제 응답이 늦게 와 그 사이 다른 화면으로 옮겼으면 onDeleted로 이동하지 않는다
   * (목록 캐시 정리와 삭제됨 안내는 그대로 남는다). 넘기지 않으면 항상 포커스된 것으로 본다.
   */
  isRouteFocused?: () => boolean;
}) {
  const c = useTheme();
  const [section, setSection] = useState<SceneSection>(initialSection ?? 'speech'),
    [loaded, setLoaded] = useState<CommonSaveDocument | null>(null);
  // CREATE-US-08-AC09 고른 등급과 그 비교 기준(조회·저장 응답의 requested, 없으면 SAFE). 다를 때만 requestedRating으로 싣는다.
  const [rating, setRating] = useState<ContentRating | null>(null),
    [savedRating, setSavedRating] = useState<ContentRating | null>(null);
  const [refreshStatus, setRefreshStatus] = useState<ContentRatingSectionProps['refreshStatus']>('idle');
  const refreshAbort = useRef<AbortController | null>(null);
  useEffect(() => () => refreshAbort.current?.abort(), []);
  const [speech, setSpeech] = useState<Expression | null>(null),
    [target, setTarget] = useState<CreationSaveState>('draft');
  const [fewPending, setFewPending] = useState<PendingInput>(idle);
  const [introPending, setIntroPending] = useState<PendingInput>(idle);
  // 저장 응답이 올 때 "지금" 작성 중인 말풍선이 있는지 본다. 저장을 보낸 시점에 잡아 둔 상태가 아니라 최신 값을 읽도록 ref로 둔다.
  const fewPendingRef = useRef<PendingInput>(idle),
    introPendingRef = useRef<PendingInput>(idle);
  const onFewPending = useCallback((value: PendingInput) => {
    fewPendingRef.current = value;
    setFewPending(value);
  }, []);
  const onIntroPending = useCallback((value: PendingInput) => {
    introPendingRef.current = value;
    setIntroPending(value);
  }, []);
  // raw*는 저장된 상태 값이다. 화면·저장·비교는 아래에서 최신 발화자 목록으로 거른 값(intros 등)만 쓴다.
  const [rawIntros, setIntros] = useState<IntroItem[]>([]),
    [rawSavedIntros, setSavedIntros] = useState<IntroItem[]>([]);
  const [rawRelations, setRelations] = useState<InitialRelation[]>([]),
    [rawSavedRelations, setSavedRelations] = useState<InitialRelation[]>([]);
  const [rawAffinities, setAffinities] = useState<InitialAffinity[]>([]),
    [rawSavedAffinities, setSavedAffinities] = useState<InitialAffinity[]>([]);
  // CREATE-US-04·12 초기 상태 탭에서 장면을 편집할 인트로(clientKey). 인트로 본문 편집의 「초기 상태 설정하기」가
  // 같은 갱신에서 탭과 함께 바꾸므로 이전 선택이 한 번 그려지지 않는다. null이면 첫 번째(기본) 인트로.
  const [stateIntroKey, setStateIntroKey] = useState<string | null>(null);
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
          const requested = data.rating?.requested ?? DEFAULT_CONTENT_RATING;
          setRating(requested);
          setSavedRating(requested);
          // 다시 불러오면 초기 상태 탭은 이전처럼 첫 번째(기본) 인트로부터 보인다.
          setStateIntroKey(null);
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
  // 머리글 제목·상태는 불러오기 전에도 편집 화면과 같게 보이도록 스토리 조회 캐시를 함께 본다.
  const story = useStory(storyId);
  const characters = few.snapshot?.characters;
  // 발화자 목록이 바뀐 렌더에서 바로 정리한다(이펙트를 거치면 한 번 오래된 목록으로 그려진다).
  const [prunedFor, setPrunedFor] = useState(characters);
  if (prunedFor !== characters) {
    setPrunedFor(characters);
    // 캐릭터 이름 변경은 이름표에만 반영되고, 삭제된 인물의 인트로 말풍선·착장·속마음과
    // 그 인물이 출발/도착인 관계·호감도만 제거한다. 저장본에도 같게 적용해 변경으로 보지 않는다.
    if (characters) {
      setIntros((value) => removeMissingFromIntros(value, characters));
      setSavedIntros((value) => removeMissingFromIntros(value, characters));
      setRelations((value) => removeMissingFromRelations(value, characters));
      setSavedRelations((value) => removeMissingFromRelations(value, characters));
      setAffinities((value) => removeMissingFromAffinities(value, characters));
      setSavedAffinities((value) => removeMissingFromAffinities(value, characters));
    }
  }
  // 위 정리는 상태를 영구히 고치지만, 정리보다 먼저 예약된(우선순위가 낮은) 갱신이 뒤에 적용되면 삭제된 인물이 되살아날 수 있다.
  // 그래서 매 렌더 최신 목록으로 한 번 더 거른다. 입력이 같으면 같은 참조를 돌려줘 하위 메모·이펙트가 반복되지 않는다.
  const intros = useMemo(
    () => (characters ? removeMissingFromIntros(rawIntros, characters) : rawIntros),
    [rawIntros, characters],
  );
  const savedIntros = useMemo(
    () => (characters ? removeMissingFromIntros(rawSavedIntros, characters) : rawSavedIntros),
    [rawSavedIntros, characters],
  );
  const relations = useMemo(
    () => (characters ? removeMissingFromRelations(rawRelations, characters) : rawRelations),
    [rawRelations, characters],
  );
  const savedRelations = useMemo(
    () => (characters ? removeMissingFromRelations(rawSavedRelations, characters) : rawSavedRelations),
    [rawSavedRelations, characters],
  );
  const affinities = useMemo(
    () => (characters ? removeMissingFromAffinities(rawAffinities, characters) : rawAffinities),
    [rawAffinities, characters],
  );
  const savedAffinities = useMemo(
    () => (characters ? removeMissingFromAffinities(rawSavedAffinities, characters) : rawSavedAffinities),
    [rawSavedAffinities, characters],
  );
  const pendingInput: PendingInput = {
    active: fewPending.active || introPending.active,
    lengthDelta: 0,
  };
  // 2~4번(장면) 변경과 등급 변경을 따로 본다. 장면이 그대로면 저장에 preserveScene을 실어 서버가 최신 장면을 유지하게 한다
  // (등급만 바꾼 저장이 이 화면이 불러온 오래된 장면을 정본처럼 보내지 않게).
  const sceneDirty =
    few.dirty ||
    (!!loaded && JSON.stringify(speech) !== JSON.stringify(loaded.speech)) ||
    JSON.stringify(intros) !== JSON.stringify(savedIntros) ||
    JSON.stringify(relations) !== JSON.stringify(savedRelations) ||
    // 호감도는 값을 바꾸면 행이 끝으로 옮겨지므로 순서와 무관하게 비교한다.
    !sameAffinities(affinities, savedAffinities);
  const ratingDirty = rating !== null && savedRating !== null && rating !== savedRating;
  const document: CommonSaveDocument | null =
    few.snapshot && speech
      ? {
          ...withoutForeignAreas(few.snapshot),
          speech,
          fewshots: few.groups,
          intros,
          relations,
          affinities,
          // 바뀐 등급만 싣는다. 빠지면 서버가 기존 선택(다른 화면에서 저장한 값 포함)을 유지한다.
          requestedRating: ratingDirty ? rating : null,
          ...(sceneDirty ? {} : { preserveScene: true }),
        }
      : null;
  const dirty = sceneDirty || ratingDirty;
  // 등급만 담긴 임시 저장본 반영 토큰은 직접 「저장」에만 붙인다(자동·직접 임시 저장은 그대로 임시 저장).
  const saveRepository = useMemo<CommonSaveRepository>(
    () => ({
      load: (id, signal) => repository.load(id, signal),
      save: (doc, state, mode, requestId, kind) =>
        repository.save(withRatingFinalize(doc, state, mode, kind), state, mode, requestId, kind),
    }),
    [repository],
  );
  const common = useCommonSave(saveRepository, {
    storyId,
    document,
    dirty,
    loading: few.loading,
    pendingInput: pendingInput.active,
    captureCommit: () => {
      const commitFew = few.captureCommit();
      // 저장을 보낼 때의 선택. 응답이 올 때 지금 선택이 이와 같으면 서버 값을 따르고, 다르면(저장 중 다시 고름) 남긴다.
      const captured = rating;
      return (result, submitted) => {
        // 실제로 보낸 묶음과 비교해, 저장 중 손대지 않았으면 응답의 (더 새) 예시를 따른다.
        // 다만 저장 중 예시를 열어 말풍선을 입력 중이면 묶음이 그대로여도 서버 묶음을 따르지 않는다
        // (서버가 그 예시를 지운 응답이면 작성 중 입력이 사라진다). 이때는 지금 입력을 두고 발급 ID만 합친다.
        commitFew(result as FewshotsDocument, fewPendingRef.current.active ? undefined : submitted.fewshots);
        // 저장소(CommonSaveRepository)의 응답이라 등급(rating)을 담고 있다.
        const response = result as CommonSaveDocument;
        setLoaded(response);
        // 응답의 requested가 새 비교 기준이다(등급을 빼고 보냈어도 다른 화면의 선택이 반영돼 있을 수 있다).
        // 응답에 등급이 없으면(이전 서버) 보낸 등급만 기준으로 삼는다.
        const sent = (submitted as CommonSaveDocument).requestedRating ?? null;
        const saved = response.rating ? (response.rating.requested ?? DEFAULT_CONTENT_RATING) : sent;
        if (saved !== null) {
          setSavedRating(saved);
          setRating((current) => (current === captured ? saved : current));
        }
        setSpeech((current) =>
          JSON.stringify(current) === JSON.stringify(submitted.speech) ? result.speech : current,
        );
        // 보낸 값 그대로면(저장 중 손대지 않음) 서버 값을 따른다. 장면을 보존한 저장(preserveScene)은 응답에
        // 보낸 것보다 새 정본 장면이 올 수 있어, 비교 기준만 바꾸면 손대지 않은 입력이 변경으로 보인다.
        // 저장 중 바뀐 인트로 입력·순서는 유지하고 새로 발급된 ID만 합친다.
        setSavedIntros(result.intros);
        // 인트로 본문 편집기도 같은 작성 중 말풍선을 쓰므로, 입력 중이면 서버 목록을 따르지 않는다.
        setIntros((current) =>
          !introPendingRef.current.active && JSON.stringify(current) === JSON.stringify(submitted.intros)
            ? result.intros
            : applyAllocatedIds(current, result.intros),
        );
        // 관계·호감도는 ID 없이 전체 교체한다. 저장 중 바뀐 입력은 그대로 남아 변경으로 표시된다.
        setSavedRelations(result.relations);
        setRelations((current) =>
          JSON.stringify(current) === JSON.stringify(submitted.relations) ? result.relations : current,
        );
        setSavedAffinities(result.affinities);
        setAffinities((current) =>
          JSON.stringify(current) === JSON.stringify(submitted.affinities) ? result.affinities : current,
        );
      };
    },
  });
  const completed = !!few.snapshot && few.snapshot.saveState !== 'draft';
  const committedState = few.snapshot?.saveState ?? 'draft';
  const visibilityChanged = !!few.snapshot && target !== committedState;
  const guarded =
    visibilityChanged ||
    (!!few.snapshot && (completed || guardDraftLeave) && (dirty || pendingInput.active || common.pendingSave));
  // 머리글 뒤로 가기에서 나가기를 확정했다. 가드를 먼저 끈 뒤(다음 커밋) onBack으로 화면을 닫는다.
  const [leaving, setLeaving] = useState(false);
  // 확인 창에서 넘기기를 확정한 요청. 누를 때마다 새 객체라 같은 구역도 다시 넘길 수 있다.
  const [handoff, setHandoff] = useState<{ section: 'basic' | 'profile' } | null>(null);
  const handedOff = useRef<typeof handoff>(null);
  // 삭제 성공도 의도한 이동이다. 가드를 먼저 끈 뒤(다음 커밋) onDeleted로 화면을 닫는다.
  const [deleted, setDeleted] = useState(false);
  // 늦게 온 삭제 성공의 이동 판단 기준(편집 화면과 같다): 구역 탭을 오가며 삭제 구역이 내려가도 이 화면이 남아 있으면 마운트로 본다.
  const hostMounted = useRef(true);
  useEffect(() => {
    hostMounted.current = true;
    return () => {
      hostMounted.current = false;
    };
  }, []);
  // 넘기기 확정 시 고른 공개 범위를 저장된 값으로 되돌려 가드가 꺼진 커밋 뒤에 한 번만 넘긴다.
  useUnsavedCreationGuard(guarded && !leaving && !deleted);
  useEffect(() => {
    if (handoff === null || handedOff.current === handoff) return;
    handedOff.current = handoff;
    onOpenEditor?.(handoff.section);
  }, [handoff, onOpenEditor]);
  useEffect(() => {
    if (leaving) onBack?.();
    // 한 번만 닫는다. onBack 참조가 바뀌어도 다시 부르지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);
  // 삭제 뒤 화면을 닫는 이동은 한 번만 한다(자동 이동 또는 머리글 뒤로 가기 중 먼저 일어난 쪽).
  const deletedExited = useRef(false);
  const exitDeleted = () => {
    if (deletedExited.current) return;
    deletedExited.current = true;
    if (onDeleted) onDeleted();
    else onBack?.();
  };
  useEffect(() => {
    // 응답이 늦어 그 사이 다른 화면으로 옮겼으면 이동하지 않는다(다른 화면의 사용자를 목록으로 보내지 않게).
    // 목록 캐시 정리(useDeleteStory)와 목록 삭제 안내(StoryDeleteSection)는 이미 끝났으므로 그대로 남는다.
    // 이때는 돌아온 뒤 머리글 뒤로 가기로 나간다.
    if (deleted && onDeleted && (isRouteFocused?.() ?? true)) exitDeleted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleted]);
  // CREATE-US-12 편집 화면 구역으로 넘기지 못한 이유. 다른 탭을 누르거나 넘기면 지운다.
  const [sectionNotice, setSectionNotice] = useState<string | null>(null);
  // 삭제 요청 중(또는 삭제 직후 onDeleted 이동 전)에는 이 화면을 떠나는 이동을 막는다.
  // 같은 틱의 누름도 판단하도록 렌더된 상태가 아니라 지금 잠금 상태(peek)를 본다.
  const writeLock = useStoryWriteLock(storyId);
  const blockedByDelete = () => {
    const status = writeLock.peek();
    if (status === 'delete') setSectionNotice(DELETING_MESSAGE);
    return status === 'delete' || status === 'deleted';
  };
  const back = onBack
    ? () => {
        // 삭제가 끝난 화면은 삭제 잠금과 관계없이 머리글 뒤로 가기로 나갈 수 있다.
        if (deleted) {
          exitDeleted();
          return;
        }
        if (leaving || blockedByDelete()) return;
        if (guarded) confirmUnsavedLeave(() => setLeaving(true));
        else onBack();
      }
    : undefined;
  const issues = document ? completionIssues(document) : [];
  // 되돌릴 수 없는 저장 상태를 골랐다(비공개·공개 → 미등록, 공개 → 비공개). 저장 버튼이 막힌다.
  const irreversible =
    (completed && target === 'draft') || (few.snapshot?.saveState === 'public' && target === 'private');
  // 직접 저장이 진행 중이거나 기다리는 중. 자동 임시 저장만 진행 중일 때는 저장 버튼을 막지 않고, 누르면 이어서 저장한다.
  // 검토 상태 새로고침 중에는 같은 스토리 쓰기 잠금을 쥐므로 저장도 막아 둔다.
  const refreshing = refreshStatus === 'loading';
  const manualBusy = (common.saving && !common.autoSaving) || common.waiting || refreshing;
  /**
   * CREATE-US-08-AC09·AC12 검토 상태만 한 번 다시 조회한다(입력·고른 등급·나머지 조회 값은 그대로).
   * 같은 스토리 쓰기 잠금을 쥐어 이 화면·다른 화면의 저장과 겹치지 않게 하고, 그사이 화면 문서가 바뀌었으면(다시 불러오기) 버린다.
   */
  const refreshReview = async () => {
    const start = loaded;
    if (!start || refreshing) return;
    const release = writeLock.acquire('save');
    if (!release) return;
    const controller = new AbortController();
    refreshAbort.current = controller;
    setRefreshStatus('loading');
    try {
      const fresh = await repository.load(storyId, controller.signal);
      if (controller.signal.aborted) return;
      const review = fresh.rating;
      if (review)
        setLoaded((current) =>
          current === start
            ? { ...current, rating: { ...review, requested: current.rating?.requested ?? review.requested } }
            : current,
        );
      setRefreshStatus('idle');
    } catch {
      if (!controller.signal.aborted) setRefreshStatus('failed');
    } finally {
      release();
    }
  };
  /**
   * CREATE-US-12 탭 누름. 이 화면이 맡는 구역은 지금처럼 확정된 변경을 자동 임시 저장하고 바꾼다.
   * 기본 설정·유저 프로필은 편집 화면 몫이라 저장된 그대로일 때만 onOpenEditor로 넘긴다(저장을 대신 보내지 않음).
   * 이 화면의 구역으로 바꿨으면 true를 돌려준다.
   */
  const changeTab = (index: number): boolean => {
    const next = sectionAt(index);
    if (!next) return false;
    if (next.owner === 'editor') {
      if (blockedByDelete()) return false;
      if (!onOpenEditor) {
        setSectionNotice(`${next.label} 탭은 기본 설정 편집 화면에서 편집해요.`);
        return false;
      }
      if (few.loading || !few.snapshot) {
        setSectionNotice(EDITOR_LOADING_MESSAGE);
        return false;
      }
      if (common.saving || common.waiting || refreshing) {
        setSectionNotice(sectionBusyMessage(next.label));
        return false;
      }
      if (dirty || pendingInput.active || common.pendingSave) {
        setSectionNotice(sectionDirtyMessage(next.label, EDITOR_SAVE_HINT));
        return false;
      }
      setSectionNotice(null);
      if (visibilityChanged) {
        const destination = next.key;
        confirmUnsavedLeave(() => {
          setTarget(committedState);
          setHandoff({ section: destination });
        });
        return false;
      }
      onOpenEditor(next.key);
      return false;
    }
    setSectionNotice(null);
    // 탭을 바꾸면 확정된 변경을 임시 저장한다. 비공개·공개 스토리는 임시 저장본에만 남는다.
    if (next.key !== section) void common.save(committedState, 'auto');
    setSection(next.key);
    return true;
  };
  /**
   * CREATE-US-12 인트로 본문 편집 하단 상태창의 「초기 상태 설정하기」. 탭을 누른 것과 같이 옮기고(확정된 변경 자동 임시 저장),
   * 옮겼을 때만 그 인트로를 초기 상태 탭의 편집 대상으로 고른다. 칩으로 고른 선택은 이때만 바뀐다.
   */
  const openStateFor = (introKey: string): boolean => {
    if (!changeTab(sectionIndex('state'))) return false;
    setStateIntroKey(introKey);
    return true;
  };
  // CREATE-US-12 목업 renderExample(intro): 인트로 본문 편집은 탭 머리글·하단 저장 줄 없이 전체 화면으로 연다.
  // 편집기 안의 「인트로 목록으로」로 돌아오면 다시 보인다. 오류·재시도 안내는 그대로 위에 남긴다.
  const [introEditing, setIntroEditing] = useState(false);
  // 말투·서술 탭의 상황 예시 편집(대화 편집기)도 같은 전체 화면으로 연다. 「확인」·「예시 목록으로」로 돌아오면 다시 보인다.
  const [exampleEditing, setExampleEditing] = useState(false);
  const fullScreen = (section === 'intro' && introEditing) || (section === 'speech' && exampleEditing);
  const title = few.snapshot?.title ?? story.data?.title ?? '제작';
  const badge = few.snapshot ? SAVE_STATE_LABEL[few.snapshot.saveState] : story.data?.saveState;
  const statusMessage = common.waiting
    ? '자동 임시 저장이 끝나면 이어서 저장합니다.'
    : common.saving
      ? '공통 저장 중입니다.'
      : dirty || pendingInput.active
        ? '저장하지 않은 변경이 있습니다.'
        : completed && (loaded?.workingCopySavedAt || loaded?.imagesWorkingCopySavedAt)
          ? '임시 저장한 내용과 같습니다.'
          : '저장한 설정과 같습니다.';
  return (
    <Surface style={styles.screen}>
      {/* CREATE-US-12 편집 화면과 같은 머리글·6개 탭 */}
      {fullScreen ? (
        <SafeAreaView edges={['top']} />
      ) : (
        <EditorHeader
          title={title}
          onBack={back}
          backLabel="목록으로 돌아가기"
          badge={badge}
          status={saveStatusLine(completed)}
          tabs={CREATION_TAB_LABELS}
          activeIndex={sectionIndex(section)}
          onTabChange={changeTab}
        />
      )}
      {/* 상태 안내도 본문과 같은 좌우 여백을 둔다(화면 가장자리에 붙지 않게). */}
      <View style={[styles.status, fullScreen && styles.statusCollapsed]}>
        {sectionNotice ? <Notice tone="alert" message={sectionNotice} /> : null}
        {section === 'visibility' && visibilityChanged ? (
          <Notice
            message={`고른 저장 상태는 아직 반영되지 않았어요. 「${SAVE_STATE_LABEL[target]}로 저장」을 눌러야 바뀌고, 임시 저장은 저장 상태를 바꾸지 않아요.`}
          />
        ) : null}
        {few.loading ? <Text accessibilityRole="progressbar">제작 설정을 불러오는 중입니다.</Text> : null}
        {few.error ? <Notice tone="alert" message={few.error} /> : null}
        {common.error ? <Notice tone="alert" message={common.error} /> : null}
        {/* 임시 저장본 안내는 저장 줄과 함께 보이는 정보라 전체 화면 편집 중에는 숨긴다(목록으로 돌아오면 다시 보인다). */}
        {!fullScreen && completed && loaded?.workingCopySavedAt ? (
          <Notice
            message={`임시 저장한 내용이에요(${new Date(loaded.workingCopySavedAt).toLocaleString('ko-KR')}). 이용자는 아직 이전에 저장한 내용을 봐요. 저장을 눌러야 반영돼요.`}
          />
        ) : null}
        {!fullScreen && completed && loaded?.imagesWorkingCopySavedAt ? (
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
        {fullScreen ? null : (
          <>
            <Text variant="caption" accessibilityLiveRegion="polite">
              {statusMessage}
            </Text>
            {few.snapshot ? (
              <Text variant="caption">마지막 저장: {new Date(few.snapshot.updatedAt).toLocaleString('ko-KR')}</Text>
            ) : null}
          </>
        )}
      </View>
      {/* CREATE-US-12 말투·서술 탭: 표현 설정 아래에 대화 예시(퓨샷) 목록을 같은 스크롤로 붙인다 */}
      <View style={[styles.screen, section !== 'speech' && styles.hidden]}>
        <FewshotEditorView
          key={loadCycle}
          editor={few}
          hideHeader
          hideSaveControls
          onPendingChange={onFewPending}
          onEditingChange={setExampleEditing}
          header={speech && !few.loading ? <ExpressionSettings value={speech} onChange={setSpeech} /> : null}
        />
      </View>
      <View style={[styles.screen, section !== 'intro' && styles.hidden]}>
        {few.snapshot && !few.loading ? (
          <IntroEditorView
            key={loadCycle}
            intros={intros}
            setIntros={setIntros}
            characters={few.snapshot.characters}
            onPendingChange={onIntroPending}
            onEditingChange={setIntroEditing}
            onOpenState={openStateFor}
          />
        ) : null}
      </View>
      <View style={[styles.screen, section !== 'state' && styles.hidden]}>
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
            onAddIntro={() => setSection('intro')}
            selected={stateIntroKey}
            onSelect={setStateIntroKey}
          />
        ) : null}
      </View>
      <ScrollView
        style={[styles.screen, section !== 'visibility' && styles.hidden]}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* CREATE-US-12 목업 visibility(): 「어떻게 보관할까요?」 구역 카드 · 저장 상태 선택 · 고른 상태 설명 */}
        <Card tone="section" style={styles.sectionCard}>
          <Text variant="heading" accessibilityRole="header">
            어떻게 보관할까요?
          </Text>
          <Text variant="caption">작성 중인 내용과 완성된 스토리를 구분해요.</Text>
          <Text variant="caption" color="text" style={styles.label}>
            저장 상태
          </Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="저장 상태" style={styles.stateRow}>
            {SAVE_TARGETS.map((value) => {
              const chosen = value === target;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityLabel={TARGET_LABEL[value]}
                  accessibilityState={{ checked: chosen }}
                  aria-checked={chosen}
                  onPress={() => {
                    if (!manualBusy && !common.pendingSave) setTarget(value);
                  }}
                  style={[
                    styles.stateOption,
                    chosen
                      ? { backgroundColor: c.actionFill, borderColor: c.actionBorder }
                      : { backgroundColor: c.surface, borderColor: c.surfaceBorder },
                  ]}
                >
                  <Text variant="caption" style={[styles.stateName, { color: chosen ? c.selectedText : c.chipText }]}>
                    {TARGET_LABEL[value]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {/* 목업 .item: 고른 상태 이름과 한 줄 설명 */}
          <Card tone="item" style={styles.selected} accessibilityLabel={`${TARGET_LABEL[target]} 설명`}>
            <Text variant="subheading">{TARGET_LABEL[target]}</Text>
            <Text variant="caption">{TARGET_DESCRIPTION[target]}</Text>
          </Card>
          {/* 목업 .hint 한 줄. 되돌릴 수 없는 상태를 고르면 같은 문구를 경고로 바꿔 저장이 막힌 이유를 보인다. */}
          {irreversible ? (
            <Notice tone="alert" message={RESTRICTION_MESSAGE} />
          ) : (
            <Text variant="caption">{RESTRICTION_MESSAGE}</Text>
          )}
          {target !== 'draft' ? issues.map((message) => <Notice key={message} tone="alert" message={message} />) : null}
          {pendingInput.active ? (
            <Notice tone="alert" message="작성 중인 말풍선을 추가하거나 수정 완료·취소해야 저장할 수 있어요." />
          ) : null}
        </Card>
        {/* CREATE-US-08-AC09 콘텐츠 등급 선택과 API의 적용 등급·검토 상태·사유·대상. 저장은 하단 저장 버튼이 함께 맡는다. */}
        {loaded ? (
          <Card tone="section" style={styles.sectionCard}>
            <ContentRatingSection
              visibility={SAVE_STATE_LABEL[committedState]}
              selected={rating}
              onSelect={setRating}
              disabled={manualBusy || common.pendingSave || few.loading || rating === null}
              applied={loaded.rating?.effective ?? null}
              reviewStatus={loaded.rating?.reviewStatus ?? null}
              feedback={formatRatingReviewFeedback(loaded.rating)}
              refreshStatus={refreshStatus}
              onRefresh={() => void refreshReview()}
              refreshDisabled={common.saving || common.pendingSave || few.loading}
            />
          </Card>
        ) : null}
        {/* 다시 불러오기는 목업에 없지만 기존 동작이라 보조 버튼 하나로 둔다. 안내는 확인 단계에서만 보인다. */}
        <View style={styles.confirm}>
          <Button
            label="최신 편집 내용 다시 불러오기"
            variant="secondary"
            disabled={common.saving || common.pendingSave || few.loading || refreshing}
            onPress={() =>
              dirty || pendingInput.active || visibilityChanged ? setConfirmReload(true) : void few.reload()
            }
          />
          {confirmReload ? (
            <>
              <Notice tone="alert" message="저장하지 않은 변경 내용이 사라집니다." />
              <View style={styles.confirmActions}>
                <Button label="변경 유지" variant="secondary" onPress={() => setConfirmReload(false)} />
                <Button
                  label="변경 버리고 최신 편집 내용 불러오기"
                  variant="danger"
                  // 저장이 진행 중이거나 재시도를 기다리는 동안 다시 불러오면 늦게 도착한 조회가 저장 결과를 덮을 수 있다.
                  disabled={common.saving || common.pendingSave || few.loading}
                  onPress={() => {
                    setConfirmReload(false);
                    void few.reload();
                  }}
                />
              </View>
            </>
          ) : null}
        </View>
        {/* CREATE-US-07-AC10·12 공개 범위 탭의 스토리 삭제 (목업 「스토리 삭제」 구역) */}
        <Card tone="section" style={styles.sectionCard}>
          <StoryDeleteSection
            storyId={storyId}
            storyTitle={title}
            onDeleted={() => setDeleted(true)}
            isHostMounted={() => hostMounted.current}
          />
        </Card>
      </ScrollView>
      {/*
        CREATE-US-12 하단 고정 저장 줄. 다른 탭은 임시 저장, 공개 범위 탭은 목업 .bottom처럼 고른 저장 상태로 저장한다.
        실패한 공통 저장은 재시도만 둔다.
      */}
      {fullScreen ? null : (
        <StickyFooter>
          {section !== 'visibility' ? (
            <Button
              label="임시 저장"
              variant="action"
              disabled={manualBusy || few.loading || !document || pendingInput.active || common.pendingSave}
              onPress={() => void common.save(committedState, 'manual', 'temporary')}
            />
          ) : common.pendingSave ? (
            <Button
              label="공통 저장 재시도"
              variant="action"
              disabled={common.saving || few.loading || !document}
              onPress={() => void common.save(target)}
            />
          ) : (
            [
              <Button
                key="temporary"
                label="임시 저장"
                variant="secondary"
                disabled={manualBusy || few.loading || !document || pendingInput.active}
                onPress={() => void common.save(committedState, 'manual', 'temporary')}
              />,
              <Button
                key="save"
                label={target === 'draft' ? '저장' : target === 'private' ? '비공개로 저장' : '공개로 저장'}
                variant="action"
                disabled={
                  manualBusy ||
                  few.loading ||
                  !document ||
                  pendingInput.active ||
                  (target !== 'draft' && issues.length > 0) ||
                  irreversible
                }
                onPress={() => void common.save(target, 'manual', 'save')}
              />,
            ]
          )}
        </StickyFooter>
      )}
    </Surface>
  );
}
/** 목업 visibility()의 .hint: 저장 상태 전환 제한(한 줄). 화면 글자는 기존 용어(미등록)를 쓴다. */
const RESTRICTION_MESSAGE = '공개 후에는 비공개로, 완성 저장 후에는 미등록으로 바꿀 수 없어요.';
/** 공개 범위 탭의 저장 상태 선택지와 설명(목업 visibility()). 화면 글자는 기존 용어(미등록)를 쓴다. */
const SAVE_TARGETS = ['draft', 'private', 'public'] as const;
const TARGET_LABEL: Record<CreationSaveState, string> = { draft: '미등록', private: '비공개', public: '공개' };
const TARGET_DESCRIPTION: Record<CreationSaveState, string> = {
  draft: '미완성 내용을 보관해요. 다른 이용자에게 공개하지 않아요.',
  private: '완성된 스토리를 나만 사용할 수 있어요.',
  public: '다른 이용자에게 공개하는 완성 상태예요.',
};
const styles = StyleSheet.create({
  screen: { flex: 1 },
  hidden: { display: 'none' },
  content: {
    paddingTop: ContentInset.top,
    paddingHorizontal: ContentInset.horizontal,
    paddingBottom: ContentInset.bottom,
    gap: Spacing.three,
  },
  status: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.one },
  // 전체 화면 편집에서는 안내가 있을 때만 자리를 차지한다.
  statusCollapsed: { paddingTop: 0 },
  sectionCard: { gap: Spacing.two, marginBottom: 0 },
  label: { fontWeight: '600', marginTop: Spacing.two },
  stateRow: { flexDirection: 'row', gap: Spacing.two },
  stateOption: {
    flex: 1,
    minHeight: MinTouchSize,
    borderWidth: 1,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateName: { fontWeight: '600' },
  selected: { gap: Spacing.one, marginVertical: Spacing.one },
  confirm: { gap: Spacing.two },
  confirmActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
