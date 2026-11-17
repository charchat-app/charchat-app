import { apiRequest } from '@/lib/api-client';
import { parseExpression, type StoryDraft, type StoryExpressionDocument } from '@/shared/story-types';

/** 실제 서버 경로/인증 확정 전 교체 가능한 전체 저장 경계. */
export interface StoryRepository {
  readonly mode: 'fixture' | 'server';
  load(id: string, signal?: AbortSignal): Promise<StoryExpressionDocument>;
  save(document: StoryExpressionDocument, requestId: string): Promise<StoryExpressionDocument>;
}
function readFixture(value: unknown, id: string): StoryDraft {
  if (
    !value ||
    typeof value !== 'object' ||
    !('mode' in value) ||
    value.mode !== 'fixture' ||
    !('story' in value) ||
    !value.story ||
    typeof value.story !== 'object'
  ) {
    throw new Error('로컬 예제 응답을 확인할 수 없습니다.');
  }
  const story = value.story;
  if (
    !('id' in story) ||
    story.id !== id ||
    !('title' in story) ||
    typeof story.title !== 'string' ||
    !('speech' in story) ||
    !('saveState' in story) ||
    story.saveState !== '임시 저장' ||
    !('updatedAt' in story) ||
    (story.updatedAt !== null && typeof story.updatedAt !== 'string') ||
    !('characters' in story) ||
    !Array.isArray(story.characters) ||
    !('fewshotGroups' in story) ||
    !Array.isArray(story.fewshotGroups) ||
    !('intros' in story) ||
    !Array.isArray(story.intros)
  ) {
    throw new Error('로컬 예제의 저장 문서 형식이 올바르지 않습니다.');
  }
  return { ...story, speech: parseExpression(story.speech) } as StoryDraft;
}
/** 개발용 경로다. 공식 FastAPI 엔드포인트로 가정하지 않는다. */
export function createFixtureRepository(baseUrl: string): StoryRepository {
  const path = (id: string) => `/__fixtures/stories/${encodeURIComponent(id)}`;
  return {
    mode: 'fixture',
    async load(id, signal) {
      return readFixture(await apiRequest<unknown>(path(id), { signal }, baseUrl), id);
    },
    async save(document, requestId) {
      const response = await apiRequest<unknown>(
        path(document.id),
        {
          method: 'PUT',
          headers: { 'Idempotency-Key': requestId },
          body: JSON.stringify({ document }),
        },
        baseUrl,
      );
      return readFixture(response, document.id);
    },
  };
}
