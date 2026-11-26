import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  StoryEditorScreen,
  parseEditorSection,
  useForgetStoryEditorCache,
  type SceneSection,
} from '@/features/story-publish';
import { confirmUnsavedLeave, useUnsavedCreationGuard } from '@/features/story-scene';

/** 제작 → 스토리 편집 */
export default function StoryEditorRoute() {
  const router = useRouter();
  const navigation = useNavigation();
  // CREATE-US-12 section: 작업 화면에서 기본 설정·유저 프로필로 넘어올 때 실어 오는 구역. 모르는 값이면 첫 구역.
  const { storyId, section } = useLocalSearchParams<{ storyId: string; section?: string }>();
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
  // CREATE-US-07·12 작업 화면(요청 구역) 열기. 두 번 눌러도 한 번만 쌓고, 편집 화면에 다시 포커스되면 풀린다.
  // 작업 화면의 저장·공개가 임시 저장본 기본 정보(새 캐릭터 등)를 정본에 반영할 수 있으므로, 넘긴 뒤에는 편집 화면을
  // 내려 두고(언마운트 정리는 그대로 돈다) 돌아오면 편집 조회 캐시를 지운 다음 새 key로 다시 마운트해 서버 값으로 채운다.
  const openingSpeech = useRef(false);
  const [handedOff, setHandedOff] = useState(false);
  const [generation, setGeneration] = useState(0);
  const forgetEditorCache = useForgetStoryEditorCache(storyId);
  useFocusEffect(
    useCallback(() => {
      const returning = openingSpeech.current;
      openingSpeech.current = false;
      if (returning) {
        // 새 편집 화면이 마운트되기 전에 지워야 이전 캐시로 입력 폼·비교 기준을 채우지 않는다.
        forgetEditorCache();
        setGeneration((g) => g + 1);
        setHandedOff(false);
      }
      return () => {
        // 실제로 작업 화면으로 넘어가 포커스를 잃었을 때만 내린다.
        if (openingSpeech.current) {
          setUnsaved(false);
          setHandedOff(true);
        }
      };
    }, [forgetEditorCache]),
  );
  const openScene = (target: SceneSection) => {
    if (openingSpeech.current || !navigation.isFocused()) return;
    openingSpeech.current = true;
    router.push({ pathname: '/create/scene/[storyId]', params: { storyId, fromEditor: '1', section: target } });
  };
  const back = () => {
    // 웹 딥 링크에서는 back/replace가 탭 이동이 되어 화면 제거 가드를 거치지 않으므로 헤더 버튼이 직접 확인한다.
    if (unsaved && !deleted) {
      confirmUnsavedLeave(() => setLeaving(true));
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/create');
  };
  // 작업 화면으로 넘긴 동안은 편집 화면을 두지 않는다(돌아오면 위 포커스 처리로 새로 마운트).
  if (handedOff) return null;
  return (
    <StoryEditorScreen
      key={`${storyId}:${generation}`}
      storyId={storyId}
      onBack={back}
      onDeleted={() => setDeleted(true)}
      isRouteFocused={() => navigation.isFocused()}
      onUnsavedChange={setUnsaved}
      onOpenScene={openScene}
      initialSection={parseEditorSection(section)}
    />
  );
}
