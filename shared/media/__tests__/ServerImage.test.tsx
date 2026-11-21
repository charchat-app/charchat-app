import { render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { ServerImage, imageSource, isServerImage } from '@/shared/media';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, authHeaders: () => ({ 'X-User-Id': '100' }) };
});

const SERVER = 'http://api.test/api/v1/creation/image-files/abc.png';

describe('소유자 전용 이미지 미리보기 인증 (CREATE-US-06)', () => {
  it('서버 이미지 파일 주소만 인증이 필요한 이미지로 본다', () => {
    expect(isServerImage(SERVER)).toBe(true);
    expect(isServerImage('file:///tmp/a.png')).toBe(false);
    expect(isServerImage('blob:http://localhost/123')).toBe(false);
    expect(isServerImage('data:image/png;base64,AAAA')).toBe(false);
  });

  it('서버 이미지에는 인증 헤더를 붙이고, 기기에서 고른 사진에는 붙이지 않는다', () => {
    expect(imageSource(SERVER)).toEqual({ uri: SERVER, headers: { 'X-User-Id': '100' } });
    expect(imageSource('file:///tmp/a.png')).toEqual({ uri: 'file:///tmp/a.png' });
  });

  it('기기에서는 Image source에 인증 헤더를 함께 넘긴다', async () => {
    await render(<ServerImage testID="photo" uri={SERVER} />);
    expect(screen.getByTestId('photo').props.source).toEqual({ uri: SERVER, headers: { 'X-User-Id': '100' } });
  });

  describe('웹', () => {
    const originalOS = Platform.OS;
    const originalFetch = globalThis.fetch;
    const createObjectURL = jest.fn(() => 'blob:local/1');
    const revokeObjectURL = jest.fn();

    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
      Object.assign(URL, { createObjectURL, revokeObjectURL });
    });
    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
      globalThis.fetch = originalFetch;
      jest.clearAllMocks();
    });

    it('인증 헤더로 파일을 받아 임시 주소로 보여 주고, 사라질 때 임시 주소를 해제한다', async () => {
      const fetchMock = jest.fn(async () => ({ ok: true, status: 200, blob: async () => ({}) }));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const view = await render(<ServerImage testID="photo" uri={SERVER} />);
      await waitFor(() => expect(screen.getByTestId('photo').props.source).toEqual({ uri: 'blob:local/1' }));
      expect(fetchMock).toHaveBeenCalledWith(SERVER, expect.objectContaining({ headers: { 'X-User-Id': '100' } }));

      await view.unmount();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:local/1');
    });

    it('권한이 없거나 실패하면 이미지를 그리지 않고 빈 칸으로 둔다', async () => {
      const fetchMock = jest.fn(async () => ({ ok: false, status: 404, blob: async () => ({}) }));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await render(<ServerImage testID="photo" uri={SERVER} />);
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(screen.getByTestId('photo').props.source).toBeUndefined();
      expect(createObjectURL).not.toHaveBeenCalled();
    });

    it('기기에서 고른 사진은 내려받지 않고 그대로 보여 준다', async () => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      await render(<ServerImage testID="photo" uri="blob:http://localhost/9" />);
      expect(screen.getByTestId('photo').props.source).toEqual({ uri: 'blob:http://localhost/9' });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
