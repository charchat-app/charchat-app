import { defaultExpression, parseExpression } from '@/shared/story-types';
import { seedStory } from '@/mocks/seed/story';
import { fromExpressionRow, toExpressionRow } from '../api';
import { fromDraft, toDraftPatch } from '../expressionAdapter';

it('실제 DB 코드·비활성 문체값을 매핑하고 원문을 손실 없이 복원한다', () => {
  const settings = {
    ...defaultExpression(),
    style: { mode: 'custom' as const, text: '  {{user}}\n*서술* **강조**  ' },
  };
  const row = toExpressionRow('9007199254740993', settings);
  expect(row.story_id).toBe('9007199254740993');
  expect(row.point_of_view).toBe('third_person');
  expect(row.preset_styles).toEqual([]);
  expect(fromExpressionRow(row)).toEqual(settings);
});
it('임시 저장의 초과 원문을 잘라내지 않고 다른 생성 영역을 보존한다', () => {
  const text = '가'.repeat(1001);
  const draft = { ...seedStory, ...toDraftPatch({ ...defaultExpression(), style: { mode: 'custom', text } }) };
  expect(fromDraft(draft).style).toEqual({ mode: 'custom', text });
  expect(draft.intros).toEqual(seedStory.intros);
  expect(draft.fewshotGroups).toEqual(seedStory.fewshotGroups);
});
it('잘못된 선택·세 번째 문체·중복 코드를 복원 성공으로 취급하지 않는다', () => {
  expect(() => parseExpression({ ...defaultExpression(), composition: 'unknown' })).toThrow();
  expect(() =>
    parseExpression({ ...defaultExpression(), style: { mode: 'preset', codes: ['plain', 'warm', 'lyrical'] } }),
  ).toThrow();
  expect(() =>
    parseExpression({ ...defaultExpression(), style: { mode: 'preset', codes: ['plain', 'plain'] } }),
  ).toThrow();
});
