import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { MinTouchSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ChipGroupProps = {
  options: readonly string[];
  /** 선택된 값들. 단일 선택이면 길이 0 또는 1. */
  value: readonly string[];
  onChange: (next: string[]) => void;
  /** single: 하나만 선택 (시점·시제 등), multi: 여러 개 선택 (문체 등) */
  mode?: 'single' | 'multi';
  /** multi일 때 최대 선택 수. 넘으면 onLimitReached를 호출하고 선택은 바꾸지 않는다. */
  max?: number;
  onLimitReached?: () => void;
  accessibilityLabel?: string;
};

/** 목업 .chips 부품: 테두리 칩, 선택되면 초록 채움 */
export function ChipGroup({
  options,
  value,
  onChange,
  mode = 'single',
  max,
  onLimitReached,
  accessibilityLabel,
}: ChipGroupProps) {
  const c = useTheme();

  const toggle = (option: string) => {
    const selected = value.includes(option);

    if (mode === 'single') {
      onChange(selected ? [] : [option]);
      return;
    }

    if (selected) {
      onChange(value.filter((v) => v !== option));
      return;
    }

    if (max !== undefined && value.length >= max) {
      onLimitReached?.();
      return;
    }

    onChange([...value, option]);
  };

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={mode === 'single' ? 'radiogroup' : 'list'}
      style={styles.wrap}
    >
      {options.map((option) => {
        const selected = value.includes(option);

        return (
          <Pressable
            key={option}
            accessibilityRole={mode === 'single' ? 'radio' : 'checkbox'}
            accessibilityState={{ selected }}
            onPress={() => toggle(option)}
            style={({ pressed }) => [
              styles.chip,
              {
                borderColor: selected ? c.accent : c.chipBorder,
                backgroundColor: selected ? c.accent : c.surface,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text variant="caption" style={[styles.label, { color: selected ? c.onAccent : c.text }]}>
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    minHeight: MinTouchSize - 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
  label: { fontSize: 13, fontWeight: '500' },
});
