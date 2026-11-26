import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ScreenHeader, Surface, TopTabs } from '@/components/ui';
import { ExpressionScreen } from './ExpressionScreen';
import { FewshotScreen } from './FewshotScreen';
import { createCommonSaveRepository, type EditorSection, type SceneSection } from '@/features/story-publish';
import { CommonCreationWorkspace } from './CommonCreationWorkspace';

const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const commonRepository = apiUrl ? createCommonSaveRepository(apiUrl) : null;

/**
 * 화면 전환으로 미저장 편집 상태와 본문 입력을 버리지 않는다.
 * storyId는 라우트에서 받는다. 없으면 로컬 개발용 EXPO_PUBLIC_STORY_ID를 쓴다.
 * guardDraftLeave: 스택으로 쌓여 뒤로 가기로 화면이 제거될 수 있을 때(CREATE-US-07 말투·서술 push),
 * 작성 중(draft) 스토리의 미저장 편집도 이탈 확인을 거치게 한다. 넘기지 않으면 지금처럼 완성된 스토리만 확인한다.
 * onBack: 있으면 머리글에 뒤로 가기 버튼을 보인다(돌아갈 곳이 있는 push 화면에서만 넘긴다).
 */
export function CreationWorkspace({
  storyId = process.env.EXPO_PUBLIC_STORY_ID,
  guardDraftLeave = false,
  onBack,
  initialSection,
  onOpenEditor,
  onDeleted,
  isRouteFocused,
}: {
  storyId?: string;
  guardDraftLeave?: boolean;
  onBack?: () => void;
  /** CREATE-US-12 처음 보일 구역 */
  initialSection?: SceneSection;
  /** CREATE-US-12 기본 설정·유저 프로필 탭 넘기기 */
  onOpenEditor?: (section: EditorSection) => void;
  /** CREATE-US-12 공개 범위 탭에서 삭제 성공 뒤 이동 */
  onDeleted?: () => void;
  /** 삭제 응답이 늦게 왔을 때 이동할지 판단할 라우트 포커스. 라우트가 내비게이션으로 판단해 넘긴다. */
  isRouteFocused?: () => boolean;
} = {}) {
  return commonRepository && storyId ? (
    <CommonCreationWorkspace
      key={storyId}
      repository={commonRepository}
      storyId={storyId}
      guardDraftLeave={guardDraftLeave}
      onBack={onBack}
      initialSection={initialSection}
      onOpenEditor={onOpenEditor}
      onDeleted={onDeleted}
      isRouteFocused={isRouteFocused}
    />
  ) : (
    <FixtureWorkspace onBack={onBack} />
  );
}
function FixtureWorkspace({ onBack }: { onBack?: () => void }) {
  const [tab, setTab] = useState(0);
  return (
    <Surface style={styles.workspace}>
      <ScreenHeader eyebrow="CHAR / CHAT" title="제작" onBack={onBack} backLabel="기본 설정으로 돌아가기" />
      <TopTabs tabs={['말투·서술', '대화 예시']} activeIndex={tab} onChange={setTab} />
      <View style={[styles.workspace, tab !== 0 && styles.hidden]}>
        <ExpressionScreen hideHeader />
      </View>
      <View style={[styles.workspace, tab !== 1 && styles.hidden]}>
        <FewshotScreen hideHeader />
      </View>
    </Surface>
  );
}
const styles = StyleSheet.create({ workspace: { flex: 1 }, hidden: { display: 'none' } });
