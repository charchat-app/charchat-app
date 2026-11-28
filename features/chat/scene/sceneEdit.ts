// CHAT-US-08 장면 정보 수정 폼: 입력 검사, 바뀐 칸만 담은 요청 만들기, 서버 거절(409·422)을 화면 문구로 바꾸기.
// 값 규칙은 서버 parse_info 왕복 검사와 같은 상한을 앱에서 먼저 본다. 최종 판정은 서버가 한다.
import { splitLines } from '@/features/chat/assistantParser';
import { ApiError } from '@/lib/api-client';
import {
  SCENE_LIMITS,
  type CurrentScene,
  type SceneDate,
  type SceneDateMode,
  type SceneInfoUpdateInput,
} from '@/shared/story-types';

export type SceneFormCharacter = { name: string; clothing: string; innerThought: string };

/** 입력 원문. 숫자 칸도 입력 그대로 문자열로 둔다. */
export type SceneForm = {
  era: string;
  year: string;
  month: string;
  day: string;
  referenceEvent: string;
  elapsedDay: string;
  hour: string;
  minute: string;
  place: string;
  characters: SceneFormCharacter[];
};

/** 오류를 붙일 자리. 캐릭터 칸은 이름으로 구분한다. `form`은 폼 맨 위 안내다. */
export type SceneErrorKey = 'form' | 'date' | 'time' | 'place' | `clothing:${string}` | `innerThought:${string}`;
export type SceneErrors = Partial<Record<SceneErrorKey, string>>;

export const clothingKey = (name: string): SceneErrorKey => `clothing:${name}`;
export const thoughtKey = (name: string): SceneErrorKey => `innerThought:${name}`;

/** 서버 상한(서버 info.py와 같다). 연호·기준 사건·장소·착장·속마음은 제작 초기 상태와 같은 값이다. */
export const SCENE_EDIT_LIMITS = {
  place: SCENE_LIMITS.place,
  clothing: SCENE_LIMITS.clothing,
  innerThought: SCENE_LIMITS.innerThought,
  era: SCENE_LIMITS.era,
  referenceEvent: SCENE_LIMITS.referenceEvent,
  elapsedDay: 999999,
  year: 9999,
} as const;

// 서버와 같이 윤년을 두지 않는다(2월은 28일까지).
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const LINE_BREAK = /[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/;

/** 글자 수(코드 포인트). 서버 len()과 같다. */
export const charCount = (value: string) => Array.from(value).length;

/**
 * 값을 한 줄로 만든다(서버 info.one_line과 같다): Python `splitlines()` 경계로 나눠 줄마다 앞뒤 공백을 자르고
 * 빈 줄을 빼고 공백 하나로 잇는다. 제작 화면의 여러 줄 착장·속마음도 폼에서는 한 줄로 보인다.
 */
export const oneLine = (value: string | null | undefined) =>
  splitLines(value ?? '')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');

const text = oneLine;
const num = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value));

/** 지금 장면으로 폼을 채운다. 캐릭터는 세션 캐릭터 전원(current_scene 순서)이다. */
export function sceneToForm(scene: CurrentScene): SceneForm {
  const date = scene.date;
  return {
    era: text(date?.era),
    year: num(date?.year),
    month: num(date?.month),
    day: num(date?.day),
    referenceEvent: text(date?.reference_event),
    elapsedDay: num(date?.elapsed_day),
    hour: num(scene.time?.hour),
    minute: num(scene.time?.minute),
    place: text(scene.place),
    characters: scene.characters.map(({ name, clothing, inner_thought }) => ({
      name,
      clothing: text(clothing),
      innerThought: text(inner_thought),
    })),
  };
}

/**
 * 이용자가 손대지 않은 글자 칸인지 본다. 입력을 다듬은 값이 원래 값을 한 줄로 만든 값이나 다듬은 값과 같으면
 * 그대로다. 원래 값에 앞뒤 공백·줄바꿈이 있어도(제작 화면 여러 줄 입력) 손대지 않은 칸은 다시 보내지 않는다.
 */
const sameText = (input: string, original: string | null | undefined) => {
  const value = input.trim();
  return value === oneLine(original) || value === (original ?? '').trim();
};

/** 숫자 칸은 숫자로 비교한다(`07`과 7은 같다). 비운 칸은 원래 값이 없을 때만 같다. */
const sameNumber = (input: string, original: number | null | undefined) => {
  const value = input.trim();
  if (value === '') return original === null || original === undefined;
  return /^[0-9]+$/.test(value) && Number(value) === original;
};

/**
 * 글자 칸 하나를 검사한다. 앞뒤 공백은 서버가 거절하므로 잘라서 비교·전송한다.
 * `original`은 장면의 원래 값(다듬지 않은 원문)이다.
 * 반환: 오류 문구, 또는 바뀐 값(안 바뀌었으면 undefined).
 */
function checkText(
  /** 조사까지 붙인 항목 이름(예: `장소는`) */
  topic: string,
  input: string,
  original: string | null | undefined,
  limit: number,
): { error: string } | { value: string | undefined } {
  const value = input.trim();
  if (sameText(input, original)) return { value: undefined };
  if (value === '') return { error: `${topic} 지울 수 없어요. 바꿀 내용을 입력해 주세요.` };
  if (LINE_BREAK.test(value)) return { error: `${topic} 줄바꿈 없이 입력해 주세요.` };
  if (charCount(value) > limit) return { error: `${topic} ${limit}자까지 쓸 수 있어요.` };
  return { value };
}

function intIn(input: string, min: number, max: number): number | null {
  const value = input.trim();
  if (!/^[0-9]+$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

function dateChanged(form: SceneForm, date: SceneDate) {
  switch (date.mode) {
    case 'elapsed':
      return !sameText(form.referenceEvent, date.reference_event) || !sameNumber(form.elapsedDay, date.elapsed_day);
    case 'world':
    case 'calendar':
      return (
        (date.mode === 'world' && !sameText(form.era, date.era)) ||
        !sameNumber(form.year, date.year) ||
        !sameNumber(form.month, date.month) ||
        !sameNumber(form.day, date.day)
      );
  }
}

/** 날짜 방식에 맞는 날짜 전체를 만든다. 문제가 있으면 오류 문구. */
function buildDate(form: SceneForm, original: SceneDate): { error: string } | { date: Partial<SceneDate> } {
  const mode: SceneDateMode = original.mode;
  if (mode === 'elapsed') {
    const day = intIn(form.elapsedDay, 1, SCENE_EDIT_LIMITS.elapsedDay);
    if (day === null) return { error: `일차는 1~${SCENE_EDIT_LIMITS.elapsedDay} 사이 숫자로 입력해 주세요.` };
    const event = checkText(
      '기준 사건은',
      form.referenceEvent,
      original.reference_event,
      SCENE_EDIT_LIMITS.referenceEvent,
    );
    if ('error' in event) return event;
    const referenceEvent = form.referenceEvent.trim();
    // 기준 사건을 빼면 서버가 지금 기준 사건을 그대로 둔다(info 규칙 11).
    return { date: { mode, elapsed_day: day, ...(referenceEvent ? { reference_event: referenceEvent } : {}) } };
  }
  let era: string | undefined;
  if (mode === 'world') {
    const checked = checkText('연호는', form.era, original.era, SCENE_EDIT_LIMITS.era);
    if ('error' in checked) return checked;
    era = form.era.trim();
    if (!era) return { error: '연호와 연·월·일을 모두 입력해 주세요.' };
  }
  if (!form.year.trim() || !form.month.trim() || !form.day.trim())
    return { error: mode === 'world' ? '연호와 연·월·일을 모두 입력해 주세요.' : '연·월·일을 모두 입력해 주세요.' };
  const year = intIn(form.year, 1, SCENE_EDIT_LIMITS.year);
  if (year === null) return { error: `연은 1~${SCENE_EDIT_LIMITS.year} 사이 숫자로 입력해 주세요.` };
  const month = intIn(form.month, 1, 12);
  if (month === null) return { error: '월은 1~12 사이로 입력해 주세요.' };
  const maxDay = DAYS_IN_MONTH[month - 1];
  const day = intIn(form.day, 1, maxDay);
  if (day === null) return { error: `${month}월은 1~${maxDay}일까지 입력할 수 있어요.` };
  return { date: { mode, ...(era !== undefined ? { era } : {}), year, month, day } };
}

export type SceneUpdatePlan =
  | { ok: false; errors: SceneErrors }
  /** input이 빈 객체면 바뀐 것이 없다. characterNames는 요청 characters[i]의 이름(422 field 해석용)이다. */
  | { ok: true; input: SceneInfoUpdateInput; characterNames: string[] };

/** 바뀐 칸만 담은 수정 요청을 만든다. 날짜·시간은 그 묶음 전체를 보낸다(서버 계약). */
export function planSceneUpdate(scene: CurrentScene, form: SceneForm): SceneUpdatePlan {
  const errors: SceneErrors = {};
  const input: SceneInfoUpdateInput = {};

  // 날짜 방식은 서버가 정한다. 장면에 날짜가 없으면 방식을 몰라 날짜를 고칠 수 없다(폼에도 칸이 없다).
  if (scene.date && dateChanged(form, scene.date)) {
    const built = buildDate(form, scene.date);
    if ('error' in built) errors.date = built.error;
    else input.date = built.date;
  }

  if (!sameNumber(form.hour, scene.time?.hour) || !sameNumber(form.minute, scene.time?.minute)) {
    if (!form.hour.trim()) {
      errors.time = scene.time ? '시간은 지울 수 없어요. 시를 입력해 주세요.' : '시를 입력해 주세요.';
    } else {
      const hour = intIn(form.hour, 0, 23);
      const minute = form.minute.trim() ? intIn(form.minute, 0, 59) : null;
      if (hour === null) errors.time = '시는 0~23 사이로 입력해 주세요.';
      else if (form.minute.trim() && minute === null) errors.time = '분은 0~59 사이로 입력해 주세요.';
      // 분을 비우면 분을 모르는 시간(`19시`)이다.
      else input.time = { hour, minute };
    }
  }

  const place = checkText('장소는', form.place, scene.place, SCENE_EDIT_LIMITS.place);
  if ('error' in place) errors.place = place.error;
  else if (place.value !== undefined) input.place = place.value;

  const characters: NonNullable<SceneInfoUpdateInput['characters']> = [];
  form.characters.forEach((person) => {
    const before = scene.characters.find(({ name }) => name === person.name);
    if (!before) return;
    const clothing = checkText('착장은', person.clothing, before.clothing, SCENE_EDIT_LIMITS.clothing);
    const thought = checkText('속마음은', person.innerThought, before.inner_thought, SCENE_EDIT_LIMITS.innerThought);
    if ('error' in clothing) errors[clothingKey(person.name)] = clothing.error;
    if ('error' in thought) errors[thoughtKey(person.name)] = thought.error;
    if ('error' in clothing || 'error' in thought) return;
    if (clothing.value === undefined && thought.value === undefined) return;
    characters.push({
      name: person.name,
      ...(clothing.value !== undefined ? { clothing: clothing.value } : {}),
      ...(thought.value !== undefined ? { inner_thought: thought.value } : {}),
    });
  });
  if (characters.length) input.characters = characters;

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, input, characterNames: characters.map(({ name }) => name) };
}

export const SCENE_EDIT_MESSAGES = {
  generating: '응답을 만드는 중에는 고칠 수 없어요. 응답이 끝난 뒤 다시 열어 주세요.',
  notLatest: '새 응답이 있어 다시 열어 주세요.',
  notCompleted: '끝나지 않은 응답이라 고칠 수 없어요. 다시 열어 주세요.',
  readOnly: '읽기 전용 대화라 고칠 수 없어요.',
  notFound: '대화나 응답을 찾지 못했어요. 대화방을 다시 열어 주세요.',
  invalid: '입력한 값을 확인해 주세요.',
  failed: '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
} as const;

const CHARACTER_FIELD = /^characters\[(\d+)\]\.(name|clothing|inner_thought)$/;

/**
 * 서버 거절을 폼 오류로 바꾼다. 422는 서버 `issues[0].field`가 가리키는 칸 옆에 서버 안내를 보인다
 * (서버는 SCENE_INFO_* 422에 `issues: [{field, code, message}]`를 함께 준다).
 */
export function sceneEditErrors(error: unknown, characterNames: string[]): SceneErrors {
  if (!(error instanceof ApiError)) return { form: SCENE_EDIT_MESSAGES.failed };
  switch (error.code) {
    case 'GENERATION_IN_PROGRESS':
      return { form: SCENE_EDIT_MESSAGES.generating };
    case 'SCENE_INFO_NOT_LATEST_REPLY':
      return { form: SCENE_EDIT_MESSAGES.notLatest };
    case 'SCENE_INFO_REPLY_NOT_COMPLETED':
    case 'SCENE_INFO_NOT_ASSISTANT_MESSAGE':
      return { form: SCENE_EDIT_MESSAGES.notCompleted };
    case 'CONVERSATION_READ_ONLY':
      return { form: SCENE_EDIT_MESSAGES.readOnly };
  }
  if (error.status === 404) return { form: SCENE_EDIT_MESSAGES.notFound };
  if (error.status !== 422) return { form: SCENE_EDIT_MESSAGES.failed };
  // 요청 모양 오류(VALIDATION_ERROR 등)는 칸을 짚지 않고 맨 위에 안내한다.
  if (!error.code.startsWith('SCENE_INFO_')) return { form: SCENE_EDIT_MESSAGES.invalid };
  const issue = error.issues[0];
  const field = issue?.field ?? '';
  const message = issue?.message || error.detail || SCENE_EDIT_MESSAGES.invalid;
  if (field === 'date' || field.startsWith('date.')) return { date: message };
  if (field === 'time' || field === 'place') return { [field]: message };
  const match = CHARACTER_FIELD.exec(field);
  const name = match ? characterNames[Number(match[1])] : undefined;
  if (match && name !== undefined) {
    if (match[2] === 'clothing') return { [clothingKey(name)]: message };
    if (match[2] === 'inner_thought') return { [thoughtKey(name)]: message };
    return { form: `${name}: ${message}` };
  }
  return { form: message };
}
