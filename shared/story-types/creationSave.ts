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
};
export type CreationSaveState = FewshotsDocument['saveState'];
export type CreationSaveMode = 'manual' | 'auto';
