/**
 * 이미지 형식·용량·대상별 규칙과 자르기 계산 (CREATE-US-06).
 * 서버도 같은 규칙으로 다시 검사한다. 여기서는 업로드 전에 빨리 알려 주는 용도다.
 */

export type ImageTarget = 'story' | 'character' | 'profile';

/** AC02: 모든 대상에 파일당 최대 5MB */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** AC03: 스토리 최대 10장, 등장 캐릭터 최대 5장, 유저 프로필 1장 */
export const MAX_IMAGES: Record<ImageTarget, number> = { story: 10, character: 5, profile: 1 };
/** AC04: 스토리 3:4, 등장 캐릭터·유저 프로필 1:1 */
export const CROP_RATIO: Record<ImageTarget, { width: number; height: number }> = {
  story: { width: 3, height: 4 },
  character: { width: 1, height: 1 },
  profile: { width: 1, height: 1 },
};

const STILL_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const GIF = 'image/gif';
const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: GIF,
};

export function isGif(mimeType: string): boolean {
  return mimeType === GIF;
}

/** 선택 도구가 형식을 알려 주지 않으면 파일 이름의 확장자로 추정한다. */
export function guessMimeType(mimeType: string | null | undefined, name: string | null | undefined): string {
  if (mimeType) return mimeType.toLowerCase();
  const extension = name?.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPES[extension] ?? 'application/octet-stream';
}

export function extensionOf(mimeType: string): string {
  return mimeType === 'image/jpeg' ? 'jpg' : (mimeType.split('/')[1] ?? 'bin');
}

/**
 * 고른 파일을 이 대상에 올릴 수 있는지 본다. 문제가 없으면 null, 있으면 안내 문구.
 * 크기를 알 수 없으면(일부 기기) 서버 검사에 맡긴다.
 */
export function checkPickedImage(file: { mimeType: string; size?: number | null }, target: ImageTarget): string | null {
  if (isGif(file.mimeType)) {
    if (target !== 'story') return 'GIF는 스토리 이미지에만 쓸 수 있어요.';
  } else if (!STILL_TYPES.includes(file.mimeType)) {
    return 'JPG·PNG·WebP 이미지만 올릴 수 있어요. GIF는 스토리 이미지에만 쓸 수 있어요.';
  }
  if (typeof file.size === 'number' && file.size > MAX_IMAGE_BYTES) {
    return '이미지는 파일 하나당 5MB까지 올릴 수 있어요.';
  }
  return null;
}

export type CropFrame = { width: number; height: number };
export type CropView = { zoom: number; offsetX: number; offsetY: number };
export type CropRect = { originX: number; originY: number; width: number; height: number };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** 확대 1배일 때 이미지가 틀을 꽉 채우는 배율(남는 쪽은 잘림) */
function baseScale(image: CropFrame, frame: CropFrame): number {
  return Math.max(frame.width / image.width, frame.height / image.height);
}

/** 틀 안에 그릴 이미지 크기와 왼쪽 위 위치(틀 좌표) */
export function layoutOf(image: CropFrame, frame: CropFrame, view: CropView) {
  const scale = baseScale(image, frame) * view.zoom;
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    scale,
    width,
    height,
    left: (frame.width - width) / 2 + view.offsetX,
    top: (frame.height - height) / 2 + view.offsetY,
  };
}

/** 이미지가 틀 밖으로 밀려 빈 공간이 보이지 않도록 확대·이동 값을 제한한다. */
export function clampView(image: CropFrame, frame: CropFrame, view: CropView): CropView {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom));
  const scale = baseScale(image, frame) * zoom;
  const maxX = Math.max(0, (image.width * scale - frame.width) / 2);
  const maxY = Math.max(0, (image.height * scale - frame.height) / 2);
  return {
    zoom,
    offsetX: Math.min(maxX, Math.max(-maxX, view.offsetX)),
    offsetY: Math.min(maxY, Math.max(-maxY, view.offsetY)),
  };
}

/** 지금 틀에 보이는 영역을 원본 이미지 픽셀 좌표로 바꾼다. 결과 비율은 틀 비율과 같다. */
export function toCropRect(image: CropFrame, frame: CropFrame, view: CropView): CropRect {
  const clamped = clampView(image, frame, view);
  const { scale, left, top } = layoutOf(image, frame, clamped);
  const width = Math.min(image.width, Math.round(frame.width / scale));
  const height = Math.min(image.height, Math.round(frame.height / scale));
  const originX = Math.min(image.width - width, Math.max(0, Math.round(-left / scale)));
  const originY = Math.min(image.height - height, Math.max(0, Math.round(-top / scale)));
  return { originX, originY, width, height };
}
