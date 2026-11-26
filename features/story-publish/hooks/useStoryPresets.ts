// CREATE-US-05/07 편집 화면의 유저 프로필 프리셋: 공통 저장(/creation)으로 불러오고, 기본 정보와 한 요청으로 저장한다.
// CREATE-US-07-AC09 자동 임시 저장도 이 훅이 같은 공통 저장 한 요청으로 보낸다(바뀐 기본 정보·프리셋만).
// 프리셋만 따로 보내는 API는 쓰지 않는다. 2~4번 영역은 저장 직전에 다시 불러온 값을 그대로 돌려보낸다.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { presetsFromDraft, presetsToDraftPatch, type PresetValues } from '@/features/story-setup';
import { ApiError } from '@/lib/api-client';
import {
  newFewshotKey,
  type CreationSaveKind,
  type CreationSaveMode,
  type CreationSaveState,
} from '@/shared/story-types';
import type { UserProfilePresetRecord } from '@/shared/story-types/presets';
import { DEFAULT_CONTENT_RATING, type ContentRating } from '@/shared/rating';

import { toWriteDto } from '../api';
import {
  createCommonSaveRepository,
  presetsPayload,
  type CommonSaveDocument,
  type CommonSaveRepository,
  type CreationImagesPayload,
  type CreationRating,
  type StagedBasicFields,
} from '../commonRepository';
import type { StoryBasicFields } from '../types';
import { rejectionMessage } from './useCommonSave';
import { storyKeys } from './useStories';

export const storyCreationKey = (id: string) => [...storyKeys.all, 'creation', id] as const;

const defaultRepository = createCommonSaveRepository(process.env.EXPO_PUBLIC_API_URL ?? '');

/**
 * - loading: 불러오는 중
 * - error: 불러오기 실패(스토리 id 형식 오류 포함)
 * - unavailable: 응답에 presets가 없음. 서버가 알려 주지 않은 목록을 빈 목록으로 지어내 지우지 않도록 편집·저장을 막는다
 * - ready: 편집·저장 가능
 */
export type PresetStatus = 'loading' | 'error' | 'unavailable' | 'ready';

/**
 * 저장 결과. 성공하면 서버가 응답한 캐릭터 id(보낸 순서)와, 그 요청 본문을 만들 때의 화면 행 key(같은 순서)를 돌려준다.
 * 같은 키로 다시 보낸 경우 rowKeys는 지금 화면이 아니라 처음 보낸 본문의 행이다.
 * - rowKeys가 비어 있으면 응답의 캐릭터 id를 화면 행에 붙이지 않는다(기본 정보를 보내지 않았거나,
 *   비공개·공개 스토리의 임시 저장이라 응답 캐릭터가 임시 저장본의 새 행이 아닌 공개 정본인 경우).
 * - basic: 이 요청이 실제로 보낸 기본 정보(다시 보낸 경우 처음 본문). 보내지 않았으면 null.
 * - stagedBasic: 응답의 임시 저장본 기본 정보. 없으면 null.
 */
export type PresetSaveResult =
  | {
      ok: true;
      kind: CreationSaveKind;
      characterIds: string[];
      rowKeys: string[];
      basic: StoryBasicFields | null;
      stagedBasic: StagedBasicFields | null;
      /**
       * CREATE-US-07-AC09 자동 임시 저장(mode auto) 응답이 마무리 가능하다고 알린 요청 키
       * (finalize_auto_request_id가 보낸 키와 같고 working_copy_saved_at이 있음). 그 밖에는 null.
       */
      finalizableAutoRequestId: string | null;
      /** 응답의 임시 저장본 시각(working_copy_saved_at). 없으면 null. */
      workingCopySavedAt: string | null;
      /** 이 요청이 실제로 보낸 images(다시 보낸 경우 처음 본문). 보내지 않았으면 null. */
      images: CreationImagesPayload | null;
      /**
       * basic.characters 각 위치를 만든 화면 행 key(다시 보낸 경우 처음 본문 기준). rowKeys와 달리 임시 저장에서도 비우지 않는다.
       * CREATE-US-07-AC09: 임시 저장본에 보낸 새 캐릭터 얼굴(basic_index)을 응답 순서가 아니라 보낸 행에 연결할 때 쓴다.
       */
      sentRowKeys: string[];
    }
  | {
      ok: false;
      /**
       * 요청을 보냈고 서버가 확실히 거절했음(성공 여부를 모르는 실패·보내기 전 확인 실패는 아님).
       * 화면은 이 경우에만 마무리 키를 버린다(사전 조회 실패 뒤에는 같은 키로 다시 마무리할 수 있게 남긴다).
       */
      rejected?: true;
    };

type Operation = {
  document: CommonSaveDocument;
  state: CreationSaveState;
  /**
   * 저장 의도. 성공 여부를 모르는 요청을 다시 보낼 때도 처음 의도(temporary·save)와 키를 그대로 쓴다.
   * CREATE-US-05-AC06: 임시 저장은 미완성 프리셋을 원문 그대로 보내고, 공개 상태를 바꾸지 않는다.
   */
  kind: CreationSaveKind;
  /**
   * 요청 방식. CREATE-US-07-AC09 자동 임시 저장은 auto다. 성공 여부를 모르는 자동 저장을 다시 보낼 때도
   * 같은 키·같은 본문이어야 하므로 manual로 바꾸지 않고 처음 방식 그대로 보낸다.
   */
  mode: CreationSaveMode;
  key: string;
  /** document.basic.characters[i]를 만든 화면 행의 key. 다시 보낼 때도 이 연결을 그대로 쓴다. */
  rowKeys: string[];
  /** 거르지 않은 basic.characters 행 key(PresetSaveResult.sentRowKeys). 기본 정보를 보내지 않았으면 []. */
  sentRowKeys: string[];
};

/** CREATE-US-08-AC12 검토 상태 새로고침: idle(대기)·loading(조회 중)·failed(조회 실패, 화면 상태는 그대로) */
export type ReviewRefreshStatus = 'idle' | 'loading' | 'failed';

/**
 * CREATE-US-08-AC12 새로고침 응답에서 적용 등급·검토 상태·검토 사유만 가져온다.
 * 고른 등급(requested)은 이 화면이 가진 값을 그대로 둔다(조회 응답으로 선택·비교 기준을 바꾸지 않는다).
 */
function mergeReviewResult(current: CreationRating | undefined, fresh: CreationRating): CreationRating {
  return {
    requested: current ? current.requested : fresh.requested,
    effective: fresh.effective,
    reviewStatus: fresh.reviewStatus,
    ...(fresh.reason ? { reason: fresh.reason } : {}),
  };
}

/** 비교용: 화면 표시 주소(photoUrl)는 이미지 identity가 아니므로 빼고 비교한다. */
function comparable(records: UserProfilePresetRecord[]) {
  return JSON.stringify(
    records.map((p) => ({ id: p.id ?? null, name: p.name, detail: p.detail, imageId: p.imageId ?? null })),
  );
}

function toRecords(presets: PresetValues[]): UserProfilePresetRecord[] {
  return presetsToDraftPatch(presets).userProfilePresets;
}

/**
 * 서버가 거절한 것이 아니라 전송·응답 확인이 실패한 경우. 서버에는 반영됐을 수 있으므로
 * 같은 요청(같은 Idempotency-Key)으로 다시 보내야 새 프로필·캐릭터가 두 번 만들어지지 않는다.
 * 요청 본문 변환 오류는 보내기 전에 따로 걸러 내므로, 여기 오는 ApiError 밖의 오류는 응답 해석 실패다.
 */
/** 서버 반영 여부를 알 수 없는 실패(네트워크·시간 초과·5xx·429). 편집 화면의 사진 자동 임시 저장도 같은 기준을 쓴다. */
export function isUncertain(failure: unknown): boolean {
  if (!(failure instanceof ApiError)) return true;
  if (failure.status === 0) return failure.code === 'NETWORK_ERROR';
  return failure.status >= 500 || failure.status === 408 || failure.status === 429;
}

function messageOf(failure: unknown): string {
  if (failure instanceof ApiError) return rejectionMessage(failure);
  return failure instanceof Error && failure.message ? failure.message : '알 수 없는 오류가 발생했습니다.';
}

export function useStoryPresets(
  storyId: string,
  enabled: boolean,
  repository: CommonSaveRepository = defaultRepository,
) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: storyCreationKey(storyId),
    queryFn: ({ signal }) => repository.load(storyId, signal),
    enabled,
  });
  // null = 아직 채우지 않음. 서버 응답(정본)과 입력 중인 값을 따로 둔다.
  const [presets, setPresets] = useState<PresetValues[] | null>(null);
  const [baseline, setBaseline] = useState<UserProfilePresetRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attemptKind, setAttemptKind] = useState<CreationSaveKind>('save');
  // 성공 여부를 모르는 앞선 요청의 저장 의도. 없으면 null. 화면은 이 값으로 다시 보낼 버튼을 고른다.
  const [pendingKind, setPendingKind] = useState<CreationSaveKind | null>(null);
  const pending = pendingKind !== null;
  const operation = useRef<Operation | null>(null);
  // 서버가 거절했거나(성공 여부가 확실한 실패) 다른 곳의 수정과 겹쳐 보내지 않은 프리셋 내용(comparable).
  // 자동 임시 저장은 같은 내용을 주기마다 다시 보내지 않는다. 입력을 고치면 다시 자동 저장한다.
  const failedFor = useRef<string | null>(null);
  // 같은 이유로 보내지 않은(거절·충돌) 기본 정보 내용(JSON). 자동 임시 저장은 실을 영역이 모두 이 기록과 같으면 보내지 않는다.
  const failedBasicFor = useRef<string | null>(null);
  // CREATE-US-08-AC01/13 등급 선택. 조회 응답의 requested_rating(없으면 SAFE)으로 처음 한 번 채우고, 그 값이 비교 기준이다.
  // 선택이 기준과 다를 때만 공통 저장 요청에 requested_rating으로 싣는다(같으면 빼서 서버가 유지한다).
  const [rating, setRatingValue] = useState<ContentRating | null>(null);
  const [ratingBaseline, setRatingBaseline] = useState<ContentRating | null>(null);
  // 같은 이유로 보내지 않은(거절·충돌) 등급. 자동 임시 저장은 같은 선택을 주기마다 다시 보내지 않는다.
  const failedRatingFor = useRef<ContentRating | null>(null);
  // 지금 안내(error)가 기본 정보만 실은 요청의 확실한 실패(거절·차단)에서 왔는지. 프리셋·이미지를 함께 실었거나
  // 성패를 모르는 실패면 false다. 기본 정보가 다른 경로로 저장되면 이 안내만 지운다(clearBasicFailure).
  const basicOnlyError = useRef(false);

  useEffect(() => {
    if (presets !== null || !query.data?.presets) return;
    setPresets(presetsFromDraft(query.data.presets));
    setBaseline(query.data.presets);
  }, [presets, query.data]);

  useEffect(() => {
    if (rating !== null || !query.data) return;
    const restored = query.data.rating?.requested ?? DEFAULT_CONTENT_RATING;
    setRatingValue(restored);
    setRatingBaseline(restored);
  }, [rating, query.data]);

  const status: PresetStatus =
    presets !== null ? 'ready' : query.isError ? 'error' : query.data ? 'unavailable' : 'loading';
  const dirty = presets !== null && baseline !== null && comparable(toRecords(presets)) !== comparable(baseline);
  const ratingDirty = rating !== null && ratingBaseline !== null && rating !== ratingBaseline;

  // CREATE-US-08-AC12 검토 상태 새로고침. 상태는 그 요청을 시작한 스토리 id와 함께 둔다(다른 스토리로 바뀌면 idle).
  const [reviewRefreshState, setReviewRefreshState] = useState<{ storyId: string; status: ReviewRefreshStatus }>({
    storyId,
    status: 'idle',
  });
  const reviewRefresh: ReviewRefreshStatus =
    reviewRefreshState.storyId === storyId ? reviewRefreshState.status : 'idle';
  // 저장 요청(send)을 보낼 때마다 늘린다. 새로고침은 시작할 때 값과 다르면 응답을 버린다.
  const writeEpoch = useRef(0);
  const refreshController = useRef<AbortController | null>(null);
  // 화면을 떠나거나 다른 스토리로 바뀌면 진행 중인 새로고침을 멈추고 응답을 버린다.
  useEffect(
    () => () => {
      refreshController.current?.abort();
      refreshController.current = null;
    },
    [storyId],
  );

  /**
   * CREATE-US-08-AC12 검토 상태를 GET(/creation) 한 번으로 다시 확인한다. 저장(PUT)·새 요청·자동 재시도는 없다.
   * 반영하는 것은 적용 등급·검토 상태·검토 사유뿐이다. 고른 등급(requested)·입력·임시 저장본·저장 시각 등
   * 나머지 조회 값은 이 화면이 가진 그대로 둔다(다시 연 화면은 새 조회로 모두 보여 준다).
   * 다음이면 응답을 버린다: 그사이 저장 요청을 보냄, 캐시의 공통 문서가 바뀜(저장 응답·다시 불러오기),
   * 화면을 떠남·스토리가 바뀜. 성공 여부를 모르는 저장이 남아 있으면 보내지 않는다.
   */
  const refreshRatingReview = async (): Promise<void> => {
    if (operation.current !== null || refreshController.current !== null) return;
    const id = storyId;
    const key = storyCreationKey(id);
    if (!client.getQueryData<CommonSaveDocument>(key)) return;
    const epoch = writeEpoch.current;
    const controller = new AbortController();
    refreshController.current = controller;
    setReviewRefreshState({ storyId: id, status: 'loading' });
    // 이미 진행 중인 같은 문서 조회(refetch)는 이 새로고침보다 먼저 시작한 오래된 조회다.
    // 늦게 끝나 새로고침 결과를 덮지 않도록 먼저 멈추고(끝날 때까지 기다린다) 그 뒤의 캐시를 기준으로 삼는다.
    await client.cancelQueries({ queryKey: key, exact: true });
    // 기다리는 동안 저장을 보냈거나 화면을 떠났거나 스토리가 바뀌었으면 조회하지 않는다.
    if (refreshController.current !== controller || controller.signal.aborted) return;
    const startData = client.getQueryData<CommonSaveDocument>(key);
    if (epoch !== writeEpoch.current || operation.current !== null || !startData) {
      refreshController.current = null;
      setReviewRefreshState({ storyId: id, status: 'idle' });
      return;
    }
    let fresh: CommonSaveDocument;
    try {
      fresh = await repository.load(id, controller.signal);
    } catch {
      if (refreshController.current !== controller || controller.signal.aborted) return;
      refreshController.current = null;
      setReviewRefreshState({ storyId: id, status: 'failed' });
      return;
    }
    if (refreshController.current !== controller || controller.signal.aborted) return;
    refreshController.current = null;
    const current = client.getQueryData<CommonSaveDocument>(key);
    // 그사이 저장을 보냈거나(진행 중 포함) 캐시 문서가 바뀌었으면 버린다. 반영할 때도 rating 밖의 값은 캐시 그대로다.
    // 스토리가 바뀌거나 화면을 떠나면 위 abort 검사에서 이미 멈춘다(key도 시작한 스토리 id 기준).
    if (
      epoch === writeEpoch.current &&
      operation.current === null &&
      current !== undefined &&
      current === startData &&
      fresh.rating
    ) {
      const merged = mergeReviewResult(current.rating, fresh.rating);
      client.setQueryData<CommonSaveDocument>(key, { ...current, rating: merged });
    }
    setReviewRefreshState({ storyId: id, status: 'idle' });
  };

  /** 입력을 버리고 서버의 최신 프리셋으로 다시 채운다(불러오기 실패·동시 수정 뒤). */
  const reload = useCallback(async () => {
    const fresh = await query.refetch();
    if (fresh.data?.presets) {
      setPresets(presetsFromDraft(fresh.data.presets));
      setBaseline(fresh.data.presets);
      setError(null);
    }
  }, [query]);

  const send = async (op: Operation): Promise<PresetSaveResult> => {
    // 저장 요청을 보내기 시작했다. 이보다 먼저 시작한 검토 상태 새로고침은 멈추고 응답을 반영하지 않는다.
    writeEpoch.current += 1;
    if (refreshController.current) {
      refreshController.current.abort();
      refreshController.current = null;
    }
    setReviewRefreshState({ storyId, status: 'idle' });
    try {
      const result = await repository.save(op.document, op.state, op.mode, op.key, op.kind);
      operation.current = null;
      failedFor.current = null;
      failedBasicFor.current = null;
      failedRatingFor.current = null;
      basicOnlyError.current = false;
      setPendingKind(null);
      setError(null);
      client.setQueryData(storyCreationKey(storyId), result);
      // CREATE-US-08-AC13 보낸 등급이 새 비교 기준이다(응답의 requested_rating이 있으면 그 값). 보내지 않았으면 선택을 그대로 둔다.
      const sentRating = op.document.requestedRating ?? null;
      if (sentRating !== null) {
        const savedRating = result.rating?.requested ?? sentRating;
        setRatingBaseline(savedRating);
        setRatingValue((current) => (current === sentRating ? savedRating : current));
      }
      // 상세(공개 정본의 기본 정보·공개 상태)는 「저장」이나 미등록 스토리의 기본 정보 임시 저장에서만 바뀐다.
      // 비공개·공개 스토리의 임시 저장(기본 정보 포함)은 임시 저장본만 바꾸므로 다시 받지 않는다.
      if (op.kind === 'save' || (op.document.basic && op.state === 'draft'))
        void client.invalidateQueries({ queryKey: storyKeys.detail(storyId) });
      void client.invalidateQueries({ queryKey: storyKeys.list() });
      if (result.presets) {
        // 저장 중에는 편집을 막으므로, 응답의 정본(서버 id·순서·{{user}} 원문)으로 그대로 바꾼다.
        setPresets(presetsFromDraft(result.presets));
        setBaseline(result.presets);
      } else {
        // 서버가 정본을 알려 주지 않으면 새 프로필의 id를 모른다. 다시 저장해 중복 생성하지 않게 다시 불러온다.
        setPresets(null);
        setBaseline(null);
        void query.refetch();
      }
      const characters = [...result.characters].sort((a, b) => a.position - b.position).map((c) => c.id);
      return {
        ok: true,
        kind: op.kind,
        characterIds: characters,
        rowKeys: op.rowKeys,
        basic: op.document.basic ?? null,
        stagedBasic: result.stagedBasic ?? null,
        finalizableAutoRequestId:
          op.mode === 'auto' && result.finalizableAutoRequestId === op.key ? result.finalizableAutoRequestId : null,
        workingCopySavedAt: result.workingCopySavedAt ?? null,
        images: op.document.images ?? null,
        sentRowKeys: op.sentRowKeys,
      };
    } catch (failure) {
      const uncertain = isUncertain(failure);
      if (!uncertain) {
        operation.current = null;
        if (op.document.presets) failedFor.current = comparable(op.document.presets);
        if (op.document.requestedRating) failedRatingFor.current = op.document.requestedRating;
        if (op.document.images) {
          failedBasicFor.current = JSON.stringify({ basic: op.document.basic, images: op.document.images });
        } else if (op.document.basic) failedBasicFor.current = JSON.stringify(op.document.basic);
      }
      basicOnlyError.current = !uncertain && !!op.document.basic && !op.document.presets && !op.document.images;
      setAttemptKind(op.kind);
      setPendingKind(uncertain ? op.kind : null);
      setError(
        uncertain
          ? '저장 성공 여부를 확인하지 못했어요. 입력은 그대로이고, 다시 저장하면 같은 요청을 보내요.'
          : messageOf(failure),
      );
      return uncertain ? { ok: false } : { ok: false, rejected: true };
    }
  };

  /**
   * 기본 정보와 프리셋(바뀐 경우)·캐릭터 얼굴 이미지(images)를 공통 저장 한 요청으로 보낸다.
   * 공개 상태는 지금 그대로 보낸다(임시 저장·저장 어느 쪽도 공개 상태를 바꾸지 않는다).
   * - kind: save(기본값)는 반영, temporary(CREATE-US-05-AC06)는 임시 저장. 임시 저장에는 images를 싣지 않는다.
   * - basic이 null이면 기본 정보를 요청에서 빼서 서버가 기존 값을 유지한다(비공개·공개 스토리의 프로필만 임시 저장).
   * - 성공 여부를 모르는 앞선 요청이 있으면 입력·kind와 관계없이 그 요청을 처음 의도·같은 키로 다시 보낸다.
   * - 그 밖에는 최신 공통 문서를 다시 불러와 2~4번을 그대로 돌려보낸다.
   * - 프리셋은 바뀐 경우에만 싣는다. 실을 때 그 사이 다른 곳에서 프리셋이 바뀌었으면 덮어쓰지 않는다.
   *   싣지 않으면 서버가 기존 프리셋을 그대로 둔다.
   * - images(CREATE-US-07-AC07)는 받은 그대로 싣는다. null이면 뺀다(통합 전과 같은 요청).
   * - blockers(완성 저장 스토리에서 원자적으로 함께 반영할 수 없는 변경)가 있으면 보내지 않는다.
   * - rowKeys는 basic.characters 각 위치의 화면 행 key다. 요청과 함께 기억해 다시 보낼 때도 그대로 돌려준다.
   * - mode: manual(기본값)은 지금 동작 그대로다. auto(CREATE-US-07-AC09)는 autoSave만 쓴다:
   *   바뀐 기본 정보·프리셋만 temporary로 보내고(이미지 제외), 성공 여부를 모르는 앞선 요청은 다시 보내지 않으며,
   *   시작할 때 안내를 지우지 않는다.
   * - finalizeAutoRequestId(CREATE-US-07-AC09): 마무리 가능 응답을 받은 자동 임시 저장의 키. 값이 있으면
   *   기본 정보·프리셋·이미지를 싣지 않고 kind save·mode manual로 그 키만 finalize_auto_request_id로 보낸다
   *   (basic·images·rowKeys·kind·mode 인자는 무시). blockers는 그대로 적용한다. 성공 여부를 모르면 같은 요청을
   *   operation에 남겨 같은 키·같은 본문으로 다시 보낸다.
   */
  const saveWithBasic = async (
    basicArg: StoryBasicFields | null,
    blockers: (fresh: CommonSaveDocument) => string | null,
    imagesArg: CreationImagesPayload | null = null,
    rowKeysArg: string[] = [],
    kindArg: CreationSaveKind = 'save',
    modeArg: CreationSaveMode = 'manual',
    finalizeAutoRequestId: string | null = null,
  ): Promise<PresetSaveResult> => {
    const finalize = typeof finalizeAutoRequestId === 'string' && finalizeAutoRequestId !== '';
    const basic = finalize ? null : basicArg;
    const images = finalize ? null : imagesArg;
    const rowKeys = finalize ? [] : rowKeysArg;
    const kind: CreationSaveKind = finalize ? 'save' : kindArg;
    const mode: CreationSaveMode = finalize ? 'manual' : modeArg;
    const auto = mode === 'auto';
    const includePresets = !finalize && dirty && presets !== null && baseline !== null;
    const content = includePresets ? comparable(toRecords(presets)) : null;
    const basicContent = images ? JSON.stringify({ basic, images }) : basic ? JSON.stringify(basic) : null;
    // CREATE-US-08-AC13 바뀐 등급 선택만 싣는다. 마무리(finalize) 요청에는 싣지 않는다.
    const requestedRating: ContentRating | null = !finalize && ratingDirty ? rating : null;
    // 직접 저장은 지금처럼 시작할 때 안내를 지운다. 자동 저장은 남아 있는 직접 저장 안내(차단 사유 등)를
    // 시작만으로 지우지 않고, 자기 실패를 알릴 때만 안내와 그 의도(errorKind)를 바꾼다.
    // remember: 같은 내용을 자동 저장이 다시 보내지 않도록 이번에 실으려던 프리셋·기본 정보를 기억한다.
    const fail = (message: string, remember = false): PresetSaveResult => {
      basicOnlyError.current = basic !== null && content === null && images === null;
      setAttemptKind(kind);
      setError(message);
      if (remember) {
        if (content !== null) failedFor.current = content;
        if (basicContent !== null) failedBasicFor.current = basicContent;
        if (requestedRating !== null) failedRatingFor.current = requestedRating;
      }
      return { ok: false };
    };
    if (!auto) setAttemptKind(operation.current?.kind ?? kind);
    if (operation.current) {
      // 성공 여부를 모르는 요청은 자동으로 다시 보내지 않는다. 화면의 재시도 버튼으로만 같은 키로 다시 보낸다.
      // 다시 보낼 때는 지금 입력이 아니라 처음 본문(기본 정보·프리셋 포함)과 키를 그대로 쓴다.
      if (auto) return { ok: false };
      return send(operation.current);
    }
    if (auto) {
      // CREATE-US-07-AC09: 바뀐 기본 정보·프리셋·이미지를 임시 저장으로만 보낸다.
      if ((!includePresets && basic === null && images === null && requestedRating === null) || kind !== 'temporary')
        return { ok: false };
      if (sameAsFailed(content, basicContent, requestedRating)) return { ok: false };
    } else if (!finalize && !includePresets && images === null && basic === null && requestedRating === null)
      return { ok: false };

    if (!auto) setError(null);
    let fresh: CommonSaveDocument;
    try {
      fresh = await repository.load(storyId);
    } catch (failure) {
      return fail(`저장 전에 최신 내용을 불러오지 못해 저장하지 않았어요. (${messageOf(failure)})`);
    }
    if (includePresets && (!fresh.presets || comparable(fresh.presets) !== comparable(baseline))) {
      return fail('다른 곳에서 유저 프로필이 바뀌어 저장하지 않았어요. 프로필을 다시 불러온 뒤 저장해 주세요.', true);
    }
    // CREATE-US-08-AC13 바꾼 등급을 보내기 전, 최신 선택이 이 화면의 기준과 같은지 본다(근사 사전 확인. 최종 판단은 서버).
    // 최신 값이 고른 값과 같더라도 기준과 다르면 다른 곳의 변경이므로 일관되게 보내지 않는다.
    if (requestedRating !== null && (fresh.rating?.requested ?? DEFAULT_CONTENT_RATING) !== ratingBaseline) {
      return fail(
        '다른 곳에서 콘텐츠 등급이 바뀌어 저장하지 않았어요. 최신 내용을 확인한 뒤 다시 저장해 주세요.',
        true,
      );
    }
    const blocked = blockers(fresh);
    // 자동 저장이 막힌 내용은 주기마다 다시 불러와 확인하지 않는다(입력을 고치면 다시 본다).
    if (blocked) return fail(blocked, auto);
    const records = includePresets ? toRecords(presets) : null;
    try {
      // 서버가 발급하지 않은 id 등은 보내기 전에 막는다. 이 오류는 성공 여부가 불확실한 실패가 아니다.
      if (records) presetsPayload(records);
      if (basic) toWriteDto(basic);
    } catch (failure) {
      return fail(`저장하지 않았어요. (${failure instanceof ApiError ? failure.detail : messageOf(failure)})`, true);
    }
    const op: Operation = {
      // presets: null은 요청에서 빼라는 뜻이다(다시 불러온 서버 값을 되돌려 보내지 않는다).
      // 2~4번은 방금 다시 불러온 최신 문서(임시 저장본이 있으면 그 내용)를 그대로 돌려보낸다.
      // CREATE-US-07-AC03/07: 이 화면은 2~4번을 편집하지 않으므로 preserve_scene을 실어(임시 저장·저장 모두)
      // 서버가 잠금 아래 최신 2~4번을 유지하게 한다. 함께 보내는 2~4번은 호환용이다.
      // op에 담아 두므로, 다시 보낼 때도 같은 키·같은 본문(preserve_scene 포함)이 나간다.
      // finalize: 명시적으로 받은 자동 저장 키만 싣는다(응답에서 읽은 마무리 가능 키는 요청에 싣지 않는다).
      document: {
        ...fresh,
        basic,
        presets: records,
        images,
        // CREATE-US-08-AC13 다시 불러온 문서의 등급(rating, 응답 전용)은 요청에 싣지 않는다. 고른 등급만 싣는다.
        requestedRating,
        preserveScene: true,
        ...(finalize && finalizeAutoRequestId ? { finalizeAutoRequestId } : {}),
      },
      state: fresh.saveState,
      kind,
      mode,
      key: newFewshotKey('creation'),
      // 기본 정보를 보내지 않으면 응답의 캐릭터 id를 화면 행에 붙이지 않는다.
      // 비공개·공개 스토리의 임시 저장은 기본 정보를 임시 저장본에만 두므로, 응답 캐릭터(공개 정본)의 id를
      // 임시 저장본의 새 행에 붙이지 않는다. 「저장」과 미등록 스토리만 응답 id를 보낸 행 순서대로 붙인다.
      rowKeys: basic && (kind === 'save' || fresh.saveState === 'draft') ? rowKeys : [],
      sentRowKeys: basic ? rowKeys : [],
    };
    operation.current = op;
    return send(op);
  };

  /**
   * CREATE-US-08-AC13 등급만 담긴 임시 저장본(rating_only_working_copy)을 「저장」으로 반영한다.
   * 화면은 이 화면에 다른 미저장 변경(기본 정보·프리셋·사진 등)이 없을 때만 부른다.
   * - 성공 여부를 모르는 앞선 요청이 있으면 그 요청을 처음 의도·같은 키·같은 본문으로 다시 보낸다.
   * - 그 밖에는 최신 문서를 다시 불러와(사전 확인) 등급만 담긴 임시 저장본인지 보고, 그 working_copy_saved_at을
   *   finalize_rating_working_copy_at으로 싣는다(kind save·mode manual·preserve_scene, 기본 정보·프리셋·사진 없음).
   *   최종 확인은 서버가 잠금 아래에서 한다.
   * - 임시 저장 뒤 등급을 다시 바꿨으면 그 선택을 requested_rating으로 함께 싣는다. 보내기 전 최신 선택이 이 화면의
   *   기준과 다르면(다른 곳의 변경) 보내지 않는다.
   * - 사전 조회가 실패하면 아무것도 보내지 않고 남기지 않는다(다시 누르면 새로 확인한다).
   */
  const finalizeRatingWorkingCopy = async (): Promise<PresetSaveResult> => {
    setAttemptKind(operation.current?.kind ?? 'save');
    if (operation.current) return send(operation.current);
    const requestedRating: ContentRating | null = ratingDirty ? rating : null;
    const fail = (message: string): PresetSaveResult => {
      setError(message);
      return { ok: false };
    };
    setError(null);
    let fresh: CommonSaveDocument;
    try {
      fresh = await repository.load(storyId);
    } catch (failure) {
      return fail(`저장 전에 최신 내용을 불러오지 못해 저장하지 않았어요. (${messageOf(failure)})`);
    }
    const stagedAt = fresh.workingCopySavedAt;
    if (
      fresh.ratingOnlyWorkingCopy !== true ||
      !stagedAt ||
      stagedAt !== query.data?.workingCopySavedAt ||
      fresh.imagesWorkingCopySavedAt ||
      fresh.stagedBasic
    ) {
      // 확인하지 않은 임시본을 다음 저장에서 반영하지 않도록 이 화면의 조회 기준을 유지한다.
      return fail(
        '다른 곳에서 임시 저장한 내용이 바뀌어 저장하지 않았어요. 입력은 그대로예요. 최신 내용을 확인한 뒤 다시 저장해 주세요.',
      );
    }
    if (requestedRating !== null && (fresh.rating?.requested ?? DEFAULT_CONTENT_RATING) !== ratingBaseline) {
      return fail('다른 곳에서 콘텐츠 등급이 바뀌어 저장하지 않았어요. 최신 내용을 확인한 뒤 다시 저장해 주세요.');
    }
    const op: Operation = {
      document: {
        ...fresh,
        basic: null,
        presets: null,
        images: null,
        requestedRating,
        preserveScene: true,
        finalizeRatingWorkingCopyAt: stagedAt,
      },
      state: fresh.saveState,
      kind: 'save',
      mode: 'manual',
      key: newFewshotKey('creation'),
      rowKeys: [],
      sentRowKeys: [],
    };
    operation.current = op;
    return send(op);
  };

  /** 실으려는 영역(null이 아닌 것)이 모두 방금 거절·충돌로 보내지 않은 내용과 같은지 */
  const sameAsFailed = (
    presetContent: string | null,
    basicContent: string | null,
    ratingContent: ContentRating | null = null,
  ): boolean =>
    (presetContent === null || presetContent === failedFor.current) &&
    (basicContent === null || basicContent === failedBasicFor.current) &&
    (ratingContent === null || ratingContent === failedRatingFor.current);

  /**
   * CREATE-US-07-AC09 자동 임시 저장이 지금 보낼 것이 있는지(요청 없이 판단).
   * basic은 화면이 판단한 바뀐 기본 정보(바뀌지 않았으면 null)다.
   * 바뀐 프리셋·기본 정보가 없거나, 성공 여부를 모르는 요청이 남아 있거나(재시도 버튼 몫),
   * 방금 거절·충돌로 보내지 않은 내용과 같으면 false다. 화면은 false면 잠금·진행 표시 없이 건너뛴다.
   */
  const autoSaveNeeded = (
    basic: StoryBasicFields | null = null,
    images: CreationImagesPayload | null = null,
  ): boolean => {
    if (operation.current !== null) return false;
    const presetContent = dirty && presets !== null && baseline !== null ? comparable(toRecords(presets)) : null;
    const basicContent = images ? JSON.stringify({ basic, images }) : basic ? JSON.stringify(basic) : null;
    const ratingContent = ratingDirty ? rating : null;
    if (presetContent === null && basicContent === null && ratingContent === null) return false;
    return !sameAsFailed(presetContent, basicContent, ratingContent);
  };

  /**
   * CREATE-US-07-AC09 자동 임시 저장: 바뀐 프리셋·기본 정보·이미지를 같은 임시 저장 요청에 담는다.
   * 바뀌지 않은 영역은 생략하며, 공개 상태는 바뀌지 않는다.
   * - basic: 바뀐 기본 정보. null이면 싣지 않는다. rowKeys는 basic.characters 각 위치의 화면 행 key다.
   * - blockers: 보내기 직전 최신 문서로 판단하는 차단 사유(다른 곳의 임시 저장본 기본 정보와 겹침 등).
   * 성공 여부를 모르면 직접 저장과 같이 입력을 잠그고 같은 키로 다시 보낼 수 있게 남긴다(자동으로 다시 보내지 않는다).
   */
  const autoSave = (
    basic: StoryBasicFields | null = null,
    rowKeys: string[] = [],
    blockers: (fresh: CommonSaveDocument) => string | null = () => null,
    images: CreationImagesPayload | null = null,
  ): Promise<PresetSaveResult> =>
    autoSaveNeeded(basic, images)
      ? saveWithBasic(basic, blockers, images, rowKeys, 'temporary', 'auto')
      : Promise.resolve<PresetSaveResult>({ ok: false });

  /**
   * 기본 정보가 다른 경로(PUT /creation/stories/{id})로 저장된 뒤 부른다. 지금 안내가 기본 정보만 실은 요청의
   * 확실한 실패에서 왔다면 그 안내는 이제 지난 내용이므로 지우고, 같은 내용 재전송 방지 기록도 버린다.
   * 성패를 모르는 요청이 남아 있거나(같은 키로 다시 보내야 함) 프리셋·이미지가 걸린 안내는 그대로 둔다.
   */
  const clearBasicFailure = useCallback(() => {
    if (operation.current !== null || !basicOnlyError.current) return;
    basicOnlyError.current = false;
    failedBasicFor.current = null;
    setError(null);
  }, []);

  return {
    query,
    status,
    presets,
    setPresets: (update: (value: PresetValues[]) => PresetValues[]) =>
      setPresets((value) => (value === null ? value : update(value))),
    dirty,
    /** CREATE-US-08 고른 등급(조회 전 null). 조회한 requested_rating이 없으면 SAFE다. */
    rating,
    /** 고른 등급이 마지막으로 저장(임시 저장 포함)한 선택과 다른지 */
    ratingDirty,
    /** 등급을 고른다. 성공 여부를 모르는 저장이 남아 있으면 같은 요청으로 다시 보내야 하므로 바꾸지 않는다. */
    setRating: (next: ContentRating) => {
      if (operation.current !== null) return;
      setRatingValue((value) => (value === null ? value : next));
    },
    /** CREATE-US-08 마지막으로 받은 공통 문서의 임시 저장본에 등급 선택만 있음(rating_only_working_copy) */
    ratingOnlyWorkingCopy: query.data?.ratingOnlyWorkingCopy === true,
    finalizeRatingWorkingCopy,
    /** CREATE-US-08-AC12 검토 상태 새로고침 진행 상태 */
    reviewRefresh,
    /** CREATE-US-08-AC12 검토 상태를 GET 한 번으로 다시 확인한다(적용 등급·검토 상태·사유만 반영) */
    refreshRatingReview,
    /** 성공 여부를 모르는 저장이 남아 있음. 같은 요청으로 다시 보내야 하므로 그동안 입력을 막는다. */
    pending,
    /** 남아 있는 요청의 저장 의도(temporary·save). 없으면 null. */
    pendingKind,
    error,
    errorKind: error ? attemptKind : null,
    reload,
    saveWithBasic,
    autoSaveNeeded,
    autoSave,
    clearBasicFailure,
  };
}
