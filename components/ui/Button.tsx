import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { Text } from '@/components/ui/Text';
import { MinTouchSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  /** primary: 주 행동(초록 채움), secondary: 보조(테두리), danger: 삭제 등 위험 행동 */
  variant?: 'primary' | 'secondary' | 'danger';
  /** 가로로 꽉 채움 (하단 고정 버튼용) */
  fullWidth?: boolean;
};

export function Button({ label, variant = 'primary', fullWidth = false, disabled, style, ...rest }: ButtonProps) {
  const c = useTheme();
  const isPrimary = variant === 'primary';
  const labelColor = isPrimary ? c.onAccent : variant === 'danger' ? c.danger : c.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      style={(state) => [
        styles.base,
        isPrimary
          ? { backgroundColor: c.accent, borderColor: c.accent }
          : { backgroundColor: c.surface, borderColor: variant === 'danger' ? c.danger : c.chipBorder },
        fullWidth && styles.fullWidth,
        state.pressed && styles.pressed,
        disabled && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    >
      <Text variant="body" style={[styles.label, { color: labelColor }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MinTouchSize,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: Spacing.four - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  label: { fontWeight: '600' },
});
