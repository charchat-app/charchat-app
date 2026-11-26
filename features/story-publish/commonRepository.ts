// CREATE-US-07 공통 저장 (2~4번 + 선택적으로 1번 기본 정보·5번 유저 프로필 프리셋)
import { apiRequest } from '@/lib/api-client';
import {
  toExpressionRow,
  type CreationSaveDocument,
  type CreationSaveState,
  type CreationSaveMode,
  type CreationSaveKind,
} from '@/shared/story-types';
import type { UserProfilePresetRecord } from '@/shared/story-types/presets';
import {
  isContentRating,
  isRatingReviewStatus,
  readRatingReviewReason,
  type ContentRating,
  type RatingReviewReason,
  type RatingReviewStatus,
} from '@/shared/rating';
// 타입만 쓴다(실행 시 shared/media를 불러오지 않는다. 아래 resolveImageUrl 설명 참고).
import type { ImageDto } from '@/shared/media';
import { toWriteDto } from './api';
import { fewshotsPayload, readFewshotsSnapshot, readId, readObject } from './fewshotRepository';
import { affinitiesPayload, readAffinities, readRelations, relationsPayload } from './initialStateRepository';
import { introsPayload, readIntros } from './introRepository';
import { readServerSnapshot } from './serverRepository';
import type { StoryBasicFields } from './types';

/**
 * 공통 저장 문서. 2~4번(CreationSaveDocument)에 선택 영역을 더한다.
 * 공유 타입(shared/story-types)을 바꾸지 않으려고 이 도메인 안에서만 확장한다.
 *
 * - basic: 1번 기본 정보. undefined·null이면 요청에서 빼서 서버가 기존 값을 유지한다.
 * - presets: 5번 유저 프로필 프리셋. undefined·null이면 요청에서 빼서 유지하고, []는 전부 지우라는 뜻이다.
 *   응답에 presets 배열이 있으면 복원하고, 없거나 null이면 undefined로 둔다(빈 목록으로 지어내지 않는다).
 * - images: CREATE-US-07-AC07 「저장」에 함께 반영할 캐릭터 얼굴·스토리(표지) 이미지. undefined·null이면 요청에서 뺀다
 *   (통합 전과 같은 요청). 서버는 「저장」(kind save·mode manual)에서 받고, CREATE-US-07-AC09 자동 임시 저장
 *   (kind temporary·mode auto)에서도 새 캐릭터 얼굴(basic_index)을 받는다. 응답의 임시 저장본 새 캐릭터 얼굴은
 *   stagedCharacterImages로 따로 읽는다.
 * - stagedBasic: CREATE-US-07-AC01/05 조회 응답의 basic(임시 저장본 기본 정보, 쓰기 DTO 모양)을 읽은 값. 읽기 전용이라
 *   저장 요청에는 싣지 않는다(basic과 별개). 응답에 없거나 null이면 키를 두지 않는다(이전 서버 호환).
 *   서버 StoryUpdateRequest는 tags·characters에 null(= 기존 값 유지)을 허용하므로 읽기 쪽만 null을 그대로 둔다
 *   (StagedBasicFields). 쓰기 DTO(StoryBasicFields·toWriteDto)는 바꾸지 않는다.
 * - preserveScene: CREATE-US-07-AC03/07 true이면 요청에 preserve_scene: true를 싣는다. 서버는 잠금 아래에서
 *   최신 2~4번을 다시 읽어 그대로 두고, 함께 보낸 2~4번(호환용 필드)으로 덮어쓰지 않는다.
 *   2~4번을 직접 편집하지 않는 화면(편집 화면의 기본 정보·프리셋·이미지 저장)에서만 쓴다.
 *   2~4번 작업 화면의 저장에는 쓰지 않는다. 그 밖의 값이면 키를 싣지 않는다(기존 요청과 같다). 응답에는 없으므로 복원하지 않는다.
 */
export type CommonSaveDocument = CreationSaveDocument & {
  presetsPending?: boolean;
  basic?: StoryBasicFields | null;
  stagedBasic?: StagedBasicFields;
  /**
   * CREATE-US-07-AC09 응답 전용(읽기): staged_character_images. 임시 저장본 basic.characters의 새 캐릭터(id null)
   * 위치(basic_index)별 얼굴 이미지 목록(순서 = position, /images와 같은 이미지 DTO). 응답에 없거나 null이면 키를 두지 않는다.
   * 저장 요청에는 싣지 않는다(보낼 때는 images.characters[].basic_index를 쓴다).
   */
  stagedCharacterImages?: StagedCharacterImages[];
  presets?: UserProfilePresetRecord[] | null;
  images?: CreationImagesPayload | null;
  preserveScene?: boolean;
  /**
   * CREATE-US-07-AC09 요청 전용: 앞선 자동 임시 저장(mode auto)의 요청 키. 값이 있을 때만 finalize_auto_request_id로 싣는다.
   * 호출자가 명시적으로 넣은 값만 보낸다(응답에서 읽은 finalizableAutoRequestId를 자동으로 싣지 않는다).
   */
  finalizeAutoRequestId?: string;
  /**
   * 응답 전용(읽기): 이 저장 응답이 마무리 가능하다고 알린 자동 저장 키. 응답의 finalize_auto_request_id가
   * 보낸 요청 키와 같고 working_copy_saved_at이 있을 때만 둔다. 저장 요청에는 싣지 않는다.
   */
  finalizableAutoRequestId?: string;
  /**
   * CREATE-US-08 응답 전용(읽기): requested_rating·effective_rating·rating_review_status. 셋 다 응답에 없으면 키를 두지 않는다.
   * 저장 요청에는 싣지 않는다(조회 응답을 펼쳐 다시 보내는 화면이 다른 화면의 선택을 되돌리지 않게, 보낼 때는 requestedRating).
   */
  rating?: CreationRating;
  /**
   * CREATE-US-08-AC13 요청 전용: 편집에서 고른 등급. 값이 있을 때만 requested_rating으로 싣고, undefined·null이면 빼서
   * 서버가 기존 선택을 유지한다. 응답에서 채우지 않는다.
   */
  requestedRating?: ContentRating | null;
  /**
   * CREATE-US-08 응답 전용(읽기): rating_only_working_copy. 응답의 working_copy_saved_at이 가리키는 임시 저장본에
   * 등급 선택만 있고 다른 미반영 영역이 없을 때만 true로 둔다. 그 밖에는 키를 두지 않는다. 저장 요청에는 싣지 않는다.
   */
  ratingOnlyWorkingCopy?: true;
  /**
   * CREATE-US-08-AC13 요청 전용: 등급만 담긴 임시 저장본을 반영하는 「저장」. 보내기 직전 조회한 working_copy_saved_at을
   * finalize_rating_working_copy_at으로 싣는다. kind save·mode manual·preserve_scene이고 basic·presets·images·
   * finalize_auto_request_id가 없을 때만 허용한다(그 밖이면 보내지 않고 오류). 소유·시각 확인은 서버가 잠금 아래에서 한다.
   */
  finalizeRatingWorkingCopyAt?: string;
};

/**
 * CREATE-US-08 공통 저장 응답의 등급.
 * - requested: 편집에서 저장한 선택(비공개·공개 스토리의 임시 저장 선택 포함). 저장한 적이 없으면 null.
 * - effective: 정본에 적용된 등급. 이번 슬라이스의 저장은 바꾸지 않는다. 없으면 null.
 * - reviewStatus: 등급 검토 상태. 없으면 null.
 */
export type CreationRating = {
  requested: ContentRating | null;
  effective: ContentRating | null;
  reviewStatus: RatingReviewStatus | null;
  /**
   * CREATE-US-08-AC09·AC10·AC12 마지막 검토가 적격이 아니었던 이유(rating_review_reason, 허용 목록 코드만).
   * 완료(completed)에는 ineligible·undetermined, 실패(failed)에는 unavailable만 받는다. 없거나 null이면 키를 두지 않는다.
   * null이 아닌데 읽을 수 없거나 상태와 어긋나면 UNRECOGNIZED_REVIEW_REASON(중립 표시)으로 남긴다(통과로 짐작하지 않게).
   */
  reason?: RatingReviewReason | UnrecognizedReviewReason;
};

/** CREATE-US-08 서버가 사유를 보냈지만 읽을 수 없음(원문은 두지 않는다). 화면은 통과·부적격 어느 쪽도 말하지 않는다. */
export type UnrecognizedReviewReason = { outcome: 'unrecognized' };
export const UNRECOGNIZED_REVIEW_REASON: UnrecognizedReviewReason = Object.freeze({ outcome: 'unrecognized' });

/**
 * 임시 저장본 기본 정보(읽기 전용). tags·characters가 null이면 서버가 그 항목을 바꾸지 않고 유지한다는 뜻이다
 * (KEEP). 이때는 정본 값을 이어 써야 하며 빈 목록([])으로 바꾸지 않는다. []는 모두 지운 값이다.
 */
export type StagedBasicFields = Omit<StoryBasicFields, 'tags' | 'characters'> & {
  tags: StoryBasicFields['tags'] | null;
  characters: StoryBasicFields['characters'] | null;
};

/** CREATE-US-07-AC09 임시 저장본 새 캐릭터 한 명(basic_index)의 얼굴 이미지 목록. 이미지는 /images와 같은 DTO다. */
export type StagedCharacterImages = { basicIndex: number; images: ImageDto[] };

/**
 * 캐릭터 하나의 얼굴 이미지 목록 전체(순서 = position). 대상은 둘 중 하나만 쓴다.
 * - basic_index: 이번 요청 basic.characters에서 id가 null인 새 캐릭터의 위치(0부터)
 * - character_id: 이미 저장된 캐릭터 (basic.characters에 있어야 한다)
 */
export type CreationCharacterImagesPayload =
  { basic_index: number; image_ids: number[] } | { character_id: number; image_ids: number[] };
/**
 * images 영역.
 * - characters: 바꿀 캐릭터 얼굴 이미지 목록. 바꿀 것이 없으면 빈 목록.
 * - story_image_ids: 스토리(표지) 이미지 id 전체(순서 = position). 키가 없거나 null이면 서버가 기존 표지를 유지하고,
 *   []이면 표지를 모두 지운다. 표지를 바꾼 경우에만 싣는다.
 */
export type CreationImagesPayload = {
  characters: CreationCharacterImagesPayload[];
  story_image_ids?: number[] | null;
};

export interface CommonSaveRepository {
  load(id: string, signal?: AbortSignal): Promise<CommonSaveDocument>;
  save(
    document: CommonSaveDocument,
    state: CreationSaveState,
    mode: CreationSaveMode,
    requestId: string,
    kind?: CreationSaveKind,
  ): Promise<CommonSaveDocument>;
}

/** 프리셋 요청·응답 한 건 (서버 프로토타입: id·name·image_id·description) */
type PresetDto = { id: number | null; name: string | null; image_id: number | null; description: string | null };

function emptyToNull(value: string): string | null {
  return value === '' ? null : value;
}

/** 서버가 발급한 프리셋 id만 보낸다. 서버가 발급하지 않은 id를 보내면 다른 프리셋으로 처리될 수 있어 막는다. */
function toServerPresetId(value: string): number {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error(`서버에 저장되지 않은 프로필 id입니다: ${value}`);
  return Number(value);
}

export function presetsPayload(presets: UserProfilePresetRecord[]): PresetDto[] {
  return presets.map((preset) => ({
    id: preset.id === undefined ? null : toServerPresetId(preset.id),
    name: emptyToNull(preset.name),
    image_id: preset.imageId ?? null,
    description: emptyToNull(preset.detail),
  }));
}

function readImageId(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    throw new Error('프로필 이미지 응답을 확인할 수 없습니다.');
  return value;
}

function readText(value: unknown): string {
  if (value === null) return '';
  if (typeof value !== 'string') throw new Error('프로필 응답을 확인할 수 없습니다.');
  return value;
}

/**
 * 응답 프리셋의 표시용 주소(image_url, 읽기 전용)를 이 저장소의 API 주소(baseUrl) 기준 전체 주소로 바꾼다.
 * 서버 루트 기준 경로("/..."로 시작, "//"·"\" 없음)만 받고, 결과가 API 주소와 같은 출처일 때만 쓴다.
 * 그 밖의 값(절대 주소·다른 출처·상대 경로·baseUrl이 전체 주소가 아님)은 미리보기 없음(null)으로 둔다.
 * shared/media(react-native 의존)를 거치지 않는다: scripts/test-expression-server.cjs가 Node만으로 이 파일을 불러온다.
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
 * 응답의 presets를 복원한다. 없거나 null이면 undefined(서버가 알려 주지 않음).
 * 표시용 주소(photoUrl):
 * - 응답에 image_url 키가 있으면 그 값만 쓴다. null이거나 받을 수 없는 값이면 미리보기 없음(null).
 * - image_url 키가 없는 이전 응답이면 보낸 문서에서 같은 이미지 id의 주소를 이어 쓴다(메모리 내 대체).
 * image_url은 표시용일 뿐이라 저장 요청(presetsPayload)에는 보내지 않는다.
 */
export function readPresets(
  value: unknown,
  submitted?: UserProfilePresetRecord[] | null,
  baseUrl = '',
  pending = false,
): UserProfilePresetRecord[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error('프로필 응답을 확인할 수 없습니다.');
  const photoByImage = new Map<number, string>();
  for (const preset of submitted ?? []) {
    if (typeof preset.imageId === 'number' && preset.photoUrl) photoByImage.set(preset.imageId, preset.photoUrl);
  }
  const ids = new Set<string>();
  return value.map((item) => {
    const row = readObject(item);
    // 임시본의 새 프리셋은 최종 반영 전까지 서버 ID가 없다.
    const id = pending && row.id === null ? undefined : readId(row.id);
    if (id !== undefined) {
      if (ids.has(id)) throw new Error('중복된 프로필 응답입니다.');
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

function readBasicText(value: unknown): string {
  if (value === null) return '';
  if (typeof value !== 'string') throw new Error('임시 저장 기본 정보 응답을 확인할 수 없습니다.');
  return value;
}

/**
 * CREATE-US-07-AC01/05 공통 저장 조회의 basic(임시 저장본 기본 정보, 쓰기 DTO 모양)을 편집 화면 값으로 읽는다.
 * 완성 조건을 채우지 않은 원문(null)은 빈 문자열로 복원하고, id가 null인 캐릭터(아직 서버 id 없음)는 id 없이 둔다.
 * tags·characters가 null이면 null(기존 값 유지)로 두고, []는 빈 목록(모두 지움)으로 구분해 둔다.
 * 없거나 null이면 undefined(복원하지 않음). 모양이 다르거나 캐릭터 id가 겹치면 받지 않는다.
 */
export function readStagedBasic(value: unknown): StagedBasicFields | undefined {
  if (value === undefined || value === null) return undefined;
  const fail = () => new Error('임시 저장 기본 정보 응답을 확인할 수 없습니다.');
  if (typeof value !== 'object' || Array.isArray(value)) throw fail();
  const row = value as Record<string, unknown>;
  const readTags = (raw: unknown): string[] | null => {
    if (raw === null) return null;
    if (!Array.isArray(raw) || !raw.every((tag): tag is string => typeof tag === 'string')) throw fail();
    return [...raw];
  };
  const readCharacters = (raw: unknown): StoryBasicFields['characters'] | null => {
    if (raw === null) return null;
    if (!Array.isArray(raw)) throw fail();
    const ids = new Set<string>();
    return raw.map((item: unknown) => {
      const ch = readObject(item);
      const id = ch.id === null ? undefined : readId(ch.id);
      if (id !== undefined) {
        if (ids.has(id)) throw fail();
        ids.add(id);
      }
      return {
        ...(id === undefined ? {} : { id }),
        name: readBasicText(ch.name),
        detail: readBasicText(ch.description),
      };
    });
  };
  return {
    title: readBasicText(row.title),
    subtitle: readBasicText(row.subtitle),
    world: readBasicText(row.world_description),
    tags: readTags(row.tags),
    characters: readCharacters(row.characters),
  };
}

/**
 * CREATE-US-07-AC09 조회·저장 응답의 staged_character_images를 읽는다. 없거나 null이면 undefined(복원하지 않음).
 * basic_index는 0 이상의 정수이고 겹치지 않아야 하며, 이미지는 /images와 같은 DTO(image_id·mime_type·byte_size·url)다.
 * 모양이 다르면 받지 않는다. basic_index가 임시 저장본의 새 캐릭터를 가리키는지는 화면이 복원할 때 확인한다.
 */
export function readStagedCharacterImages(value: unknown): StagedCharacterImages[] | undefined {
  if (value === undefined || value === null) return undefined;
  const fail = () => new Error('임시 저장 캐릭터 이미지 응답을 확인할 수 없습니다.');
  if (!Array.isArray(value)) throw fail();
  const seen = new Set<number>();
  return value.map((item: unknown) => {
    const row = readObject(item);
    const index = row.basic_index;
    if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0 || seen.has(index)) throw fail();
    seen.add(index);
    if (!Array.isArray(row.images)) throw fail();
    const images = row.images.map((raw: unknown): ImageDto => {
      const image = readObject(raw);
      const { image_id, mime_type, byte_size, url } = image;
      if (
        typeof image_id !== 'number' ||
        !Number.isSafeInteger(image_id) ||
        image_id <= 0 ||
        typeof mime_type !== 'string' ||
        typeof byte_size !== 'number' ||
        typeof url !== 'string'
      )
        throw fail();
      return { image_id, mime_type, byte_size, url };
    });
    return { basicIndex: index, images };
  });
}

/**
 * CREATE-US-08 응답의 등급 필드를 읽는다. 셋 다 없으면 undefined(서버가 알려 주지 않음). null은 null로 두고,
 * 알 수 없는 값은 받지 않는다.
 */
export function readRating(source: Record<string, unknown>): CreationRating | undefined {
  const { requested_rating: requested, effective_rating: effective, rating_review_status: status } = source;
  if (requested === undefined && effective === undefined && status === undefined) return undefined;
  const fail = () => new Error('등급 응답을 확인할 수 없습니다.');
  const rating = (raw: unknown): ContentRating | null => {
    if (raw === undefined || raw === null) return null;
    if (!isContentRating(raw)) throw fail();
    return raw;
  };
  if (status !== undefined && status !== null && !isRatingReviewStatus(status)) throw fail();
  const reviewStatus = status === undefined || status === null ? null : status;
  const reason = readReasonFor(reviewStatus, source.rating_review_reason);
  return {
    requested: rating(requested),
    effective: rating(effective),
    reviewStatus,
    ...(reason ? { reason } : {}),
  };
}

/**
 * CREATE-US-08-AC09·AC10·AC12 검토 사유를 허용 목록으로 읽고, 검토 상태와 맞을 때만 쓴다
 * (완료 = ineligible·undetermined, 실패 = unavailable). 없거나 null이면 null이다.
 * null이 아닌 값이 읽을 수 없거나 상태와 어긋나면 중립 표시(UNRECOGNIZED_REVIEW_REASON)를 돌려준다.
 * 사유가 이상해도 나머지 응답은 읽는다.
 */
function readReasonFor(
  status: RatingReviewStatus | null,
  raw: unknown,
): RatingReviewReason | UnrecognizedReviewReason | null {
  if (raw === undefined || raw === null) return null;
  const reason = readRatingReviewReason(raw);
  if (reason !== null && status === 'completed' && reason.outcome !== 'unavailable') return reason;
  if (reason !== null && status === 'failed' && reason.outcome === 'unavailable') return reason;
  return UNRECOGNIZED_REVIEW_REASON;
}

function parse(
  value: unknown,
  baseUrl: string,
  id: string,
  key?: string,
  submitted?: CommonSaveDocument,
): CommonSaveDocument {
  const few = readFewshotsSnapshot(value, id, key);
  const source = value as Record<string, unknown>;
  const document: CommonSaveDocument = {
    ...few,
    speech: readServerSnapshot(value, id, key).speech,
    intros: readIntros(source.intros, few.characters),
    relations: readRelations(source.relations, few.characters),
    affinities: readAffinities(source.affinities, few.characters),
    workingCopySavedAt: readSavedAt(source.working_copy_saved_at),
    imagesWorkingCopySavedAt: readSavedAt(source.images_working_copy_saved_at),
  };
  const presets = readPresets(source.presets, submitted?.presets, baseUrl, source.presets_pending === true);
  if (source.presets_pending === true) document.presetsPending = true;
  if (presets !== undefined) document.presets = presets;
  const stagedBasic = readStagedBasic(source.basic);
  if (stagedBasic !== undefined) document.stagedBasic = stagedBasic;
  const stagedImages = readStagedCharacterImages(source.staged_character_images);
  if (stagedImages !== undefined) document.stagedCharacterImages = stagedImages;
  const finalizable = readFinalizableAutoRequestId(source, key);
  if (finalizable !== undefined) document.finalizableAutoRequestId = finalizable;
  const rating = readRating(source);
  if (rating !== undefined) document.rating = rating;
  if (source.rating_only_working_copy === true && document.workingCopySavedAt) document.ratingOnlyWorkingCopy = true;
  return document;
}
/**
 * 응답의 마무리 가능 여부를 따로 읽는다. finalize_auto_request_id가 이번에 보낸 요청 키와 같고
 * working_copy_saved_at이 있을 때만 그 키를 돌려준다. 그 밖(키 없음·다른 키·임시 저장본 시각 없음·조회 응답)은 undefined.
 */
function readFinalizableAutoRequestId(source: Record<string, unknown>, key?: string): string | undefined {
  const value = source.finalize_auto_request_id;
  if (key === undefined || typeof value !== 'string' || value === '' || value !== key) return undefined;
  return readSavedAt(source.working_copy_saved_at) === null ? undefined : value;
}
function readSavedAt(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}
export function createCommonSaveRepository(
  baseUrl: string,
  authorization: () => Promise<HeadersInit> = async () => ({}),
): CommonSaveRepository {
  const path = (id: string) => {
    if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) throw new Error('스토리 ID를 확인해 주세요.');
    return `/creation/stories/${id}/creation`;
  };
  return {
    async load(id, signal) {
      return parse(await apiRequest(path(id), { signal, headers: await authorization() }, baseUrl), baseUrl, id);
    },
    async save(document, state, mode, requestId, kind = 'save') {
      // 새 캐릭터 이미지(basic_index)는 「저장」(save·manual)과 CREATE-US-07-AC09 자동 임시 저장(temporary·auto)에만 싣는다.
      // 직접 임시 저장(CREATE-US-05-AC06, temporary·manual)은 지금처럼 이미지를 싣지 않는다.
      const indexedAllowed = (kind === 'save' && mode === 'manual') || (kind === 'temporary' && mode === 'auto');
      if (!indexedAllowed && document.images?.characters?.some((entry) => 'basic_index' in entry))
        throw new Error('새 캐릭터 이미지는 「저장」이나 자동 임시 저장에서만 함께 보낼 수 있습니다.');
      const finalizeRatingAt =
        typeof document.finalizeRatingWorkingCopyAt === 'string' && document.finalizeRatingWorkingCopyAt
          ? document.finalizeRatingWorkingCopyAt
          : null;
      if (
        finalizeRatingAt !== null &&
        (kind !== 'save' ||
          mode !== 'manual' ||
          document.preserveScene !== true ||
          document.basic ||
          document.presets ||
          document.images ||
          document.finalizeAutoRequestId)
      )
        throw new Error('등급만 담긴 임시 저장본은 다른 변경 없이 「저장」으로만 반영할 수 있습니다.');
      const { story_id: _storyId, ...expression } = toExpressionRow(document.id, document.speech);
      const headers = new Headers(await authorization());
      headers.set('Idempotency-Key', requestId);
      return parse(
        await apiRequest(
          path(document.id),
          {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              expression,
              ...fewshotsPayload(document.fewshots),
              ...introsPayload(document.intros),
              ...relationsPayload(document.relations),
              ...affinitiesPayload(document.affinities),
              // undefined·null은 보내지 않는다 = 서버가 기존 값을 유지한다
              ...(document.basic ? { basic: toWriteDto(document.basic) } : {}),
              ...(document.presets ? { presets: presetsPayload(document.presets) } : {}),
              ...(document.images ? { images: document.images } : {}),
              ...(document.preserveScene === true ? { preserve_scene: true } : {}),
              // CREATE-US-08-AC13 고른 등급만 싣는다. 빠지면 서버가 기존 선택을 유지한다.
              ...(isContentRating(document.requestedRating) ? { requested_rating: document.requestedRating } : {}),
              // 명시적으로 넣은 마무리 키만 싣는다
              ...(typeof document.finalizeAutoRequestId === 'string' && document.finalizeAutoRequestId
                ? { finalize_auto_request_id: document.finalizeAutoRequestId }
                : {}),
              ...(finalizeRatingAt !== null ? { finalize_rating_working_copy_at: finalizeRatingAt } : {}),
              save_state: state,
              kind,
              mode,
            }),
          },
          baseUrl,
        ),
        baseUrl,
        document.id,
        requestId,
        document,
      );
    },
  };
}
