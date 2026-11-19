import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ScreenHeader, Surface, TopTabs } from '@/components/ui';
import { ExpressionScreen } from './ExpressionScreen';
import { FewshotScreen } from './FewshotScreen';

/**
 * CREATE-US-02 말투·서술과 대화 예시 편집. 두 화면은 각자 저장한다.
 * 화면 전환으로 미저장 편집 상태와 본문 입력을 버리지 않도록 숨김으로 전환한다.
 * storyId는 라우트에서 받는다. 없으면 로컬 개발용 EXPO_PUBLIC_STORY_ID를 쓴다.
 */
export function CreationWorkspace({ storyId = process.env.EXPO_PUBLIC_STORY_ID }: { storyId?: string } = {}) {
  const [tab, setTab] = useState(0);
  return (
    <Surface style={styles.workspace}>
      <ScreenHeader eyebrow="CHAR / CHAT" title="제작" />
      <TopTabs tabs={['말투·서술', '대화 예시']} activeIndex={tab} onChange={setTab} />
      <View style={[styles.workspace, tab !== 0 && styles.hidden]}>
        {storyId ? <ExpressionScreen hideHeader storyId={storyId} /> : <ExpressionScreen hideHeader />}
      </View>
      <View style={[styles.workspace, tab !== 1 && styles.hidden]}>
        {storyId ? <FewshotScreen hideHeader storyId={storyId} /> : <FewshotScreen hideHeader />}
      </View>
    </Surface>
  );
}
const styles = StyleSheet.create({ workspace: { flex: 1 }, hidden: { display: 'none' } });
