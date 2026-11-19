import type { ExpressionSettings } from './expression';
import type { FewshotsDocument } from './fewshots';
import type { IntroItem } from './intros';
export type CreationSaveDocument = FewshotsDocument & {
  speech: ExpressionSettings;
  intros: IntroItem[];
};
export type CreationSaveState = FewshotsDocument['saveState'];
export type CreationSaveMode = 'manual' | 'auto';
