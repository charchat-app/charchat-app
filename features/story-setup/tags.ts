// 해시태그 입력 규칙 (CREATE-US-01-AC13·AC15·AC18). 서버(story_basic/service.py)와 같은 기준을 쓴다.
import type { BasicInfoValues } from './types';

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 10;

/**
 * 태그 글자 수. 공백을 포함하고 유니코드 코드 포인트 단위로 센다(서버 len()과 같음).
 * 이모지·결합 문자의 글자 단위는 명세상 미결이라 임시 기준이다.
 */
export function tagLength(tag: string): number {
  return Array.from(tag).length;
}

/** 태그 하나의 문제. 문제가 없으면 null */
export function tagProblem(tag: string): string | null {
  if (tag.trim() === '') return '빈 해시태그예요.';
  const length = tagLength(tag);
  if (length > MAX_TAG_LENGTH) return `${length}자예요. 해시태그는 ${MAX_TAG_LENGTH}자까지 쓸 수 있어요.`;
  return null;
}

/**
 * 태그 비교 키: 띄어쓰기를 모두 빼고 영문 소문자로 바꾼 값(서버와 같은 규칙).
 * Romance·romance, 판타지 로맨스·판타지로맨스는 같은 태그로 본다. 저장은 쓴 표기 그대로다.
 */
export function tagKey(tag: string): string {
  return tag.replace(/\s+/g, '').toLowerCase();
}

/** 같은 태그로 취급되는 이미 추가한 태그. 없으면 undefined */
export function findSameTag(tags: string[], tag: string): string | undefined {
  const key = tagKey(tag);
  return tags.find((t) => tagKey(t) === key);
}

/**
 * 목록 전체를 보고 태그별 문제를 모은다. 길이·빈 값에 더해, 앞에 같은 태그로 취급되는 표기가
 * 있으면(예: Romance 뒤의 romance) 뒤쪽 태그를 문제로 표시한다(서버 TAG_DUPLICATE와 같은 기준).
 */
export function tagProblems(tags: string[]): Map<string, string> {
  const problems = new Map<string, string>();
  const firstByKey = new Map<string, string>();
  for (const tag of tags) {
    const own = tagProblem(tag);
    if (own) problems.set(tag, own);
    const key = tagKey(tag);
    const first = firstByKey.get(key);
    if (key !== '' && first !== undefined) {
      problems.set(tag, `'${first}'와 같은 태그예요. 대소문자와 띄어쓰기는 구분하지 않아요.`);
    } else {
      firstByKey.set(key, tag);
    }
  }
  return problems;
}

export type AddTagResult = 'added' | 'empty' | 'duplicate';

/**
 * 입력한 태그를 추가한다. 구분용 앞뒤 공백만 떼고 표기는 바꾸지 않는다.
 * 10자 초과·10개 초과 태그도 입력을 잘라내지 않고 추가해 두고 문제로 표시한다(임시 저장 보존).
 * 대소문자·띄어쓰기만 다른 태그는 같은 태그라 한 번만 둔다.
 */
export function addTag(values: BasicInfoValues, raw: string): { values: BasicInfoValues; result: AddTagResult } {
  const tag = raw.trim();
  if (tag === '') return { values, result: 'empty' };
  if (findSameTag(values.tags, tag) !== undefined) return { values, result: 'duplicate' };
  return { values: { ...values, tags: [...values.tags, tag] }, result: 'added' };
}

export function removeTag(values: BasicInfoValues, tag: string): BasicInfoValues {
  return { ...values, tags: values.tags.filter((t) => t !== tag) };
}
