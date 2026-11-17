import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  PanResponder,
  type GestureResponderEvent,
  type PanResponderCallbacks,
  type PanResponderGestureState,
} from 'react-native';
import { Text } from '@/components/ui';
import { ReorderList } from '../components/ReorderList';

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
