import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, CreationIcon, FormField, Notice, Text, TextField } from '@/components/ui';
import { ContentInset, MinTouchSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { introLength } from '@/features/story-publish';
import { countRawText } from '@/lib/rawText';
import {
  INTRO_BODY_LIMIT,
  INTRO_TITLE_LIMIT,
  MAX_INTROS,
  moveByKey,
  newIntro,
  type FewshotCharacter,
  type IntroItem,
} from '@/shared/story-types';
import { FewshotGroupEditor, type PendingInput } from './FewshotGroupEditor';
import { ReorderList } from './ReorderList';
import { Hint, IconButton } from './SceneParts';
import { SceneSummary } from './initial-state/SceneSummary';

const introName = (index: number) => (index === 0 ? '기본 인트로' : `인트로 ${index + 1}`);
/** 목업 v15 인트로 본문 머리글(.example-top .head) 치수 */
const TOP_BAR_HEIGHT = 64;
const TOP_SIDE = 48;
const TOP_ICON = 21;
const LEAVE_LOCKED_HINT = '작성한 내용을 추가하거나 수정 완료·취소한 뒤 이동할 수 있습니다.';

/** CREATE-US-03 인트로 목록·본문 편집. 저장은 7번 공통 저장이 담당한다. */
export function IntroEditorView({
  intros,
  setIntros,
  characters,
  onPendingChange,
  onEditingChange,
  onOpenState,
}: {
  intros: IntroItem[];
  setIntros: Dispatch<SetStateAction<IntroItem[]>>;
  characters: FewshotCharacter[];
  onPendingChange?: (value: PendingInput) => void;
  /** CREATE-US-12 본문 편집(목업 「시작 장면 편집」 전체 화면)을 열고 닫을 때 알린다. 호스트가 탭 머리글·저장 줄을 숨긴다. */
  onEditingChange?: (editing: boolean) => void;
  /**
   * CREATE-US-12 목업 초기 상태 카드의 「초기 상태 설정하기」. 없으면 버튼을 두지 않는다.
   * 지금 편집 중인 인트로의 clientKey를 넘겨 초기 상태 탭이 그 인트로의 장면을 열게 한다.
   * 초기 상태 탭으로 옮겼으면 true를 돌려준다. 그때만 본문 편집(전체 화면)을 닫아, 인트로 탭으로 돌아오면 목록이 보인다.
   */
  onOpenState?: (introKey: string) => boolean;
}) {
  const c = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingInput>({ active: false, lengthDelta: 0 });
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => onPendingChange?.(pending), [onPendingChange, pending]);
  const activeIndex = intros.findIndex((intro) => intro.clientKey === selected);
  const active = activeIndex >= 0 ? intros[activeIndex] : undefined;
  useEffect(() => {
    // 다시 불러오기 등으로 열린 인트로가 사라지면 목록으로 돌아간다.
    if (selected !== null && !active) {
      setSelected(null);
      setPending({ active: false, lengthDelta: 0 });
    }
  }, [active, selected]);
  const editing = !!active;
  useEffect(() => onEditingChange?.(editing), [onEditingChange, editing]);
  const update = (key: string, change: (intro: IntroItem) => IntroItem) =>
    setIntros((items) => items.map((intro) => (intro.clientKey === key ? change(intro) : intro)));

  if (active) {
    const count = introLength(active) + pending.lengthDelta;
    const over = count > INTRO_BODY_LIMIT;
    // 작성 중이면 목록으로 나가지 않는다(기존 FewshotGroupEditor 뒤로 가기 조건과 같다).
    const leaveLocked = pending.active;
    const leaveHint = leaveLocked ? LEAVE_LOCKED_HINT : undefined;
    const countText = `${count.toLocaleString()} / ${INTRO_BODY_LIMIT.toLocaleString()}자 · 이 인트로 본문`;
    const close = () => setSelected(null);
    return (
      // CREATE-US-12 목업 renderExample(intro): 탭·저장 줄 없이 이 인트로의 말풍선만 다루는 전체 화면.
      // 위: 머리글(.example-top .head: 뒤로 · 가운데 제목 · 확인) · 글자 수 줄(.example-count)
      // 가운데(스크롤): 말풍선(.conversation) · 이 인트로의 초기 상태(.initial-preview)
      // 아래(스크롤과 별개로 고정): 작성 줄(.composer). 위쪽 안전 영역은 머리글을 숨긴 호스트가 맡는다.
      <View testID="intro-body-screen" style={styles.screen}>
        <View testID="intro-body-topbar" style={[styles.topBar, { backgroundColor: c.background }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="인트로 목록으로"
            accessibilityHint={leaveHint}
            accessibilityState={{ disabled: leaveLocked }}
            disabled={leaveLocked}
            onPress={close}
            style={[styles.topSide, leaveLocked && styles.dim]}
          >
            <CreationIcon name="back" size={TOP_ICON} color={c.headerIcon} />
          </Pressable>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.topTitle}>
            {active.title.trim() || `인트로 ${activeIndex + 1}`}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="확인"
            accessibilityHint={leaveHint}
            accessibilityState={{ disabled: leaveLocked }}
            disabled={leaveLocked}
            onPress={close}
            style={[styles.topSide, leaveLocked && styles.dim]}
          >
            <Text style={[styles.done, { color: c.accent }]}>확인</Text>
          </Pressable>
        </View>
        <View testID="intro-body-count" style={[styles.countLine, { borderTopColor: c.divider }]}>
          <Text
            variant="caption"
            color={over ? 'danger' : 'textSecondary'}
            accessibilityLiveRegion="polite"
            // 초과는 목업처럼 색으로 보이고, 스크린 리더에는 초과 글자 수를 함께 읽는다.
            accessibilityLabel={
              over ? `${countText} · ${(count - INTRO_BODY_LIMIT).toLocaleString()}자 초과` : undefined
            }
            style={styles.countText}
          >
            {countText}
          </Text>
        </View>
        <FewshotGroupEditor
          key={active.clientKey}
          group={active}
          characters={characters}
          onPending={setPending}
          onClose={close}
          // 편집기는 말풍선만 바꾼다. 이전 렌더의 인트로 전체로 덮으면 캐릭터 삭제 정리가 되살아나므로 말풍선만 합친다.
          onChange={(value) => update(value.clientKey, (current) => ({ ...current, messages: value.messages }))}
          chatLayout={({ messages, composer }) => (
            <>
              <ScrollView
                testID="intro-body-scroll"
                style={styles.scroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.conversation}
              >
                {messages}
                {/* CREATE-US-04-AC08·18: 이 인트로의 초기 상태를 말풍선 다음에서 확인한다. */}
                <SceneSummary
                  scene={active.scene}
                  characters={characters}
                  onOpenState={
                    onOpenState
                      ? () => {
                          if (onOpenState(active.clientKey)) setSelected(null);
                        }
                      : undefined
                  }
                  // 목업처럼 작성 중인 말풍선이 있으면 먼저 추가·수정 완료·취소해야 넘어간다.
                  openDisabled={leaveLocked}
                />
              </ScrollView>
              <SafeAreaView
                testID="intro-body-composer-dock"
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

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView
        testID="intro-list-scroll"
        // 손잡이를 끄는 동안 목록 스크롤이 제스처를 가져가지 않게 잠근다.
        scrollEnabled={!dragging}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* CREATE-US-12 목업 intro(): 한 구역 카드 안에 제목·안내 · 인트로 카드 · 추가 버튼 · 힌트 */}
        <Card tone="section" style={styles.section}>
          <View style={styles.heading}>
            <Text variant="heading" accessibilityRole="header">
              첫 장면을 써 주세요
            </Text>
            <Text variant="caption">
              인트로마다 제목과 시작 장면을 작성해요.{'\n'}최소 1개·최대 5개, 첫 번째가 기본이에요.
            </Text>
          </View>
          {intros.length === 0 ? (
            <Card style={styles.empty}>
              <Text>작성한 인트로가 없습니다.</Text>
              <Text variant="caption">공개·비공개 저장에는 인트로가 1개 이상 필요해요.</Text>
            </Card>
          ) : null}
          {/* 인트로 카드(.item): 머리글(손잡이 · 이름 + 삭제) · 상황 제목 · 말풍선 수와 글자 수 · 시작 장면 편집 */}
          {/* CREATE-US-12: 인트로 목록만 여섯 점 손잡이로 순서를 바꾼다(이동 화살표 없음). 첫 번째가 기본이다. */}
          <ReorderList
            items={intros}
            label="인트로"
            handle="grip"
            onActive={setDragging}
            onMove={(from, to) => setIntros((items) => moveByKey(items, from, to))}
            renderTitle={(_, index) => (
              <Text variant="caption" color="text" style={styles.cardTitle}>
                {introName(index)}
              </Text>
            )}
            renderActions={(intro, index) => (
              <IconButton
                icon="trash"
                tone="danger"
                label={`인트로 ${index + 1} 삭제`}
                onPress={() => setDeleteKey(intro.clientKey)}
              />
            )}
            renderItem={(intro, index) => {
              const titleLength = countRawText(intro.title);
              return (
                <View style={styles.item}>
                  <FormField
                    label={`상황 제목 * · 최대 ${INTRO_TITLE_LIMIT}자`}
                    style={styles.field}
                    error={
                      titleLength > INTRO_TITLE_LIMIT
                        ? `${titleLength} / ${INTRO_TITLE_LIMIT}자 · ${titleLength - INTRO_TITLE_LIMIT}자 초과`
                        : undefined
                    }
                  >
                    <TextField
                      accessibilityLabel={`인트로 ${index + 1} 상황 제목`}
                      placeholder="시작 상황을 구분할 제목"
                      value={intro.title}
                      invalid={titleLength > INTRO_TITLE_LIMIT}
                      onChangeText={(title) => update(intro.clientKey, (item) => ({ ...item, title }))}
                    />
                  </FormField>
                  {/* .intro-list-summary */}
                  <BodyCount count={introLength(intro)} label={`${intro.messages.length}개 말풍선 ·`} />
                  {deleteKey === intro.clientKey ? (
                    // 삭제 확인은 지우려는 카드 안에 둔다.
                    <View style={styles.item}>
                      <Notice
                        tone="alert"
                        message={`${introName(index)}와 안의 말풍선을 모두 삭제할까요?${
                          index === 0 && intros.length > 1 ? ' 다음 인트로가 기본이 됩니다.' : ''
                        } 저장하면 삭제가 반영됩니다.`}
                      />
                      <View style={styles.actions}>
                        <Button label="인트로 삭제 취소" variant="secondary" onPress={() => setDeleteKey(null)} />
                        <Button
                          label="인트로 삭제 확인"
                          variant="danger"
                          onPress={() => {
                            setIntros((items) => items.filter((item) => item.clientKey !== deleteKey));
                            setDeleteKey(null);
                          }}
                        />
                      </View>
                    </View>
                  ) : (
                    <Button
                      label="시작 장면 편집"
                      icon="edit"
                      accessibilityLabel={`인트로 ${index + 1} 본문 편집`}
                      variant="secondary"
                      fullWidth
                      onPress={() => setSelected(intro.clientKey)}
                    />
                  )}
                </View>
              );
            }}
          />
          <Button
            label="+ 인트로 추가"
            accessibilityLabel="인트로 추가"
            variant="secondary"
            fullWidth
            disabled={intros.length >= MAX_INTROS}
            onPress={() => setIntros((items) => (items.length >= MAX_INTROS ? items : [...items, newIntro()]))}
          />
          {intros.length >= MAX_INTROS ? <Text variant="caption">인트로는 최대 5개예요.</Text> : null}
          <Hint>본문 2000자는 인트로별로 계산해요. 제목은 제외해요.</Hint>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
function BodyCount({ count, label }: { count: number; label: string }) {
  const over = count - INTRO_BODY_LIMIT;
  return (
    <>
      <Text color={over > 0 ? 'danger' : 'textSecondary'} variant="caption" accessibilityLiveRegion="polite">
        {label} {count.toLocaleString()} / {INTRO_BODY_LIMIT.toLocaleString()}자
        {over > 0 ? ` · ${over.toLocaleString()}자 초과` : ''}
      </Text>
      {over > 0 ? (
        <Notice
          tone="alert"
          message="초과 원문도 임시 저장할 수 있습니다. 공개·비공개 저장 전에는 2000자 이하로 줄여야 합니다."
        />
      ) : null}
    </>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingTop: ContentInset.top,
    paddingHorizontal: ContentInset.horizontal,
    paddingBottom: ContentInset.bottom,
  },
  section: { gap: Spacing.three },
  heading: { gap: Spacing.one },
  empty: { gap: Spacing.one, marginVertical: 0 },
  item: { gap: Spacing.two },
  field: { marginTop: 0 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  // 목업 .item-header: 13px 굵게. 카드 테두리·머리글 줄은 ReorderList 'card' 행이 맡는다.
  cardTitle: { fontWeight: '600' },
  // 목업 .example-top .head: 64px 줄, 왼쪽 뒤로(44) · 가운데 제목 · 오른쪽 확인(min 48)
  topBar: {
    height: TOP_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    gap: Spacing.one,
  },
  // 양쪽 칸 폭을 같게 두어 제목이 화면 가운데에 온다.
  topSide: { width: TOP_SIDE, height: MinTouchSize, alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 16, fontWeight: '600' },
  done: { fontSize: 15, fontWeight: '700' },
  dim: { opacity: 0.45 },
  // 목업 .example-count: 위 얇은 구분선, 가운데 정렬 11~12px, 위아래 9px
  countLine: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
    paddingHorizontal: ContentInset.horizontal,
  },
  countText: { textAlign: 'center', fontSize: 11 },
  scroll: { flex: 1 },
  // 목업 .conversation: padding 24px 16px
  conversation: { paddingVertical: Spacing.five, paddingHorizontal: ContentInset.horizontal },
});
