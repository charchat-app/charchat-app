import { useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View, type LayoutRectangle } from 'react-native';
import { Text } from '@/components/ui';
import { MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Entry = { clientKey: string };
type Layouts = Map<string, LayoutRectangle>;
export function dropTarget(layouts: Layouts, keys: string[], source: string, distance: number) {
  const origin = layouts.get(source);
  if (!origin) return source;
  const center = origin.y + origin.height / 2 + distance;
  let target = source,
    closest = Infinity;
  for (const key of keys) {
    const layout = layouts.get(key);
    if (!layout) continue;
    const delta = Math.abs(center - layout.y - layout.height / 2);
    if (delta < closest) {
      closest = delta;
      target = key;
    }
  }
  return target;
}
function Row({
  entryKey,
  label,
  index,
  keys,
  layouts,
  onMove,
  onActive,
  children,
  disabled,
}: {
  entryKey: string;
  label: string;
  index: number;
  keys: string[];
  layouts: Layouts;
  onMove: (from: string, to: string) => void;
  onActive: (value: boolean) => void;
  children: React.ReactNode;
  disabled: boolean;
}) {
  const c = useTheme();
  const translation = useRef(new Animated.Value(0)).current;
  const latest = useRef({ keys, onMove, onActive, disabled });
  latest.current = { keys, onMove, onActive, disabled };
  const [dragging, setDragging] = useState(false);
  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, state) => !latest.current.disabled && Math.abs(state.dy) > 6,
      onPanResponderGrant: () => {
        setDragging(true);
        latest.current.onActive(true);
      },
      onPanResponderMove: (_, state) => translation.setValue(state.dy),
      onPanResponderRelease: (_, state) => {
        const target = dropTarget(layouts, latest.current.keys, entryKey, state.dy);
        translation.setValue(0);
        setDragging(false);
        latest.current.onActive(false);
        latest.current.onMove(entryKey, target);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => {
        translation.setValue(0);
        setDragging(false);
        latest.current.onActive(false);
      },
    }),
  ).current;
  return (
    <Animated.View
      testID={`reorder-row-${entryKey}`}
      onLayout={(event) => layouts.set(entryKey, event.nativeEvent.layout)}
      style={[
        styles.row,
        {
          backgroundColor: c.surface,
          borderColor: c.border,
          transform: [{ translateY: translation }],
          zIndex: dragging ? 1 : 0,
        },
      ]}
    >
      <View style={styles.controls}>
        <View
          {...responder.panHandlers}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${label} 드래그로 순서 변경`}
          accessibilityActions={[
            { name: 'increment', label: '아래로 이동' },
            { name: 'decrement', label: '위로 이동' },
          ]}
          onAccessibilityAction={(event) => {
            const next = event.nativeEvent.actionName === 'increment' ? index + 1 : index - 1;
            if (!disabled && keys[next]) onMove(entryKey, keys[next]);
          }}
          style={styles.handle}
        >
          <Text>↕ {label}</Text>
        </View>
        {[-1, 1].map((direction) => (
          <Pressable
            key={direction}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${direction < 0 ? '위로' : '아래로'} 이동`}
            accessibilityState={{ disabled: disabled || !keys[index + direction] }}
            disabled={disabled || !keys[index + direction]}
            onPress={() => onMove(entryKey, keys[index + direction])}
            style={styles.arrow}
          >
            <Text>{direction < 0 ? '↑' : '↓'}</Text>
          </Pressable>
        ))}
      </View>
      {children}
    </Animated.View>
  );
}
export function ReorderList<T extends Entry>({
  items,
  label,
  renderItem,
  onMove,
  onActive,
  disabled = false,
}: {
  items: T[];
  label: string;
  renderItem: (item: T, index: number) => React.ReactNode;
  onMove: (from: string, to: string) => void;
  onActive: (value: boolean) => void;
  disabled?: boolean;
}) {
  const layouts = useRef<Layouts>(new Map()).current;
  const keys = items.map((item) => item.clientKey);
  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <Row
          key={item.clientKey}
          entryKey={item.clientKey}
          label={`${label} ${index + 1}`}
          index={index}
          keys={keys}
          layouts={layouts}
          onMove={onMove}
          onActive={onActive}
          disabled={disabled}
        >
          {renderItem(item, index)}
        </Row>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  row: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.two, gap: Spacing.two },
  controls: { flexDirection: 'row', alignItems: 'center' },
  handle: { minHeight: MinTouchSize, flex: 1, justifyContent: 'center' },
  arrow: { minHeight: MinTouchSize, minWidth: MinTouchSize, alignItems: 'center', justifyContent: 'center' },
});
