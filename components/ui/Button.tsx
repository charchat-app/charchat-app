import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { CreationIcon, type CreationIconName } from '@/components/ui/CreationIcon';
import { Text } from '@/components/ui/Text';
import { MinTouchSize, Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonVariant = 'primary' | 'action' | 'secondary' | 'danger';

export type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  /**
   * 목업 v15 다크 버튼 위계.
   * - primary: 본문 주 행동 (.primary, 선명한 파랑 채움)
   * - action: 하단 고정 줄의 저장 (.bottom .primary, 차분한 파랑 채움 + 테두리)
   * - secondary: 보조 (.secondary, 어두운 면 + 파랑 테두리)
   * - danger: 삭제 등 위험 행동 (.secondary.danger)
   */
  variant?: ButtonVariant;
  /** 가로로 꽉 채움 (하단 고정 버튼용) */
  fullWidth?: boolean;
  /** 글자 뒤에 붙는 장식 아이콘(목업 svg). 접근성 이름은 label 그대로다. */
  icon?: CreationIconName;
};

/** 버튼 글자 옆 아이콘 크기(본문 글자 높이에 맞춘다) */
const ICON_SIZE = 16;

const VARIANT: Record<ButtonVariant, { fill: ThemeColor; border: ThemeColor; label: ThemeColor }> = {
  primary: { fill: 'accent', border: 'accent', label: 'onAccent' },
  action: { fill: 'actionFill', border: 'actionBorder', label: 'actionText' },
  secondary: { fill: 'secondarySurface', border: 'secondaryBorder', label: 'secondaryText' },
  danger: { fill: 'dangerSurface', border: 'dangerBorder', label: 'dangerText' },
};

export function Button({ label, variant = 'primary', fullWidth = false, icon, disabled, style, ...rest }: ButtonProps) {
  const c = useTheme();
  const tone = VARIANT[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      style={(state) => [
        styles.base,
        { backgroundColor: c[tone.fill], borderColor: c[tone.border] },
        variant === 'action' && styles.action,
        fullWidth && styles.fullWidth,
        state.pressed && styles.pressed,
        disabled && styles.disabled,
        !!icon && styles.withIcon,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    >
      <Text variant="body" style={[styles.label, { color: c[tone.label] }]}>
        {label}
      </Text>
      {icon ? <CreationIcon testID={`button-icon-${icon}`} name={icon} size={ICON_SIZE} color={c[tone.label]} /> : null}
    </Pressable>
  );
}

// 크기·여백은 이전과 같다(대화 화면 등 다른 화면의 배치를 바꾸지 않는다). 색과 위계만 다크 목업을 따른다.
const styles = StyleSheet.create({
  base: {
    minHeight: MinTouchSize,
    borderRadius: Radius.control,
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: Spacing.four - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 하단 저장 줄 버튼(.bottom .primary): 높이 46·라운드 11
  action: { minHeight: 46, borderRadius: 11 },
  fullWidth: { alignSelf: 'stretch' },
  withIcon: { flexDirection: 'row', gap: Spacing.one },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  label: { fontWeight: '600' },
});
