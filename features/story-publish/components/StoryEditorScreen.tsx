import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  EditorHeader,
  Notice,
  ScreenHeader,
  Section,
  StickyFooter,
  Surface,
  Text,
} from '@/components/ui';
import { ContentInset, Spacing } from '@/constants/theme';
import { ApiError, type FieldIssue } from '@/lib/api-client';
import { fromImageDto, type MediaImage } from '@/shared/media';
import type { CreationSaveKind } from '@/shared/story-types';
import {
  BasicInfoForm,
  StoryImagesEditor,
  UserProfilePresetEditor,
  fromDraft,
  mergeCharacters,
  requiredImageMessage,
  sameImages,
  toDraftPatch,
  toImagesPatch,
  type BasicInfoValues,
  type StoryImagesValues,
} from '@/features/story-setup';

import { toAppIssues } from '../api';
import {
  CREATION_TAB_LABELS,
  saveStatusLine,
  sectionAt,
  sectionBusyMessage,
  sectionDirtyMessage,
  sectionIndex,
  type EditorSection,
  type SceneSection,
} from '../creationSections';
import { applySavedIds, currentBasicIssues, toFieldErrors } from '../formSync';
import { useSaveFlow } from '../hooks/useSaveFlow';
import { storyImagesKey, useSaveStoryImages, useStoryImages } from '../hooks/useStoryImages';
import { storyKeys, useSaveStoryBasic, useStory } from '../hooks/useStories';
import { isUncertain, useStoryPresets, type PresetSaveResult } from '../hooks/useStoryPresets';
import { useStoryWriteLock, writeBlockedMessage } from '../hooks/useStoryWriteLock';
import type {
  CommonSaveDocument,
  CreationCharacterImagesPayload,
  CreationImagesPayload,
  StagedBasicFields,
} from '../commonRepository';
import {
  newImagesRequestKey,
  type StoryImagesSaveKind,
  type StoryImagesSaveMode,
  type StoryImagesSnapshot,
} from '../imagesRepository';
import { formatSavedAt } from '../savedAt';
import type { EditorStory, StoryBasicFields } from '../types';

import { StoryDeleteSection } from './StoryDeleteSection';

/**
 * CREATE-US-12 목업 v15 제작 탭 구성(creationSections). 이 화면은 기본 설정·유저 프로필을 맡고,
 * 나머지 구역(말투·서술·인트로·초기 상태·공개 범위)은 라우트가 넘긴 onOpenScene으로 작업 화면에 넘긴다.
 */
const TABS = CREATION_TAB_LABELS;
/** 스토리 삭제(CREATE-US-07-AC10) 진입점이 있는 탭. 넘기기가 없을 때(단독 사용)만 이 화면이 그린다. */
const PUBLISH_TAB = sectionIndex('visibility');
/** 사진 편집기에서 아직 id가 없는 새 캐릭터 목록을 구분하는 접두사(서버 캐릭터 id와 겹치지 않음). */
const NEW_CHARACTER = 'new:';
const UPLOAD_WAIT_MESSAGE = '이미지를 올리는 중이에요. 업로드가 끝나면 저장하거나 다른 탭으로 이동할 수 있어요.';
/** CREATE-US-07-AC09 자동 임시 저장 주기 (2~4번 작업 화면의 자동 저장과 같다) */
const AUTO_SAVE_INTERVAL_MS = 60000;
const AUTO_SAVING_MESSAGE = '자동 임시 저장 중…';
/** 자동 임시 저장 직전 최신 문서의 임시 저장본 기본 정보가 이 화면이 알던 것과 다를 때(다른 곳에서 임시 저장) */
const STAGED_BASIC_CONFLICT_MESSAGE =
  '다른 곳에서 기본 정보가 임시 저장돼 자동 임시 저장하지 않았어요. 입력은 그대로예요. 화면을 다시 연 뒤 확인해 주세요.';
const QUEUED_SAVE_MESSAGE = '자동 임시 저장이 끝나면 이어서 저장해요.';
const QUEUED_SAVE_HELD_MESSAGE =
  '자동 임시 저장 결과를 확인하지 못해 누른 저장은 보내지 않았어요. 입력은 그대로예요. 같은 임시 저장을 먼저 다시 시도한 뒤 저장해 주세요.';

const AUTO_IMAGES_FAILED_MESSAGE = '사진을 자동 임시 저장하지 못했어요. 입력은 그대로예요.';
const AUTO_IMAGES_HELD_MESSAGE =
  '사진 자동 임시 저장 결과를 확인하지 못했어요. 입력은 그대로예요. 같은 내용을 두 번 보내지 않도록 사진 저장을 멈췄어요. 「사진 임시 저장 다시 시도」로 같은 요청을 다시 보내 주세요.';
/** 성패를 모르는 사진 자동 임시 저장이 남아 있어 사진을 함께 쓰는 저장(기본 저장·사진만 다시 저장)을 보내지 않았다 */
const IMAGES_PENDING_BLOCKED_MESSAGE =
  '사진 자동 임시 저장 결과를 아직 확인하지 못해 저장하지 않았어요. 입력은 그대로예요. 「사진 임시 저장 다시 시도」로 먼저 확인해 주세요.';
const IMAGES_RELOAD_FAILED_MESSAGE =
  '사진 임시 저장은 확인했지만 최신 사진 목록을 불러오지 못했어요. 입력은 그대로예요. 이미지 목록을 다시 불러와 확인해 주세요.';
const IMAGES_RETRY_LABEL = '사진 임시 저장 다시 시도';

/** 성패를 모르는 사진 자동 임시 저장 요청. 다시 보낼 때 지금 입력이 아니라 이 본문·kind·요청키를 그대로 쓴다. */
type PendingImagesSave = {
  patch: ReturnType<typeof toImagesPatch>;
  kind: StoryImagesSaveKind;
  key: string;
  /** CREATE-US-07-AC09 마무리 opt-in 표시. 같은 키로 다시 보낼 때도 처음 본문 그대로 싣는다. */
  mode?: StoryImagesSaveMode;
  /** JSON.stringify(patch). 다시 보낸 뒤 지금 입력이 보낸 내용 그대로인지 비교한다. */
  signature: string;
};

/** 자동 임시 저장 중에 누른 직접 저장 버튼. main은 하단 기본 저장 버튼, temporary는 유저 프로필 탭의 「임시 저장」. */
type SaveIntent = 'main' | 'temporary';

function stagedSignature(basic: StagedBasicFields | null | undefined): string {
  return JSON.stringify(basic ?? null);
}

export type StoryEditorScreenProps = {
  storyId: string;
  /** 일반 뒤로 가기 (목록으로 돌아가기 버튼) */
  onBack: () => void;
  /**
   * 삭제 성공 전용 이동. 서버가 삭제를 확인하고 캐시 정리가 끝난 뒤,
   * 화면이 아직 마운트·포커스 상태일 때만 한 번 부른다. 목록 안내는 이 화면이 남긴다.
   */
  onDeleted: () => void;
  /**
   * 이 편집 화면이 지금 포커스된 라우트인지. 삭제 응답이 늦게 왔을 때 onDeleted로 이동할지 판단한다.
   * 라우트 파일이 내비게이션으로 판단해 넘긴다. 넘기지 않으면 항상 포커스된 것으로 본다.
   */
  isRouteFocused?: () => boolean;
  /**
   * CREATE-US-07-AC11: 비공개·공개(완성) 스토리에 저장하지 않은 기본 정보·유저 프로필·사진 변경(진행 중인 업로드 포함)이
   * 있는지 바뀔 때마다 알린다. 이탈 확인은 라우트가 맡는다. 미등록 스토리·삭제된 스토리는 항상 false다.
   */
  onUnsavedChange?: (unsaved: boolean) => void;
  /**
   * CREATE-US-07·12 작업 화면이 맡는 구역 탭(말투·서술·인트로·초기 상태·공개 범위)을 눌렀을 때 그 구역을 실어
   * 2~4번 작업 화면으로 넘긴다. 라우트가 이동을 맡는다.
   * 저장하지 않은 변경(미등록 스토리 포함)·저장·업로드가 남아 있으면 부르지 않고 안내한다(입력은 그대로).
   * 넘기지 않으면 지금처럼 탭만 바꾼다(연결되지 않은 탭 안내).
   */
  onOpenScene?: (section: SceneSection) => void;
  /**
   * CREATE-US-07 「말투·서술」 탭만 넘기던 이전 연결. onOpenScene이 없을 때만 쓰며, 다른 구역 탭은 지금처럼 탭만 바꾼다.
   * 같은 미저장·저장 중 확인을 거친다.
   */
  onOpenSpeech?: () => void;
  /** CREATE-US-12 처음 보일 구역. 작업 화면에서 기본 설정·유저 프로필로 넘어올 때 라우트가 넘긴다. */
  initialSection?: EditorSection;
};

const SCENE_SAVE_HINT = '먼저 저장해 주세요.';
const SCENE_LOADING_MESSAGE = '저장된 내용을 불러오는 중이에요. 불러온 뒤 다시 눌러 주세요.';

const alwaysFocused = () => true;

/**
 * 스토리 편집 화면. 탭별 저장 조각을 모아 저장한다 (story-publish 책임).
 * 저장이 실패하면 입력을 그대로 두고 실패를 알린다. 성공 응답을 받기 전에는 저장 완료로 표시하지 않는다.
 */
export function StoryEditorScreen({
  storyId,
  onBack,
  onDeleted,
  isRouteFocused = alwaysFocused,
  onUnsavedChange,
  onOpenScene,
  onOpenSpeech,
  initialSection,
}: StoryEditorScreenProps) {
  const queryClient = useQueryClient();
  const { status: writeStatus, acquire, peek, deleteError } = useStoryWriteLock(storyId);
  // 다른 화면이 같은 스토리를 쓰는 중이라 저장을 보내지 않았을 때의 안내 (CREATE-US-07-AC03/07/09)
  const [lockError, setLockError] = useState<string | null>(null);
  const story = useStory(storyId, writeStatus !== 'deleted');
  const waitingForSave = useRef(writeStatus === 'save');
  const save = useSaveStoryBasic(storyId);
  const [tab, setTab] = useState(() => (initialSection ? sectionIndex(initialSection) : 0));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // CREATE-US-07·12 작업 화면 구역으로 넘기지 못한 이유. 다른 탭을 누르거나 넘기면 지운다.
  const [speechNotice, setSpeechNotice] = useState<string | null>(null);
  const mounted = useRef(true);
  // 캐릭터를 끄는 동안 화면 스크롤을 멈춘다 (AC14: 드래그와 페이지 스크롤이 겹치지 않게)
  const [dragging, setDragging] = useState(false);
  const [values, setValues] = useState<BasicInfoValues | null>(null);
  // CREATE-US-05: 유저 프로필 프리셋. 공통 저장(/creation)으로 불러오고, 바뀌면 기본 정보와 한 요청으로 저장한다.
  const presetState = useStoryPresets(storyId, writeStatus !== 'deleted');
  // CREATE-US-07-AC01/05: 공통 저장 조회(/creation)의 임시 저장본 기본 정보(stagedBasic)로 처음 한 번만 채운다.
  // 처음 채운 값(initialValues)을 아직 고치지 않았을 때만 바꾸고, 조회 결과를 한 번 본 뒤에는 다시 바꾸지 않는다.
  // 복원했으면 그 임시 저장본을 미저장 비교 기준(stagedBaseline)으로 쓴다(복원 직후는 미저장 변경이 아니다).
  const creation = presetState.query;
  const stagedBasic = creation.data?.stagedBasic;
  const initialValues = useRef<BasicInfoValues | null>(null);
  // initialValues를 만든 공개 정본. 임시 저장본의 tags·characters가 null(기존 값 유지)이면 이 값을 이어 쓴다.
  const initialCanonical = useRef<StoryBasicFields | null>(null);
  const basicEditorBaseline = useRef<StoryBasicFields | null>(null);
  const stagedSettled = useRef(false);
  const [stagedBaseline, setStagedBaseline] = useState<StoryBasicFields | null>(null);
  // CREATE-US-07-AC09 기본 정보 자동 임시 저장의 기준: 이 화면이 아는 서버 임시 저장본 기본 정보(stagedSignature).
  // null이면 기본 정보를 자동 저장하지 않는다(조회 실패, 복원하지 못한 임시 저장본이 남음, 다른 화면 저장 뒤 다시 채움).
  // 보내기 직전 최신 문서의 임시 저장본이 이 값과 다르면 다른 곳의 임시 저장본을 덮어쓰지 않도록 보내지 않는다.
  const stagedKnown = useRef<string | null>(null);
  const isProfileTab = TABS[tab] === '유저 프로필';
  // 서버 issues의 characters[i]가 어느 캐릭터인지 알려면, 그 판정을 받은 저장본의 캐릭터 순서(key)가 필요하다.
  const [savedKeys, setSavedKeys] = useState<string[]>([]);
  const [attemptKeys, setAttemptKeys] = useState<string[]>([]);
  // CREATE-US-06: 이미지 목록. 기본 정보 저장이 성공한 뒤 이어서 저장한다(캐릭터 id가 있어야 연결 가능).
  // 삭제가 끝난 스토리의 사진 목록은 다시 조회하지 않는다 (404 요청 방지).
  const images = useStoryImages(storyId, writeStatus !== 'deleted');
  const saveImages = useSaveStoryImages(storyId);
  const [imageValues, setImageValues] = useState<StoryImagesValues | null>(null);
  const imageBaseline = useRef<StoryImagesValues | null>(null);
  // CREATE-US-07-AC07: 비공개·공개 스토리의 새 캐릭터(id 없음) 얼굴 이미지. 캐릭터 key별로 두고,
  // 「저장」 한 요청(/creation)의 images.characters[].basic_index로 함께 보낸다.
  const [newImages, setNewImages] = useState<Record<string, MediaImage[]>>({});
  // CREATE-US-07-AC09 서버 임시 저장본에 있는 새 캐릭터 얼굴 이미지 id(화면 행 key별). 다시 연 화면의 복원과
  // 자동 임시 저장 성공(보낸 basic_index를 보낸 행 key로 옮김)에서만 바꾼다. 응답의 위치로 다시 연결하지 않으므로
  // 그 뒤 행을 지우거나 순서를 바꿔도 다른 행에 붙지 않는다. newImages가 이 값과 같으면 미저장 변경이 아니다.
  const newImagesBaseline = useRef<Record<string, number[]>>({});
  // 비동기 업로드가 끝난 뒤의 변경도 최신 목록 위에 적용하도록, 화면에 보여 준 합친 목록을 기억한다.
  const editorValuesRef = useRef<StoryImagesValues | null>(null);
  // 공통 저장(/creation)이 images.characters[].character_id로 이미 반영한 기존 캐릭터 id.
  // 다음 사진 단계에서 이 캐릭터들의 사진을 다시 쓰지 않도록 서버 값을 그대로 쓴다.
  const commonCoveredFaces = useRef<Set<string>>(new Set());
  // 공통 저장(/creation)이 images.story_image_ids로 표지를 이미 반영했는지. 다음 사진 단계에서 표지를 다시 쓰지 않는다.
  const commonCoveredStory = useRef(false);
  // 기본 정보 저장부터 이미지 저장까지 한 번의 저장으로 묶어 잠그고, 어느 단계에서 실패했는지 기억한다.
  const flow = useSaveFlow();
  // CREATE-US-05-AC06·CREATE-US-07-AC07: 진행 중인 이미지 업로드(고르기·자르기·업로드)의 고유 출처.
  // 하나라도 남아 있으면 이전 이미지로 저장하지 않도록 저장을 막고, 업로드 주인(편집기)이 언마운트되지 않게 탭을 고정한다.
  // 같은 틱의 저장 누름도 막도록 다시 그리기를 기다리지 않는 ref로 판단하고, 표시용 상태를 따로 둔다.
  const uploadSources = useRef<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const trackUpload = (source: string, active: boolean) => {
    const sources = uploadSources.current;
    if (active) sources.add(source);
    else sources.delete(source);
    setUploading(sources.size > 0);
  };
  // CREATE-US-07-AC09 유저 프로필 자동 임시 저장(60초 주기·탭 이동). 같은 틱의 직접 저장 누름도 판단하도록 ref로 둔다.
  const autoActive = useRef(false);
  const autoOutcome = useRef<'failed' | 'reload-failed' | 'ready'>('failed');
  // CREATE-US-07-AC09 지금 자동 임시 저장 한 번의 마무리 가능 응답. 그 응답의 키·임시 저장본 시각·보낸 기본 정보를 둔다.
  // 자동 저장을 새로 시작하거나 대기한 저장을 꺼내면 비운다(다음 자동 저장·직접 저장에 이어 쓰지 않는다).
  const autoFinalize = useRef<AutoFinalizeToken | null>(null);
  const finalizingAuto = useRef<AutoFinalizeToken | null>(null);
  // 이 화면의 자동 임시 저장이 서버 임시 저장본(working_copy_saved_at)을 남겼는지. 남았으면 기본 정보를
  // 공개 정본(PUT /creation/stories/{id})에 바로 쓰지 않는다. 「저장」(공통 저장·마무리)이 성공하면 비운다.
  const autoStaged = useRef(false);
  const [autoSaving, setAutoSaving] = useState(false);
  // CREATE-US-07-AC09 사진만 자동 임시 저장의 기록. baseline이 지금 imageBaseline과 다르면(직접 저장의 사진 단계 등으로
  // 기준이 바뀜) 버린 것으로 본다. failed: 거절된 내용.
  const imagesAuto = useRef<{ baseline: StoryImagesValues; failed: string } | null>(null);
  // CREATE-US-07-AC02/03/09 성패를 모르는 사진 자동 임시 저장. 남아 있는 동안 사진 편집과 사진을 함께 쓰는 저장을 막고,
  // 「사진 임시 저장 다시 시도」로만 같은 본문·kind·요청키로 다시 보낸다(새 요청키로 보내지 않는다).
  // 같은 틱의 누름도 판단하도록 ref로 두고, 표시용 상태를 따로 둔다.
  const imagesPendingRef = useRef<PendingImagesSave | null>(null);
  const confirmedImageRetryKey = useRef<string | null>(null);
  const [imagesPending, setImagesPendingState] = useState<PendingImagesSave | null>(null);
  /** 같은 틱의 누름도 판단하도록 ref로 본다. 진행 중인 업로드나 성패를 모르는 사진 저장이 있으면 true. */
  const photoEditorBusy = () => imagesPendingRef.current !== null || uploadSources.current.size > 0;
  const setImagesPending = (next: PendingImagesSave | null) => {
    imagesPendingRef.current = next;
    setImagesPendingState(next);
  };
  // 자동 임시 저장 중에 누른 직접 저장 하나. 버리지 않고, 자동 저장과 잠금이 끝난 뒤 그때의 최신 입력·의도로 보낸다.
  const [queuedSave, setQueuedSave] = useState<SaveIntent | null>(null);
  // 화면이 불러오기 상태일 때는 아무것도 하지 않는다. 편집 화면을 그릴 때 최신 입력으로 바꿔 둔다.
  const autoSaveRef = useRef<() => void>(() => undefined);
  autoSaveRef.current = () => undefined;
  // 편집 화면을 그린 렌더에서만 채운다. 비어 있으면 대기 중인 저장을 꺼내지 않고 기다린다.
  const runQueuedRef = useRef<((intent: SaveIntent) => void) | null>(null);
  runQueuedRef.current = null;
  // CREATE-US-07-AC11 미저장 여부. 불러오기·삭제 상태에서는 false이고, 편집 화면을 그린 렌더에서만 계산해 채운다.
  const unsavedRef = useRef(false);
  unsavedRef.current = false;
  const reportedUnsaved = useRef(false);
  useEffect(() => {
    if (reportedUnsaved.current === unsavedRef.current) return;
    reportedUnsaved.current = unsavedRef.current;
    onUnsavedChange?.(unsavedRef.current);
  });

  useEffect(() => {
    const timer = setInterval(() => autoSaveRef.current(), AUTO_SAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // 이 화면의 자동 저장이 잠금까지 풀어야 보낸다. 그사이 다른 화면이 잠그면 풀릴 때까지 기다린다.
    const run = runQueuedRef.current;
    if (queuedSave === null || autoSaving || writeStatus !== 'idle' || !run) return;
    setQueuedSave(null);
    run(queuedSave);
  });

  useEffect(() => {
    if (images.data && imageValues === null) {
      imageBaseline.current = images.data.values;
      setImageValues(images.data.values);
    }
  }, [images.data, imageValues]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 처음 연 화면만 채운다. 이전 화면의 저장을 기다린 경우에는 확정된 응답으로 한 번 더 채운다.
  useLayoutEffect(() => {
    const refreshAfterSave = waitingForSave.current && writeStatus !== 'save';
    const loadedStory = refreshAfterSave
      ? queryClient.getQueryData<EditorStory>(storyKeys.detail(storyId))
      : story.data;
    if (loadedStory && (values === null || refreshAfterSave)) {
      if (refreshAfterSave) {
        waitingForSave.current = false;
        // 이전 화면의 저장은 사진 단계까지 끝난 뒤 잠금을 푼다. 기다리기 전에 받은 사진 목록도 확정본으로 바꾼다.
        const savedImages = queryClient.getQueryData<StoryImagesSnapshot>(storyImagesKey(storyId));
        if (savedImages) {
          imageBaseline.current = savedImages.values;
          setImageValues(savedImages.values);
        }
      }
      const loaded = fromDraft(loadedStory);
      basicEditorBaseline.current = toDraftPatch(loaded);
      // 이전 화면의 저장 뒤에는 확정본으로 다시 채우므로 임시 저장본 복원 기준도 버린다.
      initialValues.current = refreshAfterSave ? null : loaded;
      initialCanonical.current = refreshAfterSave ? null : loadedStory;
      if (refreshAfterSave) {
        setStagedBaseline(null);
        // 다른 화면의 저장으로 임시 저장본이 바뀌었을 수 있다. 확인하지 못했으므로 기본 정보는 자동 저장하지 않는다.
        stagedKnown.current = null;
      }
      setValues(loaded);
      setSavedKeys(loaded.characters.map((ch) => ch.key));
    }
  }, [queryClient, story.data, storyId, values, writeStatus]);

  // CREATE-US-07-AC01/05 임시 저장본 기본 정보 복원. 조회가 실패했거나 basic이 없으면 공개 정본 그대로 둔다.
  useLayoutEffect(() => {
    if (stagedSettled.current || values === null) return;
    if (!creation.data) return;
    stagedSettled.current = true;
    if (!stagedBasic) {
      stagedKnown.current = stagedSignature(null);
      return;
    }
    // 처음 채운 뒤 이미 고친 입력은 덮어쓰지 않는다. 이때 보지 못한 임시 저장본을 자동 저장이 덮어쓰지 않도록
    // 기본 정보 자동 저장 기준도 두지 않는다.
    const canonical = initialCanonical.current;
    if (!canonical || values !== initialValues.current) return;
    stagedKnown.current = stagedSignature(stagedBasic);
    // tags·characters가 null이면 서버가 기존 값을 유지한다(KEEP). 처음 채운 공개 정본 값을 이어 쓰고, []는 그대로 빈 목록이다.
    const merged: StoryBasicFields = {
      title: stagedBasic.title,
      subtitle: stagedBasic.subtitle,
      world: stagedBasic.world,
      tags: stagedBasic.tags ?? canonical.tags,
      characters: stagedBasic.characters ?? canonical.characters,
    };
    const restored = fromDraft(merged);
    initialValues.current = null;
    initialCanonical.current = null;
    setStagedBaseline(merged);
    setValues(restored);
    setSavedKeys(restored.characters.map((ch) => ch.key));
    // CREATE-US-07-AC09 임시 저장본의 새 캐릭터 얼굴(staged_character_images)을 복원한 행 key에 한 번만 붙인다.
    // 임시 저장본이 캐릭터 목록을 보냈고(characters가 null이 아님) basic_index가 그 목록의 새 캐릭터(id 없음)를
    // 가리킬 때만 붙이고, 그 밖의 항목은 버린다. 이후에는 행 key로만 따라가므로 편집·순서 변경으로 다시 연결되지 않는다.
    const staged = creation.data.stagedCharacterImages;
    if (stagedBasic.characters !== null && staged && story.data?.saveState !== '임시 저장') {
      const restoredImages: Record<string, MediaImage[]> = {};
      const baseline: Record<string, number[]> = {};
      for (const entry of staged) {
        const row = restored.characters[entry.basicIndex];
        if (!row || row.id || stagedBasic.characters[entry.basicIndex]?.id) continue;
        restoredImages[row.key] = entry.images.map(fromImageDto);
        baseline[row.key] = entry.images.map((image) => image.image_id);
      }
      newImagesBaseline.current = baseline;
      setNewImages(restoredImages);
    }
  }, [creation.data, stagedBasic, story.data?.saveState, values]);

  if (writeStatus === 'deleted') {
    // 삭제 성공 뒤 이 화면이 포커스를 잃어 자동으로 돌아가지 않은 경우. 삭제된 스토리를 다시 편집·저장하지 않게 한다.
    return <Centered onBack={onBack} message="스토리를 삭제했어요." />;
  }
  if (story.isPending || (story.data && values === null)) {
    return <Centered onBack={onBack} message="불러오는 중…" />;
  }
  if (story.isError || !values) {
    const notFound = story.error instanceof ApiError && story.error.status === 404;
    return (
      <Centered
        onBack={onBack}
        message={notFound ? '스토리를 찾을 수 없어요.' : messageOf(story.error)}
        alert={deleteError}
        onRetry={notFound ? undefined : () => void story.refetch()}
      />
    );
  }

  const saved = story.data;
  const failedIssues = save.error instanceof ApiError ? toAppIssues(save.error.issues) : [];
  const issueKeys = failedIssues.length > 0 ? attemptKeys : savedKeys;
  const issues: FieldIssue[] = currentBasicIssues(
    failedIssues.length > 0 ? failedIssues : saved.issues,
    issueKeys,
    values,
  );
  const errors = toFieldErrors(issues, issueKeys);
  const isDraft = saved.saveState === '임시 저장';
  const newCharacters = values.characters.filter((ch) => !ch.id);
  // 비공개·공개 스토리는 새 캐릭터의 사진을 저장 전에 고르고, 「저장」 한 요청으로 함께 반영한다(AC07·AC08).
  const pickNewCharacterImages = !isDraft;
  const storyImagesDirty = () =>
    !!imageValues &&
    !!imageBaseline.current &&
    JSON.stringify(imageValues.story.map((i) => i.imageId)) !==
      JSON.stringify(imageBaseline.current.story.map((i) => i.imageId));
  const deletesSavedCharacter = () =>
    saved.characters.some((sc) => !!sc.id && !values.characters.some((ch) => ch.id === sc.id));
  /** 기본 정보(제목·태그·캐릭터 이름·상세 등)가 마지막 저장본과 다른지 */
  /** 임시 저장본으로 복원했으면 그 임시 저장본이 비교 기준이다(CREATE-US-07-AC05). */
  const basicChanged = () =>
    JSON.stringify(toDraftPatch(values)) !==
    JSON.stringify(toDraftPatch(fromDraft(stagedBaseline ?? basicEditorBaseline.current ?? saved)));
  /**
   * CREATE-US-07-AC09 새 캐릭터(id 없음)의 얼굴 이미지가 서버 임시 저장본(newImagesBaseline)과 다른지.
   * 임시 저장본이 없으면 기준은 빈 목록이라, 고른 사진이 있으면 바뀐 것이다(지금과 같다).
   */
  const newFacesChanged = () =>
    newCharacters.some(
      (ch) =>
        JSON.stringify((newImages[ch.key] ?? []).map((i) => i.imageId)) !==
        JSON.stringify(newImagesBaseline.current[ch.key] ?? []),
    );
  /** 남아 있는 기존 캐릭터의 얼굴 이미지 목록이 불러온 저장본과 다른지 */
  const savedFacesChanged = () => {
    if (!imageValues || !imageBaseline.current) return false;
    const kept = new Set(values.characters.map((ch) => ch.id).filter(Boolean));
    const before = new Map(imageBaseline.current.characters.map((c) => [c.characterId, c.images]));
    return imageValues.characters.some(
      (c) =>
        kept.has(c.characterId) &&
        JSON.stringify(c.images.map((i) => i.imageId)) !==
          JSON.stringify((before.get(c.characterId) ?? []).map((i) => i.imageId)),
    );
  };
  /**
   * 「저장」에 함께 보낼 캐릭터 얼굴 이미지(서버 계약 images.characters).
   * - 새 캐릭터(id 없음)는 모두 basic_index(이번 basic.characters 위치)로 담는다. 서버가 새 캐릭터마다 요구한다.
   * - 비공개·공개 스토리는 바뀐 기존 캐릭터 목록도 character_id로 담는다(따로 사진 저장을 보내지 않게).
   *   미등록 스토리의 기존 캐릭터 사진은 지금처럼 다음 사진 단계에서 바로 저장한다.
   * - 비공개·공개 스토리에서 표지를 바꿨으면 story_image_ids(전체 목록, []는 비움)로 담는다.
   *   바꾸지 않았으면 키를 빼서 서버가 기존 표지를 유지한다.
   * 담을 것이 없으면 null(요청에서 뺀다).
   */
  const imagesPayload = (): CreationImagesPayload | null => {
    const entries: CreationCharacterImagesPayload[] = [];
    values.characters.forEach((ch, index) => {
      if (!ch.id) entries.push({ basic_index: index, image_ids: (newImages[ch.key] ?? []).map((i) => i.imageId) });
    });
    if (!isDraft && imageValues && imageBaseline.current) {
      const kept = new Set(values.characters.map((ch) => ch.id).filter(Boolean));
      const before = new Map(imageBaseline.current.characters.map((c) => [c.characterId, c.images]));
      for (const c of imageValues.characters) {
        const ids = c.images.map((i) => i.imageId);
        const prev = (before.get(c.characterId) ?? []).map((i) => i.imageId);
        if (kept.has(c.characterId) && JSON.stringify(ids) !== JSON.stringify(prev))
          entries.push({ character_id: Number(c.characterId), image_ids: ids });
      }
    }
    if (!isDraft && imageValues && storyImagesDirty())
      return { characters: entries, story_image_ids: imageValues.story.map((i) => i.imageId) };
    return entries.length > 0 ? { characters: entries } : null;
  };
  /**
   * 비공개·공개 스토리에서 공통 「저장」 한 요청으로 원자적으로 반영할 수 없는 이유. 하나라도 있으면 보내지 않는다.
   * - 기존 캐릭터 삭제: 서버는 직접 보낸 기본 정보로는 캐릭터 삭제를 반영하지 않는다.
   * - 새 캐릭터의 얼굴 이미지가 없음: 완성 저장 조건(캐릭터마다 1장 이상)을 충족하지 못한다.
   * - 2~4번·사진 임시 저장본이 남아 있으면 「저장」이 그것까지 함께 반영하므로 이 화면에서는 보내지 않는다.
   */
  const completedBlocker = (fresh: CommonSaveDocument, finalize?: AutoFinalizeToken): string | null => {
    if (fresh.saveState === 'draft') return null;
    if (deletesSavedCharacter())
      return `${BLOCKED} 비공개·공개 스토리에서는 캐릭터 삭제를 새 캐릭터·유저 프로필 변경과 같은 저장에 담을 수 없어요.`;
    const faceless = newCharacters.filter((ch) => (newImages[ch.key] ?? []).length === 0);
    if (faceless.length > 0)
      return `${BLOCKED} 공개·비공개 스토리는 캐릭터마다 이미지가 1장 이상 필요해요. (${faceless
        .map((ch) => ch.name || '새 캐릭터')
        .join(', ')}) 이미지를 추가한 뒤 다시 저장해 주세요.`;
    if (finalize?.source === 'images') {
      // 사진만 자동 저장 마무리: 2~4번·기본 정보·프리셋 임시본이 없고, 사진 임시본이 그 자동 저장 응답의 시각과
      // 같을 때만 보낸다(다른 곳의 임시본까지 반영하지 않게). 정확한 소유 확인은 서버가 스토리 잠금 아래에서 한다.
      return fresh.workingCopySavedAt || fresh.imagesWorkingCopySavedAt !== finalize.workingCopySavedAt
        ? WORKING_COPY_BLOCKED
        : null;
    }
    // 자동 임시 저장 마무리(finalize)는 그 자동 저장이 남긴 임시 저장본(같은 시각)만 허용한다.
    const workingCopyBlocks =
      finalize === undefined
        ? Boolean(fresh.workingCopySavedAt)
        : fresh.workingCopySavedAt !== finalize.workingCopySavedAt;
    // 사진 임시본이 같은 자동 저장에 속하는지는 최종 요청에서 서버가 스토리 잠금 아래 확인한다.
    if (workingCopyBlocks || (finalize === undefined && fresh.imagesWorkingCopySavedAt)) return WORKING_COPY_BLOCKED;
    return null;
  };
  /**
   * 1단계(공통 저장): 기본 정보와 바뀐 프리셋·캐릭터 얼굴 이미지를 /creation 한 요청으로 보낸다.
   * 실패 안내는 presetState.error가 맡고, 입력(기본 정보·프리셋·고른 사진)은 그대로 둔다.
   */
  const saveCommon = async (kind: CreationSaveKind = 'save') => {
    save.reset();
    // CREATE-US-05-AC06 임시 저장: 사진(images)은 싣지 않는다(서버는 「저장」에서만 받는다).
    // 미등록 스토리는 지금처럼 기본 정보를 함께 보내고, 비공개·공개 스토리는 유저 프로필만 보낸다
    // (기본 정보는 빼서 서버가 기존 값을 유지한다). 원자적 반영 조건(completedBlocker)은 「저장」에만 적용한다.
    const temporary = kind === 'temporary';
    const payload = temporary ? null : imagesPayload();
    const result = await presetState.saveWithBasic(
      temporary && !isDraft && (isProfileTab || !basicChanged()) ? null : toDraftPatch(values),
      temporary ? () => null : completedBlocker,
      payload,
      values.characters.map((ch) => ch.key),
      kind,
    );
    if (!result.ok) return false;
    if (result.kind === 'save') {
      autoStaged.current = false;
      // 같은 요청에 담아 반영된 기존 캐릭터 사진은 다음 사진 단계에서 다시 쓰지 않는다.
      for (const entry of payload?.characters ?? [])
        if ('character_id' in entry) commonCoveredFaces.current.add(String(entry.character_id));
      // 같은 요청에 담아 반영된 표지도 다음 사진 단계에서 다시 쓰지 않는다.
      if (Array.isArray(payload?.story_image_ids)) commonCoveredStory.current = true;
    }
    applyCommonResult(result);
    return true;
  };
  /**
   * CREATE-US-07-AC09 대기한 「저장」을 자동 임시 저장의 마무리로 보낸다(1단계 대신).
   * 기본 정보·프리셋·이미지를 싣지 않고 자동 저장 키만 finalize_auto_request_id로 보낸다(kind save·mode manual).
   * 원자적 반영 조건(completedBlocker)은 그대로 보되, 임시 저장본은 그 자동 저장이 남긴 것(같은 시각)만 허용한다.
   * 성공하면 다음 사진 단계가 사진을 다시 쓰지 않도록 반영된 것으로 표시한다(사진은 자동 저장 요청에 이미 담겼다).
   * 사진만 자동 저장(/images mode auto)의 키도 같은 요청 모양으로 보낸다. 서버가 키로 그 사진 임시본만 확정한다.
   */
  const finalizeAuto = async (token: AutoFinalizeToken) => {
    save.reset();
    finalizingAuto.current = token;
    const result = await presetState.saveWithBasic(
      null,
      (fresh) => completedBlocker(fresh, token),
      null,
      [],
      'save',
      'manual',
      token.requestId,
    );
    if (!result.ok) return false;
    finalizingAuto.current = null;
    autoStaged.current = false;
    commonCoveredFaces.current = new Set((imageValues?.characters ?? []).map((c) => c.characterId));
    commonCoveredStory.current = true;
    // 자동 저장이 임시 저장본에 둔 기본 정보가 이제 정본이다.
    if (token.basic) basicEditorBaseline.current = token.basic;
    // CREATE-US-07-AC09 새 캐릭터를 함께 임시 저장했으면, 최종 응답의 캐릭터 순서(= 임시 저장본 basic.characters 순서)로
    // 서버 id를 그 자동 저장이 보낸 행 key에 붙인다. 보낼 때 확인한 조건(행 구성이 그대로)이 응답에서도 맞을 때만 붙인다.
    if (token.basic?.characters.some((ch) => !ch.id)) {
      const ids = result.characterIds;
      const clean =
        ids.length === token.rowKeys.length &&
        token.rowKeys.length === values.characters.length &&
        token.rowKeys.every((key, i) => values.characters[i].key === key);
      if (clean) {
        const bound = { ...token.basic, characters: token.basic.characters.map((ch, i) => ({ ...ch, id: ids[i] })) };
        basicEditorBaseline.current = bound;
        setValues((v) => (v ? applySavedIds(v, token.rowKeys, ids) : v));
        setSavedKeys(token.rowKeys);
        // 새 캐릭터 얼굴은 서버가 임시 저장본과 함께 반영했다. 다음 사진 단계의 재조회 결과로 보여 준다.
        newImagesBaseline.current = {};
        setNewImages({});
      } else {
        setLockError(FINALIZE_UNBOUND_MESSAGE);
      }
    }
    stagedKnown.current = stagedSignature(null);
    setStagedBaseline(null);
    return true;
  };
  /**
   * 공통 저장(직접·자동) 성공 결과의 기본 정보를 화면에 반영한다. 다시 보낸 요청이면 처음 본문 기준이다.
   * - 「저장」: 임시 저장본 비교 기준을 버린다(이후 상세 재조회 값이 기준).
   * - 임시 저장(CREATE-US-07-AC09 자동 포함): 보낸 기본 정보를 비교 기준으로 둔다. 같은 내용을 다시 자동 저장하거나
   *   미저장 변경으로 잘못 알리지 않게 한다. 미등록 스토리는 응답 id를 붙인 값이 기준이다.
   * - 응답 id는 rowKeys(보낸 행)가 있을 때만 붙인다. 비공개·공개 스토리의 임시 저장은 rowKeys가 비어,
   *   공개 정본의 id를 임시 저장본의 새 행에 붙이지 않는다.
   */
  const applyCommonResult = (result: Extract<PresetSaveResult, { ok: true }>) => {
    // 기본 정보를 보내지 않은 요청(프로필만 임시 저장)은 기본 정보·캐릭터 행과 관계가 없다.
    if (!result.basic) return;
    const sentBasic = result.basic;
    stagedKnown.current = stagedSignature(result.stagedBasic);
    // CREATE-US-07-AC09 새 캐릭터 얼굴 비교 기준. 비공개·공개 스토리의 임시 저장은 기본 정보와 함께 임시 저장본을
    // 바꾸므로, 이번에 보낸 basic_index 목록(빈 목록 포함)을 보낸 행 key(sentRowKeys)에 옮겨 새 기준으로 삼는다.
    // 응답의 위치로 다시 연결하지 않는다. 「저장」은 반영이 끝나 임시 저장본이 없으므로 비운다.
    if (result.kind === 'save') newImagesBaseline.current = {};
    else if (!isDraft) {
      const next: Record<string, number[]> = {};
      for (const entry of result.images?.characters ?? []) {
        if (!('basic_index' in entry)) continue;
        const key = result.sentRowKeys[entry.basic_index];
        if (key !== undefined) next[key] = entry.image_ids;
      }
      newImagesBaseline.current = next;
    }
    // 같은 키로 다시 보낸 요청이면 지금 입력이 아니라 처음 보낸 본문의 행 순서로 id를 붙인다.
    const sent = result.rowKeys;
    // 응답의 캐릭터 순서는 보낸 순서와 같다. 수가 다르면 잘못 붙이지 않도록 건너뛴다(상세 재조회로 확인).
    const idsMatch = sent.length > 0 && result.characterIds.length === sent.length;
    if (result.kind === 'save' || isDraft) {
      basicEditorBaseline.current = idsMatch
        ? { ...sentBasic, characters: sentBasic.characters.map((ch, i) => ({ ...ch, id: result.characterIds[i] })) }
        : sentBasic;
    }
    if (result.kind === 'save') setStagedBaseline(null);
    else
      setStagedBaseline(
        idsMatch
          ? {
              ...sentBasic,
              characters: sentBasic.characters.map((ch, i) => ({ ...ch, id: result.characterIds[i] })),
            }
          : sentBasic,
      );
    if (sent.length === 0) return;
    if (idsMatch) {
      setValues((v) => (v ? applySavedIds(v, sent, result.characterIds) : v));
      // 새 캐릭터의 사진은 서버가 같은 요청에서 연결했다. 다음 사진 단계의 재조회 결과로 보여 준다.
      setNewImages({});
    }
    setSavedKeys(sent);
  };
  /** 1단계: 기본 정보 저장. 실패 안내는 save.error로 보여 준다. */
  const saveBasic = async () => {
    // 새 저장을 시작하면 이전 공통 저장의 반영 기록은 지금 입력과 관계없다.
    commonCoveredFaces.current = new Set();
    commonCoveredStory.current = false;
    // 비공개·공개 스토리의 새 캐릭터는 사진과 함께 한 요청으로만 저장한다(기본 정보만 먼저 반영하지 않는다).
    // 기본 정보와 기존 캐릭터 사진을 함께 바꾼 경우도 같다(기본 정보만 바로 반영되고 사진은 임시 저장본에 남지 않게).
    // 표지(story_image_ids)를 기본 정보·캐릭터 사진·프리셋 변경과 함께 바꾼 경우도 같은 요청에 담는다.
    // 표지만 바꾼 경우는 지금처럼 사진 단계(임시 저장본)로 저장한다.
    const basicWithSavedFaces = !isDraft && savedFacesChanged() && basicChanged();
    const coverWithOthers =
      !isDraft &&
      storyImagesDirty() &&
      (basicChanged() || savedFacesChanged() || newCharacters.length > 0 || presetState.dirty);
    if (
      (!isDraft && newCharacters.length > 0) ||
      basicWithSavedFaces ||
      coverWithOthers ||
      presetState.dirty ||
      presetState.pending
    )
      return saveCommon();
    // CREATE-US-07-AC05: 비공개·공개 스토리에 임시 저장본 기본 정보가 남아 있으면 공개 정본(PUT /creation/stories/{id})에
    // 바로 쓰지 않는다. 임시 저장본을 건너뛰어 덮어쓰거나 어긋나게 하지 않도록 막고, 입력은 그대로 둔다.
    // CREATE-US-07-AC09 자동 임시 저장이 기본 정보를 임시 저장본에 둔 뒤(stagedBaseline)도 같다. 응답에 basic이 없는
    // 서버여도, 공개 정본만 바꾸고 이전 임시 저장본이 남아 나중에 최신 입력을 덮어쓰지 않게 막는다.
    // 이 화면의 자동 임시 저장이 임시 저장본을 남겼는데 마무리 키가 없으면(autoStaged) 같은 이유로 막는다.
    if (!isDraft && (presetState.query.data?.stagedBasic || stagedBaseline || autoStaged.current)) {
      setLockError(presetState.query.data?.stagedBasic || stagedBaseline ? STAGED_BASIC_BLOCKED : WORKING_COPY_BLOCKED);
      return false;
    }
    const sent = values.characters.map((ch) => ch.key);
    setAttemptKeys(sent);
    try {
      const savedStory = await save.mutateAsync(toDraftPatch(values));
      basicEditorBaseline.current = toDraftPatch(fromDraft(savedStory));
      // 상세 캐시가 응답으로 바뀌었으므로 그 값이 비교 기준이다(미등록 스토리의 이전 임시 저장 기준을 버린다).
      setStagedBaseline(null);
      // 새 캐릭터에 서버 id를 붙여 다음 저장 때 같은 캐릭터로 수정되게 한다.
      setValues((v) =>
        v
          ? applySavedIds(
              v,
              sent,
              savedStory.characters.map((ch) => ch.id ?? ''),
            )
          : v,
      );
      setSavedKeys(sent);
      presetState.clearBasicFailure();
      return true;
    } catch {
      return false;
    }
  };
  /**
   * 2단계: 기본 정보 저장으로 바뀐 캐릭터 목록(추가·삭제·이름)을 다시 불러와 반영한 뒤, 바뀐 이미지가 있으면 저장한다.
   * 재조회나 저장이 실패하면 예외를 던져 「사진만 다시 저장」을 보여 준다. 고른 사진은 그대로 둔다.
   */
  const saveImagesStep = async () => {
    if (imageValues === null) return;
    const fresh = await images.refetch();
    if (fresh.isError || !fresh.data) throw fresh.error ?? new Error('이미지 목록을 다시 불러오지 못했어요.');
    const covered = commonCoveredFaces.current;
    const local = mergeCharacters(imageValues, fresh.data.values);
    const baseline = new Map(imageBaseline.current?.characters.map((c) => [c.characterId, c.images]));
    // 공통 저장이 이미 반영한 캐릭터 사진은 서버 값(정본)으로 바꿔, 같은 사진을 두 번 쓰지 않는다.
    const serverFaces = new Map(fresh.data.values.characters.map((c) => [c.characterId, c.images]));
    // 공통 저장이 반영한 표지도 서버 값(정본)으로 바꿔, 표지 사진 저장(PUT)을 다시 보내지 않는다.
    const merged: StoryImagesValues = {
      story: commonCoveredStory.current || !storyImagesDirty() ? fresh.data.values.story : local.story,
      characters: local.characters.map((c) => {
        const edited =
          JSON.stringify(c.images.map((i) => i.imageId)) !==
          JSON.stringify((baseline.get(c.characterId) ?? serverFaces.get(c.characterId) ?? []).map((i) => i.imageId));
        return covered.has(c.characterId) || !edited ? { ...c, images: serverFaces.get(c.characterId) ?? c.images } : c;
      }),
    };
    commonCoveredFaces.current = new Set();
    commonCoveredStory.current = false;
    setImageValues(merged);
    imageBaseline.current = fresh.data.values;
    if (sameImages(merged, fresh.data.values)) return;
    // 안 B: 비공개·공개 스토리의 사진은 임시 저장본에 두고, 저장·공개 탭의 「저장」에서 함께 반영한다.
    const snapshot = await saveImages.mutateAsync({
      patch: toImagesPatch(merged),
      kind: isDraft ? 'save' : 'temporary',
    });
    imageBaseline.current = snapshot.values;
    setImageValues(snapshot.values);
  };
  /**
   * 기본 정보 → 사진 저장 전체(또는 사진만 다시 저장)를 스토리 쓰기 잠금 안에서 실행한다.
   * 삭제가 진행 중이거나 다른 화면이 같은 스토리를 저장 중이면 시작하지 않고,
   * 저장이 사진 단계까지 끝날 때까지 삭제를 막는다 (CREATE-US-07-AC10).
   */
  const withWriteLock = async (job: () => Promise<boolean>) => {
    // 이미지 업로드가 끝나기 전에는 이전 이미지로 저장 요청을 보내지 않는다. 안내는 하단 상태가 맡는다.
    if (uploadSources.current.size > 0) return;
    const release = acquire('save');
    if (!release) {
      // 같은 틱에 다른 화면(2~4번 공통 저장 등)이 먼저 잠근 경우. 조용히 버리지 않고 알린다. 입력은 그대로다.
      setLockError(writeBlockedMessage(peek()));
      return;
    }
    setLockError(null);
    try {
      await job();
    } finally {
      release();
    }
  };
  /**
   * CREATE-US-05-AC06 임시 저장: 공통 저장 한 요청(kind temporary)만 보내고, 이어서 사진 저장을 시작하지 않는다.
   * 공개 상태를 바꾸지 않으며(게시하지 않음), 성공 여부를 모르는 앞선 요청이 있으면 그 요청을 같은 키로 다시 보낸다.
   */
  const doTemporary = () => {
    if (isDraft && imagesPendingBlocks()) return;
    void withWriteLock(() => flow.run(() => saveCommon('temporary')));
  };
  // 미등록 스토리의 하단 「임시 저장」은 유저 프로필을 고쳤으면 kind temporary로 보낸다.
  // 성패를 모르는 임시 저장이 남아 있으면 어느 버튼이든 그 요청을 같은 의도로 다시 보낸다(사진 단계 없이).
  const temporaryFooter =
    presetState.pendingKind === 'temporary' || (isDraft && presetState.pendingKind === null && presetState.dirty);
  /**
   * 성패를 모르는 사진 자동 임시 저장이 남아 있으면 사진을 함께 쓰는 저장(기본 저장의 공통 저장 images·사진 단계,
   * 사진만 다시 저장)은 보내지 않는다. 새 요청키로 사진을 다시 쓰거나 확인 전의 기준으로 덮어쓰지 않게 한다.
   * 사진을 싣지 않는 유저 프로필 임시 저장(CREATE-US-05-AC06)은 막지 않는다.
   */
  const imagesPendingBlocks = () => {
    if (!imagesPendingRef.current) return false;
    setLockError(IMAGES_PENDING_BLOCKED_MESSAGE);
    return true;
  };
  const doSave = temporaryFooter
    ? doTemporary
    : () => {
        if (imagesPendingBlocks()) return;
        const pendingAuto = finalizingAuto.current;
        if (presetState.pendingKind === 'save' && pendingAuto) {
          void withWriteLock(() => flow.saveAll(() => finalizeAuto(pendingAuto), saveImagesStep));
          return;
        }
        finalizingAuto.current = null;
        void withWriteLock(() => flow.saveAll(saveBasic, saveImagesStep));
      };
  // 비공개·공개 스토리의 유저 프로필 탭: 「변경 내용 저장」과 별도로 프로필만 임시 저장한다.
  const showProfileTemporary =
    !isDraft &&
    presetState.status === 'ready' &&
    presetState.pendingKind === null &&
    (isProfileTab ? presetState.dirty : basicChanged());
  const workingCopySavedAt = isDraft ? null : (presetState.query.data?.workingCopySavedAt ?? null);
  const retryImages = () => {
    if (imagesPendingBlocks()) return;
    void withWriteLock(() => flow.retryImages(saveImagesStep));
  };
  // 미등록 스토리는 지금처럼 "먼저 저장" 안내를 보이고, 비공개·공개 스토리는 새 캐릭터 사진 칸을 보여 준다.
  const unsavedCharacterNames = pickNewCharacterImages ? [] : newCharacters.map((ch) => ch.name || '새 캐릭터');
  const editorValues: StoryImagesValues | null =
    imageValues && pickNewCharacterImages
      ? {
          ...imageValues,
          characters: [
            ...imageValues.characters,
            ...newCharacters.map((ch) => ({
              characterId: `${NEW_CHARACTER}${ch.key}`,
              name: ch.name,
              images: newImages[ch.key] ?? [],
            })),
          ],
        }
      : imageValues;
  editorValuesRef.current = editorValues;
  const changeImages = (update: (v: StoryImagesValues) => StoryImagesValues) => {
    if (!pickNewCharacterImages) {
      setImageValues((v) => (v ? update(v) : v));
      return;
    }
    const current = editorValuesRef.current;
    if (!current) return;
    const next = update(current);
    editorValuesRef.current = next;
    const isNew = (id: string) => id.startsWith(NEW_CHARACTER);
    setImageValues({ ...next, characters: next.characters.filter((c) => !isNew(c.characterId)) });
    setNewImages((prev) => {
      const merged = { ...prev };
      for (const c of next.characters)
        if (isNew(c.characterId)) merged[c.characterId.slice(NEW_CHARACTER.length)] = c.images;
      return merged;
    });
  };
  // 이 화면의 저장 흐름이나, 같은 스토리를 다른 화면이 저장하는 동안
  const saving = flow.running || writeStatus === 'save';
  // 삭제 중에도 저장을 시작하지 않는다
  // 이미지 업로드 중에도 저장을 시작하지 않는다
  const writeBlocked = saving || uploading || writeStatus !== 'idle';
  // CREATE-US-07-AC11: 비공개·공개 스토리에서 마지막 저장본(임시 저장 포함)과 다른 입력이 남아 있으면 이탈 확인 대상이다.
  // 성공 여부를 모르는 저장(pending)과 진행 중인 사진 업로드도 나가면 잃으므로 포함한다.
  unsavedRef.current =
    !isDraft &&
    (basicChanged() ||
      presetState.dirty ||
      presetState.pending ||
      imagesPending !== null ||
      storyImagesDirty() ||
      savedFacesChanged() ||
      newFacesChanged() ||
      uploading);
  /**
   * CREATE-US-07-AC09 사진만 자동 임시 저장: 이미 저장된 캐릭터의 얼굴·표지 변경을 기존 PUT /images(kind temporary) 한 요청으로 보낸다.
   * 원자 저장 계약이 생기기 전까지 기본 정보·프리셋·새 캐릭터·캐릭터 삭제와 함께 바뀐 경우, 직접 저장의 사진 단계가
   * 실패해 남은 경우(「사진만 다시 저장」 몫)에는 보내지 않는다. 직접 저장(saveImagesStep)은 쓰지 않는다:
   * 그 경로는 미등록 스토리에 save를 보내고 서버 목록으로 입력을 바꾼다.
   * - 바뀐 것이 없거나 이미 보낸·거절된 내용이면 요청하지 않는다.
   * - 실패하면 입력과 비교 기준을 그대로 둔다. 성패를 모르면 그 요청(본문·kind·요청키)을 imagesPending으로 남기고
   *   사진 편집·사진을 함께 쓰는 저장을 막는다. 「사진 임시 저장 다시 시도」(retryPendingImages)로만 같은 요청을 다시 보낸다.
   * - 성공 응답은 새 비교 기준이다. 미등록 스토리도 서버가 사진 목록을 저장하므로 같은 방식으로 처리한다.
   */
  const autoStageImages = () => {
    const baseline = imageBaseline.current;
    // 성패를 모르는 요청이 남아 있으면 자동으로 보내지 않는다(「사진 임시 저장 다시 시도」 몫).
    if (!imageValues || !baseline || flow.imageError || imagesPendingRef.current) return;
    if (basicChanged() || presetState.dirty || presetState.pending) return;
    if (newCharacters.length > 0 || deletesSavedCharacter() || Object.values(newImages).some((list) => list.length > 0))
      return;
    const roster = values.characters.map((ch) => ch.id ?? '').sort();
    const listed = imageValues.characters.map((c) => c.characterId).sort();
    if (JSON.stringify(roster) !== JSON.stringify(listed)) return;
    if (sameImages(imageValues, baseline)) return;
    const patch = toImagesPatch(imageValues);
    const signature = JSON.stringify(patch);
    const record = imagesAuto.current?.baseline === baseline ? imagesAuto.current : null;
    if (record && record.failed === signature) return;
    const release = acquire('save');
    if (!release) return;
    // 이번 요청의 본문·kind·요청키. 성패를 모르면 이 값 그대로 다시 보낸다.
    // 비공개·공개 스토리만 마무리 opt-in(mode auto)을 싣는다. 미등록 스토리는 서버가 바로 반영하므로 마무리할 임시본이 없다.
    const operation: PendingImagesSave = {
      patch,
      kind: 'temporary',
      key: newImagesRequestKey(),
      signature,
      ...(isDraft ? {} : { mode: 'auto' as const }),
    };
    autoOutcome.current = 'failed';
    autoFinalize.current = null;
    autoActive.current = true;
    setAutoSaving(true);
    void flow
      .run(async () => {
        const latest = await images.refetch();
        if (latest.isError || !latest.data) {
          setLockError('최신 사진 목록을 불러오지 못해 자동 임시 저장하지 않았어요. 입력은 그대로입니다.');
          return;
        }
        if (!sameImages(latest.data.values, baseline) && !sameImages(latest.data.values, imageValues)) {
          imagesAuto.current = { baseline, failed: signature };
          setLockError('다른 곳에서 사진 목록이 바뀌어 자동 임시 저장하지 않았어요. 입력은 그대로입니다.');
          return;
        }
        try {
          const snapshot = sameImages(latest.data.values, imageValues)
            ? latest.data
            : await saveImages.mutateAsync({ patch, kind: operation.kind, key: operation.key, mode: operation.mode });
          // 서버가 이번 요청(보낸 키)을 마무리 후보로 알렸으면 기억한다. 대기한 「저장」만 이 키로 마무리한다.
          // 요청을 보내지 않은 경우(조회 결과가 이미 같음)·후보 표시가 없는 응답은 마무리에 쓰지 않는다.
          if (
            !isDraft &&
            operation.mode === 'auto' &&
            snapshot.finalizableAutoRequestId === operation.key &&
            snapshot.workingCopySavedAt
          )
            autoFinalize.current = {
              source: 'images',
              requestId: operation.key,
              workingCopySavedAt: snapshot.workingCopySavedAt,
              basic: null,
              rowKeys: [],
            };
          setLockError(null);
          imageBaseline.current = snapshot.values;
          imagesAuto.current = null;
          setImageValues(snapshot.values);
          autoOutcome.current = 'ready';
        } catch (failure) {
          if (isUncertain(failure)) {
            imagesAuto.current = null;
            setImagesPending(operation);
            setLockError(AUTO_IMAGES_HELD_MESSAGE);
          } else {
            imagesAuto.current = { baseline, failed: signature };
            setLockError(`${AUTO_IMAGES_FAILED_MESSAGE} (${errorText(failure instanceof Error ? failure : null)})`);
          }
        }
      })
      .finally(() => {
        release();
        autoActive.current = false;
        setAutoSaving(false);
      });
  };
  /**
   * CREATE-US-07-AC02/03/09 성패를 모르는 사진 자동 임시 저장을 직접 다시 보낸다. 지금 입력이 아니라 남겨 둔 본문·kind·요청키를
   * 그대로 쓰고, 사진 요청 하나만 보낸다(기본 정보·공통 저장·「저장」 의도로 바꾸지 않는다).
   * - 성공: 같은 키의 응답은 처음 요청 시점의 값일 수 있어, 최신 사진 목록을 다시 불러와 비교 기준으로 쓴다.
   *   지금 입력이 보낸 내용 그대로면 최신 목록으로 바꾸고, 다르면(보낸 뒤 고친 입력) 입력은 두고 기준만 바꾼다.
   *   다시 불러오지 못하면 입력은 두고 응답을 기준으로 삼아 알린다.
   * - 다시 성패를 모름: 같은 요청을 계속 남긴다. 거절: 대기를 풀고, 같은 내용은 자동으로 다시 보내지 않는다.
   */
  const retryPendingImages = () => {
    const operation = imagesPendingRef.current;
    if (!operation || uploadSources.current.size > 0) return;
    void withWriteLock(() =>
      flow.run(async () => {
        try {
          if (confirmedImageRetryKey.current !== operation.key) {
            // 같은 키로 다시 보낼 때는 처음 본문(opt-in 표시 포함) 그대로다. 재시도 성공은 마무리 후보로 쓰지 않는다.
            await saveImages.mutateAsync({
              patch: operation.patch,
              kind: operation.kind,
              key: operation.key,
              mode: operation.mode,
            });
            confirmedImageRetryKey.current = operation.key;
          }
        } catch (failure) {
          if (isUncertain(failure)) {
            setLockError(AUTO_IMAGES_HELD_MESSAGE);
            return;
          }
          setImagesPending(null);
          if (imageBaseline.current)
            imagesAuto.current = { baseline: imageBaseline.current, failed: operation.signature };
          setLockError(`${AUTO_IMAGES_FAILED_MESSAGE} (${errorText(failure instanceof Error ? failure : null)})`);
          return;
        }
        const latest = await images.refetch();
        if (latest.isError || !latest.data) {
          setLockError(IMAGES_RELOAD_FAILED_MESSAGE);
          return;
        }
        confirmedImageRetryKey.current = null;
        setImagesPending(null);
        imagesAuto.current = null;
        setLockError(null);
        const fresh = latest.data.values;
        imageBaseline.current = fresh;
        setImageValues((current) =>
          current && JSON.stringify(toImagesPatch(current)) !== operation.signature ? current : fresh,
        );
      }),
    );
  };
  /**
   * CREATE-US-07-AC09 자동 임시 저장. 바뀐 기본 정보·프리셋만 mode auto·kind temporary로 보낸다.
   * 보낼 것이 없거나(바뀐 것 없음·성패 불명확 요청 남음·같은 내용 거절), 이미지 업로드 중이거나,
   * 이 화면·다른 화면이 같은 스토리를 쓰는 중이면 요청 없이 건너뛰고 다음 주기·탭 이동에 다시 본다.
   * 진행 중에는 직접 저장과 같이 잠금과 저장 흐름(flow)을 쥐어, 응답의 정본으로 바꾸는 동안 프로필 입력을 막는다.
   */
  autoSaveRef.current = () => {
    if (autoActive.current || queuedSave !== null || uploadSources.current.size > 0) return;
    const known = stagedKnown.current;
    const indexedImages = !isDraft && newCharacters.length > 0 && (basicChanged() || newFacesChanged());
    const hasImageEdits = storyImagesDirty() || savedFacesChanged() || newFacesChanged();
    const mixedImages =
      !isDraft &&
      !imagesPendingRef.current &&
      known !== null &&
      (indexedImages || (hasImageEdits && (basicChanged() || presetState.dirty) && newCharacters.length === 0)) &&
      !deletesSavedCharacter()
        ? imagesPayload()
        : null;
    const basic =
      (basicChanged() || indexedImages) && known !== null && (!hasImageEdits || mixedImages)
        ? toDraftPatch(values)
        : null;
    if (presetState.status !== 'ready' || !presetState.autoSaveNeeded(basic, mixedImages)) {
      autoStageImages();
      return;
    }
    const release = acquire('save');
    if (!release) return;
    autoOutcome.current = 'failed';
    autoFinalize.current = null;
    autoActive.current = true;
    setAutoSaving(true);
    void flow
      .run(async () => {
        const result = await presetState.autoSave(
          basic,
          values.characters.map((ch) => ch.key),
          (fresh) => {
            if (!basic) return null;
            const latest = queryClient.getQueryData<EditorStory>(storyKeys.detail(storyId));
            const baseline = basicEditorBaseline.current;
            const canonicalChanged =
              latest &&
              baseline &&
              stagedSignature(toDraftPatch(fromDraft(latest))) !== stagedSignature(toDraftPatch(fromDraft(baseline)));
            return stagedSignature(fresh.stagedBasic) !== known || canonicalChanged
              ? '다른 곳에서 기본 설정이 바뀌었어요. 입력은 그대로입니다. 최신 내용을 확인해 주세요.'
              : null;
          },
          mixedImages,
        );
        if (result.ok) {
          autoOutcome.current = 'ready';
          if (!isDraft && result.workingCopySavedAt) {
            autoStaged.current = true;
            if (result.finalizableAutoRequestId)
              autoFinalize.current = {
                source: 'creation',
                requestId: result.finalizableAutoRequestId,
                workingCopySavedAt: result.workingCopySavedAt,
                basic,
                rowKeys: result.sentRowKeys,
              };
          }
          applyCommonResult(result);
          if (mixedImages) {
            const refreshed = await images.refetch();
            if (!refreshed.isError && refreshed.data) {
              imageBaseline.current = refreshed.data.values;
              setImageValues(refreshed.data.values);
            } else {
              autoOutcome.current = 'reload-failed';
              setLockError(IMAGES_RELOAD_FAILED_MESSAGE);
            }
          }
          const draftRosterChanged =
            isDraft && basic && (basic.characters.some((character) => !character.id) || deletesSavedCharacter());
          if (draftRosterChanged) {
            const refreshed = await images.refetch();
            if (!refreshed.isError && refreshed.data) {
              imageBaseline.current = refreshed.data.values;
              setImageValues(refreshed.data.values);
            } else {
              autoOutcome.current = 'reload-failed';
              setLockError(IMAGES_RELOAD_FAILED_MESSAGE);
            }
          }
        }
      })
      .finally(() => {
        release();
        autoActive.current = false;
        setAutoSaving(false);
      });
  };
  /** 자동 임시 저장 중에 누른 직접 저장은 하나만 기억해 두고, 끝난 뒤 최신 입력으로 보낸다(마지막으로 누른 버튼 기준). */
  const pressSave = (intent: SaveIntent) => {
    if (autoActive.current) {
      setLockError(null);
      setQueuedSave(intent);
      return;
    }
    if (intent === 'temporary') doTemporary();
    else doSave();
  };
  runQueuedRef.current = (intent) => {
    // 마무리 키는 이번 자동 저장 한 번에만 쓴다. 꺼낸 뒤에는 비운다.
    const token = autoFinalize.current;
    autoFinalize.current = null;
    // 자동 저장이 성패를 모른 채 끝났으면 그 요청을 같은 키로 먼저 확인해야 한다. 누른 저장은 보내지 않고 알린다.
    if (presetState.pending || (intent === 'main' && imagesPendingRef.current)) {
      setLockError(QUEUED_SAVE_HELD_MESSAGE);
      return;
    }
    if (autoOutcome.current !== 'ready') {
      setLockError(
        autoOutcome.current === 'reload-failed'
          ? '자동 임시 저장은 됐지만 최신 사진을 불러오지 못해 누른 저장은 보내지 않았어요.'
          : '자동 임시 저장을 완료하지 못해 누른 저장은 보내지 않았어요. 입력은 그대로입니다.',
      );
      return;
    }
    // CREATE-US-07-AC09 자동 저장이 마무리 가능 응답으로 끝났고 그 뒤 바뀐 입력이 없으면, 대기한 「저장」은
    // 그 키로 최종 저장 한 번만 보낸다(기본 정보·프리셋·이미지 재전송·추가 사진 PUT 없음).
    const finalizable =
      intent === 'main' &&
      token !== null &&
      !isDraft &&
      !temporaryFooter &&
      !basicChanged() &&
      !presetState.dirty &&
      !storyImagesDirty() &&
      !savedFacesChanged() &&
      !newFacesChanged() &&
      (newCharacters.length === 0 || token.basic?.characters.some((ch) => !ch.id) === true) &&
      !deletesSavedCharacter();
    if (finalizable) {
      void withWriteLock(() => flow.saveAll(() => finalizeAuto(token), saveImagesStep));
      return;
    }
    if (intent === 'temporary') doTemporary();
    else doSave();
  };
  // 자동 임시 저장 중에도 저장 버튼은 눌러 대기열에 넣을 수 있다. 그 밖의 쓰기 버튼은 지금처럼 막는다.
  const saveBlocked = autoSaving ? uploading : writeBlocked;
  /**
   * CREATE-US-07·12 작업 화면 구역 넘기기. 작업 화면은 서버에 저장된 내용만 불러오므로, 이 화면에 저장되지 않은 입력이
   * 남아 있으면(미등록 스토리 포함) 넘기지 않는다. 자동 저장·직접 저장을 대신 보내지 않고 입력도 버리지 않는다.
   * 같은 틱의 누름도 판단하도록 업로드·자동 저장은 ref로, 쓰기 잠금은 peek()으로 본다. 두 번 누름은 라우트가 한 번만 쌓는다.
   */
  const openScene = (label: string, open: () => void) => {
    if (uploadSources.current.size > 0) {
      setSpeechNotice(UPLOAD_WAIT_MESSAGE);
      return;
    }
    if (
      autoActive.current ||
      queuedSave !== null ||
      flow.running ||
      waitingForSave.current ||
      // 같은 틱에 저장 버튼과 함께 눌러도 렌더를 기다리지 않고 지금 잠금 상태를 본다.
      peek() !== 'idle'
    ) {
      setSpeechNotice(sectionBusyMessage(label));
      return;
    }
    if (presetState.status === 'loading') {
      setSpeechNotice(SCENE_LOADING_MESSAGE);
      return;
    }
    const dirty =
      basicChanged() ||
      presetState.dirty ||
      presetState.pending ||
      imagesPendingRef.current !== null ||
      flow.imageError !== null ||
      storyImagesDirty() ||
      savedFacesChanged() ||
      newFacesChanged();
    if (dirty) {
      setSpeechNotice(
        sectionDirtyMessage(
          label,
          showProfileTemporary
            ? '먼저 저장해 주세요. 아래 「임시 저장」을 누른 뒤 다시 시도해 주세요.'
            : SCENE_SAVE_HINT,
        ),
      );
      return;
    }
    if (!mounted.current || !isRouteFocused()) return;
    setSpeechNotice(null);
    open();
  };
  const changeTab = (next: number) => {
    const target = sectionAt(next);
    if (target?.owner === 'scene' && onOpenScene) {
      const section: SceneSection = target.key;
      openScene(target.label, () => onOpenScene(section));
      return;
    }
    if (target?.key === 'speech' && !onOpenScene && onOpenSpeech) {
      openScene(target.label, onOpenSpeech);
      return;
    }
    setSpeechNotice(null);
    // 업로드 중에 탭을 바꾸면 업로드 주인(편집기)이 언마운트되어 결과를 잃으므로 머문다.
    if (uploadSources.current.size > 0) return;
    if (next !== tab) autoSaveRef.current();
    setTab(next);
  };

  // 목업 v15 「스토리 이미지」 카드 내용. 캐릭터 얼굴 사진은 BasicInfoForm이 캐릭터 카드 안에 그린다(characterPhotos).
  const storyPhotoCard = (
    <>
      {!isDraft && images.data?.workingCopySavedAt ? (
        <Notice message="사진은 임시 저장됐어요. 이용자는 아직 이전 사진을 봐요. 공개 범위 탭에서 저장하면 함께 반영돼요." />
      ) : null}
      {images.isError ? (
        <View style={styles.centered}>
          <Text variant="error">{`이미지를 불러오지 못했어요. (${messageOf(images.error)})`}</Text>
          <Button label="다시 시도" variant="secondary" onPress={() => void images.refetch()} />
        </View>
      ) : null}
      {/* 다시 불러오기가 실패해도 이미 편집 중인 값이 있으면 편집기를 남긴다. 언마운트하면 진행 중인 업로드를 잃는다. */}
      {editorValues === null ? (
        images.isError ? null : (
          <Text variant="caption">이미지 불러오는 중…</Text>
        )
      ) : (
        <StoryImagesEditor
          values={editorValues}
          onChange={changeImages}
          // 성공 여부를 모르는 공통 저장이 남아 있으면 같은 요청으로 다시 보내야 하므로 사진도 고치지 않게 한다.
          // 성패를 모르는 사진 자동 임시 저장도 같은 요청으로 다시 보내야 하므로 확인 전에는 사진을 고정한다.
          disabled={saving || presetState.pending || imagesPending !== null}
          unsavedCharacterNames={unsavedCharacterNames}
          onDragActiveChange={setDragging}
          onUploadActiveChange={(source, active) => trackUpload(`images:${source}`, active)}
          includeCharacters={false}
        />
      )}
    </>
  );

  return (
    <Surface style={styles.container}>
      {/* CREATE-US-12 목업 renderEditor 머리글: 압축 제목·상태 배지·저장 정책 한 줄·가로 스크롤 6개 탭 */}
      <EditorHeader
        title={values.title || '새 스토리'}
        onBack={onBack}
        backLabel="목록으로 돌아가기"
        badge={saved.saveState}
        status={saveStatusLine(!isDraft)}
        tabs={TABS}
        activeIndex={tab}
        onTabChange={changeTab}
      />
      <ScrollView
        testID="story-editor-body"
        style={styles.body}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!dragging}
      >
        {deleteError && !(tab === PUBLISH_TAB && confirmingDelete) ? (
          <Notice tone="alert" message={deleteError} />
        ) : null}
        {speechNotice ? <Notice tone="alert" message={speechNotice} /> : null}
        {tab === 0 ? (
          <>
            {issues.length > 0 ? (
              <Notice tone="alert" message="공개·비공개로 저장하려면 표시된 항목을 채워 주세요." />
            ) : null}
            <BasicInfoForm
              values={values}
              onChange={(update) => {
                // 성공 여부를 모르는 공통 저장이 남아 있으면 같은 요청으로 다시 보내야 하므로 입력을 막는다.
                if (waitingForSave.current || presetState.pending) return;
                // 저장 중에는 캐릭터 목록(추가·삭제·순서)을 고정한다. 응답의 캐릭터 id는 보낸 행 순서대로 오므로,
                // 그 사이 목록이 바뀌면 id가 다른 행에 붙을 수 있다. 이름·상세 같은 글 입력은 그대로 받는다.
                setValues((v) => {
                  if (!v) return v;
                  const next = update(v);
                  if (saving && !sameRoster(v, next)) return v;
                  // 사진 업로드·성패를 모르는 사진 저장이 남아 있으면 캐릭터 삭제만 막는다(카드 안 사진 편집기가 언마운트된다).
                  if (photoEditorBusy() && next.characters.length < v.characters.length) return v;
                  return next;
                });
              }}
              removeCharacterDisabled={imagesPending !== null || uploading}
              errors={errors}
              onDragActiveChange={setDragging}
              // CREATE-US-12 목업 v15 basic(): 스토리 정보 → 스토리 이미지 카드 → 등장 캐릭터(카드마다 얼굴 사진이 이름 위)
              characterPhotos={{
                values: editorValues,
                error: images.isError ? messageOf(images.error) : null,
                onChange: changeImages,
                disabled: saving || presetState.pending || imagesPending !== null,
                onDragActiveChange: setDragging,
                onUploadActiveChange: (source, active) => trackUpload(`images:${source}`, active),
                // 저장된 캐릭터는 서버 id, 비공개·공개 스토리의 새 캐릭터는 편집용 목록 id, 미등록 스토리의 새 캐릭터는 저장 뒤에 붙인다.
                photoIdOf: (ch) => (ch.id ? ch.id : pickNewCharacterImages ? `${NEW_CHARACTER}${ch.key}` : null),
              }}
              storyPhotos={
                // 목업 .section 「스토리 이미지」 구역 카드
                <Card tone="section">{storyPhotoCard}</Card>
              }
            />
          </>
        ) : isProfileTab ? (
          presetState.status === 'loading' ? (
            <Text variant="caption">유저 프로필 불러오는 중…</Text>
          ) : presetState.status === 'error' ? (
            <View style={styles.centered}>
              <Text variant="error">{`유저 프로필을 불러오지 못했어요. (${errorText(presetState.query.error)})`}</Text>
              <Button label="프로필 다시 불러오기" variant="secondary" onPress={() => void presetState.reload()} />
            </View>
          ) : presetState.status === 'unavailable' || !presetState.presets ? (
            <Notice
              tone="alert"
              message="유저 프로필을 불러오지 못했어요. 서버가 프로필 목록을 알려 주지 않아 편집·저장할 수 없어요."
            />
          ) : (
            // 목업 profiles(): 「이용자에게 건넬 역할」 구역 카드
            // 목업 v15: h2 「이용자에게 건넬 역할」 + .muted 설명 → 프로필 .item 카드들 → 「+ 추천 프로필 추가」 → 안내
            <Section card first title="이용자에게 건넬 역할" description="제작자 추천 프로필을 0~5개 제공할 수 있어요.">
              {isDraft ? <Text variant="caption">저장하면 기본 정보와 함께 저장돼요.</Text> : null}
              {workingCopySavedAt ? (
                <Notice message="임시 저장한 내용이 있어요. 이용자는 아직 이전 내용을 봐요. 공개 범위 탭에서 저장하면 반영돼요." />
              ) : null}
              {presetState.pending ? (
                <Notice message="이전 저장 결과를 확인할 때까지 고칠 수 없어요. 다시 저장해 주세요." />
              ) : presetState.error && !saving ? (
                <Button
                  label="프로필 다시 불러오기"
                  variant="secondary"
                  onPress={() => void presetState.reload()}
                  disabled={writeBlocked}
                />
              ) : null}
              <UserProfilePresetEditor
                presets={presetState.presets}
                characterNames={values.characters.map((character) => character.name)}
                onChange={presetState.setPresets}
                uploadImages
                editable={!saving && !presetState.pending}
                onDragActiveChange={setDragging}
                onUploadActiveChange={(source, active) => trackUpload(`presets:${source}`, active)}
              />
            </Section>
          )
        ) : (
          <>
            {/* 라우트가 넘기기를 주지 않은 단독 사용에서만 보인다. 앱에서는 작업 화면이 이 구역을 맡는다. */}
            <Notice message={`${TABS[tab]} 탭은 아직 연결되지 않았어요.`} />
            {tab === PUBLISH_TAB ? (
              <Card tone="section">
                <StoryDeleteSection
                  storyId={storyId}
                  storyTitle={saved.title}
                  onDeleted={onDeleted}
                  isRouteFocused={isRouteFocused}
                  showHeading={false}
                  confirming={confirmingDelete}
                  onConfirmingChange={setConfirmingDelete}
                  isHostMounted={() => mounted.current}
                />
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
      {/* CREATE-US-12 목업 .bottom 하단 고정 줄. 유저 프로필도 이 저장 버튼으로 기본 정보와 함께 저장한다 */}
      {
        <StickyFooter
          statusFullWidth={imagesPending !== null || !!flow.imageError}
          status={
            autoSaving ? (
              <Text variant="caption">{queuedSave ? QUEUED_SAVE_MESSAGE : AUTO_SAVING_MESSAGE}</Text>
            ) : saving ? (
              <Text variant="caption">{queuedSave ? QUEUED_SAVE_MESSAGE : '저장 중…'}</Text>
            ) : uploading ? (
              <Text variant="caption">{UPLOAD_WAIT_MESSAGE}</Text>
            ) : imagesPending ? (
              <View style={styles.imageFailure}>
                <Text variant="error">{lockError ?? AUTO_IMAGES_HELD_MESSAGE}</Text>
                <Button
                  label={IMAGES_RETRY_LABEL}
                  variant="secondary"
                  onPress={retryPendingImages}
                  disabled={writeBlocked}
                />
              </View>
            ) : lockError ? (
              <Text variant="error">{lockError}</Text>
            ) : presetState.error ? (
              <Text variant="error">{presetState.error}</Text>
            ) : save.isError ? (
              <Text variant="error">{saveErrorMessage(save.error)}</Text>
            ) : flow.imageError ? (
              <View style={styles.imageFailure}>
                <Text variant="error">{imageSaveErrorMessage(flow.imageError, imageValues)}</Text>
                <Button label="사진만 다시 저장" variant="secondary" onPress={retryImages} disabled={writeBlocked} />
              </View>
            ) : (
              <Text variant="caption">
                {workingCopySavedAt
                  ? `${formatSavedAt(saved.updatedAt)} · ${formatSavedAt(workingCopySavedAt, '임시 저장')}`
                  : formatSavedAt(saved.updatedAt)}
              </Text>
            )
          }
        >
          {showProfileTemporary ? (
            <Button
              label={presetState.errorKind === 'temporary' ? '임시 저장 다시 시도' : '임시 저장'}
              variant="secondary"
              onPress={() => pressSave('temporary')}
              disabled={saveBlocked}
            />
          ) : null}
          <Button
            label={
              presetState.pendingKind === 'temporary' && !isDraft
                ? '임시 저장 다시 시도'
                : save.isError || presetState.errorKind === 'save' || (isDraft && presetState.error)
                  ? '다시 저장'
                  : isDraft
                    ? '임시 저장'
                    : '변경 내용 저장'
            }
            variant="action"
            style={styles.mainSave}
            onPress={() => pressSave('main')}
            disabled={saveBlocked}
          />
        </StickyFooter>
      }
    </Surface>
  );
}

/** 기본 정보는 저장됐고 사진 단계만 실패했음을 알리는 첫 문장 */
const IMAGE_STEP_FAILED = '기본 정보는 저장됐지만 사진은 반영되지 않았어요.';

/**
 * 이미지 단계 실패 안내. 어느 단계까지 성공했는지 먼저 알린다.
 * 완성 저장된 스토리에서 캐릭터의 마지막 이미지를 지우면 서버가 거절한다(CREATE-US-06-AC08).
 * 이때는 누락된 캐릭터 이름을 알려 준다.
 */
function imageSaveErrorMessage(error: Error, values: StoryImagesValues | null): string {
  if (error instanceof ApiError && error.code === 'CHARACTER_IMAGE_REQUIRED') {
    return `${IMAGE_STEP_FAILED} ${requiredImageMessage(
      values,
      error.issues.map((issue) => issue.value ?? ''),
    )}`;
  }
  const reason = error instanceof ApiError ? error.detail : error.message || '알 수 없는 오류가 발생했습니다.';
  return `${IMAGE_STEP_FAILED} 고른 사진은 그대로예요. (${reason})`;
}

function Centered({
  message,
  alert,
  onBack,
  onRetry,
}: {
  message: string;
  alert?: string;
  onBack: () => void;
  onRetry?: () => void;
}) {
  return (
    <Surface style={styles.container}>
      <ScreenHeader title="스토리" onBack={onBack} backLabel="목록으로 돌아가기" />
      <View style={styles.centered}>
        <Text variant="caption">{message}</Text>
        {alert && alert !== message ? <Notice tone="alert" message={alert} /> : null}
        {onRetry ? <Button label="다시 시도" variant="secondary" onPress={onRetry} /> : null}
      </View>
    </Surface>
  );
}

/** 캐릭터 행 구성(key 순서)이 같은지. 추가·삭제·순서 변경이면 false. */
function sameRoster(a: BasicInfoValues, b: BasicInfoValues): boolean {
  return a.characters.length === b.characters.length && a.characters.every((ch, i) => ch.key === b.characters[i].key);
}

/** 기본 정보·프리셋을 보내지 않았다는 안내의 첫 문장 */
const BLOCKED = '저장하지 않았어요. 입력은 그대로예요.';
/** CREATE-US-07-AC05 임시 저장본 기본 정보가 있어 공개 정본에 바로 쓰지 않았다는 안내 */
/**
 * CREATE-US-07-AC09 마무리 가능 응답을 받은 자동 임시 저장 한 번(키·임시 저장본 시각·보낸 기본 정보).
 * - creation: 공통 자동 임시 저장(/creation mode auto). workingCopySavedAt은 그 응답의 working_copy_saved_at.
 * - images: 비공개·공개 스토리의 사진만 자동 임시 저장(/images mode auto). workingCopySavedAt은 그 응답의
 *   working_copy_saved_at(사진 임시본 시각)이고, basic은 항상 null이다.
 */
type AutoFinalizeToken = {
  source: 'creation' | 'images';
  requestId: string;
  workingCopySavedAt: string;
  basic: StoryBasicFields | null;
  rowKeys: string[];
};
const FINALIZE_UNBOUND_MESSAGE = '저장은 됐지만 캐릭터 목록을 맞추지 못했어요. 화면을 다시 열어 확인해 주세요.';
const WORKING_COPY_BLOCKED = `${BLOCKED} 임시 저장한 내용(말투·서술·인트로·초기 상태·사진)이 남아 있어 바로 반영하지 않았어요. 공개 범위 탭에서 저장하면 함께 반영돼요.`;
const STAGED_BASIC_BLOCKED =
  '저장하지 않았어요. 입력은 그대로예요. 임시 저장한 내용(기본 정보)이 남아 있어 바로 반영하지 않았어요. 공개 범위 탭에서 저장하면 함께 반영돼요. 그 뒤 바꾼 내용이 있으면 기본 설정에서 먼저 임시 저장해 주세요.';

/** 앱이 보내기 전에 막은 오류(스토리 id 형식 등)는 그 문구를, 서버 오류는 detail을 보여 준다. */
function errorText(error: Error | null): string {
  if (error instanceof ApiError) return error.detail;
  return error?.message || '알 수 없는 오류가 발생했습니다.';
}

function messageOf(error: Error | null): string {
  return error instanceof ApiError ? error.detail : '알 수 없는 오류가 발생했습니다.';
}

function saveErrorMessage(error: Error): string {
  if (error instanceof ApiError && error.code === 'STORY_INCOMPLETE') {
    return '저장 조건을 충족하지 않아 저장하지 않았어요. 입력한 내용은 그대로예요.';
  }
  return `저장하지 못했어요. 입력한 내용은 그대로예요. (${messageOf(error)})`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1 },
  // CREATE-US-12 목업 .unified-theme .content: 20px 16px 28px
  content: {
    paddingTop: ContentInset.top,
    paddingHorizontal: ContentInset.horizontal,
    paddingBottom: ContentInset.bottom,
  },
  // 하단 저장 버튼은 상태 글과 폭을 나누되 글자가 줄지 않게 둔다(목업 .bottom .primary).
  mainSave: { flexShrink: 0, minWidth: 118 },
  imageFailure: { gap: Spacing.one, alignItems: 'flex-start' },
  centered: { padding: Spacing.four, gap: Spacing.two },
});
