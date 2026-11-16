import { StyleSheet, View, type ViewProps } from 'react-native';

import { Text } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';

export type FormFieldProps = ViewProps & {
  /** 입력 항목 이름. 필수 항목은 호출하는 쪽에서 "*"를 붙인다. */
  label: string;
  /** 입력 아래 보조 설명 */
  hint?: string;
  /** 오류 문구. 있으면 hint 대신 표시한다. */
  error?: string;
  children: React.ReactNode;
};

/** 라벨 + 입력 부품 + 보조/오류 문구를 묶는 래퍼. 입력 부품 자체는 바꾸지 않는다. */
export function FormField({ label, hint, error, children, style, ...rest }: FormFieldProps) {
  return (
    <View style={[styles.wrap, style]} {...rest}>
      <Text variant="subheading" style={styles.label}>
        {label}
      </Text>
      {children}
      {error ? (
        <Text variant="error" style={styles.feedback}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" style={styles.feedback}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: Spacing.three, gap: Spacing.half },
  label: { fontSize: 13, lineHeight: 18 },
  feedback: { marginTop: Spacing.half },
});
