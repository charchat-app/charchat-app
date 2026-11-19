import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Platform, StyleSheet, Text as NativeText, TextInput, View, type TextStyle } from 'react-native';
import { Button, Text } from '@/components/ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
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

export function BodyInput({
  value,
  onChange,
  label,
  inline = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  inline?: boolean;
  autoFocus?: boolean;
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
  // 입력·선택·IME는 TextInput이 처리하고, 같은 글꼴·폭의 원문 표시를 겹친다.
  // 색상 표시를 위해 원문을 HTML이나 contentEditable로 변환하지 않는다.
  const webCaret: TextStyle & { caretColor?: string } = Platform.OS === 'web' ? { caretColor: colors.text } : {};
  return (
    <View style={styles.body}>
      <View style={[styles.bubble, { backgroundColor: colors.inputSurface, borderColor: colors.inputBorder }]}>
        <View style={[styles.inputArea, !inline && styles.newInput]}>
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <NativeText
              testID={`${label} 원문 표시`}
              accessible={false}
              style={[styles.typography, { color: colors.text }]}
            >
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
            style={[styles.typography, styles.input, webCaret]}
          />
        </View>
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

/** 승인된 최소 서식만 표시한다. HTML이나 임의 마크다운은 해석하지 않는다. */
export function MessageBody({ body }: { body: string | null }) {
  const colors = useTheme();
  return (
    <View style={[styles.bubble, { backgroundColor: colors.inputSurface, borderColor: colors.inputBorder }]}>
      <NativeText style={[styles.typography, { color: body ? colors.text : colors.textSecondary }]}>
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
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
});
