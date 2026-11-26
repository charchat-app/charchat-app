// CREATE-US-12 제작 화면 셸의 구역(탭). 목업 v15 renderEditor의 tabs 순서를 그대로 따른다.
// 구역마다 맡은 화면이 있다. 편집 화면(/create/[storyId])은 1·5·6번(기본 정보·사진·유저 프로필),
// 작업 화면(/create/scene/[storyId])은 2~4번과 7번 공개 저장·삭제를 맡는다. 저장 경로는 화면마다 기존 그대로다.

export const CREATION_SECTIONS = [
  { key: 'basic', label: '기본 설정', owner: 'editor' },
  { key: 'speech', label: '말투·서술', owner: 'scene' },
  { key: 'intro', label: '인트로', owner: 'scene' },
  { key: 'state', label: '초기 상태', owner: 'scene' },
  { key: 'profile', label: '유저 프로필', owner: 'editor' },
  { key: 'visibility', label: '공개 범위', owner: 'scene' },
] as const;

type SectionEntry = (typeof CREATION_SECTIONS)[number];
export type CreationSection = SectionEntry['key'];
/** 편집 화면이 맡는 구역 */
export type EditorSection = Extract<SectionEntry, { owner: 'editor' }>['key'];
/** 작업 화면이 맡는 구역 */
export type SceneSection = Extract<SectionEntry, { owner: 'scene' }>['key'];

export const CREATION_TAB_LABELS: readonly string[] = CREATION_SECTIONS.map((section) => section.label);

export function sectionIndex(section: CreationSection): number {
  return CREATION_SECTIONS.findIndex((entry) => entry.key === section);
}

export function sectionAt(index: number): SectionEntry | undefined {
  return CREATION_SECTIONS[index];
}

export function isEditorSection(value: unknown): value is EditorSection {
  return CREATION_SECTIONS.some((entry) => entry.owner === 'editor' && entry.key === value);
}

export function isSceneSection(value: unknown): value is SceneSection {
  return CREATION_SECTIONS.some((entry) => entry.owner === 'scene' && entry.key === value);
}

/** 라우트 파라미터(문자열·배열)를 편집 화면 구역으로 읽는다. 모르는 값은 undefined(첫 구역). */
export function parseEditorSection(value: string | string[] | undefined): EditorSection | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return isEditorSection(raw) ? raw : undefined;
}

/** 라우트 파라미터를 작업 화면 구역으로 읽는다. 모르는 값은 undefined(첫 구역). */
export function parseSceneSection(value: string | string[] | undefined): SceneSection | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return isSceneSection(raw) ? raw : undefined;
}

/** 구역 이름 뒤에 붙는 조사 「로/으로」. 받침이 있고 ㄹ 받침이 아니면 「으로」. */
export function toParticle(label: string): string {
  const code = label.charCodeAt(label.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${label}로`;
  const final = code % 28;
  return final === 0 || final === 8 ? `${label}로` : `${label}으로`;
}

/** 저장하지 않은 입력이 있어 다른 구역 화면으로 넘기지 않았다는 안내. */
export function sectionDirtyMessage(label: string, saveHint: string): string {
  return `저장하지 않은 변경이 있어 ${toParticle(label)} 이동하지 않았어요. 입력은 그대로예요. ${saveHint}`;
}

/** 저장 중이라 넘기지 않았다는 안내. */
export function sectionBusyMessage(label: string): string {
  return `저장하는 중에는 ${toParticle(label)} 이동할 수 없어요. 저장이 끝난 뒤 다시 눌러 주세요.`;
}

/** 제작 탭 안의 편집 화면 경로(/create/...)인지 본다. 목록(/create)은 아니다. */
export function isCreationEditorPath(pathname: string): boolean {
  return /^\/create\/[^/]/.test(pathname);
}

/** 서버 저장 상태를 머리글 배지 글자로 바꾼다. */
export const SAVE_STATE_LABEL = { draft: '임시 저장', private: '비공개', public: '공개' } as const;

/** 머리글 아래 한 줄 저장 정책 안내 (목업 .sub#saveState). */
export function saveStatusLine(completed: boolean): string {
  return completed
    ? '자동 임시 저장은 나만 봐요 · 저장해야 이용자에게 반영돼요'
    : '변경 내용은 1분마다·탭을 바꿀 때 자동 임시 저장돼요';
}
