// story-setup: 공개 API. 다른 도메인은 이 파일로만 접근한다.
// CLAUDE.md 경계 규칙 3: 저장 조각 변환(fromDraft·toDraftPatch)과 화면 컴포넌트만 노출한다.
export { fromDraft, toDraftPatch } from './basicInfo';
export { BasicInfoForm } from './components/BasicInfoForm';
export type { BasicInfoDraft, BasicInfoValues, CharacterDraft } from './types';
export { basicTextLength, MAX_BASIC_TEXT_LENGTH, MAX_CHARACTERS } from './basicInfo';
