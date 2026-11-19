/** CREATE-US-02 실제 FastAPI 표현 조회/임시 저장 어댑터. */
import { apiRequest } from '@/lib/api-client';
import {
  fromExpressionRow,
  toExpressionRow,
  type ExpressionRow,
  type StoryExpressionDocument,
} from '@/shared/story-types';
import { isSameId } from './fewshotRepository';
import type { StoryRepository } from './fixtureRepository';

type Authorization = () => Promise<HeadersInit>;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('표현 API 응답 형식이 올바르지 않습니다.');
  return value as Record<string, unknown>;
}
export function readServerSnapshot(value: unknown, id: string, requestId?: string): StoryExpressionDocument {
  const response = record(value);
  const expression = record(response.expression);
  if (
    !isSameId(response.story_id, id) ||
    (response.title !== null && typeof response.title !== 'string') ||
    typeof response.saved_at !== 'string' ||
    !Number.isFinite(Date.parse(response.saved_at)) ||
    !['draft', 'private', 'public'].includes(String(response.save_state)) ||
    (requestId !== undefined && response.request_id !== requestId)
  ) {
    throw new Error('표현 API 응답을 확인할 수 없습니다.');
  }
  if (
    !['none', 'preset', 'custom'].includes(String(expression.style_mode)) ||
    !Array.isArray(expression.preset_styles) ||
    (expression.custom_style !== null && typeof expression.custom_style !== 'string')
  ) {
    throw new Error('문체 응답을 확인할 수 없습니다.');
  }
  const states = { draft: '임시 저장', private: '비공개', public: '공개' } as const;
  return {
    id,
    title: response.title ?? '제목 없는 스토리',
    saveState: states[response.save_state as keyof typeof states],
    updatedAt: response.saved_at,
    speech: fromExpressionRow({ ...expression, story_id: id } as ExpressionRow),
  };
}
function path(id: string) {
  if (!/^[1-9]\d*$/.test(id) || BigInt(id) > 9223372036854775807n) throw new Error('스토리 ID가 올바르지 않습니다.');
  return `/creation/stories/${id}/expression`;
}
/** 인증 헤더는 검증된 세션 제공자에서 주입한다. 계정/토큰 방식을 임의로 만들지 않는다. */
export function createServerExpressionRepository(
  baseUrl: string,
  authorization: Authorization = async () => ({}),
): StoryRepository {
  return {
    mode: 'server',
    async load(id, signal) {
      const result = await apiRequest<unknown>(path(id), { signal, headers: await authorization() }, baseUrl);
      return readServerSnapshot(result, id);
    },
    async save(document, requestId) {
      const row = toExpressionRow(document.id, document.speech);
      const { story_id: _storyId, ...expression } = row;
      const headers = new Headers(await authorization());
      headers.set('Idempotency-Key', requestId);
      const result = await apiRequest<unknown>(
        path(document.id),
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({ expression }),
        },
        baseUrl,
      );
      return readServerSnapshot(result, document.id, requestId);
    },
  };
}
