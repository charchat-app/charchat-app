// story-publish: 공개 API. 다른 도메인은 이 파일로만 접근한다.
export { StoryEditorScreen } from './components/StoryEditorScreen';
export { StoryListScreen } from './components/StoryListScreen';
export type { EditorStory, StorySummary } from './types';
// 스토리 조회 캐시(storyKeys.detail). 2~4번 화면은 이 캐시를 구독해 캐릭터 변경을 반영한다.
export { useStory } from './hooks/useStories';
// CREATE-US-07 말투·서술에서 돌아온 편집 화면을 새로 채우기 전에 그 스토리의 편집 조회 캐시를 지운다.
export { useForgetStoryEditorCache } from './hooks/useForgetStoryEditorCache';

// 생성 2~4번(표현·퓨샷·인트로·초기 상태) 저장
export { createFixtureRepository } from './fixtureRepository';
export { createServerExpressionRepository } from './serverRepository';
export type { StoryRepository } from './fixtureRepository';
export { createServerFewshotRepository } from './fewshotRepository';
export type { FewshotRepository } from './fewshotRepository';
export { createCommonSaveRepository, type CommonSaveDocument, type CommonSaveRepository } from './commonRepository';
export { useCommonSave, completionIssues, introLength } from './hooks/useCommonSave';
