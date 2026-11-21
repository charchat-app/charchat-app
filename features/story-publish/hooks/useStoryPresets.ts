// CREATE-US-05 편집 화면의 유저 프로필 프리셋: 공통 저장(/creation)으로 불러오고 저장한다.
// 프리셋 화면의 저장은 2~4번 영역을 맡지 않는다. 서버가 스토리 잠금 안에서 최신 장면을 사용한다.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { presetsFromDraft, presetsToDraftPatch, type PresetValues } from '@/features/story-setup';
import { ApiError } from '@/lib/api-client';
import { newFewshotKey, type CreationSaveKind, type CreationSaveState } from '@/shared/story-types';
import type { UserProfilePresetRecord } from '@/shared/story-types/presets';

import { createCommonSaveRepository, type CommonSaveDocument, type CommonSaveRepository } from '../commonRepository';
import { presetsPayload } from '../presetsCodec';
import { rejectionMessage } from './useCommonSave';
import { storyKeys } from './useStories';

export const storyCreationKey = (id: string) => [...storyKeys.all, 'creation', id] as const;

const defaultRepository = createCommonSaveRepository(process.env.EXPO_PUBLIC_API_URL ?? '');

/**
 * - loading: 불러오는 중
 * - error: 불러오기 실패
 * - unavailable: 응답에 presets가 없음. 서버가 알려 주지 않은 목록을 빈 목록으로 지어내 지우지 않도록 편집·저장을 막는다
 * - ready: 편집·저장 가능
 */
export type PresetStatus = 'loading' | 'error' | 'unavailable' | 'ready';

type Operation = {
  document: CommonSaveDocument;
  state: CreationSaveState;
  /** 저장 의도. 성공 여부를 모르는 요청을 다시 보낼 때도 처음 의도와 키를 그대로 쓴다. */
  kind: CreationSaveKind;
  key: string;
};

/** 비교용: 화면 표시 주소(photoUrl)는 이미지 identity가 아니므로 빼고 비교한다. */
function comparable(records: UserProfilePresetRecord[]) {
  return JSON.stringify(
    records.map((p) => ({ id: p.id ?? null, name: p.name, detail: p.detail, imageId: p.imageId ?? null })),
  );
}

function toRecords(presets: PresetValues[]): UserProfilePresetRecord[] {
  return presetsToDraftPatch(presets).userProfilePresets;
}

/** 서버 반영 여부를 알 수 없는 실패(네트워크·시간 초과·5xx·429·응답 해석 실패) */
export function isUncertain(failure: unknown): boolean {
  if (!(failure instanceof ApiError)) return true;
  if (failure.status === 0) return failure.code === 'NETWORK_ERROR';
  return failure.status >= 500 || failure.status === 408 || failure.status === 429;
}

function messageOf(failure: unknown): string {
  if (failure instanceof ApiError) return rejectionMessage(failure);
  return failure instanceof Error && failure.message ? failure.message : '알 수 없는 오류가 발생했습니다.';
}

/** 공개·비공개 스토리에서 「저장」을 막는 안내. 2~4번 임시 저장본까지 함께 반영되지 않게 제작 화면의 저장으로 반영한다. */
export const FINAL_SAVE_BLOCKED =
  '비공개·공개 스토리의 유저 프로필은 임시 저장한 뒤 제작 화면의 「저장」에서 반영해요.';

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
  const [saving, setSaving] = useState(false);
  // 성공 여부를 모르는 앞선 요청의 저장 의도. 없으면 null. 화면은 이 값으로 다시 보낼 버튼을 고른다.
  const [pendingKind, setPendingKind] = useState<CreationSaveKind | null>(null);
  const operation = useRef<Operation | null>(null);
  // 같은 틱의 두 번 누름을 막는다(다시 그리기를 기다리지 않음).
  const busy = useRef(false);

  const dirty = presets !== null && baseline !== null && comparable(toRecords(presets)) !== comparable(baseline);
  useEffect(() => {
    if (dirty || saving || pendingKind || !query.data?.presets || query.data.presets === baseline) return;
    setPresets(presetsFromDraft(query.data.presets));
    setBaseline(query.data.presets);
  }, [baseline, dirty, pendingKind, query.data, saving]);

  const status: PresetStatus =
    presets !== null ? 'ready' : query.isError ? 'error' : query.data ? 'unavailable' : 'loading';

  /** 입력을 버리고 서버의 최신 프리셋으로 다시 채운다(불러오기 실패·동시 수정 뒤). */
  const reload = useCallback(async () => {
    if (busy.current || operation.current) return;
    const fresh = await query.refetch();
    if (fresh.data?.presets) {
      setPresets(presetsFromDraft(fresh.data.presets));
      setBaseline(fresh.data.presets);
      setError(null);
    }
  }, [query]);

  const send = async (op: Operation): Promise<boolean> => {
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await repository.save(op.document, op.state, 'manual', op.key, op.kind);
      operation.current = null;
      setPendingKind(null);
      client.setQueryData(storyCreationKey(storyId), result);
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
      return true;
    } catch (failure) {
      const uncertain = isUncertain(failure);
      if (!uncertain) operation.current = null;
      setPendingKind(uncertain ? op.kind : null);
      setError(
        uncertain
          ? '저장 성공 여부를 확인하지 못했어요. 입력은 그대로이고, 다시 저장하면 같은 요청을 보내요.'
          : messageOf(failure),
      );
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  /**
   * 프리셋을 공통 저장 한 요청으로 보낸다.
   * - kind: temporary(CREATE-US-05-AC06)는 미완성 프리셋도 원문 그대로 임시 저장한다. save는 반영한다.
   *   비공개·공개 스토리의 save는 막는다(2~4번 임시 저장본까지 함께 반영되므로 제작 화면의 「저장」으로 반영).
   * - 성공 여부를 모르는 앞선 요청이 있으면 입력·kind와 관계없이 그 요청을 같은 본문·같은 키로 다시 보낸다.
   * - 그 밖에는 최신 공통 문서를 다시 불러온 뒤 서버에 2~4번 장면 보존을 요청한다.
   *   그 사이 다른 곳에서 프리셋이 바뀌었으면 덮어쓰지 않는다.
   * - 모두 지운 목록([])도 그대로 보낸다.
   */
  const save = async (kind: CreationSaveKind): Promise<boolean> => {
    if (busy.current) return false;
    if (operation.current) return send(operation.current);
    if (!dirty || presets === null || baseline === null) return false;
    const fail = (message: string) => {
      setError(message);
      return false;
    };
    busy.current = true;
    setSaving(true);
    setError(null);
    let fresh: CommonSaveDocument;
    try {
      fresh = await repository.load(storyId);
    } catch (failure) {
      return fail(`저장 전에 최신 내용을 불러오지 못해 저장하지 않았어요. (${messageOf(failure)})`);
    } finally {
      busy.current = false;
      setSaving(false);
    }
    if (!fresh.presets || comparable(fresh.presets) !== comparable(baseline)) {
      return fail('다른 곳에서 유저 프로필이 바뀌어 저장하지 않았어요. 프로필을 다시 불러온 뒤 저장해 주세요.');
    }
    if (kind === 'save' && fresh.saveState !== 'draft') return fail(FINAL_SAVE_BLOCKED);
    const records = toRecords(presets);
    try {
      // 서버가 발급하지 않은 id 등은 보내기 전에 막는다. 이 오류는 성공 여부가 불확실한 실패가 아니다.
      presetsPayload(records);
    } catch (failure) {
      return fail(`저장하지 않았어요. (${messageOf(failure)})`);
    }
    const op: Operation = {
      document: { ...fresh, presets: records, preserveScene: true },
      state: fresh.saveState,
      kind,
      key: newFewshotKey('creation'),
    };
    operation.current = op;
    return send(op);
  };

  return {
    query,
    status,
    presets,
    setPresets: (update: (value: PresetValues[]) => PresetValues[]) =>
      setPresets((value) => (value === null ? value : update(value))),
    dirty,
    saving,
    /** 성공 여부를 모르는 저장이 남아 있음. 같은 요청으로 다시 보내야 하므로 그동안 입력을 막는다. */
    pending: pendingKind !== null,
    pendingKind,
    /** 비공개·공개 스토리에 아직 반영하지 않은 프리셋 임시 저장본이 있음 */
    staged: query.data?.presetsPending === true,
    saveState: query.data?.saveState ?? null,
    error,
    reload,
    save,
  };
}
