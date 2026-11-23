import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';

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
 * - onActiveChange(선택): 고르기를 누른 순간(앨범을 열기 전, 같은 틱) true, 자르기·업로드를 거쳐 끝나거나
 *   취소·실패·언마운트되면 false를 알린다. 같은 값을 두 번 알리지 않는다. 호출한 화면이 그동안 저장을 막는 데 쓴다.
 *   진행 중에 다시 고르기를 눌러도 새 흐름을 시작하지 않는다.
 * - 진행 중에 언마운트되면 늦게 끝난 업로드 결과를 반영하지 않는다.
 */
export function useImageUpload({
  target,
  onUploaded,
  onActiveChange,
}: {
  target: ImageTarget;
  onUploaded: (image: MediaImage) => void;
  onActiveChange?: (active: boolean) => void;
}): ImageUpload {
  const [crop, setCrop] = useState<CropRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(onUploaded);
  latest.current = onUploaded;
  const latestActive = useRef(onActiveChange);
  latestActive.current = onActiveChange;
  // 고르기부터 업로드 끝까지 진행 중인지. 다시 그리기를 기다리지 않고 바로 읽고 쓴다.
  const active = useRef(false);
  const mounted = useRef(true);
  // 자르기 확인 뒤 자르기·업로드 promise가 끝나기 전인지.
  const inFlight = useRef(false);
  const setActive = (next: boolean) => {
    if (active.current === next) return;
    active.current = next;
    latestActive.current?.(next);
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // 진행 중에 언마운트되면 잡고 있던 대기를 푼다.
      if (active.current) {
        active.current = false;
        latestActive.current?.(false);
      }
    };
  }, []);

  const send = async (source: UploadSource) => {
    try {
      const image = await uploadImage(source, target);
      if (!mounted.current) return;
      latest.current(image);
      setCrop(null);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof ApiError ? e.detail : '이미지를 올리지 못했어요. 다시 시도해 주세요.');
      setCrop(null);
    }
  };

  const pick = async () => {
    // 이미 고르기·자르기·업로드 중이면 새 흐름을 시작하지 않는다.
    if (active.current) return;
    setActive(true);
    setError(null);
    // 자르기 창을 띄우면 확인·취소에서 풀도록 진행 중으로 남긴다.
    let keepActive = false;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (!mounted.current || result.canceled || !result.assets || result.assets.length === 0) return;
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
        if (mounted.current) setBusy(false);
        return;
      }
      keepActive = true;
      setCrop({ uri: asset.uri, imageSize: { width: asset.width, height: asset.height }, mimeType, name });
    } catch {
      if (mounted.current) setError('앨범을 열지 못했어요. 다시 시도해 주세요.');
    } finally {
      if (!keepActive) setActive(false);
    }
  };

  const confirmCrop = async (rect: CropRect) => {
    if (!crop || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const cropped = await cropImage(crop.uri, rect, crop.mimeType);
      const base = crop.name.replace(/\.[^.]+$/, '');
      await send({ uri: cropped.uri, mimeType: cropped.mimeType, name: `${base}.${extensionOf(cropped.mimeType)}` });
    } catch {
      if (mounted.current) {
        setError('이미지를 자르지 못했어요. 다른 이미지로 다시 시도해 주세요.');
        setCrop(null);
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
      setActive(false);
    }
  };

  const cancelCrop = () => {
    // 자르기·업로드가 이미 진행 중이면(뒤로 가기 등 onRequestClose) 끝날 때까지 대기를 유지한다. confirmCrop이 정리한다.
    if (inFlight.current) return;
    setCrop(null);
    setActive(false);
  };

  return {
    pick,
    crop,
    confirmCrop,
    cancelCrop,
    busy,
    error,
    clearError: () => setError(null),
  };
}
