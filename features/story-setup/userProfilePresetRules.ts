// CREATE-US-05 제작자 추천 유저 프로필 프리셋: 편집 규칙·검증·저장 조각 변환 (순수 함수)
// 저장 로직은 story-publish에만 둔다. 여기서는 입력값 ↔ StoryDraft 조각 변환과 검증만 한다.
import {
  MAX_PRESET_TEXT_LENGTH,
  MAX_USER_PROFILE_PRESETS,
  USER_NAME_PLACEHOLDER,
  type PresetImage,
  type UserProfilePresetRecord,
} from '@/shared/story-types/presets';

import { tagKey } from './tags';

/** 입력 중인 프리셋 한 건. key는 화면 목록용 고유값이고 저장되지 않는다. */
export type PresetValues = Omit<UserProfilePresetRecord, 'imageId'> & {
  key: string;
  /** 서버 이미지 정수 id. 이미지가 없으면 null. photoUrl은 표시용일 뿐 이미지 유무의 기준이 아니다. */
  imageId: number | null;
};

export type PresetIssueCode =
  | 'name-empty'
  | 'name-surrounding-space'
  | 'name-duplicate-character'
  | 'name-duplicate-preset'
  | 'text-too-long'
  | 'image-missing'
  | 'too-many';

export type PresetIssue = {
  /** 문제가 있는 프리셋의 key. 목록 전체 문제(field 'list')는 빈 문자열 */
  key: string;
  field: 'name' | 'text' | 'image' | 'list';
  code: PresetIssueCode;
  message: string;
};

export type PresetValidation = {
  issues: PresetIssue[];
  /** 문제가 하나도 없으면 완료. 문제가 있어도 임시 저장 조각(presetsToDraftPatch)은 만들 수 있다. */
  isComplete: boolean;
};

/** 글자 수: 다듬거나 치환하지 않은 원문을 유니코드 코드 포인트 단위로 센다. */
export function presetTextLength(text: string): number {
  return Array.from(text).length;
}

/** 프리셋 하나의 글자 수: 이름+상세 원문의 합 (AC05) */
export function presetTotalLength(preset: Pick<PresetValues, 'name' | 'detail'>): number {
  return presetTextLength(preset.name) + presetTextLength(preset.detail);
}

/**
 * 이름 비교 키. 앱의 기존 이름 비교 기준(tags.ts의 tagKey: 공백 제거 + 소문자)을 그대로 쓴다.
 * 유니코드 정규화 등은 더하지 않는다. 비교에만 쓰고 저장 표기는 바꾸지 않는다.
 */
export function presetNameKey(name: string): string {
  return tagKey(name);
}

/** 이름이 {{user}} 그대로인가. 앞뒤 공백이나 다른 글자가 붙으면 아니다. */
export function isUserNamePreset(name: string): boolean {
  return name === USER_NAME_PLACEHOLDER;
}

/**
 * 목록 전체를 보고 문제를 모은다. 항목을 고치거나 지우지 않는다.
 * @param characterNames 등장 캐릭터 이름들. 직접 지은 프리셋 이름은 이들과 같을 수 없다.
 */
export function validatePresets(presets: PresetValues[], characterNames: string[] = []): PresetValidation {
  const issues: PresetIssue[] = [];

  if (presets.length > MAX_USER_PROFILE_PRESETS) {
    issues.push({
      key: '',
      field: 'list',
      code: 'too-many',
      message: `프로필은 최대 ${MAX_USER_PROFILE_PRESETS}개까지 둘 수 있어요.`,
    });
  }

  const characterByKey = new Map<string, string>();
  for (const name of characterNames) {
    const key = presetNameKey(name);
    if (key !== '' && !characterByKey.has(key)) characterByKey.set(key, name);
  }

  const presetByKey = new Map<string, string>();
  for (const p of presets) {
    if (p.name === '') {
      issues.push({
        key: p.key,
        field: 'name',
        code: 'name-empty',
        message: '이름을 입력하거나 ‘플레이하는 유저 이름 사용하기’를 선택해 주세요.',
      });
    } else if (!isUserNamePreset(p.name)) {
      // 직접 지은 이름만 규칙을 적용한다. {{user}} 그대로인 이름은 반복해도 유효하다.
      if (p.name !== p.name.trim()) {
        issues.push({
          key: p.key,
          field: 'name',
          code: 'name-surrounding-space',
          message: '이름 앞뒤에 공백이 있어요. 공백을 지워 주세요.',
        });
      }
      const nameKey = presetNameKey(p.name);
      if (nameKey !== '') {
        const character = characterByKey.get(nameKey);
        if (character !== undefined) {
          issues.push({
            key: p.key,
            field: 'name',
            code: 'name-duplicate-character',
            message: `등장 캐릭터 '${character}'와 같은 이름이에요. 대소문자와 띄어쓰기는 구분하지 않아요.`,
          });
        }
        const first = presetByKey.get(nameKey);
        if (first !== undefined) {
          issues.push({
            key: p.key,
            field: 'name',
            code: 'name-duplicate-preset',
            message: `'${first}'와 같은 이름이에요. 대소문자와 띄어쓰기는 구분하지 않아요.`,
          });
        } else {
          presetByKey.set(nameKey, p.name);
        }
      }
    }

    const total = presetTotalLength(p);
    if (total > MAX_PRESET_TEXT_LENGTH) {
      issues.push({
        key: p.key,
        field: 'text',
        code: 'text-too-long',
        message: `이름과 상세를 합쳐 ${total}자예요. ${MAX_PRESET_TEXT_LENGTH}자까지 쓸 수 있어요.`,
      });
    }

    if (p.imageId === null) {
      issues.push({ key: p.key, field: 'image', code: 'image-missing', message: '이미지를 선택해 주세요.' });
    }
  }

  return { issues, isComplete: issues.length === 0 };
}

/**
 * 화면용 key는 출처별 접두사로 나눈다. 저장된 프리셋은 `saved:<id>`, 아직 저장하지 않은 프리셋은 `local:<순번>`.
 * 서버 id가 어떤 문자열이든 로컬 key와 겹치지 않는다.
 */
const SAVED_KEY_PREFIX = 'saved:';
const LOCAL_KEY_PREFIX = 'local:';

/** 저장된 프리셋 id로 만든 화면용 key */
export function savedPresetKey(id: string): string {
  return `${SAVED_KEY_PREFIX}${id}`;
}

let keySeq = 0;
/** 아직 저장하지 않은 프리셋의 화면용 key */
export function newPresetKey(): string {
  keySeq += 1;
  return `${LOCAL_KEY_PREFIX}${keySeq}`;
}

/** 저장된 프리셋에서 입력값을 만든다. id가 있으면 saved key로 이어 쓰고, imageId가 없으면 이미지 없음(null)으로 본다. */
export function presetsFromDraft(saved: UserProfilePresetRecord[]): PresetValues[] {
  return saved.map((p) => ({
    ...p,
    imageId: p.imageId ?? null,
    key: p.id === undefined ? newPresetKey() : savedPresetKey(p.id),
  }));
}

/**
 * 입력값을 저장할 StoryDraft 조각으로 바꾼다. 문제가 있어도 임시 저장할 수 있게 항상 만들고,
 * 이름·상세 원문({{user}} 포함)·순서·id·imageId·photoUrl을 그대로 둔다. key는 넣지 않고 id가 없으면 id 키도 만들지 않는다.
 */
export function presetsToDraftPatch(presets: PresetValues[]): { userProfilePresets: UserProfilePresetRecord[] } {
  return {
    userProfilePresets: presets.map(({ id, name, detail, imageId, photoUrl }) =>
      id === undefined ? { name, detail, imageId, photoUrl } : { id, name, detail, imageId, photoUrl },
    ),
  };
}

/** 최대 개수에 닿으면 그대로 돌려준다. */
export function addPreset(presets: PresetValues[]): PresetValues[] {
  if (presets.length >= MAX_USER_PROFILE_PRESETS) return presets;
  return [...presets, { key: newPresetKey(), name: '', detail: '', imageId: null, photoUrl: null }];
}

/** 선택한 항목만 빼고 남은 항목의 값과 순서는 그대로 둔다. */
export function removePreset(presets: PresetValues[], key: string): PresetValues[] {
  return presets.filter((p) => p.key !== key);
}

export function updatePreset(
  presets: PresetValues[],
  key: string,
  patch: Partial<Pick<PresetValues, 'name' | 'detail'>>,
): PresetValues[] {
  return presets.map((p) => (p.key === key ? { ...p, ...patch } : p));
}

/** 플레이하는 유저 이름 사용하기: 켜면 이름을 {{user}} 그대로로, 끄면 비운다. */
export function setUserNamePreset(presets: PresetValues[], key: string, use: boolean): PresetValues[] {
  return updatePreset(presets, key, { name: use ? USER_NAME_PLACEHOLDER : '' });
}

/** 플레이하는 유저 이름 사용하기 토글: 넘겨받은 최신 목록의 현재 이름을 보고 켜거나 끈다. 없는 key면 같은 배열 */
export function toggleUserNamePreset(presets: PresetValues[], key: string): PresetValues[] {
  const current = presets.find((p) => p.key === key);
  if (current === undefined) return presets;
  return setUserNamePreset(presets, key, !isUserNamePreset(current.name));
}

/** 이미 올라가 있는 이미지를 지정하거나(null이면 해제) 한다. 업로드는 여기서 하지 않는다. */
export function setPresetImage(presets: PresetValues[], key: string, image: PresetImage | null): PresetValues[] {
  return presets.map((p) =>
    p.key === key ? { ...p, imageId: image?.imageId ?? null, photoUrl: image?.photoUrl ?? null } : p,
  );
}

/** key 항목을 offset칸 옮긴다(-1 위, +1 아래). 범위를 벗어나거나 없는 key면 같은 배열을 돌려준다. */
export function movePreset(presets: PresetValues[], key: string, offset: number): PresetValues[] {
  const from = presets.findIndex((p) => p.key === key);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= presets.length || offset === 0) return presets;
  const next = [...presets];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** 화면에 넘길 위치별 문구. key는 '<프리셋 key>.name' | '.text' | '.image' | 'list' */
export function issuesToErrors(issues: PresetIssue[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const where = issue.field === 'list' ? 'list' : `${issue.key}.${issue.field}`;
    if (errors[where] === undefined) errors[where] = issue.message;
  }
  return errors;
}
