import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { Fonts, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextFieldProps = TextInputProps & {
  /** 오류 상태면 테두리를 위험 색으로 바꾼다 */
  invalid?: boolean;
};

/** 한 줄 입력창. 목업: 테두리 1px, 둥근 9px, 최소 높이 46px */
export function TextField({ invalid = false, style, placeholderTextColor, ...rest }: TextFieldProps) {
  const c = useTheme();

  return (
    <TextInput
      placeholderTextColor={placeholderTextColor ?? c.textSecondary}
      style={[
        styles.input,
        {
          color: c.text,
          backgroundColor: c.inputSurface,
          borderColor: invalid ? c.danger : c.inputBorder,
        },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: Fonts.sans,
    fontSize: 15,
  },
});
