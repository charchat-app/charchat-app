import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

import { parseSceneSection, type EditorSection } from '@/features/story-publish';
import { CreationWorkspace } from '@/features/story-scene';

/**
 * 제작 → 말투·서술(대화 예시 포함)·인트로·초기 상태·공개 범위 (CREATE-US-02·03·04·07).
 * CREATE-US-12: 편집 화면(/create/[storyId])의 작업 구역 탭이 fromEditor=1·section으로 이 화면을 push한다.
 * section이 없거나 모르는 값이면 첫 구역(말투·서술)으로 연다. 직접 연 주소도 같은 셸이라
 * 작성 중(draft) 스토리의 미저장 편집까지 이탈 확인을 거친다.
 * 기본 설정·유저 프로필 탭은 같은 스토리 편집 화면까지 dismissTo로 닫고 구역을 싣는다(없으면 그 화면으로 바꾼다).
 * 머리글 뒤로 가기(확인 뒤)와 삭제 성공은 목록까지 닫는다.
 */
export default function StorySceneRoute() {
  const router = useRouter();
  const navigation = useNavigation();
  const { storyId, section } = useLocalSearchParams<{ storyId: string; fromEditor?: string; section?: string }>();
  const toList = () => router.dismissTo('/create');
  return (
    <CreationWorkspace
      key={storyId}
      storyId={storyId}
      guardDraftLeave
      initialSection={parseSceneSection(section)}
      onBack={toList}
      onDeleted={toList}
      isRouteFocused={() => navigation.isFocused()}
      onOpenEditor={(target: EditorSection) =>
        router.dismissTo({ pathname: '/create/[storyId]', params: { storyId, section: target } })
      }
    />
  );
}
