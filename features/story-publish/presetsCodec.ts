// CREATE-US-05 공통 저장(/creation)의 유저 프로필 프리셋 요청·응답 변환
import type { UserProfilePresetRecord } from '@/shared/story-types/presets';

/** 프리셋 요청·응답 한 건 (서버: id·name·image_id·description. 응답에는 읽기 전용 image_url이 더해질 수 있다) */
type PresetDto = { id: number | null; name: string | null; image_id: number | null; description: string | null };

const invalid = () => new Error('프로필 응답을 확인할 수 없습니다.');

function emptyToNull(value: string): string | null {
  return value === '' ? null : value;
}

/** 서버가 발급한 프리셋 id만 보낸다. 서버가 발급하지 않은 id를 보내면 다른 프리셋으로 처리될 수 있어 막는다. */
function toServerPresetId(value: string): number {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error(`서버에 저장되지 않은 프로필 id입니다: ${value}`);
  return Number(value);
}

/**
 * 요청 본문의 presets. 이름·상세 원문({{user}} 포함)과 순서를 그대로 보낸다.
 * 빈 배열은 전부 지우라는 뜻이므로 호출자는 []를 그대로 넘긴다. 표시용 주소(photoUrl)는 보내지 않는다.
 */
export function presetsPayload(presets: UserProfilePresetRecord[]): PresetDto[] {
  return presets.map((preset) => ({
    id: preset.id === undefined ? null : toServerPresetId(preset.id),
    name: emptyToNull(preset.name),
    image_id: preset.imageId ?? null,
    description: emptyToNull(preset.detail),
  }));
}

function readRow(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}

function readId(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value))) return value;
  throw invalid();
}

function readImageId(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw invalid();
  return value;
}

function readText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') throw invalid();
  return value;
}

/**
 * 응답 프리셋의 표시용 주소(image_url)를 저장소의 API 주소(baseUrl) 기준 전체 주소로 바꾼다.
 * 서버 루트 기준 경로("/"로 시작, "//"·"\"·공백 없음)만 받고, 결과가 API 주소와 같은 출처일 때만 쓴다.
 * 그 밖의 값은 미리보기 없음(null)으로 둔다.
 */
function resolveImageUrl(value: unknown, baseUrl: string): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\s\\]/.test(value))
    return null;
  try {
    const base = new URL(baseUrl);
    const resolved = new URL(value, base);
    return resolved.origin === base.origin ? resolved.toString() : null;
  } catch {
    return null;
  }
}

/**
 * 응답의 presets를 복원한다. 없거나 null이면 undefined(서버가 알려 주지 않음 — 빈 목록으로 지어내지 않는다).
 * - pending(presets_pending): 임시 저장본의 새 프리셋은 반영 전까지 서버 id가 없으므로 id null을 허용한다.
 * - 표시용 주소: image_url 키가 있으면 그 값만 쓰고, 키가 없는 응답이면 보낸 문서에서 같은 이미지 id의 주소를 이어 쓴다.
 */
export function readPresets(
  value: unknown,
  submitted: UserProfilePresetRecord[] | null | undefined,
  baseUrl: string,
  pending: boolean,
): UserProfilePresetRecord[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw invalid();
  const photoByImage = new Map<number, string>();
  for (const preset of submitted ?? []) {
    if (typeof preset.imageId === 'number' && preset.photoUrl) photoByImage.set(preset.imageId, preset.photoUrl);
  }
  const ids = new Set<string>();
  return value.map((item) => {
    const row = readRow(item);
    const id = pending && row.id === null ? undefined : readId(row.id);
    if (id !== undefined) {
      if (ids.has(id)) throw invalid();
      ids.add(id);
    }
    const imageId = readImageId(row.image_id);
    return {
      ...(id === undefined ? {} : { id }),
      name: readText(row.name),
      detail: readText(row.description),
      imageId,
      photoUrl:
        imageId === null
          ? null
          : Object.hasOwn(row, 'image_url')
            ? resolveImageUrl(row.image_url, baseUrl)
            : (photoByImage.get(imageId) ?? null),
    };
  });
}
