// CREATE-US-05-AC03 프리셋 이미지: 실제 업로드(shared/media useImageUpload·ImageCropper·ServerImage) 연결
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync } from 'expo-image-manipulator';

import { UserProfilePresetEditor } from '../components/UserProfilePresetEditor';
import type { PresetValues } from '../userProfilePresetRules';

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
import { ApiError, apiRequest } from '@/lib/api-client';

const pickMock = ImagePicker.launchImageLibraryAsync as jest.Mock;
const cropMock = manipulateAsync as jest.Mock;
const apiMock = apiRequest as jest.Mock;

/** 자르기 창(Modal) 모듈을 처음 불러오는 테스트가 느릴 수 있어 StoryImagesEditor 테스트와 같은 여유를 준다. */
const UPLOAD_FLOW_TIMEOUT_MS = 20000;

const SERVER = 'http://api.test/api/v1/creation/image-files';

const p = (key: string, name: string, extra: Partial<PresetValues> = {}): PresetValues => ({
  key,
  name,
  detail: '',
  imageId: null,
  photoUrl: null,
  ...extra,
});

const pngAsset = {
  uri: 'file:///picked.png',
  mimeType: 'image/png',
  fileName: 'picked.png',
  fileSize: 1000,
  width: 400,
  height: 400,
};

const dto = (imageId: number) => ({
  image_id: imageId,
  mime_type: 'image/png',
  byte_size: 10,
  url: `${SERVER}/${imageId}`,
});

/** 끝 시점을 테스트가 정하는 Promise */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 호스트처럼 값을 들고 "이전 값 → 새 값" 함수를 적용한다. */
async function setup(initial: PresetValues[], { editable = true }: { editable?: boolean } = {}) {
  let current = initial;
  function Harness() {
    const [values, setValues] = useState(initial);
    current = values;
    return <UserProfilePresetEditor presets={values} onChange={setValues} uploadImages editable={editable} />;
  }
  await render(<Harness />);
  return { latest: () => current };
}

async function press(label: string) {
  await act(async () => {
    await fireEvent.press(screen.getByLabelText(label));
  });
}

/** 결과를 기다리지 않고 누른다(끝나지 않은 업로드·고르기 흐름) */
async function pressPending(label: string) {
  await act(async () => {
    void fireEvent.press(screen.getByLabelText(label));
  });
}

async function confirmCrop() {
  await press('확인');
}

beforeEach(() => {
  pickMock.mockReset();
  cropMock.mockReset();
  apiMock.mockReset();
  cropMock.mockResolvedValue({ uri: 'file:///cropped.png' });
});

describe('CREATE-US-05-AC03 프리셋 이미지 실제 업로드', () => {
  it(
    '고르기 → 1:1 자르기 → profile 대상으로 업로드하면 서버 imageId와 미리보기 주소를 그대로 지정한다',
    async () => {
      pickMock.mockResolvedValue({ canceled: false, assets: [pngAsset] });
      apiMock.mockResolvedValue(dto(77));
      const { latest } = await setup([p('a', '가')]);

      await press('프로필 1 이미지 선택');
      expect(screen.getByText('이미지 자르기 (1:1)')).toBeTruthy();
      await confirmCrop();

      expect(apiMock).toHaveBeenCalledTimes(1);
      expect(apiMock.mock.calls[0][0]).toBe('/creation/images?target=profile');
      expect(latest()[0]).toEqual(p('a', '가', { imageId: 77, photoUrl: `${SERVER}/77` }));
      expect(screen.queryByText('이미지 자르기 (1:1)')).toBeNull();
      // 소유자만 볼 수 있는 서버 이미지라 인증 헤더를 붙이는 ServerImage로 보여 준다
      const preview = screen.getByTestId('preset-photo-a');
      expect(preview.props.source).toMatchObject({ uri: `${SERVER}/77` });
      expect(preview.props.source.headers).toBeDefined();
      expect(screen.queryByText('이미지를 선택해 주세요.')).toBeNull();
    },
    UPLOAD_FLOW_TIMEOUT_MS,
  );

  it('앨범에서 고르기를 취소하면 기존 이미지를 그대로 두고 업로드하지 않는다', async () => {
    pickMock.mockResolvedValue({ canceled: true, assets: [] });
    const before = p('a', '가', { imageId: 3, photoUrl: `${SERVER}/3` });
    const { latest } = await setup([before]);

    await press('프로필 1 이미지 선택');

    expect(apiMock).not.toHaveBeenCalled();
    expect(latest()[0]).toEqual(before);
  });

  it(
    '자르기를 취소하면 기존 이미지를 그대로 두고 업로드하지 않는다',
    async () => {
      pickMock.mockResolvedValue({ canceled: false, assets: [pngAsset] });
      const before = p('a', '가', { imageId: 3, photoUrl: `${SERVER}/3` });
      const { latest } = await setup([before]);

      await press('프로필 1 이미지 선택');
      await press('취소');

      expect(screen.queryByText('이미지 자르기 (1:1)')).toBeNull();
      expect(cropMock).not.toHaveBeenCalled();
      expect(apiMock).not.toHaveBeenCalled();
      expect(latest()[0]).toEqual(before);
    },
    UPLOAD_FLOW_TIMEOUT_MS,
  );

  it(
    '업로드가 실패하면 실패 이유를 그 프로필에 알리고 기존 이미지를 그대로 둔다',
    async () => {
      pickMock.mockResolvedValue({ canceled: false, assets: [pngAsset] });
      apiMock.mockRejectedValue(new ApiError(413, 'IMAGE_TOO_LARGE', '이미지가 너무 커요.'));
      const before = p('a', '가', { imageId: 3, photoUrl: `${SERVER}/3` });
      const { latest } = await setup([before]);

      await press('프로필 1 이미지 선택');
      await confirmCrop();

      expect(screen.getByText('프로필 1 이미지: 이미지가 너무 커요.')).toBeTruthy();
      expect(latest()[0]).toEqual(before);
      expect(screen.queryByText('이미지 자르기 (1:1)')).toBeNull();
    },
    UPLOAD_FLOW_TIMEOUT_MS,
  );

  it('형식 검사에 걸리면(GIF) 안내하고 업로드하지 않으며 기존 이미지를 그대로 둔다', async () => {
    pickMock.mockResolvedValue({
      canceled: false,
      assets: [{ ...pngAsset, uri: 'file:///a.gif', mimeType: 'image/gif', fileName: 'a.gif' }],
    });
    const before = p('a', '가', { imageId: 3, photoUrl: `${SERVER}/3` });
    const { latest } = await setup([before]);

    await press('프로필 1 이미지 선택');

    expect(screen.getByText('프로필 1 이미지: GIF는 스토리 이미지에만 쓸 수 있어요.')).toBeTruthy();
    expect(apiMock).not.toHaveBeenCalled();
    expect(latest()[0]).toEqual(before);
  });

  it(
    '올리는 중에는 같은 프로필에서 다시 고를 수 없다',
    async () => {
      pickMock.mockResolvedValue({ canceled: false, assets: [pngAsset] });
      const upload = deferred<ReturnType<typeof dto>>();
      apiMock.mockReturnValue(upload.promise);
      await setup([p('a', '가')]);

      await press('프로필 1 이미지 선택');
      await pressPending('확인');

      expect(screen.getByLabelText('프로필 1 이미지 선택').props.accessibilityState.disabled).toBe(true);
      await act(async () => {
        upload.resolve(dto(5));
      });
      expect(screen.getByLabelText('프로필 1 이미지 선택').props.accessibilityState.disabled).toBe(false);
    },
    UPLOAD_FLOW_TIMEOUT_MS,
  );

  it(
    '올리는 사이 그 프로필을 삭제하면 늦게 끝난 결과를 남은 프로필에 붙이지 않는다',
    async () => {
      pickMock.mockResolvedValue({ canceled: false, assets: [pngAsset] });
      const upload = deferred<ReturnType<typeof dto>>();
      apiMock.mockReturnValue(upload.promise);
      const b = p('b', '나', { imageId: 8, photoUrl: `${SERVER}/8` });
      const { latest } = await setup([p('a', '가'), b]);

      await press('프로필 1 이미지 선택');
      await pressPending('확인');
      await press('프로필 1 삭제');
      await act(async () => {
        upload.resolve(dto(99));
      });

      expect(latest()).toEqual([b]);
    },
    UPLOAD_FLOW_TIMEOUT_MS,
  );

  it('앨범을 고르는 사이 그 프로필을 삭제하면 자르기 창을 띄우지 않고 아무것도 바꾸지 않는다', async () => {
    const picked = deferred<{ canceled: boolean; assets: (typeof pngAsset)[] }>();
    pickMock.mockReturnValue(picked.promise);
    const b = p('b', '나', { imageId: 8, photoUrl: `${SERVER}/8` });
    const { latest } = await setup([p('a', '가'), b]);

    await pressPending('프로필 1 이미지 선택');
    await press('프로필 1 삭제');
    await act(async () => {
      picked.resolve({ canceled: false, assets: [pngAsset] });
    });

    expect(screen.queryByText('이미지 자르기 (1:1)')).toBeNull();
    expect(apiMock).not.toHaveBeenCalled();
    expect(latest()).toEqual([b]);
  });

  it(
    '올리는 사이 순서를 바꿔도 결과는 고른 프로필에만 붙는다',
    async () => {
      pickMock.mockResolvedValue({ canceled: false, assets: [pngAsset] });
      const upload = deferred<ReturnType<typeof dto>>();
      apiMock.mockReturnValue(upload.promise);
      const b = p('b', '나', { imageId: 8, photoUrl: `${SERVER}/8` });
      const { latest } = await setup([p('a', '가'), b]);

      await press('프로필 1 이미지 선택');
      await pressPending('확인');
      await press('프로필 1 아래로 이동');
      await act(async () => {
        upload.resolve(dto(42));
      });

      expect(latest()).toEqual([b, p('a', '가', { imageId: 42, photoUrl: `${SERVER}/42` })]);
      expect(screen.getByTestId('preset-photo-a').props.source).toMatchObject({ uri: `${SERVER}/42` });
      expect(screen.getByTestId('preset-photo-b').props.source).toMatchObject({ uri: `${SERVER}/8` });
    },
    UPLOAD_FLOW_TIMEOUT_MS,
  );

  it(
    '올리는 사이 이미지를 해제하면 늦게 끝난 결과가 해제를 되돌리지 않는다',
    async () => {
      pickMock.mockResolvedValue({ canceled: false, assets: [pngAsset] });
      const upload = deferred<ReturnType<typeof dto>>();
      apiMock.mockReturnValue(upload.promise);
      const { latest } = await setup([p('a', '가', { imageId: 3, photoUrl: `${SERVER}/3` })]);

      await press('프로필 1 이미지 선택');
      await pressPending('확인');
      await press('프로필 1 이미지 해제');
      await act(async () => {
        upload.resolve(dto(10));
      });

      expect(latest()[0]).toEqual(p('a', '가'));
      expect(screen.getByText('이미지를 선택해 주세요.')).toBeTruthy();
    },
    UPLOAD_FLOW_TIMEOUT_MS,
  );

  it(
    '자르기 창이 열린 사이 이미지를 해제하면 그 선택을 확인해도 업로드하거나 해제를 되돌리지 않는다',
    async () => {
      pickMock.mockResolvedValue({ canceled: false, assets: [pngAsset] });
      apiMock.mockResolvedValue(dto(10));
      const { latest } = await setup([p('a', '가', { imageId: 3, photoUrl: `${SERVER}/3` })]);

      await press('프로필 1 이미지 선택');
      expect(screen.getByText('이미지 자르기 (1:1)')).toBeTruthy();
      await press('프로필 1 이미지 해제');
      await confirmCrop();

      expect(apiMock).not.toHaveBeenCalled();
      expect(latest()[0]).toEqual(p('a', '가'));
      expect(screen.queryByText('이미지 자르기 (1:1)')).toBeNull();
      expect(screen.getByText('이미지를 선택해 주세요.')).toBeTruthy();
      expect(screen.getByLabelText('프로필 1 이미지 선택').props.accessibilityState.disabled).toBe(false);
    },
    UPLOAD_FLOW_TIMEOUT_MS,
  );

  it('이미지가 없으면 이미지 안내를 보여 주고, 편집 불가면 선택·해제가 막힌다', async () => {
    await setup([p('a', '가'), p('b', '나', { imageId: 8, photoUrl: `${SERVER}/8` })], { editable: false });
    expect(screen.getByText('이미지를 선택해 주세요.')).toBeTruthy();
    for (const label of ['프로필 1 이미지 선택', '프로필 2 이미지 선택', '프로필 2 이미지 해제']) {
      expect(screen.getByLabelText(label).props.accessibilityState.disabled).toBe(true);
    }
    await press('프로필 2 이미지 선택');
    expect(pickMock).not.toHaveBeenCalled();
  });
});
