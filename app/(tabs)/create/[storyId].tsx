import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { StoryEditorScreen } from '@/features/story-publish';
import { confirmUnsavedLeave, useUnsavedCreationGuard } from '@/features/story-scene';

/** 제작 → 스토리 편집 */
export default function StoryEditorRoute() {
  const router = useRouter();
  const navigation = useNavigation();
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  // CREATE-US-07-AC11: 완성 스토리의 미저장 변경이 있으면 나가기 전에 확인한다(취소하면 머문다).
  const [unsaved, setUnsaved] = useState(false);
  // 삭제 성공 이동은 의도한 이동이라 확인하지 않는다. 확인을 먼저 끈 뒤(다음 커밋) 목록으로 닫는다.
  const [deleted, setDeleted] = useState(false);
  // 헤더 뒤로 가기에서 나가기를 확정했다. 삭제와 같이 확인을 먼저 끈 뒤 목록으로 닫는다.
  const [leaving, setLeaving] = useState(false);
  useUnsavedCreationGuard(unsaved && !deleted && !leaving);
  useEffect(() => {
    // 삭제 성공·나가기 확정: 목록이 스택에 있으면 그곳까지 닫고, 딥 링크로 열었으면 편집 화면을 목록으로 바꾼다.
    if (deleted || leaving) router.dismissTo('/create');
    // 한 번에 한 번만 닫는다. router 참조가 바뀌어도 다시 닫지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleted, leaving]);
  const back = () => {
    // 웹 딥 링크에서는 back/replace가 탭 이동이 되어 화면 제거 가드를 거치지 않으므로 헤더 버튼이 직접 확인한다.
    if (unsaved && !deleted) {
      confirmUnsavedLeave(() => setLeaving(true));
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/create');
  };
  return (
    <StoryEditorScreen
      key={storyId}
      storyId={storyId}
      onBack={back}
      onDeleted={() => setDeleted(true)}
      isRouteFocused={() => navigation.isFocused()}
      onUnsavedChange={setUnsaved}
    />
  );
}
