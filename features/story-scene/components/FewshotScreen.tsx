import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Notice, ScreenHeader, Surface, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { createServerFewshotRepository, type FewshotRepository } from '@/features/story-publish';
import { moveByKey, newFewshotGroup } from '@/shared/story-types';
import { useFewshotEditor } from '../hooks/useFewshotEditor';
import { FewshotGroupEditor, type PendingInput } from './FewshotGroupEditor';
import { ReorderList } from './ReorderList';

const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const defaultRepository = apiUrl ? createServerFewshotRepository(apiUrl) : null;
export function FewshotScreen({
  repository = defaultRepository,
  hideHeader = false,
  storyId = process.env.EXPO_PUBLIC_STORY_ID ?? '',
}: {
  repository?: FewshotRepository | null;
  hideHeader?: boolean;
  storyId?: string;
}) {
  if (!repository || !storyId)
    return (
      <Surface style={styles.screen}>
        {!hideHeader ? <ScreenHeader title="대화 예시" /> : null}
        <Notice message="퓨샷을 편집할 서버와 스토리가 연결되지 않았습니다." />
      </Surface>
    );
  return <FewshotEditor key={storyId} repository={repository} storyId={storyId} hideHeader={hideHeader} />;
}
function FewshotEditor({
  repository,
  storyId,
  hideHeader,
}: {
  repository: FewshotRepository;
  storyId: string;
  hideHeader: boolean;
}) {
  const editor = useFewshotEditor(repository, storyId);
  return <FewshotEditorView editor={editor} hideHeader={hideHeader} />;
}
export function FewshotEditorView({
  editor,
  hideHeader = true,
  hideSaveControls = false,
  onPendingChange,
}: {
  editor: ReturnType<typeof useFewshotEditor>;
  hideHeader?: boolean;
  hideSaveControls?: boolean;
  onPendingChange?: (value: PendingInput) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<PendingInput>({ active: false, lengthDelta: 0 });
  const [confirmReload, setConfirmReload] = useState(false);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  useEffect(() => onPendingChange?.(pending), [onPendingChange, pending]);
  const active = editor.groups.find((group) => group.clientKey === selected);
  const count = editor.length + pending.lengthDelta;
  const reload = () => {
    setSelected(null);
    setPending({ active: false, lengthDelta: 0 });
    void editor.reload();
  };
  return (
    <Surface style={styles.screen}>
      {!hideHeader ? <ScreenHeader eyebrow="CHAR / CHAT" title="대화 예시" /> : null}
      <SafeAreaView edges={['bottom']} style={styles.screen}>
        <ScrollView
          scrollEnabled={!dragging}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          {editor.loading ? <Text accessibilityRole="progressbar">대화 예시를 불러오는 중입니다.</Text> : null}
          {editor.error ? <Notice tone="alert" message={editor.error} /> : null}
          {editor.characterSyncError ? <Notice tone="alert" message={editor.characterSyncError} /> : null}
          {editor.characterNotice ? (
            <Text variant="caption" accessibilityLiveRegion="polite">
              {editor.characterNotice}
            </Text>
          ) : null}
          {!editor.loading && editor.snapshot ? (
            <>
              <Text variant="subheading">{editor.snapshot.title}</Text>
              <Text
                color={count > 2000 ? 'danger' : 'textSecondary'}
                variant="caption"
                accessibilityLiveRegion="polite"
              >
                퓨샷 전체 {count.toLocaleString()} / 2,000자
              </Text>
              {count > 2000 ? (
                <Notice
                  tone="alert"
                  message="초과 원문도 임시 저장할 수 있습니다. 완성 저장 전에는 분량을 줄여야 합니다."
                />
              ) : null}
              {active ? (
                <FewshotGroupEditor
                  key={active.clientKey}
                  group={active}
                  characters={editor.snapshot.characters}
                  onDragging={setDragging}
                  onPending={setPending}
                  onClose={() => setSelected(null)}
                  onChange={(value) =>
                    editor.setGroups((groups) =>
                      groups.map((group) => (group.clientKey === value.clientKey ? value : group)),
                    )
                  }
                />
              ) : (
                <>
                  <Text variant="caption">
                    예시와 말풍선은 손잡이로 드래그하거나 이동 버튼으로 순서를 바꿀 수 있습니다.
                  </Text>
                  <ReorderList
                    items={editor.groups}
                    label="예시"
                    onActive={setDragging}
                    onMove={(from, to) => editor.setGroups((groups) => moveByKey(groups, from, to))}
                    renderItem={(group, index) => (
                      <View style={styles.actions}>
                        <Text>말풍선 {group.messages.length}개</Text>
                        <Button
                          label={`예시 ${index + 1} 편집`}
                          disabled={dragging}
                          onPress={() => setSelected(group.clientKey)}
                        />
                        <Button
                          label={`예시 ${index + 1} 삭제`}
                          variant="danger"
                          disabled={dragging}
                          onPress={() => setDeleteKey(group.clientKey)}
                        />
                      </View>
                    )}
                  />
                  {editor.groups.length === 0 ? (
                    <Text>작성한 대화 예시가 없습니다. 퓨샷은 선택 입력입니다.</Text>
                  ) : null}
                  <Button
                    label="예시 추가"
                    disabled={dragging}
                    onPress={() => editor.setGroups((groups) => [...groups, newFewshotGroup()])}
                  />
                  {deleteKey ? (
                    <View style={styles.actions}>
                      <Notice
                        tone="alert"
                        message="이 예시와 안의 말풍선을 모두 삭제할까요? 저장하면 삭제가 반영됩니다."
                      />
                      <Button label="예시 삭제 취소" variant="secondary" onPress={() => setDeleteKey(null)} />
                      <Button
                        label="예시 삭제 확인"
                        variant="danger"
                        onPress={() => {
                          editor.setGroups((groups) => groups.filter((group) => group.clientKey !== deleteKey));
                          setDeleteKey(null);
                        }}
                      />
                    </View>
                  ) : null}
                </>
              )}
              {!hideSaveControls ? (
                <>
                  <Text variant="caption" accessibilityLiveRegion="polite">
                    {editor.saving
                      ? '저장 중입니다.'
                      : editor.dirty
                        ? '저장하지 않은 퓨샷 변경이 있습니다.'
                        : '저장한 퓨샷과 같습니다.'}
                  </Text>
                  <Text variant="caption">
                    마지막 저장: {new Date(editor.snapshot.updatedAt).toLocaleString('ko-KR')}
                  </Text>
                  <Button
                    label={editor.pendingSave ? '이전 퓨샷 저장 재시도' : '퓨샷 임시 저장'}
                    disabled={
                      editor.saving ||
                      dragging ||
                      pending.active ||
                      (!editor.dirty && !editor.pendingSave) ||
                      editor.snapshot.saveState !== 'draft'
                    }
                    onPress={() => void editor.save()}
                  />
                  {pending.active ? (
                    <Text variant="caption">말풍선을 추가하거나 수정 완료·취소한 뒤 저장해 주세요.</Text>
                  ) : null}
                  {editor.snapshot.saveState !== 'draft' ? (
                    <Notice message="완성된 스토리는 공통 저장 흐름에서 수정해야 합니다." />
                  ) : null}
                  <Button
                    label="저장한 퓨샷 다시 불러오기"
                    variant="secondary"
                    disabled={editor.saving || dragging || pending.active || editor.pendingSave}
                    onPress={() => (editor.dirty ? setConfirmReload(true) : reload())}
                  />
                  {confirmReload ? (
                    <View style={styles.actions}>
                      <Notice tone="alert" message="저장하지 않은 퓨샷 변경이 사라집니다. 다시 불러올까요?" />
                      <Button label="퓨샷 변경 유지" variant="secondary" onPress={() => setConfirmReload(false)} />
                      <Button
                        label="퓨샷 변경 버리고 불러오기"
                        onPress={() => {
                          setConfirmReload(false);
                          reload();
                        }}
                      />
                    </View>
                  ) : null}
                </>
              ) : null}
            </>
          ) : !editor.loading ? (
            <Button label="퓨샷 다시 불러오기" onPress={reload} />
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
