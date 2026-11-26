import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  Animated,
  PanResponder,
  type GestureResponderEvent,
  type PanResponderCallbacks,
  type PanResponderGestureState,
} from 'react-native';
import { Text } from '@/components/ui';
import { ReorderList, boundedDistance, dropTarget, measureRowHeights } from '../components/ReorderList';

afterEach(() => jest.restoreAllMocks());
it('손잡이에 연결된 드래그가 실제 행 위치를 사용해 정렬과 스크롤 잠금을 전달한다', async () => {
  const configurations: PanResponderCallbacks[] = [];
  const create = PanResponder.create;
  jest.spyOn(PanResponder, 'create').mockImplementation((config) => {
    configurations.push(config);
    return create(config);
  });
  const onMove = jest.fn(),
    onActive = jest.fn();
  await render(
    <ReorderList
      items={[{ clientKey: 'a' }, { clientKey: 'b' }]}
      label="예시"
      onMove={onMove}
      onActive={onActive}
      renderItem={(item) => <Text>{item.clientKey}</Text>}
    />,
  );
  await fireEvent(screen.getByTestId('reorder-row-a'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 50 } },
  });
  await fireEvent(screen.getByTestId('reorder-row-b'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 60, width: 300, height: 50 } },
  });
  const event = null as unknown as GestureResponderEvent;
  const gesture: PanResponderGestureState = {
    stateID: 1,
    moveX: 0,
    moveY: 60,
    x0: 0,
    y0: 0,
    dx: 0,
    dy: 60,
    vx: 0,
    vy: 0,
    numberActiveTouches: 1,
  };
  expect(configurations[0].onMoveShouldSetPanResponder?.(event, gesture)).toBe(true);
  await act(() => configurations[0].onPanResponderGrant?.(event, gesture));
  await act(() => configurations[0].onPanResponderMove?.(event, gesture));
  await act(() => configurations[0].onPanResponderRelease?.(event, gesture));
  expect(onActive.mock.calls).toEqual([[true], [false]]);
  expect(onMove).toHaveBeenCalledWith('a', 'b');
});

// 웹(react-native-web)의 onLayout은 ResizeObserver 기반이라 크기가 바뀔 때만 다시 온다.
// 순서가 바뀌거나 위 행 높이가 달라져 "위치만" 바뀐 행은 새 onLayout을 받지 못한다.
const gestureOf = (dy: number): PanResponderGestureState => ({
  stateID: 1,
  moveX: 0,
  moveY: dy,
  x0: 0,
  y0: 0,
  dx: 0,
  dy,
  vx: 0,
  vy: 0,
  numberActiveTouches: 1,
});
async function setup(keys: string[]) {
  const configurations = new Map<string, PanResponderCallbacks>();
  const create = PanResponder.create;
  let mounted = 0;
  jest.spyOn(PanResponder, 'create').mockImplementation((config) => {
    // 첫 렌더에서 만든 설정만 행에 남는다(useRef 초깃값).
    if (mounted < keys.length) configurations.set(keys[mounted++], config);
    return create(config);
  });
  const onMove = jest.fn();
  const view = (order: string[]) => (
    <ReorderList
      items={order.map((clientKey) => ({ clientKey }))}
      label="예시"
      onMove={onMove}
      onActive={jest.fn()}
      renderItem={(item) => <Text>{item.clientKey}</Text>}
    />
  );
  const result = await render(view(keys));
  const layout = (key: string, y: number, height: number) =>
    fireEvent(screen.getByTestId(`reorder-row-${key}`), 'layout', {
      nativeEvent: { layout: { x: 0, y, width: 300, height } },
    });
  const drag = async (key: string, dy: number, withMove = false) => {
    const config = configurations.get(key)!;
    const event = null as unknown as GestureResponderEvent;
    await act(() => config.onPanResponderGrant?.(event, gestureOf(dy)));
    if (withMove) await act(() => config.onPanResponderMove?.(event, gestureOf(dy)));
    await act(() => config.onPanResponderRelease?.(event, gestureOf(dy)));
  };
  return { onMove, layout, drag, rerender: (order: string[]) => result.rerender(view(order)) };
}

it('웹에서 순서가 바뀐 뒤 onLayout이 다시 오지 않아도 현재 순서 기준으로 놓을 자리를 찾는다', async () => {
  const { onMove, layout, drag, rerender } = await setup(['a', 'b', 'c']);
  await layout('a', 0, 50);
  await layout('b', 58, 50);
  await layout('c', 116, 50);
  await drag('a', 58);
  expect(onMove).toHaveBeenLastCalledWith('a', 'b');
  // 저장 후 순서 b, a, c. 크기는 그대로라 웹에서는 onLayout이 오지 않는다.
  await rerender(['b', 'a', 'c']);
  onMove.mockClear();
  // 두 번째 자리의 a를 한 칸 아래로 끌면 c 자리로 가야 한다(낡은 y=0 기준이면 b로 올라간다).
  await drag('a', 58);
  expect(onMove).toHaveBeenLastCalledWith('a', 'c');
});

it('CREATE-US-12: 화면 이동은 목록 첫·마지막 자리 밖으로 나가지 않고, 놓을 자리는 실제 이동 거리로 찾는다', async () => {
  const { onMove, layout, drag } = await setup(['a', 'b', 'c']);
  await layout('a', 0, 50);
  await layout('b', 58, 50);
  await layout('c', 116, 50);
  const setValue = jest.spyOn(Animated.Value.prototype, 'setValue');
  // 맨 위 a를 아주 멀리 아래로 끌어도 c 자리(116)까지만 움직인다.
  await drag('a', 10_000, true);
  expect(setValue.mock.calls.map(([value]) => value)).toContain(116);
  expect(setValue.mock.calls.map(([value]) => value)).not.toContain(10_000);
  expect(onMove).toHaveBeenLastCalledWith('a', 'c');
  // 맨 아래 c를 아주 멀리 위로 끌면 a 자리로 간다.
  await drag('c', -10_000, true);
  expect(onMove).toHaveBeenLastCalledWith('c', 'a');
  // 맨 위 a를 위로 끌면 갈 곳이 없어 순서를 바꾸지 않는다(제자리 onMove도 부르지 않는다).
  onMove.mockClear();
  await drag('a', -10_000, true);
  expect(onMove).not.toHaveBeenCalled();
});

it('CREATE-US-12: 키 큰 행도 화면 이동은 목록 안에 머물면서 첫 자리·마지막 자리로 옮겨진다', async () => {
  const { onMove, layout, drag } = await setup(['a', 'b', 'c']);
  // b가 아주 크다: a 0~50, b 58~358(중심 208), c 366~416(중심 391)
  await layout('a', 0, 50);
  await layout('b', 58, 300);
  await layout('c', 366, 50);
  const setValue = jest.spyOn(Animated.Value.prototype, 'setValue');
  // 위로: 제한 범위는 -58까지라 제한된 값(208-58=150)으로 찾으면 a 중심(25)보다 b 자신에 가까워 옮길 수 없었다.
  await drag('b', -200, true);
  const up = setValue.mock.calls.map(([value]) => value);
  expect(up).toContain(-58);
  expect(Math.min(...up)).toBeGreaterThanOrEqual(-58);
  expect(onMove).toHaveBeenLastCalledWith('b', 'a');
  // 아래로: 제한 범위는 +58까지. 실제 거리 +200이면 c 자리로 간다.
  setValue.mockClear();
  await drag('b', 200, true);
  const down = setValue.mock.calls.map(([value]) => value);
  expect(down).toContain(58);
  expect(Math.max(...down)).toBeLessThanOrEqual(58);
  expect(onMove).toHaveBeenLastCalledWith('b', 'c');
  // 조금만 끌면 제자리(순서 그대로)
  onMove.mockClear();
  await drag('b', 30, true);
  expect(onMove).not.toHaveBeenCalled();
});

it('CREATE-US-12: 끄는 중 제스처가 취소되면 순서를 바꾸지 않고 스크롤 잠금을 한 번만 푼다', async () => {
  const configurations: PanResponderCallbacks[] = [];
  const create = PanResponder.create;
  jest.spyOn(PanResponder, 'create').mockImplementation((config) => {
    configurations.push(config);
    return create(config);
  });
  const onMove = jest.fn(),
    onActive = jest.fn();
  await render(
    <ReorderList items={[{ clientKey: 'a' }, { clientKey: 'b' }]} label="예시" onMove={onMove} onActive={onActive} />,
  );
  const event = null as unknown as GestureResponderEvent;
  await act(() => configurations[0].onPanResponderGrant?.(event, gestureOf(0)));
  await act(() => configurations[0].onPanResponderMove?.(event, gestureOf(60)));
  await act(() => configurations[0].onPanResponderTerminate?.(event, gestureOf(60)));
  // 늦게 온 놓기는 무시한다
  await act(() => configurations[0].onPanResponderRelease?.(event, gestureOf(60)));
  expect(onMove).not.toHaveBeenCalled();
  expect(onActive.mock.calls).toEqual([[true], [false]]);
});

it('CREATE-US-12: 네이티브 손잡이는 PanResponder를 쓰고, 행 본문에는 끌기 제스처가 없다', async () => {
  await render(
    <ReorderList
      items={[{ clientKey: 'a' }, { clientKey: 'b' }]}
      label="예시"
      handle="grip"
      onMove={jest.fn()}
      onActive={jest.fn()}
    />,
  );
  expect(screen.getByTestId('reorder-handle-a').props.onResponderGrant).toEqual(expect.any(Function));
  expect(screen.getByTestId('reorder-row-a').props.onResponderGrant).toBeUndefined();
});

it('위 카드 높이가 바뀌어 아래 카드 위치만 밀려도 높이가 다른 카드 사이 자리를 맞게 찾는다', async () => {
  const { onMove, layout, drag } = await setup(['a', 'b', 'c']);
  await layout('a', 0, 50);
  await layout('b', 58, 50);
  await layout('c', 116, 50);
  // a 카드가 200으로 커지면 a만 onLayout을 받고 b·c의 y는 웹에서 갱신되지 않는다.
  await layout('a', 0, 200);
  // 실제 b 중심은 208+25=233. 위로 150 끌면 83이라 a 중심(100)에 가깝다.
  // 낡은 y=58 기준이면 83-150=-67로 계산해 b 자리에 그대로 남는다.
  await drag('b', -150);
  expect(onMove).toHaveBeenLastCalledWith('b', 'a');
});

it('CREATE-US-12 웹 회귀: 순서 변경 뒤 onLayout이 0 높이로 와도 두 번째 끌기가 움직이고 놓인다', async () => {
  const { onMove, layout, drag, rerender } = await setup(['a', 'b', 'c']);
  await layout('a', 0, 76);
  await layout('b', 84, 76);
  await layout('c', 168, 76);
  await drag('a', 106, true);
  expect(onMove).toHaveBeenLastCalledWith('a', 'b');
  await rerender(['b', 'a', 'c']);
  // react-native-web ResizeObserver가 0 높이를 보내도 기존 높이를 덮어쓰지 않는다.
  await layout('a', 0, 0);
  await layout('b', 0, 0);
  onMove.mockClear();
  const setValue = jest.spyOn(Animated.Value.prototype, 'setValue');
  await drag('a', 106, true);
  expect(setValue.mock.calls.map(([value]) => value)).toContain(84);
  expect(onMove).toHaveBeenLastCalledWith('a', 'c');
});

it('CREATE-US-12 웹: 끌기 시작 때 행 DOM의 양수 높이만 다시 읽어 낡은·누락된 높이를 바로잡는다', () => {
  const layouts = new Map<string, { height: number }>([
    ['a', { height: 76 }],
    ['b', { height: 76 }],
  ]);
  const nodes = new Map<string, unknown>([
    ['a', { offsetHeight: 76 }],
    ['b', { offsetHeight: 0, getBoundingClientRect: () => ({ height: 0 }) }], // 숨겨진 행: 기존 값 유지
    ['c', { offsetHeight: 0, getBoundingClientRect: () => ({ height: 76 }) }], // onLayout 누락 행
    ['d', {}], // 네이티브 인스턴스: 측정하지 않음
  ]);
  const order = ['b', 'a', 'c'];
  expect(boundedDistance(layouts, order, 'a', 106)).toBe(0); // c 높이 누락이면 움직이지 않던 상태
  measureRowHeights(nodes, [...order, 'd'], layouts);
  expect(layouts.get('b')).toEqual({ height: 76 });
  expect(layouts.get('c')).toEqual({ height: 76 });
  expect(layouts.has('d')).toBe(false);
  expect(boundedDistance(layouts, order, 'a', 106)).toBe(84);
  expect(dropTarget(layouts, order, 'a', 106)).toBe('c');
});
