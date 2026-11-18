import { Animated, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui';
import { MinTouchSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { DragList } from './useDragList';

export type DraggableItemProps = {
  itemKey: string;
  index: number;
  keys: string[];
  /** useDragList로 만든 목록 상태. 같은 목록의 항목들이 함께 쓴다. */
  drag: DragList;
  label: string;
  disabled: boolean;
  /** ↑·↓ 버튼과 접근성 동작으로 옮길 때 */
  onMove: (fromKey: string, toKey: string) => void;
  /** 손잡이 옆(오른쪽)에 둘 버튼 등 */
  actions?: React.ReactNode;
  /** 항목 카드 모양(테두리·배경 등) */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/**
 * 카드 머리를 길게 누른 뒤 끌어서 순서를 바꾸는 항목 (CREATE-US-01-AC14).
 * - 본문(입력창)을 누르거나 바로 끌어 스크롤할 때는 드래그가 시작되지 않는다.
 * - 끄는 동안 카드가 살짝 떠 보이고, 다른 카드들이 비켜난다(useDragList).
 * - 드래그가 어려운 환경을 위해 ↑·↓ 버튼과 접근성 동작(위로/아래로)도 함께 둔다.
 * TODO(공용화): 이휘 PR의 story-scene ReorderList와 같은 역할이다. 둘 다 머지되면 components/ui로 합친다.
 */
export function DraggableItem({
  itemKey,
  index,
  keys,
  drag,
  label,
  disabled,
  onMove,
  actions,
  style,
  children,
}: DraggableItemProps) {
  const c = useTheme();
  const lifted = drag.draggingKey === itemKey;
  const prev = keys[index - 1];
  const next = keys[index + 1];

  return (
    <Animated.View
      testID={`drag-item-${itemKey}`}
      onLayout={(e) => drag.setHeight(itemKey, e.nativeEvent.layout.height)}
      style={[
        styles.wrap,
        style,
        { transform: [{ translateY: drag.offsetOf(itemKey) }, { scale: lifted ? 1.02 : 1 }] },
        lifted && [styles.lifted, { borderColor: c.accent }],
      ]}
    >
      <View style={styles.header} {...drag.responderOf(itemKey).panHandlers}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${label} 순서 변경(길게 눌러 끌기)`}
          accessibilityActions={[
            { name: 'decrement', label: '위로 이동' },
            { name: 'increment', label: '아래로 이동' },
          ]}
          onAccessibilityAction={(e) => {
            const target = e.nativeEvent.actionName === 'decrement' ? prev : next;
            if (!disabled && target) onMove(itemKey, target);
          }}
          style={styles.handle}
        >
          <Text variant="subheading" color={lifted ? 'accent' : 'text'}>
            {label}
          </Text>
        </View>
        <ArrowButton
          label={`${label} 위로 이동`}
          glyph="↑"
          disabled={disabled || !prev}
          onPress={() => prev && onMove(itemKey, prev)}
          color={c.text}
        />
        <ArrowButton
          label={`${label} 아래로 이동`}
          glyph="↓"
          disabled={disabled || !next}
          onPress={() => next && onMove(itemKey, next)}
          color={c.text}
        />
        {actions}
      </View>
      {children}
    </Animated.View>
  );
}

function ArrowButton({
  label,
  glyph,
  disabled,
  onPress,
  color,
}: {
  label: string;
  glyph: string;
  disabled: boolean;
  onPress: () => void;
  color: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={[styles.arrow, disabled && styles.arrowDisabled]}
    >
      <Text variant="body" style={{ color }}>
        {glyph}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  // 들고 있는 카드는 다른 카드 위에 떠 보이게 한다(웹 zIndex, 안드로이드 elevation, iOS 그림자)
  lifted: {
    zIndex: 10,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  handle: { flex: 1, minHeight: MinTouchSize, justifyContent: 'center' },
  arrow: { minWidth: MinTouchSize, minHeight: MinTouchSize, alignItems: 'center', justifyContent: 'center' },
  arrowDisabled: { opacity: 0.3 },
});
