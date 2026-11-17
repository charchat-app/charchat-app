// story-setup: 서버 호출. 화면에서 fetch를 직접 쓰지 않고 이 파일을 거친다.
import { apiRequest } from '@/lib/api-client';

import type { TagSuggestion } from './types';

type TagSuggestionDto = { name: string; public_story_count: number };

/** 해시태그 자동검색 후보: 앞부분 일치, 공개 스토리 수 많은 순 (CREATE-US-01-AC17) */
export async function fetchTagSuggestions(query: string): Promise<TagSuggestion[]> {
  const rows = await apiRequest<TagSuggestionDto[]>(`/creation/tags?q=${encodeURIComponent(query)}`);
  return rows.map((r) => ({ name: r.name, publicStoryCount: r.public_story_count }));
}
