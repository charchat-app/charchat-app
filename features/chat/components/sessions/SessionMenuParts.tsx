// CHAT-US-09 여러 세션: ☰ 메뉴의 오른쪽 서랍·가운데 확인 팝업·체크박스 같은 표시 부품
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 오른쪽에서 나오는 서랍. 제목 줄 오른쪽에 닫기 버튼을 둔다. */
export function Drawer({
  title,
  closeLabel,
  onClose,
  wide = false,
  modal = true,
  footer,
  children,
}: {
  title: string;
  closeLabel: string;
  onClose?: () => void;
  wide?: boolean;
  /** 위에 확인 팝업을 띄울 때는 끈다. 화면 읽기 프로그램이 팝업만 읽게 한다. */
  modal?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const c = useTheme();
  return (
    <View
      accessibilityViewIsModal={modal}
      importantForAccessibility={modal ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.drawer,
        wide ? styles.wide : styles.narrow,
        { backgroundColor: c.backgroundElement, borderColor: c.border },
      ]}
    >
      <SafeAreaView edges={['top', 'bottom', 'right']} style={styles.fill}>
        <View style={[styles.head, { borderBottomColor: c.divider }]}>
          <Text variant="subheading" accessibilityRole="header" style={styles.fill}>
            {title}
          </Text>
          {onClose ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              onPress={onClose}
              hitSlop={4}
              style={styles.icon}
            >
              <Text variant="body" color="headerIcon">
                ✕
              </Text>
            </Pressable>
          ) : null}
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer ? <View style={[styles.footer, { borderTopColor: c.divider }]}>{footer}</View> : null}
      </SafeAreaView>
    </View>
  );
}

/** 가운데 확인 팝업 */
export function Dialog({ title, children }: { title: string; children: ReactNode }) {
  const c = useTheme();
  return (
    <View pointerEvents="box-none" style={styles.center}>
      <View
        accessibilityViewIsModal
        style={[styles.dialog, { backgroundColor: c.backgroundElement, borderColor: c.border }]}
      >
        <Text variant="subheading" accessibilityRole="header">
          {title}
        </Text>
        {children}
      </View>
    </View>
  );
}

/** 서랍 안의 큰 메뉴 줄(새로하기·이어하기) */
export function MenuItem({ label, description, onPress }: { label: string; description: string; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={description}
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        { backgroundColor: c.surface, borderColor: c.surfaceBorder },
        pressed && styles.pressed,
      ]}
    >
      <Text variant="subheading">{label}</Text>
      <Text variant="caption">{description}</Text>
    </Pressable>
  );
}

export function CheckBox({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      // 웹(react-native-web)은 accessibilityState.checked를 aria-checked로 옮기지 않아 직접 넣는다.
      aria-checked={checked}
      onPress={onToggle}
      style={styles.check}
    >
      <View
        style={[
          styles.box,
          { borderColor: checked ? c.accent : c.inputBorder, backgroundColor: checked ? c.accent : c.inputSurface },
        ]}
      >
        {checked ? (
          <Text variant="caption" color="onAccent">
            ✓
          </Text>
        ) : null}
      </View>
      <Text variant="body">{label}</Text>
    </Pressable>
  );
}

export const sessionStyles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1, flexBasis: 0, minWidth: 0 },
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  drawer: { position: 'absolute', top: 0, bottom: 0, right: 0, borderLeftWidth: 1 },
  narrow: { width: '78%', maxWidth: 320 },
  wide: { width: '92%', maxWidth: 480 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
  },
  icon: { minWidth: MinTouchSize, minHeight: MinTouchSize, alignItems: 'center', justifyContent: 'center' },
  body: { padding: Spacing.four, gap: Spacing.three },
  footer: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.three, borderTopWidth: 1, gap: Spacing.two },
  center: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  item: {
    minHeight: MinTouchSize,
    borderWidth: 1,
    borderRadius: Radius.item,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  pressed: { opacity: 0.85 },
  check: { minHeight: MinTouchSize, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  box: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderRadius: Radius.sm / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
