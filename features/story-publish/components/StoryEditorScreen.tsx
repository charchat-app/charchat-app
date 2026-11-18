import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, Button, Notice, ScreenHeader, Surface, Text, TopTabs } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, type FieldIssue } from '@/lib/api-client';
import { BasicInfoForm, fromDraft, toDraftPatch, type BasicInfoValues } from '@/features/story-setup';

import { toAppIssues } from '../api';
import { applySavedIds, toFieldErrors } from '../formSync';
import { useSaveStoryBasic, useStory } from '../hooks/useStories';
import { formatSavedAt } from '../savedAt';

/** 목업의 제작 탭 구성. 지금은 기본 설정 탭만 서버와 연결되어 있다. */
const TABS = ['기본 설정', '말투·서술', '인트로', '초기 상태', '유저 프로필', '공개 범위'] as const;

export type StoryEditorScreenProps = {
  storyId: string;
  onBack: () => void;
};

/**
 * 스토리 편집 화면. 탭별 저장 조각을 모아 저장한다 (story-publish 책임).
 * 저장이 실패하면 입력을 그대로 두고 실패를 알린다. 성공 응답을 받기 전에는 저장 완료로 표시하지 않는다.
 */
export function StoryEditorScreen({ storyId, onBack }: StoryEditorScreenProps) {
  const c = useTheme();
  const story = useStory(storyId);
  const save = useSaveStoryBasic(storyId);
  const [tab, setTab] = useState(0);
  // 캐릭터를 끄는 동안 화면 스크롤을 멈춘다 (AC14: 드래그와 페이지 스크롤이 겹치지 않게)
  const [dragging, setDragging] = useState(false);
  const [values, setValues] = useState<BasicInfoValues | null>(null);
  // 서버 issues의 characters[i]가 어느 캐릭터인지 알려면, 그 판정을 받은 저장본의 캐릭터 순서(key)가 필요하다.
  const [savedKeys, setSavedKeys] = useState<string[]>([]);
  const [attemptKeys, setAttemptKeys] = useState<string[]>([]);

  // 처음 불러온 저장본으로 입력값을 채운다. 이후 서버 응답이 입력 중인 내용을 덮어쓰지 않게 한 번만 한다.
  useEffect(() => {
    if (story.data && values === null) {
      const loaded = fromDraft(story.data);
      setValues(loaded);
      setSavedKeys(loaded.characters.map((ch) => ch.key));
    }
  }, [story.data, values]);

  if (story.isPending || (story.data && values === null)) {
    return <Centered onBack={onBack} message="불러오는 중…" />;
  }
  if (story.isError || !values) {
    const notFound = story.error instanceof ApiError && story.error.status === 404;
    return (
      <Centered
        onBack={onBack}
        message={notFound ? '스토리를 찾을 수 없어요.' : messageOf(story.error)}
        onRetry={notFound ? undefined : () => void story.refetch()}
      />
    );
  }

  const saved = story.data;
  const failedIssues = save.error instanceof ApiError ? toAppIssues(save.error.issues) : [];
  const issues: FieldIssue[] = failedIssues.length > 0 ? failedIssues : saved.issues;
  const errors = toFieldErrors(issues, failedIssues.length > 0 ? attemptKeys : savedKeys);
  const isDraft = saved.saveState === '임시 저장';
  const doSave = () => {
    const sent = values.characters.map((ch) => ch.key);
    setAttemptKeys(sent);
    save.mutate(toDraftPatch(values), {
      onSuccess: (story) => {
        // 새 캐릭터에 서버 id를 붙여 다음 저장 때 같은 캐릭터로 수정되게 한다.
        setValues((v) =>
          v
            ? applySavedIds(
                v,
                sent,
                story.characters.map((ch) => ch.id ?? ''),
              )
            : v,
        );
        setSavedKeys(sent);
      },
    });
  };

  return (
    <Surface style={styles.container}>
      <ScreenHeader
        title={values.title || '새 스토리'}
        onBack={onBack}
        backLabel="목록으로 돌아가기"
        right={<Badge label={saved.saveState} />}
      />
      {/* 가로 스크롤 탭이 세로로 늘어나지 않게 높이를 내용에 맞춘다 */}
      <View style={styles.tabs}>
        <TopTabs tabs={TABS} activeIndex={tab} onChange={setTab} />
      </View>
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!dragging}
      >
        {tab === 0 ? (
          <>
            {issues.length > 0 ? (
              <Notice tone="alert" message="공개·비공개로 저장하려면 표시된 항목을 채워 주세요." />
            ) : null}
            <BasicInfoForm
              values={values}
              onChange={(update) => setValues((v) => (v ? update(v) : v))}
              errors={errors}
              onDragActiveChange={setDragging}
            />
          </>
        ) : (
          <Notice message={`${TABS[tab]} 탭은 아직 연결되지 않았어요.`} />
        )}
      </ScrollView>
      <SafeAreaView
        edges={['bottom']}
        style={[styles.footer, { borderTopColor: c.border, backgroundColor: c.background }]}
      >
        <View style={styles.status}>
          {save.isPending ? (
            <Text variant="caption">저장 중…</Text>
          ) : save.isError ? (
            <Text variant="error">{saveErrorMessage(save.error)}</Text>
          ) : (
            <Text variant="caption">{formatSavedAt(saved.updatedAt)}</Text>
          )}
        </View>
        <Button
          label={save.isError ? '다시 저장' : isDraft ? '임시 저장' : '변경 내용 저장'}
          onPress={doSave}
          disabled={save.isPending}
        />
      </SafeAreaView>
    </Surface>
  );
}

function Centered({ message, onBack, onRetry }: { message: string; onBack: () => void; onRetry?: () => void }) {
  return (
    <Surface style={styles.container}>
      <ScreenHeader title="스토리" onBack={onBack} backLabel="목록으로 돌아가기" />
      <View style={styles.centered}>
        <Text variant="caption">{message}</Text>
        {onRetry ? <Button label="다시 시도" variant="secondary" onPress={onRetry} /> : null}
      </View>
    </Surface>
  );
}

function messageOf(error: Error | null): string {
  return error instanceof ApiError ? error.detail : '알 수 없는 오류가 발생했습니다.';
}

function saveErrorMessage(error: Error): string {
  if (error instanceof ApiError && error.code === 'STORY_INCOMPLETE') {
    return '저장 조건을 충족하지 않아 저장하지 않았어요. 입력한 내용은 그대로예요.';
  }
  return `저장하지 못했어요. 입력한 내용은 그대로예요. (${messageOf(error)})`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { flexGrow: 0, flexShrink: 0 },
  body: { flex: 1 },
  content: { padding: Spacing.four, paddingBottom: Spacing.six },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderTopWidth: 1,
  },
  status: { flex: 1, minWidth: 0 },
  centered: { padding: Spacing.four, gap: Spacing.two },
});
