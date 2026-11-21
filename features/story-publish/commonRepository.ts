// CREATE-US-07 공통 저장 (2~4번 + 선택적으로 5번 유저 프로필 프리셋)
import { apiRequest } from '@/lib/api-client';
import {
  toExpressionRow,
  type CreationSaveDocument,
  type CreationSaveState,
  type CreationSaveMode,
  type CreationSaveKind,
} from '@/shared/story-types';
import type { UserProfilePresetRecord } from '@/shared/story-types/presets';
import { fewshotsPayload, readFewshotsSnapshot } from './fewshotRepository';
import { affinitiesPayload, readAffinities, readRelations, relationsPayload } from './initialStateRepository';
import { introsPayload, readIntros } from './introRepository';
import { presetsPayload, readPresets } from './presetsCodec';
import { readServerSnapshot } from './serverRepository';

/**
 * 공통 저장 문서. 2~4번(CreationSaveDocument)에 CREATE-US-05 프리셋 영역을 더한다.
 * 공유 타입(shared/story-types)을 바꾸지 않으려고 이 도메인 안에서만 확장한다.
 *
 * - presets: undefined·null이면 요청에서 빼서 서버가 기존 값을 유지하고, []는 전부 지우라는 뜻이다.
 *   응답에 presets 배열이 있으면 복원하고, 없거나 null이면 키를 두지 않는다(빈 목록으로 지어내지 않는다).
 * - presetsPending: 응답의 presets_pending. 비공개·공개 스토리에 아직 반영하지 않은 프리셋 임시 저장본이 있다.
 *   「저장」(kind save)을 보내면 서버가 함께 반영한다. 응답 전용이라 요청에는 싣지 않는다.
 */
export type CommonSaveDocument = CreationSaveDocument & {
  presets?: UserProfilePresetRecord[] | null;
  presetsPending?: boolean;
  preserveScene?: boolean;
};

export interface CommonSaveRepository {
  load(id: string, signal?: AbortSignal): Promise<CommonSaveDocument>;
  save(
    document: CommonSaveDocument,
    state: CreationSaveState,
    mode: CreationSaveMode,
    requestId: string,
    kind?: CreationSaveKind,
  ): Promise<CommonSaveDocument>;
}
function parse(
  value: unknown,
  baseUrl: string,
  id: string,
  key?: string,
  submitted?: CommonSaveDocument,
): CommonSaveDocument {
  const few = readFewshotsSnapshot(value, id, key);
  const source = value as Record<string, unknown>;
  const presetsPending = source.presets_pending === true;
  const document: CommonSaveDocument = {
    ...few,
    speech: readServerSnapshot(value, id, key).speech,
    intros: readIntros(source.intros, few.characters),
    relations: readRelations(source.relations, few.characters),
    affinities: readAffinities(source.affinities, few.characters),
    workingCopySavedAt: readSavedAt(source.working_copy_saved_at),
    imagesWorkingCopySavedAt: readSavedAt(source.images_working_copy_saved_at),
  };
  // 이전 응답과 같은 문서 모양을 유지하려고 임시 저장본이 있을 때만 키를 둔다.
  if (presetsPending) document.presetsPending = true;
  const presets = readPresets(source.presets, submitted?.presets, baseUrl, presetsPending);
  if (presets !== undefined) document.presets = presets;
  return document;
}
function readSavedAt(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}
export function createCommonSaveRepository(
  baseUrl: string,
  authorization: () => Promise<HeadersInit> = async () => ({}),
): CommonSaveRepository {
  const path = (id: string) => {
    if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) throw new Error('스토리 ID를 확인해 주세요.');
    return `/creation/stories/${id}/creation`;
  };
  return {
    async load(id, signal) {
      return parse(await apiRequest(path(id), { signal, headers: await authorization() }, baseUrl), baseUrl, id);
    },
    async save(document, state, mode, requestId, kind = 'save') {
      const { story_id: _storyId, ...expression } = toExpressionRow(document.id, document.speech);
      // 보내기 전에 변환한다. 서버가 발급하지 않은 프리셋 id 등은 여기서 막혀 요청이 나가지 않는다.
      const presets = document.presets ? presetsPayload(document.presets) : null;
      const headers = new Headers(await authorization());
      headers.set('Idempotency-Key', requestId);
      return parse(
        await apiRequest(
          path(document.id),
          {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              expression,
              ...fewshotsPayload(document.fewshots),
              ...introsPayload(document.intros),
              ...relationsPayload(document.relations),
              ...affinitiesPayload(document.affinities),
              // undefined·null은 보내지 않는다 = 서버가 기존 프리셋을 유지한다. []는 전부 지움.
              ...(presets ? { presets } : {}),
              ...(document.preserveScene ? { preserve_scene: true } : {}),
              save_state: state,
              kind,
              mode,
            }),
          },
          baseUrl,
        ),
        baseUrl,
        document.id,
        requestId,
        document,
      );
    },
  };
}
