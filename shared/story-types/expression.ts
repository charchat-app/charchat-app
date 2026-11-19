/** CREATE-US-02. 실제 PostgreSQL 코드와 일치하는 표현 설정 계약. */
export const POINTS_OF_VIEW = ['first_person', 'second_person', 'third_person'] as const;
export const TENSES = ['past', 'present'] as const;
export const COMPOSITIONS = ['dialogue', 'action', 'balanced'] as const;
export const RESPONSE_LENGTHS = ['short', 'normal', 'long'] as const;
export const STYLE_CODES = [
  'dynamic',
  'lyrical',
  'tense',
  'humorous',
  'plain',
  'delicate',
  'romantic',
  'warm',
] as const;
export type StyleCode = (typeof STYLE_CODES)[number];
export type ExpressionStyle =
  { mode: 'none' } | { mode: 'preset'; codes: StyleCode[] } | { mode: 'custom'; text: string };
export type ExpressionSettings = {
  pointOfView: (typeof POINTS_OF_VIEW)[number];
  tense: (typeof TENSES)[number];
  composition: (typeof COMPOSITIONS)[number];
  responseLength: (typeof RESPONSE_LENGTHS)[number];
  style: ExpressionStyle;
};
export function defaultExpression(): ExpressionSettings {
  return {
    pointOfView: 'third_person',
    tense: 'past',
    composition: 'balanced',
    responseLength: 'normal',
    style: { mode: 'none' },
  };
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('표현 설정의 데이터 형식을 확인할 수 없습니다.');
  }
  return value as Record<string, unknown>;
}
function enumValue<T extends string>(value: unknown, options: readonly T[]): T {
  if (typeof value !== 'string' || !options.some((option) => option === value)) {
    throw new Error('표현 설정에 지원하지 않는 선택값이 있습니다.');
  }
  return value as T;
}
/** 원문 길이는 잘라내지 않는다. 초과 커스텀도 임시 저장·복원해야 한다. */
export function parseExpression(value: unknown): ExpressionSettings {
  const input = record(value);
  const source = record(input.style);
  let style: ExpressionStyle;
  if (source.mode === 'none') {
    style = { mode: 'none' };
  } else if (source.mode === 'custom' && typeof source.text === 'string') {
    style = { mode: 'custom', text: source.text };
  } else if (source.mode === 'preset' && Array.isArray(source.codes)) {
    const codes = source.codes.map((code: unknown) => enumValue(code, STYLE_CODES));
    if (codes.length > 2 || new Set(codes).size !== codes.length) {
      throw new Error('문체는 서로 다른 항목을 최대 2개까지 선택할 수 있습니다.');
    }
    style = { mode: 'preset', codes };
  } else {
    throw new Error('문체 설정의 데이터 형식을 확인할 수 없습니다.');
  }
  return {
    pointOfView: enumValue(input.pointOfView, POINTS_OF_VIEW),
    tense: enumValue(input.tense, TENSES),
    composition: enumValue(input.composition, COMPOSITIONS),
    responseLength: enumValue(input.responseLength, RESPONSE_LENGTHS),
    style,
  };
}

export type ExpressionRow = {
  story_id: string;
  point_of_view: ExpressionSettings['pointOfView'];
  tense: ExpressionSettings['tense'];
  composition: ExpressionSettings['composition'];
  response_length: ExpressionSettings['responseLength'];
  style_mode: 'none' | 'preset' | 'custom';
  preset_styles: StyleCode[];
  custom_style: string | null;
};
export function fromExpressionRow(row: ExpressionRow): ExpressionSettings {
  return parseExpression({
    pointOfView: row.point_of_view,
    tense: row.tense,
    composition: row.composition,
    responseLength: row.response_length,
    style:
      row.style_mode === 'custom'
        ? { mode: 'custom', text: row.custom_style ?? '' }
        : row.style_mode === 'preset'
          ? { mode: 'preset', codes: row.preset_styles }
          : { mode: 'none' },
  });
}
export function toExpressionRow(storyId: string, settings: ExpressionSettings): ExpressionRow {
  const value = parseExpression(settings);
  return {
    story_id: storyId,
    point_of_view: value.pointOfView,
    tense: value.tense,
    composition: value.composition,
    response_length: value.responseLength,
    style_mode: value.style.mode,
    preset_styles: value.style.mode === 'preset' ? [...value.style.codes] : [],
    custom_style: value.style.mode === 'custom' ? value.style.text : null,
  };
}
