import { addTag, findSameTag, MAX_TAG_LENGTH, removeTag, tagKey, tagLength, tagProblem, tagProblems } from '../tags';
import type { BasicInfoValues } from '../types';

const base: BasicInfoValues = { title: '', subtitle: '', world: '', tags: ['로맨스'], tagInput: '', characters: [] };

describe('해시태그 규칙 (CREATE-US-01)', () => {
  it('10자까지는 문제없고 11자부터 이유를 알려 준다 (AC13)', () => {
    expect(tagProblem('가나다라마바사아자차')).toBeNull();
    expect(tagProblem('가나다라마바사아자차카')).toBe(`11자예요. 해시태그는 ${MAX_TAG_LENGTH}자까지 쓸 수 있어요.`);
  });

  it('공백을 포함해 세고, 이모지는 한 글자로 센다 (서버와 같은 기준)', () => {
    expect(tagLength('판타지 로맨스')).toBe(7);
    expect(tagLength('😀로맨스')).toBe(4);
  });

  it('11자 태그도 잘라내지 않고 추가한다 (AC13 입력 보존)', () => {
    const { values, result } = addTag(base, '가나다라마바사아자차카');
    expect(result).toBe('added');
    expect(values.tags).toEqual(['로맨스', '가나다라마바사아자차카']);
  });

  it('후보에 없는 새 태그도 추가하고, 같은 표기는 한 번만 둔다 (AC18)', () => {
    expect(addTag(base, '  서점물 ').values.tags).toEqual(['로맨스', '서점물']);
    expect(addTag(base, '로맨스').result).toBe('duplicate');
    expect(addTag(base, '   ').result).toBe('empty');
  });

  it('선택한 태그만 지운다', () => {
    const v = { ...base, tags: ['로맨스', '판타지', '로판'] };
    expect(removeTag(v, '판타지').tags).toEqual(['로맨스', '로판']);
  });

  it('대소문자·띄어쓰기만 다른 태그는 같은 태그로 보고 한 번만 둔다 (서버와 같은 규칙)', () => {
    expect(tagKey('판타지 로맨스')).toBe(tagKey('판타지로맨스'));
    expect(tagKey('Romance')).toBe('romance');
    const v = { ...base, tags: ['Romance', '판타지 로맨스'] };
    expect(addTag(v, 'romance').result).toBe('duplicate');
    expect(addTag(v, '판타지로맨스').result).toBe('duplicate');
    expect(findSameTag(v.tags, 'ROMANCE')).toBe('Romance');
  });

  it('불러온 목록에 같은 태그로 취급되는 표기가 있으면 뒤쪽을 문제로 표시한다 (서버 TAG_DUPLICATE)', () => {
    const problems = tagProblems(['Romance', '로맨스', 'romance', '가나다라마바사아자차카']);
    expect([...problems.keys()]).toEqual(['romance', '가나다라마바사아자차카']);
    expect(problems.get('romance')).toMatch(/'Romance'와 같은 태그예요/);
  });
});
