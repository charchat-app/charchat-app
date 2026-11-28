// CHAT-US-08 대화방 헤더의 「상태 보기」 켜기·끄기 (KAN-40: OFF는 화면에서만 숨기고 서버는 계속 쓴다)
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function SceneCardToggle({ visible, onChange }: { visible: boolean; onChange: (visible: boolean) => void }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel="상태 보기"
      accessibilityState={{ checked: visible }}
      // 웹(react-native-web)은 accessibilityState.checked를 aria-checked로 옮기지 않아 직접 넣는다.
      aria-checked={visible}
      onPress={() => onChange(!visible)}
      hitSlop={4}
      style={styles.toggle}
    >
      <Text variant="caption">상태 보기</Text>
      <View
        style={[
          styles.pill,
          visible
            ? { backgroundColor: c.actionFill, borderColor: c.actionBorder }
            : { backgroundColor: c.inputSurface, borderColor: c.inputBorder },
        ]}
      >
        <Text variant="caption" color={visible ? 'actionText' : 'textSecondary'}>
          {visible ? 'ON' : 'OFF'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: { minHeight: MinTouchSize, flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  pill: { borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
});
