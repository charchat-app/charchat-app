import { useEffect, useImperativeHandle, useRef, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';
import { Button, Text } from '@/components/ui';
import { Fonts, MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { insertAtSelection } from '@/shared/story-types';

/** 원문 길이와 공백을 바꾸지 않고 치환 표기만 구분한다. */
function RawTokens({ text }: { text: string }) {
  const colors = useTheme();
  return text.split(/(\{\{user\}\})/g).map((part, index) => (
    <NativeText key={index} style={part === '{{user}}' ? { color: colors.userToken } : undefined}>
      {part}
    </NativeText>
  ));
}

/** 목업 v15 .compose-input / .new-message-tools 치수. 토큰에 없는 값만 둔다. */
const Composer = { inputMinHeight: 52, inputMaxHeight: 104, radius: 12, toolRadius: 10 } as const;
/** 목업 v15 .chat-body 치수 */
const Chat = { radius: 16, lineHeight: 25, padY: 13, padX: 15 } as const;
/** 목업 v15 .bubble-source: 최소 폭 130, 최소 높이 52 */
const BubbleEdit = { minWidth: 130, minHeight: 52 } as const;

/** 입력칸 밖(하단 고정 수정 도구)에서 현재 커서 위치에 원문 표기를 넣을 때 쓴다. */
export type BodyInputHandle = { insert: (token: string) => void };
/** 목업 대화형 말풍선 모양. MessageBody tone 중 대화형 세 가지와 같다. */
export type ChatTone = 'narrator' | 'user' | 'character';

export function BodyInput({
  value,
  onChange,
  label,
  inline = false,
  autoFocus = false,
  variant = 'bubble',
  tone = 'character',
  handle,
  placeholder,
  accessory,
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  inline?: boolean;
  autoFocus?: boolean;
  /**
   * CREATE-US-12 목업 renderExample .composer: 'composer'는 입력칸 안 오른쪽에 accessory(보내기 버튼)를 두고,
   * 아래 줄에 {{user}}·* 삽입과 hint를 놓는다. 입력·삽입 동작은 'bubble'과 같다.
   */
  /**
   * 'bubble-edit'는 목업 inlineMessageEditor(.bubble-source)처럼 말풍선 자리에서 같은 모양으로 원문을 고친다.
   * 삽입 도구는 그리지 않고 handle로 내보내 호스트의 하단 수정 도구(bubbleEditToolbar)가 쓴다.
   */
  variant?: 'bubble' | 'composer' | 'bubble-edit';
  /** 'bubble-edit' 모양: 유저는 오른쪽 파란 말풍선, 캐릭터는 왼쪽 말풍선, 나레이터는 점선 테두리 기울임 */
  tone?: ChatTone;
  handle?: Ref<BodyInputHandle>;
  placeholder?: string;
  accessory?: ReactNode;
  hint?: string;
}) {
  const colors = useTheme();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const selection = useRef({ start: value.length, end: value.length });
  const [forcedSelection, setForcedSelection] = useState<{ start: number; end: number }>();
  const focusFrame = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    },
    [],
  );
  const insert = (token: string) => {
    const result = insertAtSelection(value, selection.current, token);
    selection.current = result.selection;
    onChange(result.text);
    setForcedSelection(result.selection);
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => input.current?.focus());
  };
  useImperativeHandle(handle, () => ({ insert }));
  // 입력·선택·IME는 TextInput이 처리하고, 같은 글꼴·폭의 원문 표시를 겹친다.
  // 색상 표시를 위해 원문을 HTML이나 contentEditable로 변환하지 않는다.
  const webCaret: TextStyle & { caretColor?: string } = Platform.OS === 'web' ? { caretColor: colors.text } : {};
  const composer = variant === 'composer';
  const bubbleEdit = variant === 'bubble-edit';
  // 말풍선 제자리 수정은 읽기 말풍선과 같은 줄 높이·기울임을 써서 원문 표시와 입력 위치가 어긋나지 않게 한다.
  const typography = [
    styles.typography,
    bubbleEdit && styles.chatTypography,
    bubbleEdit && tone === 'narrator' && styles.italic,
  ];
  const field = (
    <View
      style={[
        styles.inputArea,
        composer ? styles.composerInput : bubbleEdit ? styles.bubbleEditInput : !inline && styles.newInput,
      ]}
    >
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <NativeText testID={`${label} 원문 표시`} accessible={false} style={[typography, { color: colors.text }]}>
          <RawTokens text={value} />
          {'\u200b'}
        </NativeText>
      </View>
      <TextInput
        ref={input}
        accessibilityLabel={label}
        autoFocus={autoFocus}
        multiline
        scrollEnabled={false}
        textAlignVertical="top"
        underlineColorAndroid="transparent"
        selectionColor={colors.accent}
        cursorColor={colors.text}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholderText}
        value={value}
        selection={forcedSelection}
        onSelectionChange={(event) => {
          const next = event.nativeEvent.selection;
          selection.current = next;
          // 삽입 위치가 적용됐으면 제어를 돌려줘 이후 커서 이동을 붙잡지 않는다.
          setForcedSelection((current) =>
            current?.start === next.start && current.end === next.end ? undefined : current,
          );
        }}
        onChangeText={(text) => {
          // 일반 입력의 선택 위치는 플랫폼에 맡겨 IME 중간 위치를 추측하지 않는다.
          setForcedSelection(undefined);
          onChange(text);
        }}
        style={[typography, styles.input, webCaret]}
      />
    </View>
  );
  if (bubbleEdit) {
    // 목업 .bubble-source: 읽기 말풍선과 같은 바탕·말꼬리 모서리에 얇은 강조 테두리, 나레이터는 점선 테두리만 둔다.
    const shape = {
      user: [
        styles.chatBubble,
        styles.userBubble,
        { backgroundColor: colors.actionFill, borderColor: colors.accentText },
      ],
      character: [
        styles.chatBubble,
        styles.characterBubble,
        { backgroundColor: colors.surface, borderColor: colors.eyebrow },
      ],
      narrator: [styles.narratorBody, styles.narratorEdit, { borderColor: colors.eyebrow }],
    }[tone];
    return (
      <View testID={`bubble-edit-${tone}`} style={[styles.bubbleEdit, shape]}>
        {field}
      </View>
    );
  }
  if (composer) {
    // 목업 .compose-input(입력 + 보내기) · .new-message-tools(삽입) · small(도움말). 긴 원문은 입력칸 안에서만 스크롤한다.
    const tool = [styles.composeTool, { backgroundColor: colors.actionFill, borderColor: colors.actionBorder }];
    return (
      <View testID="composer-body-input" style={styles.composerBody}>
        <View style={[styles.composeBox, { backgroundColor: colors.inputSurface, borderColor: colors.actionBorder }]}>
          <ScrollView
            style={styles.composeScroll}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {field}
          </ScrollView>
          {accessory}
        </View>
        <View style={styles.composeFooter}>
          <View style={styles.composeTools}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="{{user}} 삽입"
              onPress={() => insert('{{user}}')}
              style={tool}
            >
              <NativeText style={[styles.toolText, { color: colors.userToken }]}>{'{{user}}'}</NativeText>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="* 삽입" onPress={() => insert('*')} style={tool}>
              <NativeText style={[styles.starText, { color: colors.badgeText }]}>*</NativeText>
            </Pressable>
          </View>
          {hint ? (
            <Text variant="caption" style={styles.composeHint}>
              {hint}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.body}>
      <View style={[styles.bubble, { backgroundColor: colors.inputSurface, borderColor: colors.inputBorder }]}>
        {field}
      </View>
      <View style={styles.tools}>
        <Button label="{{user}} 삽입" variant="secondary" onPress={() => insert('{{user}}')} />
        <Button label="* 삽입" variant="secondary" onPress={() => insert('*')} />
      </View>
      {!inline ? (
        <Text variant="caption">원문 표기를 그대로 저장합니다. 삽입 버튼은 말풍선을 추가하지 않습니다.</Text>
      ) : null}
    </View>
  );
}

export type FormattedSegment = { text: string; bold: boolean; italic: boolean };

const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char);

/** 여는 기호 바로 뒤가 공백이 아니어야 서식으로 본다. `3 * 4 * 5` 같은 일반 별표를 보호한다. */
function findClose(text: string, from: number, marker: '*' | '**'): number {
  for (let j = from + 1; j < text.length; j += 1) {
    if (marker === '*' && text.startsWith('**', j)) {
      // 기울임 안의 굵게는 통째로 건너뛰어 그 안의 별표를 닫는 기호로 오인하지 않는다.
      const inner = isSpace(text[j + 2]) ? -1 : findClose(text, j + 2, '**');
      j = inner >= 0 ? inner + 1 : j + 1;
      continue;
    }
    if (text.startsWith(marker, j) && !isSpace(text[j - 1])) {
      // `**굵게 *기울임***`: 닫는 별표 세 개 중 첫 번째는 안쪽 기울임을 닫고 뒤의 두 개가 굵게를 닫는다.
      if (marker === '**' && text[j + 2] === '*' && hasOpenItalic(text.slice(from, j))) return j + 1;
      return j;
    }
  }
  return -1;
}

/** 굵게 기호(`**`)를 뺀 단일 별표가 홀수 개면 닫히지 않은 기울임이 있다. */
function hasOpenItalic(segment: string): boolean {
  return (segment.replaceAll('**', '').match(/\*/g)?.length ?? 0) % 2 === 1;
}

/** `**굵게**`·`*기울임*`과 한 단계 겹침만 해석한다. 짝이 없는 기호는 원문 그대로 둔다. */
export function parseFormatted(text: string, bold = false, italic = false): FormattedSegment[] {
  const out: FormattedSegment[] = [];
  let plain = '';
  const flush = () => {
    if (plain) out.push({ text: plain, bold, italic });
    plain = '';
  };
  let i = 0;
  while (i < text.length) {
    const double = text.startsWith('**', i);
    if (double && !bold && !isSpace(text[i + 2])) {
      const end = findClose(text, i + 2, '**');
      if (end >= 0) {
        flush();
        out.push(...parseFormatted(text.slice(i + 2, end), true, italic));
        i = end + 2;
        continue;
      }
    }
    if (!double && text[i] === '*' && !italic && !isSpace(text[i + 1])) {
      const end = findClose(text, i + 1, '*');
      if (end >= 0) {
        flush();
        out.push(...parseFormatted(text.slice(i + 1, end), bold, true));
        i = end + 1;
        continue;
      }
    }
    plain += text[i];
    i += 1;
  }
  flush();
  return out;
}

export type MessageTone = 'plain' | 'narrator' | 'user' | 'character';

/**
 * 승인된 최소 서식만 표시한다. HTML이나 임의 마크다운은 해석하지 않는다.
 * tone은 CREATE-US-12 목업 대화형 표시(.chat-body)를 고른다. 기본 'plain'은 기존 입력면 상자다.
 * narrator: 상자 없이 기울임·보조색 / user: 파란 말풍선 / character: 회청색 말풍선
 */
export function MessageBody({ body, tone = 'plain' }: { body: string | null; tone?: MessageTone }) {
  const colors = useTheme();
  const tint = (backgroundColor: string, borderColor: string) => ({ backgroundColor, borderColor });
  const box = {
    plain: [styles.bubble, tint(colors.inputSurface, colors.inputBorder)],
    narrator: [styles.narratorBody],
    user: [styles.chatBubble, styles.userBubble, tint(colors.actionFill, colors.actionBorder)],
    character: [styles.chatBubble, styles.characterBubble, tint(colors.surface, colors.surfaceBorder)],
  }[tone];
  const narrator = tone === 'narrator';
  return (
    <View testID={`message-body-${tone}`} style={box}>
      <NativeText
        style={[
          styles.typography,
          tone !== 'plain' && styles.chatTypography,
          narrator && styles.italic,
          { color: body && !narrator ? colors.text : colors.textSecondary },
        ]}
      >
        {body
          ? parseFormatted(body).map((part, index) =>
              part.bold || part.italic ? (
                <NativeText key={index} style={[part.bold && styles.bold, part.italic && styles.italic]}>
                  <RawTokens text={part.text} />
                </NativeText>
              ) : (
                <RawTokens key={index} text={part.text} />
              ),
            )
          : '내용 없음 — 눌러서 수정'}
      </NativeText>
    </View>
  );
}
const styles = StyleSheet.create({
  body: { gap: Spacing.two },
  bubble: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.two },
  inputArea: { minHeight: 22 },
  newInput: { minHeight: 88 },
  typography: { fontFamily: Fonts.sans, fontSize: 15, lineHeight: 22, fontWeight: '400', includeFontPadding: false },
  input: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    color: 'transparent',
    overflow: 'hidden',
  },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  // 목업 .compose-input: padding 10px 12px, 1px 파란 테두리, radius 12, 보내기 버튼과 gap 10
  composerBody: { gap: Spacing.one },
  composeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three - Spacing.one,
    borderWidth: 1,
    borderRadius: Composer.radius,
  },
  composeScroll: { flex: 1, minWidth: 0, maxHeight: Composer.inputMaxHeight },
  composerInput: { minHeight: Composer.inputMinHeight },
  // 목업 .new-message-tools(왼쪽) + small(오른쪽)
  composeFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  composeTools: { flexDirection: 'row', gap: Spacing.one + 2 },
  composeTool: {
    minWidth: MinTouchSize,
    height: MinTouchSize,
    paddingHorizontal: Spacing.two + 2,
    borderWidth: 1,
    borderRadius: Composer.toolRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolText: { fontFamily: Fonts.sans, fontSize: 14 },
  starText: { fontFamily: Fonts.sans, fontSize: 20, lineHeight: 24 },
  composeHint: { flexShrink: 1, textAlign: 'right', fontSize: 11 },
  // 목업 .chat-body: padding 13px 15px, radius 16(말꼬리 쪽 0), 15px/1.7
  chatBubble: { borderWidth: 1, borderRadius: Chat.radius, paddingVertical: Chat.padY, paddingHorizontal: Chat.padX },
  userBubble: { borderTopRightRadius: 0 },
  characterBubble: { borderTopLeftRadius: 0 },
  // 목업 .narrator .chat-body: 상자 없이 padding 6px 12px
  narratorBody: { paddingVertical: Spacing.one + 2, paddingHorizontal: Spacing.three - Spacing.one },
  // 목업 .bubble-source: min-width 130, 입력 최소 높이 52(패딩 포함)
  bubbleEdit: { minWidth: BubbleEdit.minWidth },
  bubbleEditInput: { minHeight: BubbleEdit.minHeight - Chat.padY * 2 },
  // 목업 .narrator .bubble-source: 바탕 없이 1px 점선
  narratorEdit: { borderWidth: 1, borderStyle: 'dashed' },
  chatTypography: { lineHeight: Chat.lineHeight },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
});
