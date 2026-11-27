// CHAT-US-02 입력창: 한 입력창에 `@이름:` 줄로 화자 전환(`@` 칩 줄), 본문 합산 5,000자 한도, 전송 가능 여부 안내
import { type ComponentRef, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button, Notice, Text } from '@/components/ui';
import { Fonts, MinTouchSize, Radius, Spacing } from '@/constants/theme';
import type { SpeakerChip } from '@/features/chat/hooks/useSpeakers';
import { withParticle } from '@/features/chat/koreanParticle';
import {
  detectSpeakerTrigger,
  DRAFT_PROBLEM_MESSAGES,
  type DraftProblem,
  draftLength,
  insertSpeakerTag,
  limitInput,
  MESSAGE_MAX_LENGTH,
  type MessageDraft,
  type SpeakerNames,
  toMessageParts,
  validateDraft,
} from '@/features/chat/messageDraft';
import { useTheme } from '@/hooks/use-theme';
import type { ChatMessagePartInput } from '@/shared/story-types';

type Selection = { start: number; end: number };

export function ChatComposer({
  draft,
  update,
  names,
  chips,
  blockedReason,
  onSend,
}: {
  draft: MessageDraft;
  update: (change: (draft: MessageDraft) => MessageDraft) => void;
  /** 태그 이름을 발화자로 바꿀 세션 이름 */
  names: SpeakerNames;
  /** `@`를 치면 입력창 위에 보이는 화자 칩(나레이터·유저·캐릭터 순) */
  chips: SpeakerChip[];
  /** 응답 생성 중 등 지금 보낼 수 없는 이유. 작성·수정은 계속 허용한다(AC06). */
  blockedReason: string | null;
  /** 접수 시작에 성공하면 true. 입력창을 비우는 일은 보낸 쪽이 맡는다(기기 보관분 정리 시점 때문). */
  onSend: (parts: ChatMessagePartInput[]) => boolean;
}) {
  const colors = useTheme();
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  // 방금 입력한 `@`의 위치. 값이 있는 동안 칩 줄을 보인다.
  const [trigger, setTrigger] = useState<number | null>(null);
  // 칩으로 태그를 넣은 직후에만 커서를 태그 뒤로 지정한다. 다음 커서 변화부터는 이용자를 따른다.
  const [selection, setSelection] = useState<Selection | undefined>(undefined);
  const [problem, setProblem] = useState<DraftProblem | null>(null);

  const changeText = (next: string) => {
    setProblem(null);
    setSelection(undefined);
    // 합산 한도를 넘는 추가분은 막는다. `@` 한 글자를 새로 쳤을 때만 칩 줄을 열고, 그 밖의 입력은 닫는다.
    const limited = limitInput(draft.text, next, names);
    setTrigger(detectSpeakerTrigger(draft.text, limited));
    // 막혀서 글자가 그대로여도 새 값으로 다시 그려 입력창(네이티브)에 들어간 글자를 되돌린다.
    update(() => ({ text: limited }));
  };

  const choose = (name: string) => {
    const inserted = trigger === null ? null : insertSpeakerTag(draft.text, trigger, name);
    setTrigger(null);
    if (!inserted) return;
    // 태그를 넣으면 보통 합산이 줄지만, 늘어서 한도를 넘으면 넣지 않고 이유를 알린다(전송 때도 다시 막힌다).
    if (limitInput(draft.text, inserted.text, names) !== inserted.text) {
      setProblem('too_long');
      return;
    }
    update(() => ({ text: inserted.text }));
    setSelection({ start: inserted.cursor, end: inserted.cursor });
    // 웹에서는 칩을 누르면 입력창 초점이 빠지므로 다시 둔다.
    inputRef.current?.focus();
  };

  const submit = () => {
    const found = validateDraft(draft, names);
    if (found) {
      setProblem(found);
      return;
    }
    if (blockedReason) return;
    if (onSend(toMessageParts(draft, names))) setTrigger(null);
  };

  return (
    <View style={styles.composer}>
      {trigger !== null ? (
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="always"
          showsHorizontalScrollIndicator={false}
          accessibilityLabel="화자 목록"
          contentContainerStyle={styles.chips}
        >
          {chips.map((chip) => {
            const disabled = chip.disabledHint !== undefined;
            return (
              <Pressable
                key={chip.key}
                accessibilityRole="button"
                accessibilityLabel={`${withParticle(chip.name, '으로')} 말하기`}
                accessibilityHint={chip.disabledHint}
                accessibilityState={{ disabled }}
                // 웹(react-native-web)에서도 비활성을 읽도록 직접 넣는다.
                aria-disabled={disabled}
                disabled={disabled}
                onPress={() => choose(chip.name)}
                style={[
                  styles.chip,
                  { borderColor: colors.chipBorder, backgroundColor: colors.surface },
                  disabled ? styles.chipDisabled : null,
                ]}
              >
                <Text>{chip.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <TextInput
        ref={inputRef}
        accessibilityLabel="메시지 입력"
        accessibilityHint="@를 입력하면 화자를 고릅니다. @이름: 으로 시작하는 줄은 그 화자의 내용으로, 그 밖의 글은 내 대사로 보냅니다."
        multiline
        textAlignVertical="top"
        value={draft.text}
        onChangeText={changeText}
        selection={selection}
        onSelectionChange={() => setSelection(undefined)}
        placeholder="내용 입력하기 (@로 화자 바꾸기)"
        placeholderTextColor={colors.textSecondary}
        style={[
          styles.input,
          { color: colors.text, backgroundColor: colors.inputSurface, borderColor: colors.inputBorder },
        ]}
      />
      <Text variant="caption">
        {draftLength(draft, names).toLocaleString()} / {MESSAGE_MAX_LENGTH.toLocaleString()}자
      </Text>
      {problem ? <Notice tone="alert" message={DRAFT_PROBLEM_MESSAGES[problem]} /> : null}
      {blockedReason ? (
        <Text variant="caption" accessibilityLiveRegion="polite">
          {blockedReason}
        </Text>
      ) : null}
      <Button
        label="전송"
        accessibilityLabel="메시지 전송"
        accessibilityHint={blockedReason ?? undefined}
        disabled={!!blockedReason}
        onPress={submit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  composer: { gap: Spacing.two },
  chips: { gap: Spacing.two },
  chip: {
    minHeight: MinTouchSize,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.lg,
  },
  chipDisabled: { opacity: 0.5 },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.three - 4,
    fontFamily: Fonts.sans,
  },
});
