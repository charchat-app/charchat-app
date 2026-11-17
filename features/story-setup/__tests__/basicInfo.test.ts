import { addCharacter, fromDraft, MAX_CHARACTERS, removeCharacter, toDraftPatch, updateCharacter } from '../basicInfo';
import type { BasicInfoValues } from '../types';

const empty: BasicInfoValues = { title: '', subtitle: '', world: '', tags: [], tagInput: '', characters: [] };

describe('기본 설정 저장 조각 (CREATE-US-01)', () => {
  it('저장본 → 입력값 → 저장 조각이 원문을 바꾸지 않는다 (AC01·AC04)', () => {
    const draft = {
      title: ' 달빛 서점',
      subtitle: '부제',
      world: '첫 줄\n둘째 줄',
      tags: ['로맨스', 'Romance'],
      characters: [
        { id: '7', name: '서윤', detail: '서점 주인.\n말수가 적다.' },
        { id: '8', name: 'Alex', detail: '단골' },
      ],
    };
    expect(toDraftPatch(fromDraft(draft))).toEqual(draft);
  });

  it('필수값이 비어도 입력을 그대로 둔다 (AC02·AC05)', () => {
    const values = addCharacter({ ...empty, subtitle: '  ' });
    expect(toDraftPatch(values)).toEqual({
      title: '',
      subtitle: '  ',
      world: '',
      tags: [],
      characters: [{ id: undefined, name: '', detail: '' }],
    });
  });
});

describe('캐릭터 추가·삭제·수정 (AC08·AC12)', () => {
  it('삭제해도 남은 캐릭터의 이름·상세·순서가 섞이지 않는다', () => {
    let v = addCharacter(addCharacter(addCharacter(empty)));
    const [a, b, c] = v.characters;
    v = updateCharacter(v, a.key, { name: 'A', detail: 'a' });
    v = updateCharacter(v, b.key, { name: 'B', detail: 'b' });
    v = updateCharacter(v, c.key, { name: 'C', detail: 'c' });
    v = removeCharacter(v, b.key);
    expect(v.characters.map((ch) => [ch.key, ch.name, ch.detail])).toEqual([
      [a.key, 'A', 'a'],
      [c.key, 'C', 'c'],
    ]);
  });

  it(`${MAX_CHARACTERS}명이면 더 추가하지 않는다`, () => {
    let v = empty;
    for (let i = 0; i < MAX_CHARACTERS + 2; i += 1) v = addCharacter(v);
    expect(v.characters).toHaveLength(MAX_CHARACTERS);
  });

  it('추가 버튼을 누르지 않은 입력창의 태그도 저장 조각에 넣는다 (입력 보존)', () => {
    expect(toDraftPatch({ ...empty, tags: ['로맨스'], tagInput: ' 서점물 ' }).tags).toEqual(['로맨스', '서점물']);
    expect(toDraftPatch({ ...empty, tags: ['Romance'], tagInput: 'romance' }).tags).toEqual(['Romance']);
    expect(toDraftPatch({ ...empty, tags: ['로맨스'], tagInput: '  ' }).tags).toEqual(['로맨스']);
  });
});
