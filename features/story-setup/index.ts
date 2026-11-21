// story-setup: 공개 API. 다른 도메인은 이 파일로만 접근한다.
// CLAUDE.md 경계 규칙 3: 저장 조각 변환(fromDraft·toDraftPatch)과 화면 컴포넌트만 노출한다.
export { fromDraft, toDraftPatch } from './basicInfo';
export { BasicInfoForm } from './components/BasicInfoForm';
export { UserProfilePresetEditor } from './components/UserProfilePresetEditor';
export type { PresetValues } from './userProfilePresetRules';
// CREATE-US-05 프리셋 저장 조각 변환 (저장된 목록 ↔ 입력값). 저장은 story-publish가 맡는다.
export { presetsFromDraft, presetsToDraftPatch } from './userProfilePresetRules';
export type { BasicInfoDraft, BasicInfoValues, CharacterDraft } from './types';
// CREATE-US-06 이미지: 편집 화면과 저장 조각(목록 → 저장 요청 본문) 변환
export { StoryImagesEditor } from './components/StoryImagesEditor';
export { mergeCharacters, requiredImageMessage, sameImages, toImagesPatch } from './images';
export type { CharacterImagesValue, StoryImagesPatch, StoryImagesValues } from './images';
export { basicTextLength, MAX_BASIC_TEXT_LENGTH, MAX_CHARACTERS } from './basicInfo';
