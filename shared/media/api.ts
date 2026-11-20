/**
 * 이미지 업로드 API (CREATE-US-06). 화면은 fetch를 직접 쓰지 않고 이 파일을 거친다.
 * 파일은 서버가 로컬 저장소에 보관하고, 응답의 url은 서버 기준 경로다.
 */
import { Platform } from 'react-native';

import { apiRequest } from '@/lib/api-client';

import type { ImageTarget } from './rules';

/** 서버에 올라간 이미지 한 장. 대상 연결은 목록 저장에서 한다. */
export type MediaImage = {
  imageId: number;
  mimeType: string;
  byteSize: number;
  /** 화면에 바로 쓸 수 있는 전체 주소 */
  uri: string;
};

export type ImageDto = { image_id: number; mime_type: string; byte_size: number; url: string };

/** 업로드할 파일. 웹은 blob:/data: 주소, 기기는 file:// 주소다. */
export type UploadSource = { uri: string; mimeType: string; name: string };

const UPLOAD_TIMEOUT_MS = 60000;

/** 서버가 준 경로(/api/v1/...)를 API 서버 주소 기준 전체 주소로 바꾼다. */
export function imageUri(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  const base = process.env.EXPO_PUBLIC_API_URL ?? '';
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

export function fromImageDto(dto: ImageDto): MediaImage {
  return { imageId: dto.image_id, mimeType: dto.mime_type, byteSize: dto.byte_size, uri: imageUri(dto.url) };
}

async function toFormData(source: UploadSource): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(source.uri)).blob();
    form.append('file', blob, source.name);
  } else {
    // React Native의 FormData는 { uri, name, type } 객체로 파일을 보낸다(웹 Blob 타입과 다름).
    form.append('file', { uri: source.uri, name: source.name, type: source.mimeType } as unknown as Blob);
  }
  return form;
}

/** AC02: 업로드. 형식·5MB·GIF 대상 검사는 서버가 최종 판단한다. */
export async function uploadImage(
  source: UploadSource,
  target: ImageTarget,
  signal?: AbortSignal,
): Promise<MediaImage> {
  const dto = await apiRequest<ImageDto>(`/creation/images?target=${target}`, {
    method: 'POST',
    body: await toFormData(source),
    timeoutMs: UPLOAD_TIMEOUT_MS,
    signal,
  });
  return fromImageDto(dto);
}
