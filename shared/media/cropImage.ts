/**
 * 자르기 결과를 새 파일로 만든다 (CREATE-US-06-AC04). 원본 파일은 바꾸지 않는다.
 * 원래 형식(JPG·PNG·WebP)을 유지해 투명 배경 등이 바뀌지 않게 한다.
 */
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import type { CropRect } from './rules';

const FORMATS: Record<string, SaveFormat> = {
  'image/png': SaveFormat.PNG,
  'image/webp': SaveFormat.WEBP,
  'image/jpeg': SaveFormat.JPEG,
};

export async function cropImage(
  uri: string,
  rect: CropRect,
  mimeType: string,
): Promise<{ uri: string; mimeType: string }> {
  const format = FORMATS[mimeType] ?? SaveFormat.JPEG;
  const result = await manipulateAsync(uri, [{ crop: rect }], { format, compress: 0.92 });
  return { uri: result.uri, mimeType: format === SaveFormat.JPEG ? 'image/jpeg' : mimeType };
}
