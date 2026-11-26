import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CreationIcon, Text } from '@/components/ui';
import { Fonts, MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 목업 치수(.unified-theme select: 최소 높이 44, 글자 14, 안쪽 11px 12px). 토큰에 없는 값만 둔다. */
const Dim = { fontSize: 14, paddingVertical: 11, chevron: 16, menuMaxHeight: 240 } as const;

/**
 * 고를 수 있는 값 하나. key는 화면 이름표와 무관한 고정값(인트로 clientKey, 인물 키 등)이라
 * 이름이 겹치거나 바뀌어도 선택이 흔들리지 않는다.
 */
export type SceneDropdownOption<K extends string> = {
  key: K;
  label: string;
  /** 고를 수 없는 값(목업 option:disabled). 목록에는 보이지만 누를 수 없다. */
  disabled?: boolean;
  /** 고를 수 없는 이유 등 보조 글자(목업 「· 반대쪽에서 선택됨」). */
  note?: string;
};

/**
 * CREATE-US-12 목업 v15 초기 상태 탭의 select. 접힌 상태에서는 고른 값 하나만 보이고,
 * 누르면 그 자리 아래에 목록이 펼쳐진다(목록은 스크롤 막대를 숨긴다). 새 라이브러리 없이 만든다.
 * - 접근성: 접힌 칸은 combobox(이름 = label, 값 = 고른 이름표, expanded 상태), 목록은 menu/menuitem.
 * - value가 options에 없으면(예: 삭제된 인물) 고른 값으로 보이지 않고 placeholder를 보여 준다.
 */
export function SceneDropdown<K extends string>({
  label,
  options,
  value,
  onChange,
  placeholder = '선택해 주세요',
  disabled = false,
}: {
  /** 접근성 이름. 화면의 라벨 글자는 호출하는 쪽이 FieldLabel 등으로 둔다. */
  label: string;
  options: readonly SceneDropdownOption<K>[];
  value: K | null;
  onChange: (key: K) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const c = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.key === value) ?? null;
  const expanded = open && !disabled;
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="combobox"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected?.label ?? placeholder }}
        accessibilityState={{ expanded, disabled }}
        disabled={disabled}
        onPress={() => setOpen((current) => !current)}
        style={[
          styles.control,
          {
            backgroundColor: c.inputSurface,
            borderColor: expanded ? c.actionBorder : c.inputBorder,
          },
          disabled && styles.disabled,
        ]}
      >
        <Text numberOfLines={1} style={[styles.value, { color: selected ? c.text : c.placeholderText }]}>
          {selected?.label ?? placeholder}
        </Text>
        <View style={[styles.chevron, { transform: [{ rotate: expanded ? '90deg' : '-90deg' }] }]}>
          <CreationIcon name="back" size={Dim.chevron} color={c.headerIcon} />
        </View>
      </Pressable>
      {expanded ? (
        <View
          accessibilityRole="menu"
          accessibilityLabel={`${label} 목록`}
          style={[styles.menu, { backgroundColor: c.inputSurface, borderColor: c.inputBorder }]}
        >
          <ScrollView
            testID="scene-dropdown-menu"
            style={styles.scroll}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          >
            {options.map((option) => {
              const chosen = option.key === value;
              const blocked = !!option.disabled;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="menuitem"
                  accessibilityLabel={option.label}
                  accessibilityHint={option.note}
                  accessibilityState={{ selected: chosen, disabled: blocked }}
                  disabled={blocked}
                  onPress={() => {
                    setOpen(false);
                    if (!chosen) onChange(option.key);
                  }}
                  style={[styles.option, chosen && { backgroundColor: c.actionFill }]}
                >
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.optionLabel,
                      { color: blocked ? c.placeholderText : chosen ? c.selectedText : c.text },
                      blocked && styles.blocked,
                    ]}
                  >
                    {option.label}
                    {option.note ? ` · ${option.note}` : ''}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  control: {
    minHeight: MinTouchSize,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingVertical: Dim.paddingVertical,
    paddingHorizontal: Spacing.two + Spacing.one,
  },
  value: { flex: 1, minWidth: 0, fontFamily: Fonts.sans, fontSize: Dim.fontSize },
  chevron: { alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  menu: { borderWidth: 1, borderRadius: Radius.control, overflow: 'hidden' },
  scroll: { maxHeight: Dim.menuMaxHeight },
  option: {
    minHeight: MinTouchSize,
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two + Spacing.one,
  },
  optionLabel: { fontFamily: Fonts.sans, fontSize: Dim.fontSize },
  blocked: { opacity: 0.7 },
});
