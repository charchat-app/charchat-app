import type { ExpressionSettings } from './expression';
import type { FewshotsDocument } from './fewshots';
import type { InitialAffinity, InitialRelation } from './initialState';
import type { IntroItem } from './intros';
export type CreationSaveDocument = FewshotsDocument & {
  speech: ExpressionSettings;
  intros: IntroItem[];
  /** CREATE-US-04 스토리 공통 초기 관계. */
  relations: InitialRelation[];
  /** CREATE-US-04-AC09 방향별 초기 호감도. 목록에 없는 조합은 0이다. */
  affinities: InitialAffinity[];
  /**
   * 값이 있으면 이 내용은 아직 저장(반영)하지 않은 임시 저장본이다. 이용자는 이전 저장본을 본다.
   * 비공개·공개 스토리를 고치다 임시 저장했을 때만 생긴다(2026-11-20 결정).
   */
  workingCopySavedAt?: string | null;
  /**
   * 값이 있으면 6번 사진에 아직 반영하지 않은 임시 저장본이 있다. 「저장」하면 2~4번과 함께 검사·반영한다
   * (안 B, 팀 확인 전).
   */
  imagesWorkingCopySavedAt?: string | null;
};
/** 공개 상태. draft는 미등록이다. */
export type CreationSaveState = FewshotsDocument['saveState'];
export type CreationSaveMode = 'manual' | 'auto';
/** 저장 상태. temporary(임시 저장)는 이용자 화면을 바꾸지 않고, save(저장)는 반영한다. 자동 저장은 언제나 임시 저장이다. */
export type CreationSaveKind = 'temporary' | 'save';
