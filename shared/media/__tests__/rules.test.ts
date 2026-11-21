import { CROP_RATIO, MAX_IMAGE_BYTES, checkPickedImage, clampView, guessMimeType, toCropRect } from '../rules';

describe('업로드 전 검사 (CREATE-US-06-AC02·AC05)', () => {
  it('정지 이미지는 모든 대상, GIF는 스토리에만 허용한다', () => {
    for (const mimeType of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(checkPickedImage({ mimeType, size: 10 }, 'character')).toBeNull();
      expect(checkPickedImage({ mimeType, size: 10 }, 'story')).toBeNull();
    }
    expect(checkPickedImage({ mimeType: 'image/gif', size: 10 }, 'story')).toBeNull();
    expect(checkPickedImage({ mimeType: 'image/gif', size: 10 }, 'character')).toMatch(/GIF는 스토리/);
    expect(checkPickedImage({ mimeType: 'image/gif', size: 10 }, 'profile')).toMatch(/GIF는 스토리/);
    expect(checkPickedImage({ mimeType: 'image/bmp', size: 10 }, 'story')).toMatch(/JPG·PNG·WebP/);
  });

  it('파일당 5MB까지 허용하고 크기를 모르면 서버 검사에 맡긴다', () => {
    expect(checkPickedImage({ mimeType: 'image/png', size: MAX_IMAGE_BYTES }, 'story')).toBeNull();
    expect(checkPickedImage({ mimeType: 'image/png', size: MAX_IMAGE_BYTES + 1 }, 'story')).toMatch(/5MB/);
    expect(checkPickedImage({ mimeType: 'image/png', size: undefined }, 'story')).toBeNull();
  });

  it('형식 정보가 없으면 확장자로 추정한다', () => {
    expect(guessMimeType(undefined, 'photo.JPG')).toBe('image/jpeg');
    expect(guessMimeType(null, 'moving.gif')).toBe('image/gif');
    expect(guessMimeType('image/webp', 'x.png')).toBe('image/webp');
    expect(guessMimeType(undefined, 'noext')).toBe('application/octet-stream');
  });
});

describe('자르기 영역 계산 (CREATE-US-06-AC04)', () => {
  const landscape = { width: 1200, height: 800 };

  it('스토리는 3:4, 캐릭터는 1:1 비율로 원본 안에서 자른다', () => {
    const storyFrame = { width: 300, height: 400 };
    const rect = toCropRect(landscape, storyFrame, { zoom: 1, offsetX: 0, offsetY: 0 });
    expect(rect.height).toBe(800);
    expect(rect.width).toBe(600);
    expect(rect.originX).toBe(300); // 가운데
    expect(rect.originY).toBe(0);
    expect(CROP_RATIO.story).toEqual({ width: 3, height: 4 });

    const square = toCropRect(landscape, { width: 200, height: 200 }, { zoom: 2, offsetX: 0, offsetY: 0 });
    expect(square.width).toBe(square.height);
    expect(square.width).toBe(400);
  });

  it('틀 밖으로 밀어도 빈 공간이 생기지 않게 이동·확대를 제한한다', () => {
    const frame = { width: 300, height: 400 };
    const pushed = clampView(landscape, frame, { zoom: 9, offsetX: 10000, offsetY: -10000 });
    expect(pushed.zoom).toBe(4);
    const rect = toCropRect(landscape, frame, { zoom: 1, offsetX: 10000, offsetY: 0 });
    expect(rect.originX).toBe(0); // 오른쪽으로 끝까지 밀면 원본 왼쪽 끝부터
    expect(rect.originX + rect.width).toBeLessThanOrEqual(landscape.width);
  });
});
