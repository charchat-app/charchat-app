/**
 * CREATE-US-04 초기 상태. 인트로별 장면(날짜·시간·장소·캐릭터별 착장·속마음)과
 * 스토리 공통 관계·호감도. 입력은 원문 문자열로 보존해 부분·초과 입력도 임시 저장한다.
 */
export const DATE_MODES = ['calendar', 'world', 'elapsed'] as const;
export type DateMode = (typeof DATE_MODES)[number];
export type TimeFormat = '24h' | '12h';
export type Meridiem = 'am' | 'pm';

export const SCENE_LIMITS = {
  place: 30,
  clothing: 300,
  innerThought: 100,
  era: 10,
  referenceEvent: 10,
  relationLabel: 10,
} as const;

export type SceneCharacterState = { characterId: string; clothing: string; innerThought: string };
export type IntroScene = {
  /** null이면 날짜 미지정. 방식마다 해당 입력만 둔다. */
  dateMode: DateMode | null;
  era: string;
  year: string;
  month: string;
  day: string;
  referenceEvent: string;
  elapsedDay: string;
  /** 입력 체계 기본값일 뿐 시각을 자동으로 채우지 않는다. */
  timeFormat: TimeFormat;
  hour: string;
  minute: string;
  meridiem: Meridiem | null;
  place: string;
  /** 등장 캐릭터만. 유저 캐릭터의 착장·속마음은 제작 입력 대상이 아니다. */
  characters: SceneCharacterState[];
};

export type PersonKind = 'user' | 'character';
/** 스토리 공통 방향별 초기 관계. 카드가 없는 조합은 관계 미지정이다. 호감도는 InitialAffinity로 따로 둔다. */
export type InitialRelation = {
  clientKey: string;
  sourceKind: PersonKind;
  sourceCharacterId: string | null;
  targetKind: PersonKind;
  targetCharacterId: string | null;
  label: string;
};

/**
 * CREATE-US-04-AC09 출발 캐릭터 → 상대(유저·다른 캐릭터) 방향별 초기 호감도. 관계와 독립이다.
 * 목록에 없는 조합은 기본값 0이다(행을 미리 만들지 않는다). 지운 값('')·범위 밖 값도 원문 그대로 보존한다.
 * 유저가 출발점인 호감도는 미정이라 다루지 않는다.
 */
export type InitialAffinity = {
  sourceCharacterId: string;
  targetKind: PersonKind;
  targetCharacterId: string | null;
  value: string;
};
export const AFFINITY_DEFAULT = '0';
const sameAffinityDirection = (a: Omit<InitialAffinity, 'value'>, b: Omit<InitialAffinity, 'value'>) =>
  a.sourceCharacterId === b.sourceCharacterId &&
  a.targetKind === b.targetKind &&
  a.targetCharacterId === b.targetCharacterId;
/** 화면 표시값. 입력하지 않은 조합은 0이다. */
export function affinityValue(affinities: InitialAffinity[], direction: Omit<InitialAffinity, 'value'>): string {
  return affinities.find((a) => sameAffinityDirection(a, direction))?.value ?? AFFINITY_DEFAULT;
}
/** 한 방향의 값을 바꾼다. 기본값 0으로 되돌리면 행을 지워 미입력 조합과 같게 둔다. 다른 방향은 건드리지 않는다. */
export function setAffinity(affinities: InitialAffinity[], next: InitialAffinity): InitialAffinity[] {
  const rest = affinities.filter((a) => !sameAffinityDirection(a, next));
  return next.value === AFFINITY_DEFAULT ? rest : [...rest, next];
}

export const emptyScene = (): IntroScene => ({
  dateMode: null,
  era: '',
  year: '',
  month: '',
  day: '',
  referenceEvent: '',
  elapsedDay: '',
  timeFormat: '24h',
  hour: '',
  minute: '',
  meridiem: null,
  place: '',
  characters: [],
});

/** 날짜 방식을 바꾸면 기존 날짜 입력은 지운다(보관·변환하지 않음). 다른 항목은 유지한다. */
export const switchDateMode = (scene: IntroScene, dateMode: DateMode | null): IntroScene => ({
  ...scene,
  dateMode,
  era: '',
  year: '',
  month: '',
  day: '',
  referenceEvent: '',
  elapsedDay: '',
});
/** 시간제를 바꾸면 기존 시각 입력은 지운다. */
export const switchTimeFormat = (scene: IntroScene, timeFormat: TimeFormat): IntroScene => ({
  ...scene,
  timeFormat,
  hour: '',
  minute: '',
  meridiem: null,
});
export const hasDateInput = (s: IntroScene) =>
  [s.era, s.year, s.month, s.day, s.referenceEvent, s.elapsedDay].some((v) => v !== '');
export const hasTimeInput = (s: IntroScene) => s.hour !== '' || s.minute !== '' || s.meridiem !== null;

const length = (value: string) => Array.from(value).length;
/** 0·음수·소수·기호 없이 쓴 정수인지. 앞자리 0은 허용한다. */
const integerIn = (value: string, min: number, max: number) =>
  /^[0-9]+$/.test(value) && Number(value) >= min && Number(value) <= max;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** 공개·비공개 저장 기준의 날짜 오류. 전부 비우면 미지정으로 허용한다. */
export function dateIssue(s: IntroScene): string | null {
  if (s.dateMode === null || !hasDateInput(s)) return null;
  if (s.dateMode === 'elapsed') {
    if (!s.referenceEvent.trim() || !s.elapsedDay) return '기준 사건과 시작 일차를 모두 입력해 주세요.';
    if (!integerIn(s.elapsedDay, 1, 9999)) return '시작 일차는 1~9999 사이 정수로 입력해 주세요.';
    return null;
  }
  if ((s.dateMode === 'world' && !s.era.trim()) || !s.year || !s.month || !s.day)
    return s.dateMode === 'world' ? '연호와 연·월·일을 모두 입력해 주세요.' : '연·월·일을 모두 입력해 주세요.';
  if (!integerIn(s.year, 1, 9999)) return '연은 1~9999 사이 정수로 입력해 주세요.';
  if (!integerIn(s.month, 1, 12)) return '월은 1~12 사이로 입력해 주세요.';
  const maxDay = DAYS_IN_MONTH[Number(s.month) - 1];
  if (!integerIn(s.day, 1, maxDay)) return `${Number(s.month)}월은 1~${maxDay}일까지 입력할 수 있어요.`;
  return null;
}
export function timeIssue(s: IntroScene): string | null {
  if (!hasTimeInput(s)) return null;
  if (!s.hour || !s.minute || (s.timeFormat === '12h' && !s.meridiem))
    return s.timeFormat === '12h' ? '오전·오후와 시·분을 모두 입력해 주세요.' : '시·분을 모두 입력해 주세요.';
  if (s.timeFormat === '24h' ? !integerIn(s.hour, 0, 23) : !integerIn(s.hour, 1, 12))
    return s.timeFormat === '24h' ? '시는 0~23 사이로 입력해 주세요.' : '시는 1~12 사이로 입력해 주세요.';
  if (!integerIn(s.minute, 0, 59)) return '분은 0~59 사이로 입력해 주세요.';
  return null;
}
export function sceneTextOver(s: IntroScene): boolean {
  return (
    length(s.place) > SCENE_LIMITS.place ||
    length(s.era) > SCENE_LIMITS.era ||
    length(s.referenceEvent) > SCENE_LIMITS.referenceEvent ||
    s.characters.some(
      (c) => length(c.clothing) > SCENE_LIMITS.clothing || length(c.innerThought) > SCENE_LIMITS.innerThought,
    )
  );
}
export function affinityIssue(value: string): string | null {
  return /^-?[0-9]+$/.test(value) && Number(value) >= -100 && Number(value) <= 100
    ? null
    : '호감도는 -100~100 사이 정수로 입력해 주세요.';
}

/** 상태 카드 표시용. 미완성 입력은 원문 그대로 보여주고, 비어 있으면 null(미지정). */
export function formatSceneDate(s: IntroScene): string | null {
  if (s.dateMode === null || !hasDateInput(s)) return null;
  if (s.dateMode === 'elapsed') return `${s.referenceEvent} ${s.elapsedDay}일째`.trim();
  const ymd = `${s.year}년 ${s.month}월 ${s.day}일`;
  return s.dateMode === 'world' ? `${s.era} ${ymd}` : ymd;
}
export function formatSceneTime(s: IntroScene): string | null {
  if (!hasTimeInput(s)) return null;
  const clock = `${s.hour}:${s.minute.padStart(2, '0')}`;
  return s.timeFormat === '12h'
    ? `${s.meridiem === 'pm' ? '오후' : s.meridiem === 'am' ? '오전' : ''} ${clock}`.trim()
    : clock;
}
