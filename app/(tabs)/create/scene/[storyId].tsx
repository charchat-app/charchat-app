import { useLocalSearchParams } from 'expo-router';

import { CreationWorkspace } from '@/features/story-scene';

/**
 * 제작 → 말투·서술·대화 예시 편집 (CREATE-US-02).
 * 기본 설정 편집 화면(/create/[storyId])에서 들어오는 연결은 story-publish 담당과 정한 뒤 추가한다.
 */
export default function StorySceneRoute() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  return <CreationWorkspace key={storyId} storyId={storyId} />;
}
