import { useRef, useState } from 'react';
import { Platform } from 'react-native';

/**
 * 웹 전용 끌기 손잡이 어댑터 (CREATE-US-12).
 *
 * react-native-web에서 PanResponder는 마우스·터치 이벤트를 흉내 내는데, 손잡이를 길게 누르는 조건과 겹치면
 * 보통 속도로 움직일 때 길게 누르기가 취소되어 끌기가 시작되지 않았다. 웹에서는 손잡이 DOM 요소에
 * Pointer Events를 직접 붙인다.
 * - pointerdown에서 포인터를 붙잡아(setPointerCapture) 손잡이 밖으로 나가도 이동·놓기를 계속 받는다.
 * - 시작점에서 START_THRESHOLD(5px) 넘게 움직여야 끌기를 시작한다. 그 전에 떼면 아무 일도 없다(클릭).
 * - 이동 거리는 clientX/clientY 차이로 계산하고, 화면에 보이는 스크롤 영역(가장 가까운 스크롤 조상과 창) 안으로 제한한다.
 * - 놓을 때는 마지막으로 미리 보여 준 이동 값(마지막 onMove)으로 onRelease를 부른다. pointerup 좌표는 쓰지 않는다
 *   (좌표가 비정상이거나 마지막 이동과 달라도 보이던 자리 그대로 놓인다).
 * - pointercancel·lostpointercapture·연결 해제(언마운트)는 onCancel로 끝낸다. 한 번 끝난 끌기는 다시 끝내지 않는다.
 * 네이티브는 이 어댑터를 쓰지 않고 각 목록의 기존 PanResponder를 그대로 쓴다.
 */
export const pointerDragSupported = Platform.OS === 'web';

/** 끌기로 보기 시작하는 최소 이동 거리(px) */
export const START_THRESHOLD = 5;

export type PointerDragCallbacks = {
  /** 끌기를 시작해도 되는지(편집 불가·다른 항목을 끄는 중이면 false) */
  canStart?: () => boolean;
  onStart: () => void;
  /** 시작점에서 움직인 거리 */
  onMove: (dy: number, dx: number) => void;
  /** 마지막으로 onMove에 알린 거리로 놓는다(pointerup 좌표는 쓰지 않는다) */
  onRelease: (dy: number, dx: number) => void;
  onCancel: () => void;
};

/** 어댑터가 쓰는 PointerEvent의 최소 모양(테스트에서 가짜 이벤트를 쓸 수 있게 구조로만 정의) */
export type PointerLike = {
  pointerId: number;
  clientX: number;
  clientY: number;
  button?: number;
  pointerType?: string;
  isPrimary?: boolean;
  preventDefault?: () => void;
};

type Listener = (event: PointerLike) => void;
type Viewport = { top: number; bottom: number; left: number; right: number };

/** 어댑터가 쓰는 DOM 요소의 최소 모양 */
export type PointerTarget = {
  addEventListener: (type: string, listener: Listener) => void;
  removeEventListener: (type: string, listener: Listener) => void;
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
  hasPointerCapture?: (pointerId: number) => boolean;
  parentElement?: unknown;
};

const EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture'] as const;

type DomLike = {
  parentElement?: DomLike | null;
  getBoundingClientRect?: () => Viewport;
  scrollHeight?: number;
  clientHeight?: number;
};

/** 가장 가까운 세로 스크롤 조상과 창이 겹치는 영역. DOM이 없으면(테스트 등) null. */
function visibleViewport(element: PointerTarget): Viewport | null {
  const view = (
    globalThis as {
      window?: {
        innerHeight?: number;
        innerWidth?: number;
        getComputedStyle?: (node: unknown) => { overflowY: string };
      };
    }
  ).window;
  // 브라우저에서는 window를 this로 불러야 한다(떼어 내 부르면 Illegal invocation).
  const getStyle = view?.getComputedStyle;
  const style = typeof getStyle === 'function' ? (node: unknown) => getStyle.call(view, node) : null;
  let rect: Viewport | null =
    typeof view?.innerHeight === 'number' && typeof view.innerWidth === 'number'
      ? { top: 0, left: 0, bottom: view.innerHeight, right: view.innerWidth }
      : null;
  if (typeof style !== 'function') return rect;
  let node = (element as DomLike).parentElement ?? null;
  while (node) {
    let overflow = '';
    try {
      overflow = style(node).overflowY;
    } catch {
      break; // DOM 노드가 아니면 더 올라가지 않는다
    }
    if ((overflow === 'auto' || overflow === 'scroll') && (node.scrollHeight ?? 0) > (node.clientHeight ?? 0)) {
      const box = node.getBoundingClientRect?.();
      if (box)
        rect = rect
          ? {
              top: Math.max(rect.top, box.top),
              bottom: Math.min(rect.bottom, box.bottom),
              left: Math.max(rect.left, box.left),
              right: Math.min(rect.right, box.right),
            }
          : box;
      break;
    }
    node = node.parentElement ?? null;
  }
  return rect;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export type PointerDragOptions = {
  threshold?: number;
  /** 이동 거리를 제한할 영역. null을 돌려주면 제한하지 않은 실제 거리를 알린다. 기본은 보이는 스크롤 영역. */
  viewport?: (element: PointerTarget) => Viewport | null;
};

/**
 * 세로 목록(ReorderList·useDragList)용 옵션: 보이는 영역으로 제한하지 않은 실제 이동 거리를 알린다.
 * 목록은 화면 이동만 목록 범위로 제한하고 놓을 자리는 실제 거리로 찾는다. 보이는 영역으로 먼저 제한하면
 * 아래쪽 카드 손잡이가 화면 끝에 가까울 때 다음 자리까지 닿지 못한다.
 */
export const RAW_POINTER_DELTA: PointerDragOptions = { viewport: () => null };

/**
 * element에 Pointer Events 끌기를 연결하고 해제 함수를 돌려준다.
 * callbacks는 이벤트마다 다시 읽는다(최신 상태를 쓰도록 getter로 받는다).
 */
export function attachPointerDrag(
  element: PointerTarget,
  callbacks: () => PointerDragCallbacks,
  options: PointerDragOptions = {},
): () => void {
  const threshold = options.threshold ?? START_THRESHOLD;
  const measure = options.viewport ?? visibleViewport;
  let session: {
    id: number;
    x0: number;
    y0: number;
    dx: number;
    dy: number;
    active: boolean;
    viewport: Viewport | null;
  } | null = null;

  const deltaOf = (event: PointerLike) => {
    if (!session || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return null;
    const v = session.viewport;
    const x = v ? clamp(event.clientX, v.left, v.right) : event.clientX;
    const y = v ? clamp(event.clientY, v.top, v.bottom) : event.clientY;
    return { dx: x - session.x0, dy: y - session.y0 };
  };

  /** 세션을 먼저 비우고 포인터를 놓는다. 놓으면서 오는 lostpointercapture는 끝난 세션이라 무시된다. */
  const finish = () => {
    const ended = session;
    session = null;
    if (ended && element.hasPointerCapture?.(ended.id) !== false) {
      try {
        element.releasePointerCapture?.(ended.id);
      } catch {
        // 이미 놓친 포인터면 무시한다.
      }
    }
    return ended;
  };

  const down: Listener = (event) => {
    if (session) return; // 두 번째 손가락은 무시한다
    if (event.isPrimary === false) return;
    if (event.pointerType === 'mouse' && event.button !== undefined && event.button !== 0) return;
    if (callbacks().canStart?.() === false) return;
    session = {
      id: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      dx: 0,
      dy: 0,
      active: false,
      viewport: measure(element),
    };
    try {
      element.setPointerCapture?.(event.pointerId);
    } catch {
      // 캡처를 못 해도 요소 위 이동은 받는다.
    }
    // 마우스로 끌 때 주변 글자가 선택되지 않게 한다(터치는 touch-action: none이 맡는다).
    if (event.pointerType === 'mouse') event.preventDefault?.();
  };

  const move: Listener = (event) => {
    if (!session || event.pointerId !== session.id) return;
    const delta = deltaOf(event);
    if (!delta) return;
    if (!session.active) {
      if (Math.hypot(delta.dx, delta.dy) <= threshold) return;
      if (callbacks().canStart?.() === false) {
        finish();
        return;
      }
      session.active = true;
      callbacks().onStart();
      // onStart 안에서 취소되었을 수 있다.
      if (!session) return;
    }
    session.dx = delta.dx;
    session.dy = delta.dy;
    event.preventDefault?.();
    callbacks().onMove(delta.dy, delta.dx);
  };

  // 놓기는 pointerup 좌표를 다시 읽지 않고, 마지막으로 미리 보여 준(onMove) 이동 값을 확정한다.
  // pointerup 좌표가 마지막 pointermove와 다르면 화면에 보이던 자리와 다른 곳에 놓이기 때문이다.
  const up: Listener = (event) => {
    if (!session || event.pointerId !== session.id) return;
    const ended = finish();
    if (ended?.active) callbacks().onRelease(ended.dy, ended.dx);
  };

  const cancel: Listener = (event) => {
    if (!session || event.pointerId !== session.id) return;
    const ended = finish();
    if (ended?.active) callbacks().onCancel();
  };

  const listeners: Record<(typeof EVENTS)[number], Listener> = {
    pointerdown: down,
    pointermove: move,
    pointerup: up,
    pointercancel: cancel,
    lostpointercapture: cancel,
  };
  for (const type of EVENTS) element.addEventListener(type, listeners[type]);

  return () => {
    for (const type of EVENTS) element.removeEventListener(type, listeners[type]);
    const ended = finish();
    if (ended?.active) callbacks().onCancel();
  };
}

function isPointerTarget(node: unknown): node is PointerTarget {
  return (
    typeof node === 'object' &&
    node !== null &&
    typeof (node as PointerTarget).addEventListener === 'function' &&
    typeof (node as PointerTarget).removeEventListener === 'function'
  );
}

/**
 * 손잡이 View의 ref에 넘길 콜백을 만든다. 웹(react-native-web)에서 View ref는 DOM 요소다.
 * 요소가 붙으면 연결하고, 떨어지거나(null) 바뀌면 이전 연결을 해제한다. DOM 요소가 아니면(네이티브) 아무것도 하지 않는다.
 * 목록처럼 항목마다 ref가 필요하면 항목별로 한 번 만들어 재사용한다(매 렌더 새로 만들면 다시 연결된다).
 */
export function createPointerDragRef(
  callbacks: () => PointerDragCallbacks,
  options?: PointerDragOptions,
): (node: unknown) => void {
  let detach: (() => void) | null = null;
  return (node) => {
    detach?.();
    detach = null;
    if (isPointerTarget(node)) detach = attachPointerDrag(node, callbacks, options);
  };
}

/** 항목 하나의 손잡이용 훅. 웹이 아니면 undefined를 돌려줘 ref를 붙이지 않는다. */
export function usePointerDragRef(
  callbacks: PointerDragCallbacks,
  options?: PointerDragOptions,
): ((node: unknown) => void) | undefined {
  const latest = useRef(callbacks);
  latest.current = callbacks;
  // 렌더마다 같은 ref 콜백을 돌려줘야 다시 연결되지 않는다.
  // 언마운트 때는 React가 ref(null)을 불러 연결을 해제한다(끄는 중이면 onCancel).
  // StrictMode의 가짜 언마운트에서 해제되지 않도록 effect 정리로 해제하지 않는다.
  // options는 처음 값만 쓴다(연결할 때 정해진다).
  const [ref] = useState(() => createPointerDragRef(() => latest.current, options));
  return pointerDragSupported ? ref : undefined;
}
