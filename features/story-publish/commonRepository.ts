import { apiRequest } from '@/lib/api-client';
import {
  toExpressionRow,
  type CreationSaveDocument,
  type CreationSaveState,
  type CreationSaveMode,
  type CreationSaveKind,
} from '@/shared/story-types';
import { fewshotsPayload, readFewshotsSnapshot } from './fewshotRepository';
import { affinitiesPayload, readAffinities, readRelations, relationsPayload } from './initialStateRepository';
import { introsPayload, readIntros } from './introRepository';
import { readServerSnapshot } from './serverRepository';

export interface CommonSaveRepository {
  load(id: string, signal?: AbortSignal): Promise<CreationSaveDocument>;
  save(
    document: CreationSaveDocument,
    state: CreationSaveState,
    mode: CreationSaveMode,
    requestId: string,
    kind?: CreationSaveKind,
  ): Promise<CreationSaveDocument>;
}
function parse(value: unknown, id: string, key?: string): CreationSaveDocument {
  const few = readFewshotsSnapshot(value, id, key);
  return {
    ...few,
    speech: readServerSnapshot(value, id, key).speech,
    intros: readIntros((value as Record<string, unknown>).intros, few.characters),
    relations: readRelations((value as Record<string, unknown>).relations, few.characters),
    affinities: readAffinities((value as Record<string, unknown>).affinities, few.characters),
    workingCopySavedAt: readSavedAt((value as Record<string, unknown>).working_copy_saved_at),
    imagesWorkingCopySavedAt: readSavedAt((value as Record<string, unknown>).images_working_copy_saved_at),
  };
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
      return parse(await apiRequest(path(id), { signal, headers: await authorization() }, baseUrl), id);
    },
    async save(document, state, mode, requestId, kind = 'save') {
      const { story_id: _storyId, ...expression } = toExpressionRow(document.id, document.speech);
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
              save_state: state,
              kind,
              mode,
            }),
          },
          baseUrl,
        ),
        document.id,
        requestId,
      );
    },
  };
}
