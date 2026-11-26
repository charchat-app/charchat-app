import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import {
  PanResponder,
  type GestureResponderEvent,
  type PanResponderCallbacks,
  type PanResponderGestureState,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync } from 'expo-image-manipulator';

import { Spacing } from '@/constants/theme';
import type { MediaImage } from '@/shared/media';

import { StoryImagesEditor } from '../components/StoryImagesEditor';
import { PHOTO_LONG_PRESS_MS } from '../components/usePhotoReorder';
import type { StoryImagesValues } from '../images';

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, apiRequest: jest.fn() };
});
// eslint-disable-next-line import/first
import { apiRequest } from '@/lib/api-client';

const pickMock = ImagePicker.launchImageLibraryAsync as jest.Mock;
const cropMock = manipulateAsync as jest.Mock;
const apiMock = apiRequest as jest.Mock;

const img = (imageId: number): MediaImage => ({
  imageId,
  mimeType: 'image/png',
  byteSize: 10,
  uri: `http://x/${imageId}`,
});

/** 실제 화면처럼 onChange 결과를 다시 values로 넘겨 그리는 감싸기 */
async function setup(initial: StoryImagesValues) {
  let current = initial;
  const onChange = jest.fn();
  function Harness() {
    const [state, setState] = useState(initial);
    current = state;
    return (
      <StoryImagesEditor
        values={state}
        onChange={(update) => {
          onChange(update);
          setState((v) => update(v));
        }}
      />
    );
  }
  await render(<Harness />);
  return { onChange, latest: () => current };
}

/** 짧게 누르기와 같은 선택. 화면 읽기 기능의 '선택' 동작으로 보낸다(끌기 제스처와 분리된 경로). */
async function select(element: ReturnType<typeof screen.getByLabelText>) {
  await fireEvent(element, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
}

// ---- 손잡이 끌기: 실제 PanResponder 설정의 콜백을 그대로 부른다 ----

/** 사진 칸 너비(78) + 간격(Spacing.two). 한 칸 옮기는 거리 */
const SLOT = 78 + Spacing.two;
const noEvent = null as unknown as GestureResponderEvent;
const gesture = (dx: number): PanResponderGestureState => ({
  stateID: 1,
  moveX: dx,
  moveY: 0,
  x0: 0,
  y0: 0,
  dx,
  dy: 0,
  vx: 0,
  vy: 0,
  numberActiveTouches: 1,
});

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

afterEach(() => {
  jest.restoreAllMocks();
});

const values: StoryImagesValues = {
  story: [],
  characters: [
    { characterId: '1', name: '하린', images: [img(11), img(12)] },
    { characterId: '2', name: '도윤', images: [] },
  ],
};

// 고르기→자르기→업로드 흐름 테스트의 제한 시간. 처음 실행(변환 캐시 없음)에 CPU까지 바쁘면
// 자르기 창(Modal) 모듈을 테스트 도중 처음 불러오느라 평소 0.15초가 13초 넘게 걸린 적이 있다.
// 다른 화면 테스트의 긴 흐름(`}, 30000)`)과 같은 방식으로 이 흐름에만 넉넉한 시간을 준다.
const UPLOAD_FLOW_TIMEOUT_MS = 20000;

beforeEach(() => {
  pickMock.mockReset();
  cropMock.mockReset();
  apiMock.mockReset();
});

describe('StoryImagesEditor (CREATE-US-06)', () => {
  it('대체 표지 안내와 이미지 없는 캐릭터를 보여 준다 (AC08·AC09)', async () => {
    await render(<StoryImagesEditor values={values} onChange={jest.fn()} />);
    expect(screen.getByText(/하린의 첫 사진을 표지로 써요/)).toBeOnTheScreen();
    expect(screen.getByText(/이미지가 없는 캐릭터: 도윤/)).toBeOnTheScreen();
    expect(screen.getByText('캐릭터 사진 · 2 / 5장')).toBeOnTheScreen();
  });

  it('사진을 골라 앞으로 옮기거나 삭제한다 (AC06·AC08)', async () => {
    const { latest } = await setup(values);
    await select(await screen.findByLabelText('하린 이미지 2번째'));
    await fireEvent.press(screen.getByLabelText('하린 이미지 2번째 앞으로'));
    expect(latest().characters[0].images.map((i) => i.imageId)).toEqual([12, 11]);
    await fireEvent.press(screen.getByLabelText('하린 이미지 1번째 삭제'));
    // 앞으로 옮긴 사진(12)이 선택된 채로 삭제된다.
    expect(latest().characters[0].images.map((i) => i.imageId)).toEqual([11]);
  });

  it('화면 읽기 기능으로 사진을 앞뒤로 옮긴다 (AC06)', async () => {
    const { latest } = await setup(values);
    await fireEvent(screen.getByLabelText('하린 이미지 1번째(대표)'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(latest().characters[0].images.map((i) => i.imageId)).toEqual([12, 11]);
    expect(screen.getByLabelText('하린 이미지 1번째(대표)')).toBeOnTheScreen();
  });

  it('CREATE-US-12: 사진을 누르면 선택만 하고, 순서 끌기는 점 6개 손잡이에만 붙는다', async () => {
    const configs = capturePanResponders();
    const { latest } = await setup(values);
    // 사진 2장 → 손잡이 2개. 끌기 응답기도 손잡이 수만큼만 만들어진다(사진 자체에는 없다).
    expect(screen.getByTestId('photo-drag-handle-11', { includeHiddenElements: true }).props.onResponderGrant).toEqual(
      expect.any(Function),
    );
    expect(screen.getByTestId('photo-drag-handle-12', { includeHiddenElements: true }).props.onResponderGrant).toEqual(
      expect.any(Function),
    );
    expect(configs).toHaveLength(2);
    expect(screen.getByTestId('photo-11').props.onResponderGrant).toBeUndefined();
    const grip = screen.getByTestId('photo-drag-grip-11', { includeHiddenElements: true });
    expect(grip.children).toHaveLength(3);
    for (const row of grip.children) {
      expect(typeof row === 'string' ? [] : row.children).toHaveLength(2);
    }
    // 손잡이는 화면 읽기에서 숨긴다(사진의 접근성 동작과 중복되지 않게)
    expect(
      screen.getByTestId('photo-drag-handle-11', { includeHiddenElements: true }).props.accessibilityElementsHidden,
    ).toBe(true);

    // 사진을 누르면 고르기만 하고 순서는 그대로다. 글자 버튼(앞으로·뒤로)으로 옮길 수 있다.
    await fireEvent.press(screen.getByLabelText('하린 이미지 2번째'));
    expect(screen.getByLabelText('하린 이미지 2번째 앞으로')).toBeOnTheScreen();
    expect(latest().characters[0].images.map((i) => i.imageId)).toEqual([11, 12]);
    // 화면에 보이는 이동 화살표는 없다
    expect(screen.queryAllByText(/[←→↑↓]/)).toHaveLength(0);
  });

  it('CREATE-US-12: 손잡이를 길게 누른 뒤 가로로 끌어 놓으면 사진 순서가 바뀐다', async () => {
    jest.useFakeTimers();
    try {
      const configs = capturePanResponders();
      const { latest } = await setup(values);
      const first = configs[0]; // 사진 11의 손잡이
      expect(required(first.onStartShouldSetPanResponder, 'start')(noEvent, gesture(0))).toBe(true);
      await act(async () => {
        required(first.onPanResponderGrant, 'grant')(noEvent, gesture(0));
      });
      await act(async () => {
        jest.advanceTimersByTime(PHOTO_LONG_PRESS_MS);
      });
      await act(async () => {
        required(first.onPanResponderMove, 'move')(noEvent, gesture(SLOT));
      });
      await act(async () => {
        required(first.onPanResponderRelease, 'release')(noEvent, gesture(SLOT));
      });
      expect(latest().characters[0].images.map((i) => i.imageId)).toEqual([12, 11]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('CREATE-US-12: 사진이 한 장뿐이면 순서를 바꿀 수 없어 손잡이를 그리지 않는다', async () => {
    await setup({ story: [], characters: [{ characterId: '1', name: '하린', images: [img(11)] }] });
    expect(screen.getByTestId('photo-11')).toBeOnTheScreen();
    expect(screen.queryByTestId('photo-drag-handle-11')).toBeNull();
  });

  it('CREATE-US-12: 편집 불가 동안 사진 손잡이를 감추고 누름도 사진으로 넘긴다', async () => {
    await render(<StoryImagesEditor values={values} onChange={jest.fn()} disabled />);
    const handle = screen.getByTestId('photo-drag-handle-11', { includeHiddenElements: true });
    expect(handle).toHaveStyle({ opacity: 0 });
    expect(handle.props.pointerEvents).toBe('none');
  });

  it(
    '캐릭터에 GIF를 고르면 올리지 않고 위치와 이유를 알린다 (AC05)',
    async () => {
      pickMock.mockResolvedValue({
        canceled: false,
        assets: [
          { uri: 'file:///a.gif', mimeType: 'image/gif', fileName: 'a.gif', width: 10, height: 10, fileSize: 100 },
        ],
      });
      const { onChange } = await setup(values);
      await act(async () => {
        fireEvent.press(screen.getByLabelText('도윤 이미지 추가'));
      });
      expect(await screen.findByText('도윤 이미지: GIF는 스토리 이미지에만 쓸 수 있어요.')).toBeOnTheScreen();
      expect(apiMock).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    },
    UPLOAD_FLOW_TIMEOUT_MS,
  );

  it(
    '정지 이미지는 1:1로 자른 결과를 올려 목록 끝에 붙인다 (AC02·AC04)',
    async () => {
      pickMock.mockResolvedValue({
        canceled: false,
        assets: [
          { uri: 'file:///b.jpg', mimeType: 'image/jpeg', fileName: 'b.jpg', width: 1200, height: 800, fileSize: 1000 },
        ],
      });
      cropMock.mockResolvedValue({ uri: 'file:///cropped.jpg', width: 800, height: 800 });
      apiMock.mockResolvedValue({
        image_id: 99,
        mime_type: 'image/jpeg',
        byte_size: 900,
        url: '/api/v1/creation/image-files/x.jpg',
      });
      const { latest } = await setup(values);

      await act(async () => {
        fireEvent.press(screen.getByLabelText('도윤 이미지 추가'));
      });
      expect(await screen.findByText('이미지 자르기 (1:1)')).toBeOnTheScreen();
      await act(async () => {
        fireEvent.press(screen.getByLabelText('확인'));
      });

      const [, actions] = cropMock.mock.calls[0];
      expect(actions[0].crop.width).toBe(actions[0].crop.height);
      expect(apiMock.mock.calls[0][0]).toBe('/creation/images?target=character');
      expect(latest().characters[1].images.map((i) => i.imageId)).toEqual([99]);
    },
    UPLOAD_FLOW_TIMEOUT_MS,
  );

  it(
    '업로드가 실패하면 기존 사진을 유지하고 이유를 알린다 (AC02·AC07)',
    async () => {
      const { ApiError } = jest.requireActual('@/lib/api-client');
      pickMock.mockResolvedValue({
        canceled: false,
        assets: [
          { uri: 'file:///c.png', mimeType: 'image/png', fileName: 'c.png', width: 100, height: 100, fileSize: 10 },
        ],
      });
      cropMock.mockResolvedValue({ uri: 'file:///c2.png', width: 100, height: 100 });
      apiMock.mockRejectedValue(new ApiError(422, 'IMAGE_TOO_LARGE', '이미지는 파일 하나당 5MB까지 올릴 수 있습니다.'));
      const { onChange } = await setup(values);

      await select(await screen.findByLabelText('하린 이미지 1번째(대표)'));
      await act(async () => {
        fireEvent.press(screen.getByLabelText('하린 이미지 1번째 교체'));
      });
      await act(async () => {
        fireEvent.press(screen.getByLabelText('확인'));
      });
      expect(await screen.findByText('하린 이미지: 이미지는 파일 하나당 5MB까지 올릴 수 있습니다.')).toBeOnTheScreen();
      expect(onChange).not.toHaveBeenCalled();
    },
    UPLOAD_FLOW_TIMEOUT_MS,
  );
});
