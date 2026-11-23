// CHAT-US-02 입력창: @ 발화자 전환, 여러 발화자 부분 구성, 5,000자 한도, 전송 가능 여부 안내
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Notice, Text } from '@/components/ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { DraftPartList } from '@/features/chat/components/room/DraftPartList';
import { type SpeakerOption, SpeakerPicker } from '@/features/chat/components/room/SpeakerPicker';
import {
  detectSpeakerTrigger,
  DRAFT_PROBLEM_MESSAGES,
  type DraftProblem,
  type DraftSpeaker,
  draftLength,
  emptyDraft,
  inputMaxLength,
  limitText,
  MESSAGE_MAX_LENGTH,
  type MessageDraft,
  removePart,
  switchSpeaker,
  textBudget,
  toMessageParts,
  validateDraft,
} from '@/features/chat/messageDraft';
import { useTheme } from '@/hooks/use-theme';
import type { ChatMessagePartInput } from '@/shared/story-types';

export function ChatComposer({
  draft,
  update,
  options,
  labelOf,
  blockedReason,
  onSend,
}: {
  draft: MessageDraft;
  update: (change: (draft: MessageDraft) => MessageDraft) => void;
  options: SpeakerOption[];
  labelOf: (speaker: DraftSpeaker) => string;
  /** 응답 생성 중 등 지금 보낼 수 없는 이유. 작성·수정은 계속 허용한다(AC06). */
  blockedReason: string | null;
  /** 접수 시작에 성공하면 true. 그때만 입력창을 비운다. */
  onSend: (parts: ChatMessagePartInput[]) => boolean;
}) {
  const colors = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [problem, setProblem] = useState<DraftProblem | null>(null);
  const speakerLabel = labelOf(draft.speaker);

  const changeText = (next: string) => {
    setProblem(null);
    // `@`를 입력하면 발화자 선택을 연다. 입력한 `@`는 본문에 남기지 않는다.
    if (detectSpeakerTrigger(draft.text, next) !== null) {
      setPickerOpen(true);
      return;
    }
    update((current) => ({ ...current, text: limitText(next, textBudget(current)) }));
  };

  const selectSpeaker = (speaker: DraftSpeaker) => {
    update((current) => switchSpeaker(current, speaker));
    setPickerOpen(false);
  };

  const submit = () => {
    const found = validateDraft(draft);
    if (found) {
      setProblem(found);
      return;
    }
    if (blockedReason) return;
    if (onSend(toMessageParts(draft))) {
      // 보낸 내용만 비우고 다음 발화자는 유저 캐릭터로 되돌린다(AC01·AC05).
      update(() => emptyDraft());
      setPickerOpen(false);
    }
  };

  return (
    <View style={styles.composer}>
      <DraftPartList
        parts={draft.parts}
        labelOf={labelOf}
        onRemove={(index) => update((current) => removePart(current, index))}
      />
      <View style={styles.row}>
        <Button
          label={`@ 발화자: ${speakerLabel}`}
          accessibilityLabel={`발화자 바꾸기, 현재 ${speakerLabel}`}
          accessibilityState={{ expanded: pickerOpen }}
          variant="secondary"
          onPress={() => setPickerOpen((open) => !open)}
        />
      </View>
      {pickerOpen ? <SpeakerPicker options={options} selected={draft.speaker} onSelect={selectSpeaker} /> : null}
      <TextInput
        accessibilityLabel="메시지 입력"
        accessibilityHint={`${speakerLabel}의 대사나 서술을 입력합니다. @를 입력하면 발화자를 바꿉니다.`}
        multiline
        textAlignVertical="top"
        value={draft.text}
        onChangeText={changeText}
        maxLength={inputMaxLength(draft)}
        placeholder={`${speakerLabel}(으)로 입력`}
        placeholderTextColor={colors.textSecondary}
        style={[
          styles.input,
          { color: colors.text, backgroundColor: colors.inputSurface, borderColor: colors.inputBorder },
        ]}
      />
      <Text variant="caption">
        {draftLength(draft).toLocaleString()} / {MESSAGE_MAX_LENGTH.toLocaleString()}자
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
  row: { flexDirection: 'row' },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.three - 4,
    fontFamily: Fonts.sans,
  },
});
