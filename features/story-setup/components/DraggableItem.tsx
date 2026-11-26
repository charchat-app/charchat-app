import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui';
import { MinTouchSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { DragGripDots, webDragHandle } from './DragGrip';
import type { DragList } from './useDragList';

export type DraggableItemProps = {
  itemKey: string;
  index: number;
  keys: string[];
  /** useDragList로 만든 목록 상태. 같은 목록의 항목들이 함께 쓴다. */
  drag: DragList;
  label: string;
  disabled: boolean;
  /** 화면 읽기 기능의 접근성 동작(위로/아래로)으로 한 칸 옮길 때 */
  onMove: (fromKey: string, toKey: string) => void;
  /** 손잡이 옆(오른쪽)에 둘 버튼 등 */
  actions?: React.ReactNode;
  /** 항목 카드 모양(테두리·배경 등) */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/**
 * 전용 손잡이(점 6개)를 길게 누른 뒤 끌어서 순서를 바꾸는 항목 (CREATE-US-01-AC14, CREATE-US-12).
 * - 끌기 제스처는 손잡이에만 붙는다. 카드 제목·본문(입력창)·사진을 누르거나 끌어 스크롤할 때는 시작되지 않는다.
 * - 손잡이는 순서를 바꿀 수 있을 때만 보인다: 항목이 2개 이상이고 편집 가능할 때.
 *   편집 불가(저장 중 등)일 때는 자리만 두고 숨겨 머리 줄이 흔들리지 않게 한다.
 * - 끄는 동안 카드가 살짝 떠 보이고, 다른 카드들이 비켜난다(useDragList).
 * - 드래그가 어려운 환경을 위해 손잡이에 접근성 동작(위로/아래로)을 둔다. 화면에 보이는 이동 버튼은 두지 않는다(CREATE-US-12 목업).
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
  const reorderable = keys.length > 1;
  const pointerRef = drag.pointerRefOf(itemKey);

  return (
    <Animated.View
      testID={`drag-item-${itemKey}`}
      onLayout={(e) => drag.setHeight(itemKey, e.nativeEvent.layout.height)}
      style={[
        styles.wrap,
        style,
        { transform: [{ translateY: drag.offsetOf(itemKey) }, { scale: lifted ? 1.02 : 1 }] },
        lifted && [styles.lifted, { borderColor: c.accent, shadowColor: c.text }],
      ]}
    >
      <View style={styles.header}>
        {reorderable ? (
          // 전용 손잡이: 길게 누른 뒤 위아래로 끈다. 제스처는 여기에만 붙는다.
          // 웹은 Pointer Events(pointerRefOf), 네이티브는 PanResponder를 붙인다. 한쪽만 붙여 두 번 처리하지 않는다.
          <View
            testID={`drag-handle-${itemKey}`}
            ref={pointerRef}
            {...(pointerRef ? null : drag.responderOf(itemKey).panHandlers)}
            {...(pointerRef && !disabled
              ? {
                  tabIndex: 0 as const,
                  onKeyDown: (event: { key?: unknown; preventDefault(): void }) => {
                    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                    event.preventDefault();
                    const target = event.key === 'ArrowUp' ? prev : next;
                    if (target) onMove(itemKey, target);
                  },
                }
              : null)}
            accessible={!disabled}
            accessibilityElementsHidden={disabled}
            importantForAccessibility={disabled ? 'no-hide-descendants' : 'auto'}
            accessibilityRole="adjustable"
            accessibilityLabel={`${label} 순서 변경(길게 눌러 끌기)`}
            accessibilityState={{ disabled }}
            accessibilityActions={[
              { name: 'decrement', label: '위로 이동' },
              { name: 'increment', label: '아래로 이동' },
            ]}
            onAccessibilityAction={(e) => {
              const target = e.nativeEvent.actionName === 'decrement' ? prev : next;
              if (!disabled && target) onMove(itemKey, target);
            }}
            style={[styles.handle, webDragHandle, disabled && styles.hidden]}
          >
            <DragGripDots testID={`drag-grip-${itemKey}`} color={lifted ? c.accent : c.headerIcon} />
          </View>
        ) : null}
        <Text variant="subheading" color={lifted ? 'accent' : 'text'} style={styles.title}>
          {label}
        </Text>
        {actions}
      </View>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  // 들고 있는 카드는 다른 카드 위에 떠 보이게 한다(웹 zIndex, 안드로이드 elevation, iOS 그림자)
  lifted: {
    zIndex: 10,
    elevation: 8,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  title: { flex: 1 },
  handle: { minWidth: MinTouchSize, minHeight: MinTouchSize, alignItems: 'center', justifyContent: 'center' },
  // 순서를 바꿀 수 없는 동안(편집 불가)은 손잡이를 감춘다. 자리는 남겨 머리 줄이 움직이지 않는다.
  hidden: { opacity: 0 },
});
