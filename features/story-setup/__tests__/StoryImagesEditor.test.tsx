import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync } from 'expo-image-manipulator';

import type { MediaImage } from '@/shared/media';

import { StoryImagesEditor } from '../components/StoryImagesEditor';
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
    expect(screen.getByText('2 / 5장')).toBeOnTheScreen();
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
