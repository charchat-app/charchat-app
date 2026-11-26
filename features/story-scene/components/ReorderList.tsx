import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutRectangle,
  type ViewStyle,
} from 'react-native';
import { Text } from '@/components/ui';
import { MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { RAW_POINTER_DELTA, usePointerDragRef } from '@/hooks/use-pointer-drag';
import { useTheme } from '@/hooks/use-theme';

type Entry = { clientKey: string };
type Layouts = Map<string, Pick<LayoutRectangle, 'height'>>;
/**
 * 드래그를 놓은 자리에서 가장 가까운 행을 찾는다.
 *
 * 행의 y는 저장해 두지 않고 **현재 순서·높이·간격으로 매번 계산**한다.
 * 웹(react-native-web)의 onLayout은 ResizeObserver 기반이라 크기가 바뀔 때만 다시 온다. 순서가 바뀌거나
 * 위 카드 높이가 바뀌어 위치만 밀린 행은 onLayout을 받지 못해, 저장한 y로 계산하면 다음 드래그가
 * 엉뚱한 자리로 가거나 제자리에 남았다. 높이는 순서가 바뀌어도 그대로이므로 높이만 믿는다.
 * (story-setup의 dropTargetKey와 같은 방식. 도메인 경계 때문에 따로 둔다.)
 */
export function dropTarget(
  layouts: Layouts,
  keys: string[],
  source: string,
  distance: number,
  gap: number = Spacing.two,
) {
  const centers = new Map<string, number>();
  let top = 0;
  for (const key of keys) {
    const layout = layouts.get(key);
    if (!layout) return source; // 아직 그려지지 않은 행이 있으면 옮기지 않는다
    centers.set(key, top + layout.height / 2);
    top += layout.height + gap;
  }
  const origin = centers.get(source);
  if (origin === undefined) return source;
  const dropped = origin + distance;
  let target = source,
    closest = Infinity;
  for (const [key, center] of centers) {
    const delta = Math.abs(dropped - center);
    if (delta < closest) {
      closest = delta;
      target = key;
    }
  }
  return target;
}
/**
 * source 행을 끌 수 있는 세로 범위. 목록 첫 행 위·마지막 행 아래로 나가지 않는다(CREATE-US-12).
 * dropTarget과 같이 현재 순서·실제 높이·간격으로 계산한다. 아직 그려지지 않은 행이 있으면 null.
 */
export function dragBounds(layouts: Layouts, keys: string[], source: string, gap: number = Spacing.two) {
  let top = 0,
    sourceTop: number | null = null,
    sourceHeight = 0;
  for (const key of keys) {
    const layout = layouts.get(key);
    if (!layout) return null;
    if (key === source) {
      sourceTop = top;
      sourceHeight = layout.height;
    }
    top += layout.height + gap;
  }
  if (sourceTop === null) return null;
  return { min: -sourceTop, max: top - gap - sourceTop - sourceHeight };
}
/**
 * 화면에 보일 이동 값: 끄는 거리를 목록 범위로 제한한다. 범위를 모르면 움직이지 않는다.
 * 놓을 자리 계산(dropTarget)에는 쓰지 않는다. 놓을 자리는 제한하지 않은 거리로 찾는다.
 */
export function boundedDistance(
  layouts: Layouts,
  keys: string[],
  source: string,
  distance: number,
  gap: number = Spacing.two,
) {
  const bounds = dragBounds(layouts, keys, source, gap);
  return bounds ? Math.min(Math.max(distance, bounds.min), bounds.max) : 0;
}
/** 행 DOM 요소의 최소 모양(웹). 네이티브 인스턴스에는 없어서 측정하지 않는다. */
type MeasurableNode = { offsetHeight?: number; getBoundingClientRect?: () => { height: number } };
/** 0·음수·NaN 높이는 아직 그려지지 않았거나 숨겨진 행이라 기록하지 않는다(놓을 자리·끌기 범위를 망가뜨린다). */
const validHeight = (height: unknown): height is number =>
  typeof height === 'number' && Number.isFinite(height) && height > 0;
/**
 * 끌기 시작 때 등록된 행 요소에서 현재 높이를 다시 읽어 layouts를 갱신한다(웹).
 * react-native-web의 onLayout(ResizeObserver)은 순서가 바뀐 뒤 다시 오지 않거나 0 높이로 올 수 있어,
 * 두 번째 끌기에서 범위가 0이 되어 움직이지 않고 놓아도 제자리에 남았다. 양수 높이만 덮어쓴다.
 */
export function measureRowHeights(nodes: Map<string, unknown>, keys: string[], layouts: Layouts) {
  for (const key of keys) {
    const node = nodes.get(key) as MeasurableNode | null | undefined;
    if (!node || typeof node !== 'object') continue;
    let height: unknown = node.offsetHeight;
    if (!validHeight(height) && typeof node.getBoundingClientRect === 'function') {
      try {
        height = node.getBoundingClientRect().height;
      } catch {
        height = undefined;
      }
    }
    if (validHeight(height)) layouts.set(key, { height });
  }
}
// 웹: 손잡이에서 시작한 터치를 브라우저 스크롤이 가져가면(pointercancel) 드래그가 종료된다.
// 손잡이만 브라우저 기본 스크롤·텍스트 선택을 끈다. 네이티브에서는 scrollEnabled 잠금이 같은 역할을 한다.
/** plain 행의 이동 줄 높이. 44px 터치 영역은 hitSlop으로 보탠다. */
const PLAIN_CONTROL = 28;
const PLAIN_HIT_SLOP = (MinTouchSize - PLAIN_CONTROL) / 2;
const webHandle: ViewStyle & { touchAction?: 'none'; userSelect?: 'none' } =
  Platform.OS === 'web' ? { touchAction: 'none', userSelect: 'none' } : {};
/** 손잡이 점 지름·간격(px). 두 열 세 줄의 여섯 점 */
const GRIP_DOT = 4;
/** 행 사이 간격. styles.list·styles.plainList의 gap과 같다. */
const CARD_GAP = Spacing.two;
const PLAIN_GAP = Spacing.four;
const GRIP_GAP = 3;
const ARROWS: readonly number[] = [-1, 1];
const NO_ARROWS: readonly number[] = [];
/** CREATE-US-12 여섯 점 손잡이. 장식이라 스크린 리더에는 손잡이 라벨만 읽힌다. */
function GripDots() {
  const c = useTheme();
  return (
    <View testID="reorder-grip-dots" style={styles.gripDots}>
      {Array.from({ length: 6 }, (_, dot) => (
        <View key={dot} style={[styles.gripDot, { backgroundColor: c.textSecondary }]} />
      ))}
    </View>
  );
}
function Row({
  entryKey,
  label,
  index,
  keys,
  layouts,
  nodes,
  onMove,
  onActive,
  children,
  title,
  actions,
  disabled,
  plain,
  grip,
  gap,
}: {
  entryKey: string;
  label: string;
  index: number;
  keys: string[];
  layouts: Layouts;
  /** 행 요소(웹은 DOM). 끌기 시작 때 높이를 다시 잰다. */
  nodes: Map<string, unknown>;
  onMove: (from: string, to: string) => void;
  onActive: (value: boolean) => void;
  children: React.ReactNode;
  /** CREATE-US-12 손잡이 자리에 보일 머리글(목업 .item-header 왼쪽). 없으면 "↕ 라벨 N". */
  title?: React.ReactNode;
  /** CREATE-US-12 이동 버튼 오른쪽에 둘 동작(목업 .item-header 오른쪽 삭제·편집 아이콘). */
  actions?: React.ReactNode;
  disabled: boolean;
  plain: boolean;
  grip: boolean;
  /** 행 사이 간격(목록 style의 gap과 같아야 놓을 자리·끌기 범위가 맞는다) */
  gap: number;
}) {
  const c = useTheme();
  const translation = useRef(new Animated.Value(0)).current;
  const latest = useRef({ keys, onMove, onActive, disabled, gap });
  latest.current = { keys, onMove, onActive, disabled, gap };
  const [dragging, setDragging] = useState(false);
  // 끄는 중인지. 상태(dragging)는 다음 렌더에야 바뀌므로 제스처 콜백은 이 값을 본다(놓기·취소를 한 번만 처리).
  const active = useRef(false);
  // 행 요소 등록. 렌더마다 같은 콜백이어야 ref가 다시 붙었다 떨어지지 않는다.
  // 떨어질 때는 이 행이 등록한 요소일 때만 지운다(같은 키로 새로 붙은 행을 지우지 않는다).
  const [rowRef] = useState(() => {
    let mine: unknown = null;
    return (node: unknown) => {
      if (node) {
        mine = node;
        nodes.set(entryKey, node);
        return;
      }
      if (mine !== null && nodes.get(entryKey) === mine) nodes.delete(entryKey);
      mine = null;
    };
  });
  // 네이티브(PanResponder)·웹(Pointer Events)이 같이 쓰는 끌기 처리.
  // - 화면 이동(transform)만 목록 범위로 제한한다. 행이 목록 첫 행 위·마지막 행 아래(머리글·하단 줄)로 나가지 않는다.
  // - 놓을 자리는 제한하지 않은 실제 이동 거리로 찾는다. 제한한 값으로 찾으면 키 큰 행은 중심이 끝 행 중심에
  //   닿지 못해 첫 자리·마지막 자리로 옮길 수 없었다.
  const gesture = useRef({
    start: () => {
      if (active.current) return;
      active.current = true;
      // 웹: 저장해 둔 onLayout 높이 대신 지금 행 요소 높이를 읽는다(네이티브 인스턴스는 건너뛴다).
      measureRowHeights(nodes, latest.current.keys, layouts);
      setDragging(true);
      latest.current.onActive(true);
    },
    move: (distance: number) => {
      if (!active.current) return;
      const { keys: order, gap: g } = latest.current;
      translation.setValue(boundedDistance(layouts, order, entryKey, distance, g));
    },
    finish: (distance: number | null) => {
      if (!active.current) return;
      active.current = false;
      translation.setValue(0);
      setDragging(false);
      latest.current.onActive(false);
      if (distance === null || latest.current.disabled) return; // 취소
      const { keys: order, gap: g } = latest.current;
      // 행 높이를 모르면 끌 때 움직이지 않았고, dropTarget도 source를 돌려줘 제자리에 둔다.
      const target = dropTarget(layouts, order, entryKey, distance, g);
      if (target !== entryKey) latest.current.onMove(entryKey, target);
    },
  }).current;
  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, state) => !latest.current.disabled && Math.abs(state.dy) > 6,
      onPanResponderGrant: () => gesture.start(),
      onPanResponderMove: (_, state) => gesture.move(state.dy),
      onPanResponderRelease: (_, state) => gesture.finish(state.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => gesture.finish(null),
    }),
  ).current;
  // 웹: 길게 누르기·PanResponder 흉내 대신 손잡이 DOM에 Pointer Events를 붙인다(5px 움직이면 시작).
  // 화면 이동은 boundedDistance가 목록 범위로 제한하므로, 어댑터는 보이는 영역으로 제한하지 않은 실제 거리를 넘긴다.
  const pointerRef = usePointerDragRef(
    {
      canStart: () => !latest.current.disabled,
      onStart: gesture.start,
      onMove: (dy) => gesture.move(dy),
      onRelease: (dy) => gesture.finish(dy),
      onCancel: () => gesture.finish(null),
    },
    RAW_POINTER_DELTA,
  );
  // 끄는 중에 편집 불가가 되면 취소한다.
  useEffect(() => {
    if (disabled) gesture.finish(null);
  }, [disabled, gesture]);
  // 끄는 중에 행이 사라지면 바깥 스크롤 잠금을 풀어 둔다.
  useEffect(() => () => gesture.finish(null), [gesture]);
  // 손잡이 모드에서 행이 하나뿐이면 옮길 자리가 없으므로 손잡이를 두지 않는다(머리글·동작만 보인다).
  const gripless = grip && keys.length <= 1;
  return (
    <Animated.View
      testID={`reorder-row-${entryKey}`}
      ref={rowRef}
      onLayout={(event) => {
        const { height } = event.nativeEvent.layout;
        if (validHeight(height)) layouts.set(entryKey, { height });
      }}
      style={[
        plain ? styles.plainRow : [styles.row, { backgroundColor: c.surface, borderColor: c.surfaceBorder }],
        { transform: [{ translateY: translation }], zIndex: dragging ? 1 : 0 },
      ]}
    >
      <View testID={`reorder-controls-${entryKey}`} style={[styles.controls, plain && styles.plainControls]}>
        {gripless ? null : (
          <View
            testID={`reorder-handle-${entryKey}`}
            ref={pointerRef}
            {...(pointerRef ? null : responder.panHandlers)}
            {...(pointerRef && grip && !disabled
              ? {
                  tabIndex: 0 as const,
                  onKeyDown: (event: { key?: unknown; preventDefault(): void }) => {
                    const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
                    if (!delta) return;
                    event.preventDefault();
                    const target = keys[index + delta];
                    if (target) onMove(entryKey, target);
                  },
                }
              : null)}
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
            style={[grip ? styles.grip : styles.handle, plain && styles.plainControl, webHandle]}
          >
            {grip ? (
              <GripDots />
            ) : plain ? (
              <View style={styles.titleBody}>{title}</View>
            ) : title !== undefined ? (
              <View style={styles.title}>
                <Text color="textSecondary">↕</Text>
                <View style={styles.titleBody}>{title}</View>
              </View>
            ) : (
              <Text>↕ {label}</Text>
            )}
          </View>
        )}
        {/* 손잡이 모드는 머리글을 손잡이 밖에 둬서 드래그가 손잡이에서만 시작하고, 이동 버튼은 두지 않는다. */}
        {grip ? <View style={styles.titleBody}>{title}</View> : null}
        {(grip ? NO_ARROWS : ARROWS).map((direction) => (
          <Pressable
            key={direction}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${direction < 0 ? '위로' : '아래로'} 이동`}
            accessibilityState={{ disabled: disabled || !keys[index + direction] }}
            disabled={disabled || !keys[index + direction]}
            onPress={() => onMove(entryKey, keys[index + direction])}
            hitSlop={plain ? PLAIN_HIT_SLOP : undefined}
            style={[styles.arrow, plain && styles.plainArrow, plain && !keys[index + direction] && styles.faded]}
          >
            <Text variant={plain ? 'caption' : undefined}>{direction < 0 ? '↑' : '↓'}</Text>
          </Pressable>
        ))}
        {actions}
      </View>
      {children}
    </Animated.View>
  );
}
export function ReorderList<T extends Entry>({
  items,
  label,
  renderItem,
  renderTitle,
  renderActions,
  onMove,
  onActive,
  disabled = false,
  variant = 'card',
  handle = 'title',
}: {
  items: T[];
  label: string;
  renderItem?: (item: T, index: number) => React.ReactNode;
  renderTitle?: (item: T, index: number) => React.ReactNode;
  renderActions?: (item: T, index: number) => React.ReactNode;
  onMove: (from: string, to: string) => void;
  onActive: (value: boolean) => void;
  disabled?: boolean;
  /**
   * CREATE-US-12 인트로 대화형 본문: 'plain'은 카드 테두리·배경 없이 행을 쌓고,
   * 손잡이(renderTitle)·이동 버튼을 말풍선 위 한 줄로 작게 둔다. 이동·드래그·접근성 동작은 'card'와 같다.
   */
  variant?: 'card' | 'plain';
  /**
   * CREATE-US-12 인트로 목록: 'grip'은 머리글 왼쪽 여섯 점 손잡이에서만 드래그를 받고 위·아래 이동 버튼을 두지 않는다.
   * 스크린 리더는 손잡이의 조절(adjustable) 동작으로 한 칸씩 옮긴다. 기본 'title'은 기존처럼 머리글 전체가 손잡이다.
   */
  handle?: 'title' | 'grip';
}) {
  const layouts = useRef<Layouts>(new Map()).current;
  const nodes = useRef(new Map<string, unknown>()).current;
  const keys = items.map((item) => item.clientKey);
  return (
    <View style={variant === 'plain' ? styles.plainList : styles.list}>
      {items.map((item, index) => (
        <Row
          key={item.clientKey}
          entryKey={item.clientKey}
          label={`${label} ${index + 1}`}
          index={index}
          keys={keys}
          layouts={layouts}
          nodes={nodes}
          onMove={onMove}
          onActive={onActive}
          disabled={disabled}
          plain={variant === 'plain'}
          grip={handle === 'grip'}
          gap={variant === 'plain' ? PLAIN_GAP : CARD_GAP}
          title={renderTitle?.(item, index)}
          actions={renderActions?.(item, index)}
        >
          {renderItem?.(item, index) ?? null}
        </Row>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  list: { gap: CARD_GAP, overflow: 'hidden' },
  // 목업 .item / .speech-examples .example-row: 라운드 12
  row: { borderWidth: 1, borderRadius: Radius.item, padding: Spacing.two, gap: Spacing.two },
  controls: { flexDirection: 'row', alignItems: 'center' },
  handle: { minHeight: MinTouchSize, flex: 1, minWidth: 0, justifyContent: 'center' },
  grip: { minHeight: MinTouchSize, minWidth: MinTouchSize, alignItems: 'center', justifyContent: 'center' },
  gripDots: { width: GRIP_DOT * 2 + GRIP_GAP, flexDirection: 'row', flexWrap: 'wrap', gap: GRIP_GAP },
  gripDot: { width: GRIP_DOT, height: GRIP_DOT, borderRadius: GRIP_DOT / 2 },
  title: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  titleBody: { flex: 1, minWidth: 0 },
  arrow: { minHeight: MinTouchSize, minWidth: MinTouchSize, alignItems: 'center', justifyContent: 'center' },
  // 목업 .chat-line: margin 0 0 20px. 이동 줄은 이름표 높이로 줄이고 터치 영역은 hitSlop으로 44px을 채운다.
  plainList: { gap: PLAIN_GAP },
  plainRow: { gap: Spacing.one },
  plainControls: { minHeight: PLAIN_CONTROL },
  plainControl: { minHeight: PLAIN_CONTROL },
  plainArrow: { minHeight: PLAIN_CONTROL, minWidth: PLAIN_CONTROL },
  faded: { opacity: 0.35 },
});
