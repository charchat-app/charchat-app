import { apiRequest } from '@/lib/api-client';
import {
  toExpressionRow,
  type CreationSaveDocument,
  type CreationSaveState,
  type CreationSaveMode,
} from '@/shared/story-types';
import { fewshotsPayload, readFewshotsSnapshot } from './fewshotRepository';
import { introsPayload, readIntros } from './introRepository';
import { readServerSnapshot } from './serverRepository';

export interface CommonSaveRepository {
  load(id: string, signal?: AbortSignal): Promise<CreationSaveDocument>;
  save(
    document: CreationSaveDocument,
    state: CreationSaveState,
    mode: CreationSaveMode,
    requestId: string,
  ): Promise<CreationSaveDocument>;
}
function parse(value: unknown, id: string, key?: string): CreationSaveDocument {
  const few = readFewshotsSnapshot(value, id, key);
  return {
    ...few,
    speech: readServerSnapshot(value, id, key).speech,
    intros: readIntros((value as Record<string, unknown>).intros, few.characters),
  };
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
    async save(document, state, mode, requestId) {
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
              save_state: state,
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
