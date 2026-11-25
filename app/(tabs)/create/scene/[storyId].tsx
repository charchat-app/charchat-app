import { useLocalSearchParams, useRouter } from 'expo-router';

import { CreationWorkspace } from '@/features/story-scene';

/**
 * 제작 → 말투·퓨샷·인트로·초기 상태 편집 (CREATE-US-02·03·04).
 * CREATE-US-07: 기본 설정 편집 화면(/create/[storyId])의 「말투·서술」 탭이 fromEditor=1로 이 화면을 push한다.
 * 웹에서는 스택 헤더 뒤로 가기가 보이지 않고 렌더 시점의 스택 index도 믿을 수 없으므로, fromEditor로 들어온
 * 화면만 머리글 뒤로 가기를 보이고 작성 중(draft) 스토리의 미저장 편집도 이탈 확인을 거친다.
 * 뒤로 가기는 작업 화면이 확인한 뒤 같은 스토리의 편집 화면까지 dismissTo로 닫는다(없으면 그 화면으로 바꾼다).
 * 직접 연 화면은 뒤로 가기를 보이지 않고, 지금처럼 완성된 스토리만 확인한다.
 */
export default function StorySceneRoute() {
  const router = useRouter();
  const { storyId, fromEditor } = useLocalSearchParams<{ storyId: string; fromEditor?: string }>();
  const stacked = fromEditor === '1';
  return (
    <CreationWorkspace
      key={storyId}
      storyId={storyId}
      guardDraftLeave={stacked}
      onBack={stacked ? () => router.dismissTo({ pathname: '/create/[storyId]', params: { storyId } }) : undefined}
    />
  );
}
