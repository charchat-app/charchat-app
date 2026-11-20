/**
 * 이미지 업로드 API (CREATE-US-06). 화면은 fetch를 직접 쓰지 않고 이 파일을 거친다.
 * 파일은 서버가 로컬 저장소에 보관하고, 응답의 url은 서버 기준 경로다.
 */
import { Platform } from 'react-native';

import { ApiError, apiRequest, authHeaders } from '@/lib/api-client';

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

/**
 * 서버 이미지 파일 주소인지. 미등록·비공개 스토리나 아직 연결하지 않은 사진은 소유자만 볼 수 있어
 * 이 주소를 불러올 때는 인증 헤더를 붙여야 한다. 기기에서 고른 사진(file:, blob:, data:)은 해당하지 않는다.
 */
export function isServerImage(uri: string): boolean {
  return /^https?:\/\//.test(uri) && uri.includes('/creation/image-files/');
}

/** 이미지 요청에 붙일 source. 기기(iOS·안드로이드)의 Image는 headers를 그대로 지원한다. */
export function imageSource(uri: string): { uri: string; headers?: Record<string, string> } {
  return isServerImage(uri) ? { uri, headers: authHeaders() } : { uri };
}

/**
 * 웹 전용: 웹의 Image는 요청 헤더를 붙일 수 없으므로, 인증 헤더로 파일을 받아 임시 주소(blob:)로 바꾼다.
 * 쓰고 난 주소는 호출 측이 URL.revokeObjectURL로 해제한다.
 */
export async function loadImageObjectUrl(uri: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(uri, { headers: authHeaders(), signal });
  if (!response.ok) throw new ApiError(response.status, 'IMAGE_LOAD_FAILED', '이미지를 불러오지 못했습니다.');
  return URL.createObjectURL(await response.blob());
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
