import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';

import { ApiError } from '@/lib/api-client';

import { uploadImage, type MediaImage, type UploadSource } from '../api';
import { cropImage } from '../cropImage';
import {
  checkPickedImage,
  extensionOf,
  guessMimeType,
  isGif,
  type CropFrame,
  type CropRect,
  type ImageTarget,
} from '../rules';

export type CropRequest = { uri: string; imageSize: CropFrame; mimeType: string; name: string };

export type ImageUpload = {
  /** 앨범에서 고르기 → 검사 → (정지 이미지는 자르기) → 업로드 */
  pick: () => Promise<void>;
  /** 자르기 화면에 넘길 값. null이면 자르기 화면을 띄우지 않는다. */
  crop: CropRequest | null;
  confirmCrop: (rect: CropRect) => Promise<void>;
  cancelCrop: () => void;
  busy: boolean;
  /** 실패 이유. 실패 위치(어느 칸인지)는 호출하는 화면이 붙인다. */
  error: string | null;
  clearError: () => void;
};

/**
 * 이미지 한 장을 올리는 흐름 (CREATE-US-06-AC02·AC04·AC05).
 * - 형식·5MB·GIF 대상 규칙을 먼저 확인해 안내하고, 서버가 최종 검사한다.
 * - 정지 이미지는 대상 비율로 자른 뒤 올린다. GIF(스토리만)는 자르지 않고 원본을 올린다.
 * - 취소하거나 실패하면 onUploaded를 부르지 않는다. 기존 이미지와 작성 내용은 호출한 화면에 그대로 남는다.
 */
export function useImageUpload({
  target,
  onUploaded,
}: {
  target: ImageTarget;
  onUploaded: (image: MediaImage) => void;
}): ImageUpload {
  const [crop, setCrop] = useState<CropRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(onUploaded);
  latest.current = onUploaded;

  const send = async (source: UploadSource) => {
    try {
      latest.current(await uploadImage(source, target));
      setCrop(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : '이미지를 올리지 못했어요. 다시 시도해 주세요.');
      setCrop(null);
    }
  };

  const pick = async () => {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    const mimeType = guessMimeType(asset.mimeType, asset.fileName ?? asset.uri);
    const problem = checkPickedImage({ mimeType, size: asset.fileSize ?? asset.file?.size }, target);
    if (problem) {
      setError(problem);
      return;
    }
    const name = asset.fileName ?? `image.${extensionOf(mimeType)}`;
    if (isGif(mimeType)) {
      setBusy(true);
      await send({ uri: asset.uri, mimeType, name });
      setBusy(false);
      return;
    }
    setCrop({ uri: asset.uri, imageSize: { width: asset.width, height: asset.height }, mimeType, name });
  };

  const confirmCrop = async (rect: CropRect) => {
    if (!crop) return;
    setBusy(true);
    try {
      const cropped = await cropImage(crop.uri, rect, crop.mimeType);
      const base = crop.name.replace(/\.[^.]+$/, '');
      await send({ uri: cropped.uri, mimeType: cropped.mimeType, name: `${base}.${extensionOf(cropped.mimeType)}` });
    } catch {
      setError('이미지를 자르지 못했어요. 다른 이미지로 다시 시도해 주세요.');
      setCrop(null);
    } finally {
      setBusy(false);
    }
  };

  return {
    pick,
    crop,
    confirmCrop,
    cancelCrop: () => setCrop(null),
    busy,
    error,
    clearError: () => setError(null),
  };
}
