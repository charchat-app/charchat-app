// CREATE-US-05 프리셋 편집기 (제어 컴포넌트)
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import {
  Animated,
  PanResponder,
  type GestureResponderEvent,
  type PanResponderCallbacks,
  type PanResponderGestureState,
} from 'react-native';

import { Spacing } from '@/constants/theme';
import { MAX_PRESET_TEXT_LENGTH } from '@/shared/story-types/presets';

import { LONG_PRESS_MS, UNCHANGED_ORDER_FALLBACK_MS } from '../components/useDragList';

import { UserProfilePresetEditor, type PresetImageChoice } from '../components/UserProfilePresetEditor';
import type { PresetValues } from '../userProfilePresetRules';

const p = (key: string, name: string, detail = '', extra: Partial<PresetValues> = {}): PresetValues => ({
  key,
  name,
  detail,
  imageId: 1,
  photoUrl: null,
  ...extra,
});

type HarnessProps = {
  initial: PresetValues[];
  characterNames?: string[];
  onSelectImage?: (key: string) => Promise<PresetImageChoice | null | undefined>;
  editable?: boolean;
  spy?: (values: PresetValues[]) => void;
  onDragActiveChange?: (active: boolean) => void;
  /** 호스트가 받은 변경을 다르게 적용하는 경우(그사이 다른 변경이 끼어드는 등)를 흉내 낸다. */
  mapUpdate?: (update: Updater) => Updater;
};

type Updater = (presets: PresetValues[]) => PresetValues[];

/** 호스트처럼 값을 들고 있다가 "이전 값 → 새 값" 함수를 적용한다. */
function Harness({
  initial,
  characterNames,
  onSelectImage,
  editable,
  spy,
  onDragActiveChange,
  mapUpdate,
}: HarnessProps) {
  const [values, setValues] = useState(initial);
  spy?.(values);
  return (
    <UserProfilePresetEditor
      presets={values}
      characterNames={characterNames}
      onChange={(update) => setValues(mapUpdate ? mapUpdate(update) : update)}
      onSelectImage={onSelectImage}
      editable={editable}
      onDragActiveChange={onDragActiveChange}
    />
  );
}

// ---- 끌어서 순서 바꾸기: 실제 PanResponder 설정의 콜백을 그대로 부른다 ----

const GAP = Spacing.three;
const noEvent = null as unknown as GestureResponderEvent;
const gesture = (dy: number, dx = 0): PanResponderGestureState => ({
  stateID: 1,
  moveX: dx,
  moveY: dy,
  x0: 0,
  y0: 0,
  dx,
  dy,
  vx: 0,
  vy: 0,
  numberActiveTouches: 1,
});

/** 콜백이 없으면 조용히 건너뛰지 않고 실패한다. */
function required<T>(fn: T | undefined, name: string): T {
  if (fn === undefined) throw new Error(`PanResponder 콜백 ${name}이(가) 없다`);
  return fn;
}

/** PanResponder.create에 넘어간 설정을 만들어진 순서대로 모은다. */
function capturePanResponders() {
  const configs: PanResponderCallbacks[] = [];
  const create = PanResponder.create;
  jest.spyOn(PanResponder, 'create').mockImplementation((config) => {
    configs.push(config);
    return create(config);
  });
  return configs;
}

/** 카드 높이를 알려 준다(카드마다 높이가 다를 수 있다). */
async function layoutCards(heights: Record<string, number>) {
  for (const [key, height] of Object.entries(heights)) {
    await fireEvent(screen.getByTestId(`preset-item-${key}`), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height } },
    });
  }
}

/** 손잡이를 누르고(start → grant) 길게 기다려 드래그를 시작한다. */
async function longPress(config: PanResponderCallbacks) {
  expect(required(config.onStartShouldSetPanResponder, 'onStartShouldSetPanResponder')(noEvent, gesture(0))).toBe(true);
  await act(async () => {
    required(config.onPanResponderGrant, 'onPanResponderGrant')(noEvent, gesture(0));
  });
  await act(async () => {
    jest.advanceTimersByTime(LONG_PRESS_MS);
  });
}

async function moveTo(config: PanResponderCallbacks, dy: number) {
  await act(async () => {
    required(config.onPanResponderMove, 'onPanResponderMove')(noEvent, gesture(dy));
  });
}

async function release(config: PanResponderCallbacks, dy: number) {
  await act(async () => {
    required(config.onPanResponderRelease, 'onPanResponderRelease')(noEvent, gesture(dy));
  });
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
}

/** 끝나지 않은 이미지 선택을 기다리지 않고 누른다. 핸들러 Promise는 테스트가 직접 끝낸다. */
async function pressPending(label: string) {
  await act(async () => {
    void fireEvent.press(screen.getByLabelText(label));
  });
}

describe('CREATE-US-05 프리셋 편집기', () => {
  it('AC02: 비어 있으면 빈 상태 안내와 0/5를 보여 주고 추가할 수 있다', async () => {
    await render(<Harness initial={[]} />);
    expect(screen.getByText('아직 추천 프로필이 없어요.')).toBeTruthy();
    expect(screen.getByText('0/5개')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('+ 프로필 추가'));
    expect(screen.getByLabelText('프로필 1 이름')).toBeTruthy();
    expect(screen.getByText('1/5개')).toBeTruthy();
  });

  it('AC02: 5개가 되면 추가 버튼이 막힌다', async () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((k) => p(k, k));
    await render(<Harness initial={five} />);
    expect(screen.getByLabelText('프로필은 최대 5개예요').props.accessibilityState.disabled).toBe(true);
  });

  it('AC01: 이름·상세 입력은 원문 그대로 반영되고 {{user}}도 치환하지 않는다', async () => {
    const seen: PresetValues[][] = [];
    await render(<Harness initial={[p('a', '')]} spy={(v) => seen.push(v)} />);
    await fireEvent.changeText(screen.getByLabelText('프로필 1 이름'), ' 민수 ');
    await fireEvent.changeText(screen.getByLabelText('프로필 1 상세'), '{{user}}의 친구');
    expect(seen[seen.length - 1][0]).toMatchObject({ name: ' 민수 ', detail: '{{user}}의 친구' });
  });

  it('입력은 "이전 값 → 새 값" 함수로 전달해 최신 상태 위에 반영된다', async () => {
    const onChange = jest.fn();
    await render(<UserProfilePresetEditor presets={[p('a', '')]} onChange={onChange} />);
    await fireEvent.changeText(screen.getByLabelText('프로필 1 이름'), '가');
    const update = onChange.mock.calls[0][0] as (v: PresetValues[]) => PresetValues[];
    expect(update([{ ...p('a', ''), id: '11' }])[0]).toMatchObject({ key: 'a', id: '11', name: '가' });
  });

  it('AC05: 이름+상세 합계를 원문 기준으로 실시간 보여 준다', async () => {
    await render(<Harness initial={[p('a', ' 가', '{{user}}\n')]} />);
    expect(screen.getByText(`11 / ${MAX_PRESET_TEXT_LENGTH}자`)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('프로필 1 상세'), '😀😀');
    expect(screen.getByText(`4 / ${MAX_PRESET_TEXT_LENGTH}자`)).toBeTruthy();
  });

  it('AC05: 합계가 1000이면 안내가 없고 1001이면 안내가 뜨되 입력은 막지 않는다', async () => {
    const seen: PresetValues[][] = [];
    await render(<Harness initial={[p('a', '가', '나'.repeat(999))]} spy={(v) => seen.push(v)} />);
    expect(screen.getByText('1000 / 1000자')).toBeTruthy();
    expect(screen.queryByText('이름과 상세를 합쳐 1001자예요. 1000자까지 쓸 수 있어요.')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('프로필 1 상세'), '나'.repeat(1000));
    expect(screen.getByText('1001 / 1000자')).toBeTruthy();
    expect(screen.getByText('이름과 상세를 합쳐 1001자예요. 1000자까지 쓸 수 있어요.')).toBeTruthy();
    expect(seen[seen.length - 1][0].detail).toHaveLength(1000);
  });

  it('AC03: 플레이하는 유저 이름 사용하기를 고르면 이름에 {{user}}가 그대로 들어가고 미완성 안내가 없다', async () => {
    const seen: PresetValues[][] = [];
    await render(<Harness initial={[p('a', '')]} spy={(v) => seen.push(v)} />);
    expect(screen.getByText('이름을 입력하거나 ‘플레이하는 유저 이름 사용하기’를 선택해 주세요.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('프로필 1 플레이하는 유저 이름 사용하기'));
    expect(seen[seen.length - 1][0].name).toBe('{{user}}');
    expect(screen.getByLabelText('프로필 1 플레이하는 유저 이름 사용하기').props.accessibilityState.selected).toBe(
      true,
    );
    expect(screen.queryByText('이름을 입력하거나 ‘플레이하는 유저 이름 사용하기’를 선택해 주세요.')).toBeNull();
    expect(screen.getByLabelText('프로필 1 이름').props.editable).toBe(false);
    // 다시 누르면 해제되어 이름을 직접 쓸 수 있다
    await fireEvent.press(screen.getByLabelText('프로필 1 플레이하는 유저 이름 사용하기'));
    expect(seen[seen.length - 1][0].name).toBe('');
    expect(screen.getByLabelText('프로필 1 이름').props.editable).toBe(true);
  });

  it('AC04: 등장 캐릭터와 같은 이름이면 안내가 뜬다', async () => {
    await render(<Harness initial={[p('a', 'ha rin')]} characterNames={['Ha Rin']} />);
    expect(
      screen.getByText("등장 캐릭터 'Ha Rin'와 같은 이름이에요. 대소문자와 띄어쓰기는 구분하지 않아요."),
    ).toBeTruthy();
  });

  it('AC04: 직접 지은 이름이 겹치면 뒤쪽 항목에 중복 안내가 뜬다', async () => {
    await render(<Harness initial={[p('a', 'Min'), p('b', 'min')]} />);
    expect(screen.getByText("'Min'와 같은 이름이에요. 대소문자와 띄어쓰기는 구분하지 않아요.")).toBeTruthy();
  });

  it('AC04: 앞뒤 공백은 다듬지 않고 안내만 띄운다', async () => {
    await render(<Harness initial={[p('a', ' 민수')]} />);
    expect(screen.getByText('이름 앞뒤에 공백이 있어요. 공백을 지워 주세요.')).toBeTruthy();
    expect(screen.getByLabelText('프로필 1 이름').props.value).toBe(' 민수');
  });

  it('AC04: {{user}}가 반복돼도 안내가 없다', async () => {
    await render(<Harness initial={[p('a', '{{user}}'), p('b', '{{user}}')]} characterNames={['{{user}}']} />);
    expect(screen.queryByText(/같은 이름이에요/)).toBeNull();
  });

  it('AC03·AC06: 이미지가 없으면 이미지 안내가 뜬다', async () => {
    await render(<Harness initial={[p('a', '가', '', { imageId: null })]} onSelectImage={jest.fn()} />);
    expect(screen.getByText('이미지를 선택해 주세요.')).toBeTruthy();
  });

  it('AC07: 삭제하면 해당 프로필만 사라진다', async () => {
    await render(<Harness initial={[p('a', '가'), p('b', '나')]} />);
    await fireEvent.press(screen.getByLabelText('프로필 1 삭제'));
    expect(screen.queryByDisplayValue('가')).toBeNull();
    expect(screen.getByDisplayValue('나')).toBeTruthy();
  });

  it('AC08: 위·아래 버튼으로 순서를 바꾸고 가장자리 버튼은 막힌다', async () => {
    const seen: PresetValues[][] = [];
    await render(<Harness initial={[p('a', '가'), p('b', '나')]} spy={(v) => seen.push(v)} />);
    expect(screen.getByLabelText('프로필 1 위로 이동').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('프로필 2 아래로 이동').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('프로필 1 아래로 이동'));
    expect(seen[seen.length - 1].map((x) => x.key)).toEqual(['b', 'a']);
    expect(screen.getByLabelText('프로필 1 이름').props.value).toBe('나');
  });

  it('AC03: 이미지 선택은 imageId와 표시 주소를 함께 지정하고 취소(undefined)는 그대로다', async () => {
    const seen: PresetValues[][] = [];
    const onSelectImage = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ imageId: 42, photoUrl: 'https://img/42.png' });
    await render(
      <Harness
        initial={[p('a', '가', '', { imageId: null })]}
        onSelectImage={onSelectImage}
        spy={(v) => seen.push(v)}
      />,
    );
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('프로필 1 이미지 선택'));
    });
    expect(onSelectImage).toHaveBeenCalledWith('a');
    expect(seen[seen.length - 1][0]).toMatchObject({ imageId: null, photoUrl: null });
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('프로필 1 이미지 선택'));
    });
    expect(seen[seen.length - 1][0]).toMatchObject({ imageId: 42, photoUrl: 'https://img/42.png' });
    await fireEvent.press(screen.getByLabelText('프로필 1 이미지 해제'));
    expect(seen[seen.length - 1][0]).toMatchObject({ imageId: null, photoUrl: null });
  });

  it('유저 이름 토글은 그려진 시점이 아니라 최신 값 기준으로 계산한다', async () => {
    const onChange = jest.fn();
    await render(<UserProfilePresetEditor presets={[p('a', '')]} onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText('프로필 1 플레이하는 유저 이름 사용하기'));
    const update = onChange.mock.calls[0][0] as (v: PresetValues[]) => PresetValues[];
    // 화면은 이름이 빈 상태로 그려졌지만, 그 사이 최신 값은 이미 {{user}}다 → 토글은 끈다
    expect(update([p('a', '{{user}}')])[0].name).toBe('');
    expect(update([p('a', '')])[0].name).toBe('{{user}}');
  });

  it('이미지 선택이 늦게 끝나도 더 나중에 고른 이미지를 덮어쓰지 않는다', async () => {
    const seen: PresetValues[][] = [];
    const resolvers: ((v: PresetImageChoice | undefined) => void)[] = [];
    const onSelectImage = jest.fn(
      () => new Promise<PresetImageChoice | undefined>((resolve) => resolvers.push(resolve)),
    );
    await render(
      <Harness
        initial={[p('a', '가', '', { imageId: null })]}
        onSelectImage={onSelectImage}
        spy={(v) => seen.push(v)}
      />,
    );
    await pressPending('프로필 1 이미지 선택');
    await pressPending('프로필 1 이미지 선택');
    expect(resolvers).toHaveLength(2);
    await act(async () => {
      resolvers[1]({ imageId: 2, photoUrl: 'https://img/2.png' });
    });
    await act(async () => {
      resolvers[0]({ imageId: 1, photoUrl: 'https://img/1.png' });
    });
    expect(seen[seen.length - 1][0]).toMatchObject({ imageId: 2, photoUrl: 'https://img/2.png' });
  });

  it('이미지 선택 중에 해제하면 늦게 끝난 선택이 해제를 되돌리지 않는다', async () => {
    const seen: PresetValues[][] = [];
    let resolvePick: (v: PresetImageChoice | undefined) => void = () => undefined;
    const onSelectImage = jest.fn(
      () =>
        new Promise<PresetImageChoice | undefined>((resolve) => {
          resolvePick = resolve;
        }),
    );
    await render(
      <Harness
        initial={[p('a', '가', '', { imageId: 3, photoUrl: 'https://img/3.png' })]}
        onSelectImage={onSelectImage}
        spy={(v) => seen.push(v)}
      />,
    );
    await pressPending('프로필 1 이미지 선택');
    await pressPending('프로필 1 이미지 해제');
    expect(seen[seen.length - 1][0]).toMatchObject({ imageId: null, photoUrl: null });
    await act(async () => {
      resolvePick({ imageId: 9, photoUrl: 'https://img/9.png' });
    });
    expect(seen[seen.length - 1][0]).toMatchObject({ imageId: null, photoUrl: null });
  });

  it('지난 선택의 실패는 더 나중 선택의 결과를 가리지 않는다', async () => {
    const seen: PresetValues[][] = [];
    const rejecters: ((e: Error) => void)[] = [];
    const resolvers: ((v: PresetImageChoice | undefined) => void)[] = [];
    const onSelectImage = jest.fn(
      () =>
        new Promise<PresetImageChoice | undefined>((resolve, reject) => {
          resolvers.push(resolve);
          rejecters.push(reject);
        }),
    );
    await render(
      <Harness
        initial={[p('a', '가', '', { imageId: null })]}
        onSelectImage={onSelectImage}
        spy={(v) => seen.push(v)}
      />,
    );
    await pressPending('프로필 1 이미지 선택');
    await pressPending('프로필 1 이미지 선택');
    await act(async () => {
      resolvers[1]({ imageId: 5, photoUrl: null });
    });
    await act(async () => {
      rejecters[0](new Error('late'));
    });
    expect(screen.queryByText('이미지를 불러오지 못했어요. 다시 시도해 주세요.')).toBeNull();
    expect(seen[seen.length - 1][0].imageId).toBe(5);
  });

  it('이미지 선택 콜백이 없으면 선택 버튼을 만들지 않는다(업로드를 만들지 않음)', async () => {
    await render(<Harness initial={[p('a', '가')]} />);
    expect(screen.queryByLabelText('프로필 1 이미지 선택')).toBeNull();
  });

  it('이미지 선택이 실패하면 오류 안내를 띄우고 값은 그대로다', async () => {
    const seen: PresetValues[][] = [];
    const onSelectImage = jest.fn().mockRejectedValue(new Error('x'));
    await render(<Harness initial={[p('a', '가')]} onSelectImage={onSelectImage} spy={(v) => seen.push(v)} />);
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('프로필 1 이미지 선택'));
    });
    expect(screen.getByText('이미지를 불러오지 못했어요. 다시 시도해 주세요.')).toBeTruthy();
    expect(seen[seen.length - 1][0].imageId).toBe(1);
  });

  it('편집 불가 상태에서는 입력·버튼이 모두 막힌다', async () => {
    await render(
      <Harness
        initial={[p('a', '가', '', { imageId: 3, photoUrl: 'https://img/3.png' })]}
        editable={false}
        onSelectImage={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('프로필 1 이름').props.editable).toBe(false);
    for (const label of [
      '+ 프로필 추가',
      '프로필 1 삭제',
      '프로필 1 이미지 선택',
      '프로필 1 이미지 해제',
      '프로필 1 플레이하는 유저 이름 사용하기',
    ]) {
      expect(screen.getByLabelText(label).props.accessibilityState.disabled).toBe(true);
    }
  });
});

describe('CREATE-US-05-AC08 프리셋 끌어서 순서 바꾸기', () => {
  // 높이가 서로 다른 세 카드. 가운데 b가 가장 크다.
  // 중심: a=50, b=100+GAP+150, c=100+GAP+300+GAP+40
  const HEIGHTS = { a: 100, b: 300, c: 80 };
  const centerA = 50;
  const centerB = 100 + GAP + 150;
  const centerC = 100 + GAP + 300 + GAP + 40;
  const three = () => [p('a', '가'), p('b', '나'), p('c', '다')];

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function setup(extra: Partial<HarnessProps> = {}) {
    const configs = capturePanResponders();
    const seen: PresetValues[][] = [];
    const onDragActiveChange = jest.fn();
    const element = (more: Partial<HarnessProps> = {}) => (
      <Harness
        initial={three()}
        spy={(v) => seen.push(v)}
        onDragActiveChange={onDragActiveChange}
        {...extra}
        {...more}
      />
    );
    await render(element());
    await layoutCards(HEIGHTS);
    // 손잡이는 a, b, c 순서로 그려지며 PanResponder도 그 순서로 하나씩 만들어진다.
    expect(configs).toHaveLength(3);
    const config = { a: configs[0], b: configs[1], c: configs[2] };
    const order = () => seen[seen.length - 1].map((x) => x.key);
    /** 같은 호스트를 props만 바꿔 다시 그린다(값은 유지). */
    const rerender = async (more: Partial<HarnessProps>) => {
      await act(async () => {
        await screen.rerender(element(more));
      });
    };
    return { config, order, onDragActiveChange, rerender };
  }

  /** 끝난 제스처에 늦게 도착한 이동·놓기·취소 이벤트 */
  async function lateEvents(config: PanResponderCallbacks, dy: number) {
    await moveTo(config, dy);
    await release(config, dy);
    await act(async () => {
      required(config.onPanResponderTerminate, 'onPanResponderTerminate')(noEvent, gesture(dy));
    });
  }

  /** Animated.Value에 직접 넣은 값을 기록한다(놓은 카드의 손가락 위치 → 새 자리 보정 확인용). */
  function recordSetValue() {
    return jest.spyOn(Animated.Value.prototype, 'setValue');
  }

  it('길게 누르는 중에 편집 불가가 되면 드래그가 시작되지 않고 늦은 이벤트도 순서를 바꾸지 않는다', async () => {
    const { config, order, onDragActiveChange, rerender } = await setup();
    await act(async () => {
      required(config.a.onPanResponderGrant, 'onPanResponderGrant')(noEvent, gesture(0));
    });
    await rerender({ editable: false });
    await act(async () => {
      jest.advanceTimersByTime(LONG_PRESS_MS * 2);
    });
    expect(onDragActiveChange).not.toHaveBeenCalled();
    await rerender({ editable: true });
    await lateEvents(config.a, centerB - centerA);
    expect(order()).toEqual(['a', 'b', 'c']);
    expect(onDragActiveChange).not.toHaveBeenCalled();
  });

  it('끄는 중에 편집 불가가 되면 바로 끌기를 취소해 한 번만 잠금을 풀고 늦은 이벤트는 무시한다', async () => {
    const { config, order, onDragActiveChange, rerender } = await setup();
    await longPress(config.a);
    await moveTo(config.a, centerB - centerA);
    await rerender({ editable: false });
    expect(onDragActiveChange.mock.calls).toEqual([[true], [false]]);
    await rerender({ editable: true });
    await lateEvents(config.a, centerB - centerA);
    expect(order()).toEqual(['a', 'b', 'c']);
    expect(onDragActiveChange.mock.calls).toEqual([[true], [false]]);
  });

  it('길게 누르는 중에 그 카드가 지워지면 드래그가 시작되지 않는다', async () => {
    const { config, order, onDragActiveChange } = await setup();
    await act(async () => {
      required(config.a.onPanResponderGrant, 'onPanResponderGrant')(noEvent, gesture(0));
    });
    await fireEvent.press(screen.getByLabelText('프로필 1 삭제'));
    await act(async () => {
      jest.advanceTimersByTime(LONG_PRESS_MS * 2);
    });
    expect(onDragActiveChange).not.toHaveBeenCalled();
    await lateEvents(config.a, centerC - centerA);
    expect(order()).toEqual(['b', 'c']);
    expect(onDragActiveChange).not.toHaveBeenCalled();
  });

  it('끄는 중에 그 카드가 지워지면 끌기를 취소해 한 번만 잠금을 풀고 늦은 이벤트는 무시한다', async () => {
    const { config, order, onDragActiveChange } = await setup();
    await longPress(config.a);
    await moveTo(config.a, centerC - centerA);
    await fireEvent.press(screen.getByLabelText('프로필 1 삭제'));
    expect(onDragActiveChange.mock.calls).toEqual([[true], [false]]);
    await lateEvents(config.a, centerC - centerA);
    expect(order()).toEqual(['b', 'c']);
    expect(onDragActiveChange.mock.calls).toEqual([[true], [false]]);
  });

  it('놓은 순서가 그대로 반영되면 놓은 카드만 손가락 위치에서 새 자리로 미끄러진다', async () => {
    const { config, order } = await setup();
    const setValue = recordSetValue();
    const dy = centerB - centerA;
    await longPress(config.a);
    await moveTo(config.a, dy);
    setValue.mockClear();
    await release(config.a, dy);
    expect(order()).toEqual(['b', 'a', 'c']);
    // 손가락 위치(dy)와 새 자리(b 높이 + 간격)의 차이에서 출발한다
    expect(setValue.mock.calls).toContainEqual([dy - (HEIGHTS.b + GAP)]);
  });

  it('놓는 사이 대상 카드가 지워져 순서가 예상과 다르면 남은 거리 보정 없이 제자리로 돌린다', async () => {
    let dropTargetDeleted = false;
    const { config, order, onDragActiveChange } = await setup({
      // 놓을 때의 변경이 도착하기 전에 대상 카드 b가 지워진 상황
      mapUpdate: (update) => (dropTargetDeleted ? (v) => update(v.filter((x) => x.key !== 'b')) : update),
    });
    const setValue = recordSetValue();
    const dy = centerB - centerA;
    await longPress(config.a);
    await moveTo(config.a, dy);
    setValue.mockClear();
    dropTargetDeleted = true;
    await release(config.a, dy);
    expect(order()).toEqual(['a', 'c']);
    expect(setValue.mock.calls).not.toContainEqual([dy - (HEIGHTS.b + GAP)]);
    expect(onDragActiveChange.mock.calls).toEqual([[true], [false]]);
  });

  it('지난 놓기의 되돌림 타이머가 늦게 돌아도 새로 끄는 카드를 건드리지 않는다', async () => {
    let ignoreMove = true;
    const { config, order } = await setup({
      // 첫 놓기는 호스트가 반영하지 않는다(순서 그대로 → 되돌림 타이머가 걸린다)
      mapUpdate: (update) => (ignoreMove ? (v) => v : update),
    });
    // 되돌림 타이머만 붙잡아 두었다가 나중에 직접 부른다(JS가 바빠 타이머가 늦게 도는 상황).
    const fallbacks: (() => void)[] = [];
    const realSetTimeout = globalThis.setTimeout;
    jest.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      if (ms === UNCHANGED_ORDER_FALLBACK_MS) {
        fallbacks.push(fn);
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }
      return realSetTimeout(fn, ms);
    }) as typeof setTimeout);
    const dy = centerB - centerA;
    await longPress(config.a);
    await moveTo(config.a, dy);
    await act(async () => {
      required(config.a.onPanResponderRelease, 'onPanResponderRelease')(noEvent, gesture(dy));
    });
    expect(order()).toEqual(['a', 'b', 'c']);
    expect(fallbacks).toHaveLength(1);

    ignoreMove = false;
    await longPress(config.a);
    await moveTo(config.a, dy);
    const spring = jest.spyOn(Animated, 'spring');
    await act(async () => {
      fallbacks[0]();
    });
    expect(spring).not.toHaveBeenCalled();
    spring.mockRestore();

    const setValue = recordSetValue();
    await act(async () => {
      required(config.a.onPanResponderRelease, 'onPanResponderRelease')(noEvent, gesture(dy));
    });
    expect(order()).toEqual(['b', 'a', 'c']);
    expect(setValue.mock.calls).toContainEqual([dy - (HEIGHTS.b + GAP)]);
  });

  it('전용 손잡이에만 끌기 제스처가 붙고 카드 본문에는 붙지 않는다', async () => {
    await setup();
    const handle = screen.getByTestId('preset-drag-handle-a');
    expect(handle.props.onResponderGrant).toEqual(expect.any(Function));
    expect(handle.props.accessibilityLabel).toBe('프로필 1 순서 손잡이(길게 눌러 끌기)');
    expect(screen.getByTestId('preset-item-a').props.onResponderGrant).toBeUndefined();
  });

  it('손잡이를 길게 누른 뒤 세로로 끌어 놓으면 그 자리로 옮기고 호스트에 드래그 시작·끝을 알린다', async () => {
    const { config, order, onDragActiveChange } = await setup();
    await longPress(config.a);
    expect(onDragActiveChange.mock.calls).toEqual([[true]]);
    await moveTo(config.a, centerB - centerA);
    await release(config.a, centerB - centerA);
    expect(order()).toEqual(['b', 'a', 'c']);
    expect(onDragActiveChange.mock.calls).toEqual([[true], [false]]);
    // 이름·상세 등 값은 카드와 함께 움직인다
    expect(screen.getByLabelText('프로필 1 이름').props.value).toBe('나');
    expect(screen.getByLabelText('프로필 2 이름').props.value).toBe('가');
  });

  it('카드 높이가 달라도 실제 높이로 놓을 자리를 계산한다', async () => {
    const { config, order } = await setup();
    // 높이가 모두 같다고 보면 a 자리로 가지만, 실제로는 큰 b 카드의 중심이 더 가깝다.
    const dy = -300;
    expect(Math.abs(centerC + dy - centerB)).toBeLessThan(Math.abs(centerC + dy - centerA));
    await longPress(config.c);
    await moveTo(config.c, dy);
    await release(config.c, dy);
    expect(order()).toEqual(['a', 'c', 'b']);
  });

  it('끄는 중에 제스처가 취소되면 순서를 바꾸지 않고 드래그 끝을 알린다', async () => {
    const { config, order, onDragActiveChange } = await setup();
    await longPress(config.a);
    await moveTo(config.a, centerB - centerA);
    await act(async () => {
      required(config.a.onPanResponderTerminate, 'onPanResponderTerminate')(noEvent, gesture(centerB - centerA));
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(order()).toEqual(['a', 'b', 'c']);
    expect(onDragActiveChange.mock.calls).toEqual([[true], [false]]);
  });

  it('제자리 근처에 놓으면 순서가 그대로다', async () => {
    const { config, order, onDragActiveChange } = await setup();
    await longPress(config.b);
    await moveTo(config.b, 20);
    await release(config.b, 20);
    expect(order()).toEqual(['a', 'b', 'c']);
    expect(onDragActiveChange.mock.calls).toEqual([[true], [false]]);
  });

  it('길게 누르기 전에 떼거나 먼저 움직이면(스크롤) 드래그가 시작되지 않는다', async () => {
    const { config, order, onDragActiveChange } = await setup();
    // 바로 뗌
    await act(async () => {
      required(config.a.onPanResponderGrant, 'onPanResponderGrant')(noEvent, gesture(0));
    });
    await release(config.a, centerB - centerA);
    // 길게 누르기 전에 움직임 → 기다려도 드래그가 되지 않는다
    await act(async () => {
      required(config.a.onPanResponderGrant, 'onPanResponderGrant')(noEvent, gesture(0));
    });
    await moveTo(config.a, 40);
    await act(async () => {
      jest.advanceTimersByTime(LONG_PRESS_MS * 2);
    });
    await moveTo(config.a, centerB - centerA);
    await release(config.a, centerB - centerA);
    expect(order()).toEqual(['a', 'b', 'c']);
    expect(onDragActiveChange).not.toHaveBeenCalled();
  });

  it('드래그 중이면 스크롤이 제스처를 가져가지 못하고, 드래그 전에는 가져갈 수 있다', async () => {
    const { config } = await setup();
    const request = required(config.a.onPanResponderTerminationRequest, 'onPanResponderTerminationRequest');
    expect(request(noEvent, gesture(0))).toBe(true);
    await longPress(config.a);
    expect(request(noEvent, gesture(0))).toBe(false);
    await release(config.a, 0);
  });

  it('편집 불가 상태에서는 손잡이 제스처를 받지 않고 순서 버튼·접근성 동작도 막힌다', async () => {
    const { config, order, onDragActiveChange } = await setup({ editable: false });
    const start = required(config.a.onStartShouldSetPanResponder, 'onStartShouldSetPanResponder');
    expect(start(noEvent, gesture(0))).toBe(false);
    expect(screen.getByLabelText('프로필 1 아래로 이동').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('프로필 2 위로 이동').props.accessibilityState.disabled).toBe(true);
    await fireEvent(screen.getByTestId('preset-drag-handle-a'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(order()).toEqual(['a', 'b', 'c']);
    expect(onDragActiveChange).not.toHaveBeenCalled();
  });

  it('끌기가 어려우면 손잡이의 접근성 동작(위로/아래로)으로 한 칸씩 옮긴다', async () => {
    const { order } = await setup();
    const handle = screen.getByTestId('preset-drag-handle-a');
    expect(handle.props.accessibilityActions).toEqual([
      { name: 'decrement', label: '위로 이동' },
      { name: 'increment', label: '아래로 이동' },
    ]);
    await fireEvent(handle, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(order()).toEqual(['b', 'a', 'c']);
    await fireEvent(screen.getByTestId('preset-drag-handle-a'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    expect(order()).toEqual(['a', 'b', 'c']);
    // 위·아래 버튼도 그대로 남아 있다
    await fireEvent.press(screen.getByLabelText('프로필 3 위로 이동'));
    expect(order()).toEqual(['a', 'c', 'b']);
  });
});
