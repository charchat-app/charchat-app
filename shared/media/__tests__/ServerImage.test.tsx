import { render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { ServerImage, imageSource, isServerImage } from '@/shared/media';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, authHeaders: () => ({ 'X-User-Id': '100' }) };
});

const SERVER = 'http://api.test/api/v1/creation/image-files/abc.png';
const ORIGINAL_API_URL = process.env.EXPO_PUBLIC_API_URL;

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test/api/v1';
});
afterAll(() => {
  if (ORIGINAL_API_URL === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = ORIGINAL_API_URL;
});

describe('소유자 전용 이미지 미리보기 인증 (CREATE-US-06)', () => {
  it('서버 이미지 파일 주소만 인증이 필요한 이미지로 본다', () => {
    expect(isServerImage(SERVER)).toBe(true);
    expect(isServerImage('file:///tmp/a.png')).toBe(false);
    expect(isServerImage('blob:http://localhost/123')).toBe(false);
    expect(isServerImage('data:image/png;base64,AAAA')).toBe(false);
  });

  it.each([
    ['다른 도메인의 같은 경로', 'http://evil.test/api/v1/creation/image-files/abc.png'],
    ['같은 호스트의 다른 포트', 'http://api.test:8080/api/v1/creation/image-files/abc.png'],
    ['다른 프로토콜(https)', 'https://api.test/api/v1/creation/image-files/abc.png'],
    ['주소 앞부분에 우리 호스트를 넣은 다른 도메인', 'http://api.test.evil.test/api/v1/creation/image-files/abc.png'],
    ['사용자 정보로 우리 호스트를 흉내 낸 주소', 'http://api.test@evil.test/api/v1/creation/image-files/abc.png'],
    ['query에 경로를 넣은 속임', 'http://api.test/api/v1/other?x=/creation/image-files/abc.png'],
    ['fragment에 경로를 넣은 속임', 'http://evil.test/x#/api/v1/creation/image-files/abc.png'],
    ['API 기준 경로 밖의 같은 경로', 'http://api.test/creation/image-files/abc.png'],
    ['해석할 수 없는 주소', 'http://[::1'],
  ])('BASE-03 인증 헤더를 붙이지 않는다: %s', (_name, uri) => {
    expect(isServerImage(uri)).toBe(false);
    expect(imageSource(uri)).toEqual({ uri });
  });

  it('BASE-03 우리 API 서버의 이미지 파일 주소에만 인증 헤더를 붙인다', () => {
    expect(isServerImage('http://api.test/api/v1/creation/image-files/7/abc.png?v=2')).toBe(true);
    expect(imageSource(SERVER)).toEqual({ uri: SERVER, headers: { 'X-User-Id': '100' } });
  });

  it('BASE-03 API 기준 주소를 해석할 수 없으면 붙이지 않는다', () => {
    process.env.EXPO_PUBLIC_API_URL = '';
    try {
      expect(isServerImage(SERVER)).toBe(false);
    } finally {
      process.env.EXPO_PUBLIC_API_URL = 'http://api.test/api/v1';
    }
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
