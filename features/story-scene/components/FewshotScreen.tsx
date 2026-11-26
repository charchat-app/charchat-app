import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, CreationIcon, Notice, ScreenHeader, Surface, Text } from '@/components/ui';
import { ContentInset, MinTouchSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createServerFewshotRepository, type FewshotRepository } from '@/features/story-publish';
import { moveByKey, newFewshotGroup, type FewshotCharacter, type FewshotGroup } from '@/shared/story-types';
import { useFewshotEditor } from '../hooks/useFewshotEditor';
import { FewshotGroupEditor, type PendingInput } from './FewshotGroupEditor';
import { ReorderList } from './ReorderList';
import { IconButton, SectionHeading } from './SceneParts';

/** 목업 v15 예시 본문 머리글(.example-top .head) 치수. IntroEditorView와 같다. */
const TOP_BAR_HEIGHT = 64;
const TOP_SIDE = 48;
const TOP_ICON = 21;
const FEWSHOT_LIMIT = 2000;

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
  onEditingChange,
  header,
}: {
  editor: ReturnType<typeof useFewshotEditor>;
  hideHeader?: boolean;
  hideSaveControls?: boolean;
  onPendingChange?: (value: PendingInput) => void;
  /** CREATE-US-12 상황 예시 편집(전체 높이 대화 편집기)을 열고 닫을 때 알린다. 호스트가 탭 머리글·저장 줄을 숨긴다. */
  onEditingChange?: (editing: boolean) => void;
  /** CREATE-US-12 목록 위에 같은 스크롤로 붙일 내용(말투·서술 탭의 표현 설정). */
  header?: ReactNode;
}) {
  const c = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingInput>({ active: false, lengthDelta: 0 });
  const [confirmReload, setConfirmReload] = useState(false);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  // 예시 카드를 끄는 동안 목록 스크롤을 멈추고 카드 안 버튼을 막는다.
  const [dragging, setDragging] = useState(false);
  useEffect(() => onPendingChange?.(pending), [onPendingChange, pending]);
  const activeIndex = editor.groups.findIndex((group) => group.clientKey === selected);
  const active = activeIndex >= 0 ? editor.groups[activeIndex] : undefined;
  const count = editor.length + pending.lengthDelta;
  useEffect(() => {
    // 다시 불러오기·삭제 등으로 열린 예시가 사라지면 목록으로 돌아간다.
    if (selected !== null && !active) {
      setSelected(null);
      setPending({ active: false, lengthDelta: 0 });
    }
  }, [active, selected]);
  const characters = editor.snapshot?.characters;
  const editing = !!active && !!characters && !editor.loading;
  useEffect(() => onEditingChange?.(editing), [onEditingChange, editing]);
  const reload = () => {
    setSelected(null);
    setPending({ active: false, lengthDelta: 0 });
    void editor.reload();
  };
  return (
    <Surface style={styles.screen}>
      {!hideHeader ? <ScreenHeader eyebrow="CHAR / CHAT" title="대화 예시" /> : null}
      {/* 저장 조작을 숨기면 호스트의 하단 고정 줄이 아래 안전 영역을 맡는다. */}
      {/* 대화 편집기를 여는 동안에는 편집기 작성 줄이 아래 안전 영역을 맡는다. */}
      <SafeAreaView edges={hideSaveControls || editing ? [] : ['bottom']} style={styles.screen}>
        {/*
          CREATE-US-12 상황 예시 편집은 목록 스크롤을 대신하는 전체 높이 대화 편집기로 연다.
          목록 스크롤은 숨기기만 해서(언마운트하지 않음) 표현 설정의 선택·확인 상태와 스크롤 위치를 유지한다.
        */}
        <ScrollView
          style={editing ? styles.hidden : undefined}
          scrollEnabled={!dragging}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          {header}
          {editor.loading ? <Text accessibilityRole="progressbar">대화 예시를 불러오는 중입니다.</Text> : null}
          {editor.error ? <Notice tone="alert" message={editor.error} /> : null}
          {editor.characterSyncError ? <Notice tone="alert" message={editor.characterSyncError} /> : null}
          {editor.characterNotice ? (
            <Text variant="caption" accessibilityLiveRegion="polite">
              {editor.characterNotice}
            </Text>
          ) : null}
          {/* 대화 편집기를 연 동안 목록 쪽 글자 수·목록·저장 조작은 그리지 않는다(편집기 머리글이 글자 수를 보인다). */}
          {!editor.loading && editor.snapshot && !editing ? (
            <>
              {/* CREATE-US-12 목업 .speech-examples 구역 머리글. 단독 화면에서는 스토리 제목을 함께 보인다. */}
              {header ? null : <Text variant="subheading">{editor.snapshot.title}</Text>}
              {/* CREATE-US-12 목업 v15: 「대화 예시」 제목 + 「선택」 표시(문체 스타일과 같은 모양) 머리글 아래 예시 카드 목록.
                  카드를 누르면 아래 편집기로 펼친다. */}
              <SectionHeading
                testID="fewshot-heading"
                title="대화 예시"
                optional
                caption="말투 참고 예시"
                level="subheading"
              />
              <Text variant="caption">상황 예시로 캐릭터의 성격과 말투를 표현해 주세요.</Text>
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
              {/* CREATE-US-12 목업 .example-row: 한 줄 카드(여섯 점 손잡이 · 제목·말풍선 수 + 편집·삭제).
                  예시 카드 순서는 손잡이로만 바꾼다(놓을 때 한 번 반영, 저장은 기존 저장 조작). 말풍선 순서는 바꾸지 않는다. */}
              <ReorderList
                items={editor.groups}
                label="상황 예시"
                handle="grip"
                onActive={setDragging}
                onMove={(from, to) => editor.setGroups((groups) => moveByKey(groups, from, to))}
                renderTitle={(group, index) => (
                  // 카드 본문을 눌러도 대화 편집기로 연다(편집 버튼과 같은 동작).
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`상황 예시 ${index + 1} 펼쳐 편집`}
                    disabled={dragging}
                    onPress={() => setSelected(group.clientKey)}
                    style={styles.rowBody}
                  >
                    <Text numberOfLines={1} style={styles.rowTitle}>
                      상황 예시 {index + 1}
                    </Text>
                    <Text variant="caption" numberOfLines={1}>
                      {group.messages[0]?.body?.trim() || '아직 말풍선이 없어요'}
                    </Text>
                    <Text variant="caption">{group.messages.length}개 말풍선 · 눌러서 편집</Text>
                  </Pressable>
                )}
                renderActions={(group, index) => (
                  <>
                    <IconButton
                      icon="edit"
                      label={`예시 ${index + 1} 편집`}
                      disabled={dragging}
                      onPress={() => setSelected(group.clientKey)}
                    />
                    <IconButton
                      icon="trash"
                      tone="danger"
                      label={`예시 ${index + 1} 삭제`}
                      disabled={dragging}
                      onPress={() => setDeleteKey(group.clientKey)}
                    />
                  </>
                )}
              />
              {editor.groups.length === 0 ? (
                <Text variant="caption">작성한 대화 예시가 없습니다. 퓨샷은 선택 입력입니다.</Text>
              ) : null}
              <Button
                label="+ 상황 예시 추가"
                accessibilityLabel="예시 추가"
                variant="secondary"
                style={styles.add}
                disabled={dragging}
                onPress={() => editor.setGroups((groups) => [...groups, newFewshotGroup()])}
              />
              <Text variant="caption">기본 설정 3000자와 별도 · 예시·말풍선 개수 제한 없음.</Text>
              {deleteKey ? (
                <View style={styles.actions}>
                  <Notice tone="alert" message="이 예시와 안의 말풍선을 모두 삭제할까요? 저장하면 삭제가 반영됩니다." />
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
                    disabled={editor.saving || pending.active || editor.pendingSave}
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
          ) : !editor.loading && !editing ? (
            <Button label="퓨샷 다시 불러오기" onPress={reload} />
          ) : null}
        </ScrollView>
        {editing && active && characters ? (
          <ConversationEditor
            key={active.clientKey}
            group={active}
            index={activeIndex}
            count={count}
            characters={characters}
            pending={pending.active}
            syncError={editor.characterSyncError}
            setPending={setPending}
            onClose={() => setSelected(null)}
            onChange={(messages) =>
              editor.setGroups((groups) =>
                groups.map((group) => (group.clientKey === active.clientKey ? { ...group, messages } : group)),
              )
            }
            colors={c}
          />
        ) : null}
      </SafeAreaView>
    </Surface>
  );
}
/**
 * CREATE-US-12 목업 renderExample(example): 이 상황 예시의 말풍선만 다루는 전체 높이 편집기.
 * 인트로 본문 편집(IntroEditorView)과 같은 머리글·글자 수 줄·스크롤 대화·하단 고정 작성 줄을 쓰고, 초기 상태 카드는 없다.
 * 「확인」은 바뀐 말풍선을 화면 상태에만 두고 목록으로 돌아간다. 저장은 목록의 기존 저장 조작(또는 호스트 저장 줄)이 맡는다.
 */
function ConversationEditor({
  group,
  index,
  count,
  characters,
  pending,
  syncError,
  setPending,
  onClose,
  onChange,
  colors: c,
}: {
  group: FewshotGroup;
  index: number;
  count: number;
  characters: FewshotCharacter[];
  pending: boolean;
  /** 캐릭터 목록 동기화 실패 안내. 목록 화면은 숨겨지므로 열린 편집기에서도 보인다. */
  syncError: string | null;
  setPending: (value: PendingInput) => void;
  onClose: () => void;
  /** 말풍선만 넘긴다. 이전 렌더의 예시 전체로 덮지 않도록 호스트가 말풍선만 합친다. */
  onChange: (messages: FewshotGroup['messages']) => void;
  colors: ReturnType<typeof useTheme>;
}) {
  const over = count > FEWSHOT_LIMIT;
  // 작성 중이면 목록으로 나가지 않는다(기존 뒤로 가기 조건과 같다).
  const leaveLocked = pending;
  const leaveHint = leaveLocked ? '작성한 내용을 추가하거나 수정 완료·취소한 뒤 이동할 수 있습니다.' : undefined;
  return (
    <View testID="conversation-editor" style={styles.screen}>
      <View style={[styles.topBar, { backgroundColor: c.background }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="예시 목록으로"
          accessibilityHint={leaveHint}
          accessibilityState={{ disabled: leaveLocked }}
          disabled={leaveLocked}
          onPress={onClose}
          style={[styles.topSide, leaveLocked && styles.dim]}
        >
          <CreationIcon name="back" size={TOP_ICON} color={c.headerIcon} />
        </Pressable>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.topTitle}>
          상황 예시 {index + 1}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="확인"
          accessibilityHint={leaveHint}
          accessibilityState={{ disabled: leaveLocked }}
          disabled={leaveLocked}
          onPress={onClose}
          style={[styles.topSide, leaveLocked && styles.dim]}
        >
          <Text style={[styles.done, { color: c.accent }]}>확인</Text>
        </Pressable>
      </View>
      <View style={[styles.countLine, { borderTopColor: c.divider }]}>
        <Text
          variant="caption"
          color={over ? 'danger' : 'textSecondary'}
          accessibilityLiveRegion="polite"
          style={styles.countText}
        >
          퓨샷 전체 {count.toLocaleString()} / 2,000자
        </Text>
        {over ? (
          <Notice tone="alert" message="초과 원문도 임시 저장할 수 있습니다. 완성 저장 전에는 분량을 줄여야 합니다." />
        ) : null}
        {syncError ? <Notice tone="alert" message={syncError} /> : null}
        {/* 작성 중 입력 때문에 나갈 수 없을 때만 짧게 알린다. */}
        {pending ? (
          <Text variant="caption" accessibilityLiveRegion="polite" style={styles.countText}>
            말풍선을 추가하거나 수정을 마치면 나갈 수 있어요.
          </Text>
        ) : null}
      </View>
      <FewshotGroupEditor
        group={group}
        characters={characters}
        onPending={setPending}
        onClose={onClose}
        onChange={(value) => onChange(value.messages)}
        chatLayout={({ messages, composer }) => (
          <>
            <ScrollView
              style={styles.screen}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.conversation}
            >
              {messages}
            </ScrollView>
            {/* 목업 .composer: 스크롤과 별개로 아래에 고정. 말풍선 수정 중에는 비어 있어도 자리는 유지한다. */}
            <SafeAreaView
              testID="conversation-composer"
              edges={['bottom']}
              style={composer ? { backgroundColor: c.footer } : undefined}
            >
              {composer}
            </SafeAreaView>
          </>
        )}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  hidden: { display: 'none' },
  // 목업 .example-top .head: 64px 줄, 왼쪽 뒤로 · 가운데 제목 · 오른쪽 확인(IntroEditorView와 같다)
  topBar: {
    height: TOP_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    gap: Spacing.one,
  },
  topSide: { width: TOP_SIDE, height: MinTouchSize, alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 16, fontWeight: '600' },
  done: { fontSize: 15, fontWeight: '700' },
  dim: { opacity: 0.45 },
  // 목업 .example-count: 위 얇은 구분선, 가운데 정렬
  countLine: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
    paddingHorizontal: ContentInset.horizontal,
    gap: Spacing.two,
  },
  countText: { textAlign: 'center', fontSize: 11 },
  // 목업 .conversation: padding 24px 16px
  conversation: { paddingVertical: Spacing.five, paddingHorizontal: ContentInset.horizontal },
  content: { padding: Spacing.four, gap: Spacing.three },
  actions: { gap: Spacing.two },
  // 목업 .speech-examples .example-row 카드 모양(라운드 12·테두리·간격)은 ReorderList 'card' 행이 맡는다.
  rowBody: { flex: 1, minWidth: 0, minHeight: MinTouchSize, justifyContent: 'center' },
  rowTitle: { fontWeight: '600' },
  // 목업 #addExample: 점선 테두리의 넓은 추가 버튼
  add: { borderStyle: 'dashed', alignSelf: 'stretch' },
});
