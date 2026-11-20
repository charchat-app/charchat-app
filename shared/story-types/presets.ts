// CREATE-US-05 제작자 추천 유저 프로필 프리셋 타입. 이 파일만 새로 추가했고 index.ts는 건드리지 않았다.
import type { UserProfilePreset } from './index';

/** 제작자 추천 프로필은 스토리당 최대 5개 (StoryDraft.userProfilePresets 0~5개) */
export const MAX_USER_PROFILE_PRESETS = 5;

/** 프리셋 하나의 이름+상세 합계 글자 수 한도. 공백·줄바꿈·{{user}}를 포함한 코드 포인트 기준 (AC05) */
export const MAX_PRESET_TEXT_LENGTH = 1000;

/** 플레이하는 유저 이름 사용하기를 고르면 이름에 이 값을 그대로 쓴다. 치환하지 않고 원문 저장 (AC03) */
export const USER_NAME_PLACEHOLDER = '{{user}}';

/**
 * 저장된 프리셋 한 건. 서버가 id를 발급하면 이름·순서를 바꿔도 같은 프리셋으로 이어진다.
 * 아직 저장하지 않은 새 프리셋은 id가 없다. UserProfilePreset(index.ts)에 id·imageId가 없어 여기서 확장한다.
 *
 * - imageId: 서버가 발급한 이미지 정수 id. 이미지가 있는지는 이 값으로 판단한다. 없거나 null이면 이미지 없음.
 * - photoUrl: 화면 표시용 주소. 이미지 identity가 아니다.
 */
export type UserProfilePresetRecord = UserProfilePreset & { id?: string; imageId?: number | null };

/** 고른 이미지 한 장: 서버 정수 id와 표시용 주소 */
export type PresetImage = { imageId: number; photoUrl: string | null };
