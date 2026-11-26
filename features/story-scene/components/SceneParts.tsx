// CREATE-US-12 제작 작업 화면(말투·서술·인트로·초기 상태·공개 범위)의 목업 v15 구역 부품.
// 도메인 동작이 있는 칸(라디오·삭제 등)이라 components/ui가 아니라 story-scene 안에 둔다.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import { CreationIcon, Text, type CreationIconName } from '@/components/ui';
import { Fonts, MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 목업 v15 .item-header svg 21px (기본 설정 화면의 아이콘 버튼과 같다) */
const ICON_SIZE = 21;

/** 목업 치수(.speech-options·.style-picks·.optional-tag 등). 토큰에 없는 값만 이 파일 안에 둔다. */
const Dim = {
  optionsPadding: 3,
  optionHeight: 38,
  optionWithSubHeight: 51,
  optionRadius: 7,
  pickHeight: 39,
  tagRadius: 4,
  eyebrowTracking: 0.4,
} as const;

/** 목업 .speech-section-heading: 왼쪽 제목(+선택 표시), 오른쪽 작은 보조 글자 */
export function SectionHeading({
  title,
  caption,
  optional = false,
  level = 'heading',
  testID,
}: {
  title: string;
  caption?: string;
  optional?: boolean;
  level?: 'heading' | 'subheading';
  testID?: string;
}) {
  const c = useTheme();
  return (
    <View testID={testID} style={styles.heading}>
      <View style={styles.headingTitle}>
        <Text variant="subheading" accessibilityRole="header" style={level === 'heading' && styles.strong}>
          {title}
        </Text>
        {optional ? (
          <View style={[styles.tag, { backgroundColor: c.chipSurface }]}>
            <Text variant="caption">선택</Text>
          </View>
        ) : null}
      </View>
      {caption ? (
        <Text variant="caption" accessibilityLiveRegion="polite">
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/** 목업 .state-eyebrow: 카드 묶음 위 작은 분류 글자(산세리프 10~11px, 굵게, 좁은 자간) */
export function Eyebrow({ children }: { children: string }) {
  return (
    <Text variant="eyebrow" color="textSecondary" style={styles.eyebrow}>
      {children}
    </Text>
  );
}

/** 목업 .state-card label: 입력 위 14px 굵은 라벨(선택 칩처럼 FormField를 쓰지 않는 칸에 쓴다) */
export function FieldLabel({ children, first = false }: { children: string; first?: boolean }) {
  return (
    <Text variant="caption" color="text" style={[styles.fieldLabel, first && styles.firstLabel]}>
      {children}
    </Text>
  );
}

/** 목업 .hint / .relation-help: 카드나 구역 끝의 짧은 보조 문구 */
export function Hint({ children }: { children: string }) {
  return (
    <Text variant="caption" style={styles.hint}>
      {children}
    </Text>
  );
}

export type SegmentOption<T extends string> = { value: T; label: string; sub?: string };

/**
 * 목업 .speech-options: 한 줄 분할 선택(필수 단일 선택). 다시 눌러도 해제되지 않는다.
 * 접근성 이름은 label만 쓴다(보조 분량 글자는 hint로 읽는다).
 */
export function SegmentedChoice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const c = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.options, { backgroundColor: c.inputSurface, borderColor: c.inputBorder }]}
    >
      {options.map((option) => {
        const chosen = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityHint={option.sub}
            accessibilityState={{ checked: chosen }}
            aria-checked={chosen}
            onPress={() => {
              if (!chosen) onChange(option.value);
            }}
            style={[
              styles.option,
              option.sub ? styles.optionTall : null,
              chosen && { backgroundColor: c.actionFill, borderColor: c.actionBorder },
            ]}
          >
            <Text
              variant="caption"
              numberOfLines={1}
              style={[styles.optionLabel, { color: chosen ? c.selectedText : c.chipText }]}
            >
              {option.label}
            </Text>
            {option.sub ? (
              <Text variant="caption" numberOfLines={1} style={styles.optionSub}>
                {option.sub}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** 목업 .style-picks: 4열 다중 선택 칩. ✓ / + 표시 */
export function StylePicks({
  label,
  options,
  value,
  onToggle,
}: {
  label: string;
  options: readonly string[];
  value: readonly string[];
  onToggle: (option: string) => void;
}) {
  const c = useTheme();
  return (
    <View accessibilityRole="list" accessibilityLabel={label} style={styles.picks}>
      {options.map((option) => {
        const selected = value.includes(option);
        return (
          <Pressable
            key={option}
            accessibilityRole="checkbox"
            accessibilityLabel={option}
            accessibilityState={{ checked: selected }}
            aria-checked={selected}
            onPress={() => onToggle(option)}
            style={[
              styles.pick,
              {
                backgroundColor: selected ? c.actionFill : c.chipSurface,
                borderColor: selected ? c.actionBorder : c.chipBorder,
              },
            ]}
          >
            <Text
              variant="caption"
              numberOfLines={1}
              style={[styles.pickLabel, { color: selected ? c.selectedText : c.chipText }]}
            >
              {selected ? '✓ ' : '+ '}
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * 목업 button('trash'|'edit'): 44px 정사각 아이콘 버튼. 목업 svg를 옮긴 CreationIcon을 쓴다(이모지·글리프를 쓰지 않는다).
 * 아이콘은 장식이고 이름은 accessibilityLabel로 준다.
 */
export function IconButton({
  icon,
  label,
  tone = 'default',
  disabled,
  onPress,
}: {
  icon: Extract<CreationIconName, 'edit' | 'trash'>;
  label: string;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  onPress: PressableProps['onPress'];
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.icon, disabled && styles.disabled]}
    >
      <CreationIcon
        testID={`icon-${icon}`}
        name={icon}
        size={ICON_SIZE}
        color={tone === 'danger' ? c.dangerText : c.headerIcon}
      />
    </Pressable>
  );
}

/** 목업 .item-header: 왼쪽 이름, 오른쪽 동작(삭제 등) */
export function ItemHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <View style={styles.itemHeader}>
      <View style={styles.itemTitle}>{typeof title === 'string' ? <Text>{title}</Text> : title}</View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  headingTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flexShrink: 1 },
  strong: { fontWeight: '700' },
  tag: { borderRadius: Dim.tagRadius, paddingHorizontal: Spacing.one + 1, paddingVertical: Spacing.half },
  // .state-eyebrow: margin 22px 0 5px, letter-spacing .04em, 600
  eyebrow: {
    fontFamily: Fonts.sans,
    fontWeight: '600',
    letterSpacing: Dim.eyebrowTracking,
    marginTop: Spacing.three,
    marginBottom: Spacing.half,
  },
  fieldLabel: { fontSize: 14, fontWeight: '600', marginTop: Spacing.three },
  firstLabel: { marginTop: 0 },
  hint: { fontSize: 12, lineHeight: 20 },
  options: {
    flexDirection: 'row',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radius.control,
    padding: Dim.optionsPadding,
  },
  option: {
    flex: 1,
    minWidth: 0,
    minHeight: Dim.optionHeight,
    borderRadius: Dim.optionRadius,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  optionTall: { minHeight: Dim.optionWithSubHeight },
  optionLabel: { fontWeight: '600' },
  optionSub: { marginTop: Spacing.half },
  picks: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one + 1 },
  pick: {
    // 목업 4열(repeat(4, 1fr)). 간격을 빼고 네 칸이 한 줄에 들어가게 한다.
    flexBasis: '23%',
    flexGrow: 1,
    minWidth: 0,
    minHeight: Dim.pickHeight,
    borderWidth: 1,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.half,
  },
  pickLabel: { fontWeight: '500' },
  icon: { minWidth: MinTouchSize, minHeight: MinTouchSize, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  itemTitle: { flex: 1, minWidth: 0 },
});
