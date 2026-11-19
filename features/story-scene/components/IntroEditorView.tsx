import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, FormField, Notice, Text, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
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
import { SceneSummary } from './initial-state/SceneSummary';

const introName = (index: number) => (index === 0 ? '기본 인트로' : `인트로 ${index + 1}`);

/** CREATE-US-03 인트로 목록·본문 편집. 저장은 7번 공통 저장이 담당한다. */
export function IntroEditorView({
  intros,
  setIntros,
  characters,
  onPendingChange,
}: {
  intros: IntroItem[];
  setIntros: Dispatch<SetStateAction<IntroItem[]>>;
  characters: FewshotCharacter[];
  onPendingChange?: (value: PendingInput) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<PendingInput>({ active: false, lengthDelta: 0 });
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
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
  const update = (key: string, change: (intro: IntroItem) => IntroItem) =>
    setIntros((items) => items.map((intro) => (intro.clientKey === key ? change(intro) : intro)));
  const deleteIndex = intros.findIndex((intro) => intro.clientKey === deleteKey);
  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView scrollEnabled={!dragging} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text variant="heading">첫 장면을 써 주세요</Text>
        <Text variant="caption">인트로마다 제목과 시작 장면을 작성해요. 최소 1개·최대 5개, 첫 번째가 기본이에요.</Text>
        {active ? (
          <>
            <BodyCount count={introLength(active) + pending.lengthDelta} label="이 인트로 본문" />
            <FewshotGroupEditor
              key={active.clientKey}
              group={active}
              characters={characters}
              heading={`${active.title.trim() || introName(activeIndex)} 본문 편집`}
              backLabel="인트로 목록으로"
              onDragging={setDragging}
              onPending={setPending}
              onClose={() => setSelected(null)}
              // 편집기는 말풍선만 바꾼다. 이전 렌더의 인트로 전체로 덮으면 캐릭터 삭제 정리가 되살아나므로 말풍선만 합친다.
              onChange={(value) => update(value.clientKey, (current) => ({ ...current, messages: value.messages }))}
            />
            {/* CREATE-US-04-AC08·18: 이 인트로의 초기 상태를 하단에서 확인한다. */}
            <SceneSummary scene={active.scene} characters={characters} />
          </>
        ) : (
          <>
            <ReorderList
              items={intros}
              label="인트로"
              onActive={setDragging}
              onMove={(from, to) => setIntros((items) => moveByKey(items, from, to))}
              renderItem={(intro, index) => {
                const titleLength = countRawText(intro.title);
                return (
                  <View style={styles.item}>
                    {/* 행 머리글에 "인트로 N"이 이미 있으므로 기본 인트로 표시만 더한다. */}
                    {index === 0 ? <Text variant="subheading">기본 인트로</Text> : null}
                    <FormField
                      label="상황 제목 *"
                      error={
                        titleLength > INTRO_TITLE_LIMIT
                          ? `${titleLength} / ${INTRO_TITLE_LIMIT}자 · ${titleLength - INTRO_TITLE_LIMIT}자 초과`
                          : undefined
                      }
                      hint={`${titleLength} / ${INTRO_TITLE_LIMIT}자`}
                    >
                      <TextField
                        accessibilityLabel={`인트로 ${index + 1} 상황 제목`}
                        placeholder="시작 상황을 구분할 제목"
                        value={intro.title}
                        invalid={titleLength > INTRO_TITLE_LIMIT}
                        editable={!dragging}
                        onChangeText={(title) => update(intro.clientKey, (item) => ({ ...item, title }))}
                      />
                    </FormField>
                    <BodyCount count={introLength(intro)} label={`말풍선 ${intro.messages.length}개 ·`} />
                    <View style={styles.actions}>
                      <Button
                        label={`인트로 ${index + 1} 본문 편집`}
                        disabled={dragging}
                        onPress={() => setSelected(intro.clientKey)}
                      />
                      <Button
                        label={`인트로 ${index + 1} 삭제`}
                        variant="danger"
                        disabled={dragging}
                        onPress={() => setDeleteKey(intro.clientKey)}
                      />
                    </View>
                  </View>
                );
              }}
            />
            {intros.length === 0 ? (
              <Text>작성한 인트로가 없습니다. 공개·비공개 저장에는 인트로가 1개 이상 필요해요.</Text>
            ) : null}
            <Button
              label="인트로 추가"
              disabled={dragging || intros.length >= MAX_INTROS}
              onPress={() => setIntros((items) => (items.length >= MAX_INTROS ? items : [...items, newIntro()]))}
            />
            {intros.length >= MAX_INTROS ? <Text variant="caption">인트로는 최대 5개예요.</Text> : null}
            {deleteIndex >= 0 ? (
              <View style={styles.item}>
                <Notice
                  tone="alert"
                  message={`${introName(deleteIndex)}와 안의 말풍선을 모두 삭제할까요?${
                    deleteIndex === 0 && intros.length > 1 ? ' 다음 인트로가 기본이 됩니다.' : ''
                  } 저장하면 삭제가 반영됩니다.`}
                />
                <Button label="인트로 삭제 취소" variant="secondary" onPress={() => setDeleteKey(null)} />
                <Button
                  label="인트로 삭제 확인"
                  variant="danger"
                  onPress={() => {
                    setIntros((items) => items.filter((intro) => intro.clientKey !== deleteKey));
                    setDeleteKey(null);
                  }}
                />
              </View>
            ) : null}
            <Text variant="caption">
              본문 2000자는 인트로별로 계산해요. 제목은 제외해요. 인트로와 말풍선은 손잡이로 드래그하거나 이동 버튼으로
              순서를 바꿀 수 있어요.
            </Text>
          </>
        )}
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
  content: { padding: Spacing.four, gap: Spacing.three },
  item: { gap: Spacing.two },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
