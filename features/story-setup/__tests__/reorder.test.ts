import { basicTextLength, MAX_BASIC_TEXT_LENGTH } from '../basicInfo';
import { dropTargetKey, moveCharacter } from '../reorder';
import type { BasicInfoValues } from '../types';

const values: BasicInfoValues = {
  title: '',
  subtitle: '',
  world: '',
  tags: [],
  tagInput: '',
  characters: [
    { key: 'a', id: '1', name: 'A', detail: 'a' },
    { key: 'b', id: '2', name: 'B', detail: 'b' },
    { key: 'c', name: 'C', detail: 'c' },
  ],
};

describe('캐릭터 순서 변경 (CREATE-US-01-AC14)', () => {
  it('옮긴 캐릭터의 id·이름·상세가 함께 따라간다', () => {
    const moved = moveCharacter(values, 'c', 'a');
    expect(moved.characters.map((ch) => [ch.key, ch.id, ch.name, ch.detail])).toEqual([
      ['c', undefined, 'C', 'c'],
      ['a', '1', 'A', 'a'],
      ['b', '2', 'B', 'b'],
    ]);
    expect(moveCharacter(values, 'a', 'c').characters.map((ch) => ch.key)).toEqual(['b', 'c', 'a']);
  });

  it('없는 key나 같은 자리로 옮기면 그대로 둔다', () => {
    expect(moveCharacter(values, 'a', 'a')).toBe(values);
    expect(moveCharacter(values, 'x', 'a')).toBe(values);
  });

  it('놓은 위치에서 가장 가까운 항목을 고른다', () => {
    const heights = new Map([
      ['a', 100],
      ['b', 100],
      ['c', 100],
    ]);
    const keys = ['a', 'b', 'c'];
    expect(dropTargetKey(heights, keys, 'a', 230, 10)).toBe('c');
    expect(dropTargetKey(heights, keys, 'c', -120, 10)).toBe('b');
    expect(dropTargetKey(heights, keys, 'b', 20, 10)).toBe('b');
    expect(dropTargetKey(new Map(), keys, 'b', 500, 10)).toBe('b');
  });

  it('순서가 바뀐 뒤에도 현재 순서 기준으로 계산한다 (위치를 저장해 두지 않음)', () => {
    // 높이가 다른 세 항목. 순서 [b, c, a]에서 a를 한 칸 위로 끈다.
    const heights = new Map([
      ['a', 100],
      ['b', 300],
      ['c', 100],
    ]);
    expect(dropTargetKey(heights, ['b', 'c', 'a'], 'a', -110, 10)).toBe('c');
  });
});

describe('합산 글자 수 (CREATE-US-01-AC09)', () => {
  it('제목·소개·세계관·캐릭터 이름·상세를 공백·줄바꿈 포함해 세고, 해시태그는 뺀다', () => {
    const v = {
      ...values,
      title: '제목',
      subtitle: '소 개',
      world: '첫 줄\n둘째',
      tags: ['로맨스'],
      tagInput: '판타지',
    };
    // 2 + 3 + 6 + (1+1)*3
    expect(basicTextLength(v)).toBe(17);
  });

  it('이모지는 1자로 센다 (서버와 같은 코드 포인트 기준)', () => {
    expect(basicTextLength({ ...values, characters: [], world: '😀😀' })).toBe(2);
  });

  it('한도는 3000자다', () => {
    expect(MAX_BASIC_TEXT_LENGTH).toBe(3000);
  });
});
