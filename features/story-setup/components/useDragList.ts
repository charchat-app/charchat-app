import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, PanResponder, type PanResponderInstance } from 'react-native';

import { dropTargetKey } from '../reorder';

const SHIFT_MS = 150;
/** 카드 머리를 이만큼 누르고 있으면 드래그를 시작한다 */
export const LONG_PRESS_MS = 250;
/** 길게 누르기 전에 이만큼 움직이면 드래그가 아니라 스크롤로 본다 */
const SCROLL_SLOP = 8;
/** 놓은 뒤 이 시간 안에 순서가 바뀌지 않으면 카드를 제자리로 되돌린다 */
export const UNCHANGED_ORDER_FALLBACK_MS = 100;

export type DragList = {
  /** 지금 들고 있는 항목 key. 없으면 null */
  draggingKey: string | null;
  /** 항목별 세로 이동 값(들고 있는 카드는 손가락 위치, 나머지는 비켜나는 거리) */
  offsetOf: (key: string) => Animated.Value;
  /** 항목별 카드 머리 제스처(길게 누른 뒤 끌기) */
  responderOf: (key: string) => PanResponderInstance;
  /** onLayout으로 받은 높이를 기록한다 */
  setHeight: (key: string, height: number) => void;
};

/**
 * 카드 머리를 길게 누른 뒤 끌어서 순서를 바꾸는 목록의 상태 (CREATE-US-01-AC14).
 *
 * - 시작: 카드 머리를 LONG_PRESS_MS 동안 누르고 있으면 카드가 떠오르고 바깥 스크롤이 멈춘다.
 *   그 전에 손가락이 움직이면 스크롤로 보고 드래그하지 않는다(제스처를 스크롤에 넘긴다).
 *   카드 본문(이름·상세 입력칸)은 대상이 아니라 텍스트 편집과 겹치지 않는다.
 * - 끄는 동안: 들고 있는 카드는 손가락을 따라가고, 지나가는 자리의 카드들은 그 카드 높이만큼 위아래로 비켜난다.
 * - 놓으면: 비켜난 모습 그대로 순서를 확정한다. 새 순서가 그려진 직후 이동 값을 0으로 되돌려 화면이 튀지 않는다.
 * - 제자리에 놓으면: 카드들이 원래 자리로 부드럽게 돌아간다.
 * 위치는 저장해 두지 않고 현재 순서와 높이로 계산한다(dropTargetKey 참고).
 */
/** source를 target 자리로 옮긴 뒤의 순서(꺼내서 target이 있던 자리에 넣는다) */
function movedOrder(order: string[], source: string, target: string): string[] {
  const next = order.filter((k) => k !== source);
  next.splice(order.indexOf(target), 0, source);
  return next;
}

export function useDragList({
  keys,
  gap,
  disabled,
  onMove,
  onDragActiveChange,
}: {
  keys: string[];
  gap: number;
  disabled: boolean;
  onMove: (fromKey: string, toKey: string) => void;
  onDragActiveChange?: (active: boolean) => void;
}): DragList {
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const heights = useRef(new Map<string, number>()).current;
  const offsets = useRef(new Map<string, Animated.Value>()).current;
  const shifts = useRef(new Map<string, number>()).current; // 비켜난 목표 거리(같은 값이면 애니메이션을 다시 걸지 않음)
  const responders = useRef(new Map<string, PanResponderInstance>()).current;
  // 놓은 카드: 새 순서가 그려진 직후 그 카드를 손가락 위치에서 새 자리로 미끄러뜨린다.
  // expected: 놓은 대로 순서가 바뀌었을 때의 순서. 실제 순서가 이와 같을 때만 남은 거리를 보정한다.
  const pendingDrop = useRef<{ key: string; residual: number; expected: string } | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armedKey = useRef<string | null>(null); // 길게 눌러 끌 준비가 된 카드
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // PanResponder는 항목마다 한 번만 만들어지므로 최신 값은 ref로 읽는다.
  const latest = useRef({ keys, gap, disabled, onMove, onDragActiveChange });
  latest.current = { keys, gap, disabled, onMove, onDragActiveChange };

  const offsetOf = (key: string) => {
    let value = offsets.get(key);
    if (!value) {
      value = new Animated.Value(0);
      offsets.set(key, value);
    }
    return value;
  };

  const shiftTo = (key: string, distance: number) => {
    if (shifts.get(key) === distance) return;
    shifts.set(key, distance);
    Animated.timing(offsetOf(key), { toValue: distance, duration: SHIFT_MS, useNativeDriver: false }).start();
  };

  /** 들고 있는 카드가 target 자리로 가면 다른 카드들이 얼마나 비켜나야 하는지 계산해 적용한다. */
  const shiftOthers = (source: string, target: string) => {
    const order = latest.current.keys;
    const from = order.indexOf(source);
    const to = order.indexOf(target);
    const size = (heights.get(source) ?? 0) + latest.current.gap;
    order.forEach((key, i) => {
      if (key === source) return;
      let distance = 0;
      if (from < to && i > from && i <= to) distance = -size;
      if (from > to && i >= to && i < from) distance = size;
      shiftTo(key, distance);
    });
  };

  const resetAll = (animated: boolean) => {
    for (const key of latest.current.keys) {
      shifts.set(key, 0);
      if (animated) {
        Animated.spring(offsetOf(key), { toValue: 0, useNativeDriver: false, bounciness: 4 }).start();
      } else {
        offsetOf(key).stopAnimation();
        offsetOf(key).setValue(0);
      }
    }
  };

  const clearPressTimer = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const clearFallbackTimer = () => {
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    fallbackTimer.current = null;
  };

  /** 지금 이 카드를 끌 수 있는지: 편집 가능하고 목록에 아직 있어야 한다. */
  const canDrag = (key: string) => !latest.current.disabled && latest.current.keys.includes(key);

  const arm = (key: string) => {
    // 다른 카드를 이미 들고 있으면(두 손가락) 새로 들지 않는다.
    if (armedKey.current !== null && armedKey.current !== key) return;
    // 누르는 사이 편집 불가가 되었거나 카드가 지워졌으면 시작하지 않는다.
    if (!canDrag(key)) return;
    // 아직 처리되지 않은 지난 놓기는 정리한다(늦게 도는 되돌림 타이머가 새 끌기를 건드리지 않게).
    if (pendingDrop.current) {
      pendingDrop.current = null;
      clearFallbackTimer();
      resetAll(true);
    }
    armedKey.current = key;
    offsetOf(key).stopAnimation();
    setDraggingKey(key);
    latest.current.onDragActiveChange?.(true);
  };

  const end = (key: string, dy: number, cancelled: boolean) => {
    armedKey.current = null;
    const { keys: order, gap: g } = latest.current;
    const target = cancelled || !canDrag(key) ? key : dropTargetKey(heights, order, key, dy, g);
    setDraggingKey(null);
    latest.current.onDragActiveChange?.(false);
    if (target === key) {
      resetAll(true);
      return;
    }
    // 순서는 놓는 즉시 확정한다(애니메이션이 끊기거나 멈춰도 변경이 사라지지 않게).
    // 화면 효과는 새 순서가 그려진 직후(useLayoutEffect) 처리한다:
    // 다른 카드는 이미 비켜난 위치 = 새 위치라 0으로 두고, 놓은 카드만 손가락 위치에서 새 자리로 미끄러진다.
    const drop = {
      key,
      residual: dy - slotOffset(order, key, target, g),
      expected: movedOrder(order, key, target).join('|'),
    };
    pendingDrop.current = drop;
    latest.current.onMove(key, target);
    // 순서가 실제로 바뀌지 않으면(그사이 캐릭터가 지워지는 등) useLayoutEffect가 돌지 않아
    // 카드가 밀린 채 남는다. 잠시 뒤에도 이 놓기가 처리되지 않았으면 제자리로 되돌린다.
    clearFallbackTimer();
    fallbackTimer.current = setTimeout(() => {
      if (pendingDrop.current !== drop) return;
      fallbackTimer.current = null;
      pendingDrop.current = null;
      resetAll(true);
    }, UNCHANGED_ORDER_FALLBACK_MS);
  };

  /** 끄는 중에 편집 불가가 되거나 그 카드가 지워지면 끌기를 취소한다. 이후 늦게 온 이벤트는 무시된다. */
  const cancelActive = () => {
    armedKey.current = null;
    setDraggingKey(null);
    latest.current.onDragActiveChange?.(false);
    resetAll(true);
  };

  /** source 카드가 target 자리에 들어갈 때 원래 위치에서 움직일 거리 */
  const slotOffset = (order: string[], source: string, target: string, g: number) => {
    const from = order.indexOf(source);
    const to = order.indexOf(target);
    const between = from < to ? order.slice(from + 1, to + 1) : order.slice(to, from);
    const distance = between.reduce((sum, k) => sum + (heights.get(k) ?? 0) + g, 0);
    return from < to ? distance : -distance;
  };

  const responderOf = (key: string) => {
    let responder = responders.get(key);
    if (!responder) {
      responder = PanResponder.create({
        // 카드 머리를 누르면 일단 받아 두고, 길게 누르면 드래그를 시작한다.
        // 안쪽 버튼(↑·↓·삭제)은 더 안쪽에서 먼저 응답하므로 여기로 오지 않는다.
        // 다른 카드를 들고 있는 동안에는 새 제스처를 받지 않는다(두 손가락으로 두 카드를 잡는 경우).
        onStartShouldSetPanResponder: () => !latest.current.disabled && armedKey.current === null,
        onPanResponderGrant: () => {
          clearPressTimer();
          pressTimer.current = setTimeout(() => arm(key), LONG_PRESS_MS);
        },
        onPanResponderMove: (_, g) => {
          if (armedKey.current !== key) {
            // 길게 누르기 전에 움직이면 스크롤하려는 것이다. 드래그를 시작하지 않는다.
            if (Math.abs(g.dy) > SCROLL_SLOP || Math.abs(g.dx) > SCROLL_SLOP) clearPressTimer();
            return;
          }
          offsetOf(key).setValue(g.dy);
          const { keys: order, gap: g2 } = latest.current;
          shiftOthers(key, dropTargetKey(heights, order, key, g.dy, g2));
        },
        onPanResponderRelease: (_, g) => {
          clearPressTimer();
          if (armedKey.current === key) end(key, g.dy, false);
        },
        // 드래그 중이 아니면 스크롤뷰가 제스처를 가져갈 수 있게 한다.
        onPanResponderTerminationRequest: () => armedKey.current !== key,
        onPanResponderTerminate: () => {
          clearPressTimer();
          if (armedKey.current === key) end(key, 0, true);
        },
      });
      responders.set(key, responder);
    }
    return responder;
  };

  // 드래그 중에 목록이 사라지면(탭 전환 등) 바깥 스크롤 잠금을 풀어 둔다.
  useEffect(
    () => () => {
      clearPressTimer();
      clearFallbackTimer();
      if (armedKey.current !== null) {
        armedKey.current = null;
        latest.current.onDragActiveChange?.(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const orderSignature = keys.join('|');

  // 길게 누르는 중·끄는 중에 편집 불가가 되거나 그 카드가 지워지면 취소한다(잠금은 한 번만 푼다).
  useEffect(() => {
    if (disabled) clearPressTimer();
    const active = armedKey.current;
    if (active !== null && !canDrag(active)) cancelActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, orderSignature]);

  useLayoutEffect(() => {
    const drop = pendingDrop.current;
    if (!drop) return;
    pendingDrop.current = null;
    clearFallbackTimer();
    // 놓은 대로가 아닌 순서로 바뀌었으면(그사이 다른 변경·대상 삭제) 남은 거리 보정 없이 제자리로 돌린다.
    if (orderSignature !== drop.expected) {
      resetAll(true);
      return;
    }
    resetAll(false);
    offsetOf(drop.key).setValue(drop.residual);
    Animated.timing(offsetOf(drop.key), { toValue: 0, duration: SHIFT_MS, useNativeDriver: false }).start();
    // keys가 바뀐 그 렌더 직후에만 실행한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderSignature]);

  return {
    draggingKey,
    offsetOf,
    responderOf,
    setHeight: (key, height) => heights.set(key, height),
  };
}
