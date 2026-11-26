import {
  attachPointerDrag,
  createPointerDragRef,
  RAW_POINTER_DELTA,
  START_THRESHOLD,
  type PointerLike,
  type PointerTarget,
} from '@/hooks/use-pointer-drag';

/** addEventListener·포인터 캡처만 흉내 내는 가짜 손잡이 요소. 캡처를 놓으면 브라우저처럼 lostpointercapture를 보낸다. */
function fakeHandle() {
  const listeners = new Map<string, Set<(event: PointerLike) => void>>();
  const captured = new Set<number>();
  const element: PointerTarget = {
    addEventListener: (type, listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(listener);
    },
    removeEventListener: (type, listener) => listeners.get(type)?.delete(listener),
    setPointerCapture: jest.fn((id: number) => captured.add(id)),
    releasePointerCapture: jest.fn((id: number) => {
      if (captured.delete(id)) emit('lostpointercapture', { pointerId: id, clientX: 0, clientY: 0 });
    }),
    hasPointerCapture: (id: number) => captured.has(id),
  };
  const emit = (type: string, event: Partial<PointerLike> & { pointerId: number }) => {
    const full: PointerLike = {
      clientX: 0,
      clientY: 0,
      button: 0,
      pointerType: 'touch',
      isPrimary: true,
      preventDefault: jest.fn(),
      ...event,
    };
    for (const listener of [...(listeners.get(type) ?? [])]) listener(full);
    return full;
  };
  const count = () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
  return { element, emit, captured, count };
}

function callbacks() {
  return {
    canStart: jest.fn(() => true),
    onStart: jest.fn(),
    onMove: jest.fn(),
    onRelease: jest.fn(),
    onCancel: jest.fn(),
  };
}

const noViewport = { viewport: () => null };

describe('웹 Pointer Events 끌기 어댑터 (CREATE-US-12)', () => {
  it('누르면 포인터를 붙잡고, 5px 이하 움직임은 끌기가 아니며 떼어도 놓기를 부르지 않는다', () => {
    const { element, emit, captured } = fakeHandle();
    const cb = callbacks();
    attachPointerDrag(element, () => cb, noViewport);
    emit('pointerdown', { pointerId: 1, clientX: 10, clientY: 100 });
    expect(element.setPointerCapture).toHaveBeenCalledWith(1);
    expect(captured.has(1)).toBe(true);
    emit('pointermove', { pointerId: 1, clientX: 13, clientY: 100 + START_THRESHOLD - 1 });
    expect(cb.onStart).not.toHaveBeenCalled();
    emit('pointerup', { pointerId: 1, clientX: 13, clientY: 104 });
    expect(cb.onRelease).not.toHaveBeenCalled();
    expect(cb.onCancel).not.toHaveBeenCalled();
    // 떼면 캡처를 놓는다
    expect(captured.has(1)).toBe(false);
  });

  it('길게 누르지 않고 5px 넘게 움직이면 바로 시작하고, clientY 차이로 이동·놓기를 알린다', () => {
    const { element, emit } = fakeHandle();
    const cb = callbacks();
    attachPointerDrag(element, () => cb, noViewport);
    emit('pointerdown', { pointerId: 7, clientX: 0, clientY: 200 });
    const move = emit('pointermove', { pointerId: 7, clientX: 1, clientY: 210 });
    expect(cb.onStart).toHaveBeenCalledTimes(1);
    expect(cb.onMove).toHaveBeenLastCalledWith(10, 1);
    // 끄는 중에는 브라우저 기본 동작(스크롤·선택)을 막는다
    expect(move.preventDefault).toHaveBeenCalled();
    emit('pointermove', { pointerId: 7, clientX: 1, clientY: 260 });
    expect(cb.onMove).toHaveBeenLastCalledWith(60, 1);
    emit('pointerup', { pointerId: 7, clientX: 1, clientY: 260 });
    expect(cb.onRelease).toHaveBeenCalledWith(60, 1);
    expect(cb.onCancel).not.toHaveBeenCalled();
  });

  it('pointerup 좌표가 마지막 이동과 달라도 마지막으로 미리 보여 준 이동 값으로 놓는다', () => {
    const { element, emit } = fakeHandle();
    const cb = callbacks();
    attachPointerDrag(element, () => cb, noViewport);
    emit('pointerdown', { pointerId: 7, clientX: 0, clientY: 200 });
    emit('pointermove', { pointerId: 7, clientX: 1, clientY: 260 });
    expect(cb.onMove).toHaveBeenLastCalledWith(60, 1);
    emit('pointerup', { pointerId: 7, clientX: 9, clientY: 500 });
    expect(cb.onRelease).toHaveBeenCalledTimes(1);
    expect(cb.onRelease).toHaveBeenCalledWith(60, 1);
    // 놓을 때 새 미리보기를 만들지 않는다
    expect(cb.onMove).toHaveBeenCalledTimes(1);
  });

  it('pointerup 좌표가 비정상이면 마지막 이동 값으로 놓는다', () => {
    const { element, emit } = fakeHandle();
    const cb = callbacks();
    attachPointerDrag(element, () => cb, noViewport);
    emit('pointerdown', { pointerId: 1, clientY: 0 });
    emit('pointermove', { pointerId: 1, clientY: 80 });
    emit('pointerup', { pointerId: 1, clientX: Number.NaN, clientY: Number.NaN });
    expect(cb.onRelease).toHaveBeenCalledWith(80, 0);
  });

  it('놓을 때 캡처를 놓으며 오는 lostpointercapture는 취소로 보지 않는다(놓기는 한 번만)', () => {
    const { element, emit } = fakeHandle();
    const cb = callbacks();
    attachPointerDrag(element, () => cb, noViewport);
    emit('pointerdown', { pointerId: 1, clientY: 0 });
    emit('pointermove', { pointerId: 1, clientY: 40 });
    emit('pointerup', { pointerId: 1, clientY: 40 });
    expect(element.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(cb.onRelease).toHaveBeenCalledTimes(1);
    expect(cb.onCancel).not.toHaveBeenCalled();
  });

  it.each(['pointercancel', 'lostpointercapture'])('끄는 중 %s가 오면 취소하고 이후 늦은 이벤트는 무시한다', (type) => {
    const { element, emit } = fakeHandle();
    const cb = callbacks();
    attachPointerDrag(element, () => cb, noViewport);
    emit('pointerdown', { pointerId: 1, clientY: 0 });
    emit('pointermove', { pointerId: 1, clientY: 30 });
    emit(type, { pointerId: 1 });
    expect(cb.onCancel).toHaveBeenCalledTimes(1);
    emit('pointermove', { pointerId: 1, clientY: 90 });
    emit('pointerup', { pointerId: 1, clientY: 90 });
    expect(cb.onRelease).not.toHaveBeenCalled();
    expect(cb.onMove).toHaveBeenCalledTimes(1);
  });

  it('시작 전 취소는 onCancel을 부르지 않는다', () => {
    const { element, emit } = fakeHandle();
    const cb = callbacks();
    attachPointerDrag(element, () => cb, noViewport);
    emit('pointerdown', { pointerId: 1, clientY: 0 });
    emit('pointercancel', { pointerId: 1 });
    expect(cb.onCancel).not.toHaveBeenCalled();
  });

  it('다른 포인터(두 번째 손가락)·마우스 오른쪽 버튼·보조 포인터는 무시한다', () => {
    const { element, emit } = fakeHandle();
    const cb = callbacks();
    attachPointerDrag(element, () => cb, noViewport);
    emit('pointerdown', { pointerId: 1, clientY: 0, pointerType: 'mouse', button: 2 });
    emit('pointermove', { pointerId: 1, clientY: 50, pointerType: 'mouse' });
    expect(cb.onStart).not.toHaveBeenCalled();
    emit('pointerdown', { pointerId: 2, clientY: 0, isPrimary: false });
    emit('pointermove', { pointerId: 2, clientY: 50 });
    expect(cb.onStart).not.toHaveBeenCalled();

    emit('pointerdown', { pointerId: 3, clientY: 0 });
    emit('pointerdown', { pointerId: 4, clientY: 0 });
    emit('pointermove', { pointerId: 4, clientY: 50 });
    emit('pointerup', { pointerId: 4, clientY: 50 });
    expect(cb.onStart).not.toHaveBeenCalled();
    emit('pointermove', { pointerId: 3, clientY: 20 });
    expect(cb.onStart).toHaveBeenCalledTimes(1);
    expect(cb.onMove).toHaveBeenLastCalledWith(20, 0);
  });

  it('마우스로 누르면 글자 선택이 생기지 않게 기본 동작을 막고, 터치는 막지 않는다', () => {
    const { element, emit } = fakeHandle();
    attachPointerDrag(element, () => callbacks(), noViewport);
    const mouse = emit('pointerdown', { pointerId: 1, pointerType: 'mouse' });
    expect(mouse.preventDefault).toHaveBeenCalled();
    emit('pointerup', { pointerId: 1 });
    const touch = emit('pointerdown', { pointerId: 2, pointerType: 'touch' });
    expect(touch.preventDefault).not.toHaveBeenCalled();
  });

  it('편집 불가 등으로 시작할 수 없으면 끌기를 시작하지 않는다', () => {
    const { element, emit } = fakeHandle();
    const cb = callbacks();
    cb.canStart.mockReturnValue(false);
    attachPointerDrag(element, () => cb, noViewport);
    emit('pointerdown', { pointerId: 1, clientY: 0 });
    emit('pointermove', { pointerId: 1, clientY: 50 });
    emit('pointerup', { pointerId: 1, clientY: 50 });
    expect(cb.onStart).not.toHaveBeenCalled();
    expect(cb.onRelease).not.toHaveBeenCalled();
  });

  it('이동 거리는 화면에 보이는 스크롤 영역 안으로 제한된다', () => {
    const { element, emit } = fakeHandle();
    const cb = callbacks();
    attachPointerDrag(element, () => cb, { viewport: () => ({ top: 50, bottom: 400, left: 0, right: 300 }) });
    emit('pointerdown', { pointerId: 1, clientY: 100 });
    emit('pointermove', { pointerId: 1, clientY: 900 });
    expect(cb.onMove).toHaveBeenLastCalledWith(300, 0);
    emit('pointermove', { pointerId: 1, clientY: -500 });
    expect(cb.onMove).toHaveBeenLastCalledWith(-50, 0);
    // 놓기는 마지막 미리보기(-50)를 확정한다. pointerup 좌표(2000)는 쓰지 않는다.
    emit('pointerup', { pointerId: 1, clientY: 2000 });
    expect(cb.onRelease).toHaveBeenCalledWith(-50, 0);
  });

  it('세로 목록 옵션(RAW_POINTER_DELTA)은 보이는 영역 밖까지 실제 거리를 알린다(기본 동작은 그대로 제한)', () => {
    // 화면 아래 끝(400) 가까이 있는 카드 손잡이: 기본은 창 높이로 제한되어 다음 자리에 닿지 못한다.
    const g = globalThis as { window?: unknown };
    const saved = g.window;
    g.window = { innerHeight: 400, innerWidth: 300 };
    try {
      const clamped = fakeHandle();
      const cbDefault = callbacks();
      createPointerDragRef(() => cbDefault)(clamped.element);
      clamped.emit('pointerdown', { pointerId: 1, clientY: 380 });
      clamped.emit('pointermove', { pointerId: 1, clientY: 520 });
      expect(cbDefault.onMove).toHaveBeenLastCalledWith(20, 0);

      const raw = fakeHandle();
      const cbRaw = callbacks();
      createPointerDragRef(() => cbRaw, RAW_POINTER_DELTA)(raw.element);
      raw.emit('pointerdown', { pointerId: 1, clientY: 380 });
      raw.emit('pointermove', { pointerId: 1, clientY: 520 });
      expect(cbRaw.onMove).toHaveBeenLastCalledWith(140, 0);
      raw.emit('pointerup', { pointerId: 1, clientY: 520 });
      expect(cbRaw.onRelease).toHaveBeenCalledWith(140, 0);
    } finally {
      g.window = saved;
    }
  });

  it('끄는 중 연결이 해제되면(언마운트) 취소하고 리스너를 모두 뗀다', () => {
    const { element, emit, count } = fakeHandle();
    const cb = callbacks();
    const ref = createPointerDragRef(() => cb, noViewport);
    ref(element);
    expect(count()).toBe(5);
    emit('pointerdown', { pointerId: 1, clientY: 0 });
    emit('pointermove', { pointerId: 1, clientY: 30 });
    ref(null);
    expect(cb.onCancel).toHaveBeenCalledTimes(1);
    expect(count()).toBe(0);
    emit('pointerup', { pointerId: 1, clientY: 30 });
    expect(cb.onRelease).not.toHaveBeenCalled();
  });

  it('DOM 요소가 아니면(네이티브 View) 아무것도 연결하지 않는다', () => {
    const ref = createPointerDragRef(() => callbacks());
    expect(() => ref({})).not.toThrow();
    expect(() => ref(null)).not.toThrow();
  });
});
