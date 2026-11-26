import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Notice, ScreenHeader, Surface, Text } from '@/components/ui';
import {
  createFixtureRepository,
  createServerExpressionRepository,
  type StoryRepository,
} from '@/features/story-publish';
import { Spacing } from '@/constants/theme';
import { useExpressionEditor } from '../hooks/useExpressionEditor';
import { ExpressionSettings } from './ExpressionSettings';

const apiUrl = process.env.EXPO_PUBLIC_API_URL;
// 서버 주소가 없으면 로컬 예제 서버(기본 8787)에 연결한다. 예제 서버는 `npm run fixture:stories`로 켜며 Node 24 이상이 필요하다.
const defaultRepository = apiUrl
  ? createServerExpressionRepository(apiUrl)
  : createFixtureRepository(process.env.EXPO_PUBLIC_STORY_FIXTURE_URL ?? 'http://127.0.0.1:8787');
export function ExpressionScreen({
  repository = defaultRepository,
  hideHeader = false,
  storyId = apiUrl ? (process.env.EXPO_PUBLIC_STORY_ID ?? '') : 'seed-story-001',
}: {
  repository?: StoryRepository;
  hideHeader?: boolean;
  storyId?: string;
}) {
  return storyId ? (
    <ExpressionEditor repository={repository} storyId={storyId} hideHeader={hideHeader} />
  ) : (
    <Surface style={styles.screen}>
      {!hideHeader ? <ScreenHeader title="표현 설정" /> : null}
      <Notice message="편집할 스토리를 선택해 주세요." />
    </Surface>
  );
}
function ExpressionEditor({
  repository,
  storyId,
  hideHeader,
}: {
  repository: StoryRepository;
  storyId: string;
  hideHeader: boolean;
}) {
  const editor = useExpressionEditor(repository, storyId);
  const [confirmReload, setConfirmReload] = useState(false);
  // 완성(비공개·공개)된 스토리는 이 화면의 임시 저장 요청을 서버가 거절(409)하므로 퓨샷처럼 저장을 막는다.
  const completed = !!editor.draft && editor.draft.saveState !== '임시 저장';
  return (
    <Surface style={styles.screen}>
      {!hideHeader ? <ScreenHeader eyebrow="CHAR / CHAT" title="표현 설정" /> : null}
      <SafeAreaView edges={['bottom']} style={styles.screen}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {repository.mode === 'fixture' ? (
            <Notice message="로컬 예제 모드입니다. 저장한 설정은 로컬 개발 서버의 예제 파일에만 남으며 공유 DB에는 저장하지 않습니다." />
          ) : null}
          {editor.loading ? <Text accessibilityRole="progressbar">설정을 불러오는 중입니다.</Text> : null}
          {editor.loadError ? (
            <View style={styles.actions}>
              <Notice tone="alert" message={editor.loadError} />
              <Button label="다시 불러오기" onPress={() => void editor.reload()} />
            </View>
          ) : null}
          {!editor.loading && !editor.loadError && editor.settings && editor.draft ? (
            <>
              <Text variant="subheading">{editor.draft.title}</Text>
              <ExpressionSettings value={editor.settings} onChange={editor.setSettings} />
              <Text variant="caption" accessibilityLiveRegion="polite">
                {editor.saving
                  ? '저장 중입니다.'
                  : editor.dirty
                    ? '저장하지 않은 변경이 있습니다.'
                    : '저장한 설정과 같습니다.'}
              </Text>
              {editor.draft.updatedAt ? (
                <Text variant="caption">마지막 저장: {new Date(editor.draft.updatedAt).toLocaleString('ko-KR')}</Text>
              ) : null}
              {editor.saveError ? <Notice tone="alert" message={editor.saveError} /> : null}
              <Button
                label={editor.hasPendingSave ? '이전 저장 재시도' : '표현 설정 임시 저장'}
                disabled={editor.saving || (!editor.dirty && !editor.hasPendingSave) || completed}
                onPress={() => void editor.save()}
              />
              {completed ? <Notice message="완성된 스토리는 공통 저장 흐름에서 수정해야 합니다." /> : null}
              <Button
                label="저장한 설정 다시 불러오기"
                variant="secondary"
                disabled={editor.saving || editor.hasPendingSave}
                onPress={() => (editor.dirty ? setConfirmReload(true) : void editor.reload())}
              />
              {confirmReload ? (
                <View style={styles.actions}>
                  <Notice tone="alert" message="저장하지 않은 변경이 사라집니다. 마지막 저장 설정을 불러올까요?" />
                  <Button label="변경 유지" variant="secondary" onPress={() => setConfirmReload(false)} />
                  <Button
                    label="변경 버리고 불러오기"
                    onPress={() => {
                      setConfirmReload(false);
                      void editor.reload();
                    }}
                  />
                </View>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Surface>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  actions: { gap: Spacing.two },
});
