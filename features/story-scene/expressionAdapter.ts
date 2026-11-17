import { parseExpression, type ExpressionSettings, type StoryDraft } from '@/shared/story-types';
export function fromDraft(draft: Pick<StoryDraft, 'speech'>): ExpressionSettings {
  return parseExpression(draft.speech);
}
/** 다른 생성 영역을 덮어쓰지 않도록 표현 설정 조각만 반환한다. */
export function toDraftPatch(settings: ExpressionSettings): Pick<StoryDraft, 'speech'> {
  return { speech: parseExpression(settings) };
}
