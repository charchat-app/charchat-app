import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Text } from '@/components/ui/Text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextAreaProps = TextInputProps & {
  /** 글자 수 한도. 공백·줄바꿈 포함 기준으로 센다 (CREATE-US-02 등). */
  maxLength?: number;
  /** 한도 표시를 숨기려면 false */
  showCount?: boolean;
  invalid?: boolean;
};

/** 여러 줄 입력창. 목업: 최소 높이 115px, 오른쪽 아래 글자 수 표시 */
export function TextArea({ value = '', maxLength, showCount = true, invalid = false, style, ...rest }: TextAreaProps) {
  const c = useTheme();
  const length = value.length;
  const over = maxLength !== undefined && length > maxLength;

  return (
    <View style={styles.wrap}>
      <TextInput
        multiline
        textAlignVertical="top"
        value={value}
        placeholderTextColor={c.textSecondary}
        style={[
          styles.input,
          {
            color: c.text,
            backgroundColor: c.inputSurface,
            borderColor: invalid || over ? c.danger : c.inputBorder,
          },
          style,
        ]}
        {...rest}
      />
      {showCount && maxLength !== undefined ? (
        <Text variant="caption" color={over ? 'danger' : 'textSecondary'} style={styles.count}>
          {length.toLocaleString()} / {maxLength.toLocaleString()}자
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.half },
  input: {
    minHeight: 115,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 22,
  },
  count: { textAlign: 'right' },
});
