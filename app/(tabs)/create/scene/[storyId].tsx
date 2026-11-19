import { useLocalSearchParams } from 'expo-router';

import { CreationWorkspace } from '@/features/story-scene';

/**
 * 제작 → 말투·퓨샷·인트로·초기 상태 편집 (CREATE-US-02·03·04).
 * 기본 설정 편집 화면(/create/[storyId])에서 들어오는 연결은 story-publish 담당과 정한 뒤 추가한다.
 */
export default function StorySceneRoute() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  return <CreationWorkspace key={storyId} storyId={storyId} />;
}
