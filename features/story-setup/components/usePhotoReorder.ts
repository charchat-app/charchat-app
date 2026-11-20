import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, type PanResponderInstance } from 'react-native';

import { dropIndex, shiftDuringDrag } from '../images';

/** 사진을 이만큼 누르고 있으면 끌기를 시작한다(캐릭터 카드 끌기와 같은 값) */
export const PHOTO_LONG_PRESS_MS = 250;
/** 길게 누르기 전에 이만큼 움직이면 끌기가 아니라 스크롤·취소로 본다 */
const MOVE_SLOP = 8;
const SHIFT_MS = 150;

export type PhotoReorder = {
  /** 지금 들고 있는 사진의 key. 없으면 null */
  draggingKey: string | null;
  offsetOf: (key: string) => Animated.Value;
  responderOf: (key: string) => PanResponderInstance;
};

/**
 * 가로 사진 줄에서 사진을 길게 누른 뒤 끌어서 순서를 바꾼다 (CREATE-US-06-AC06).
 * - 짧게 누르면 onTap(사진 선택), 길게 누르면 사진이 떠오르고 손가락을 따라 움직인다.
 * - 끄는 동안 지나가는 자리의 사진들이 한 칸씩 비켜나고, 놓으면 그 자리로 순서를 확정한다.
 * - 사진 칸은 모두 같은 너비라 위치를 칸 너비+간격(slot)으로 계산한다(dropIndex).
 * 세로 카드용 useDragList와 같은 방식(길게 누르기 → 끌기)을 가로 사진 줄에 맞춘 것이다.
 */
export function usePhotoReorder({
  keys,
  slot,
  disabled,
  onTap,
  onMove,
  onDragActiveChange,
}: {
  keys: string[];
  slot: number;
  disabled: boolean;
  onTap: (key: string) => void;
  onMove: (from: number, to: number) => void;
  onDragActiveChange?: (active: boolean) => void;
}): PhotoReorder {
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const offsets = useRef(new Map<string, Animated.Value>()).current;
  const shifts = useRef(new Map<string, number>()).current;
  const responders = useRef(new Map<string, PanResponderInstance>()).current;
  const armed = useRef<string | null>(null);
  const moved = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 제스처는 사진마다 한 번만 만들어지므로 최신 값은 ref로 읽는다.
  const latest = useRef({ keys, slot, disabled, onTap, onMove, onDragActiveChange });
  latest.current = { keys, slot, disabled, onTap, onMove, onDragActiveChange };

  const offsetOf = (key: string) => {
    let value = offsets.get(key);
    if (!value) {
      value = new Animated.Value(0);
      offsets.set(key, value);
    }
    return value;
  };

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const shiftOthers = (key: string, dx: number) => {
    const { keys: order, slot: size } = latest.current;
    const from = order.indexOf(key);
    const to = dropIndex(from, dx, size, order.length);
    order.forEach((k, i) => {
      if (k === key) return;
      const distance = shiftDuringDrag(i, from, to) * size;
      if (shifts.get(k) === distance) return;
      shifts.set(k, distance);
      Animated.timing(offsetOf(k), { toValue: distance, duration: SHIFT_MS, useNativeDriver: false }).start();
    });
  };

  const resetAll = () => {
    for (const k of latest.current.keys) {
      shifts.set(k, 0);
      offsetOf(k).stopAnimation();
      offsetOf(k).setValue(0);
    }
  };

  const finish = (key: string, dx: number, cancelled: boolean) => {
    armed.current = null;
    setDraggingKey(null);
    latest.current.onDragActiveChange?.(false);
    const { keys: order, slot: size } = latest.current;
    const from = order.indexOf(key);
    const to = cancelled ? from : dropIndex(from, dx, size, order.length);
    // 순서를 먼저 확정하고 이동 값을 지운다. 새 순서로 다시 그려지면 사진이 제자리에 놓인다.
    if (to !== from) latest.current.onMove(from, to);
    resetAll();
  };

  const responderOf = (key: string) => {
    let responder = responders.get(key);
    if (!responder) {
      responder = PanResponder.create({
        onStartShouldSetPanResponder: () => !latest.current.disabled && armed.current === null,
        onPanResponderGrant: () => {
          moved.current = false;
          clearTimer();
          timer.current = setTimeout(() => {
            timer.current = null;
            armed.current = key;
            offsetOf(key).stopAnimation();
            setDraggingKey(key);
            latest.current.onDragActiveChange?.(true);
          }, PHOTO_LONG_PRESS_MS);
        },
        onPanResponderMove: (_, g) => {
          if (armed.current !== key) {
            // 길게 누르기 전에 움직이면 끌기·선택이 아니다(가로 스크롤하려는 것).
            if (Math.abs(g.dx) > MOVE_SLOP || Math.abs(g.dy) > MOVE_SLOP) {
              moved.current = true;
              clearTimer();
            }
            return;
          }
          offsetOf(key).setValue(g.dx);
          shiftOthers(key, g.dx);
        },
        onPanResponderRelease: (_, g) => {
          const quickTap = timer.current !== null && !moved.current;
          clearTimer();
          if (armed.current === key) finish(key, g.dx, false);
          else if (quickTap) latest.current.onTap(key);
        },
        // 끌고 있지 않으면 스크롤이 제스처를 가져갈 수 있게 한다.
        onPanResponderTerminationRequest: () => armed.current !== key,
        onPanResponderTerminate: () => {
          clearTimer();
          if (armed.current === key) finish(key, 0, true);
        },
      });
      responders.set(key, responder);
    }
    return responder;
  };

  // 끄는 중에 목록이 사라지면(탭 전환 등) 바깥 스크롤 잠금을 풀어 둔다.
  useEffect(
    () => () => {
      clearTimer();
      if (armed.current !== null) {
        armed.current = null;
        latest.current.onDragActiveChange?.(false);
      }
    },
    [],
  );

  return { draggingKey, offsetOf, responderOf };
}
