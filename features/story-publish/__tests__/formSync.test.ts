import { applySavedIds, toFieldErrors } from '../formSync';

const values = {
  title: '',
  subtitle: '',
  world: '',
  tags: [],
  tagInput: '',
  characters: [
    { key: 'new-1', name: 'A', detail: 'a' },
    { key: 'new-2', name: 'B', detail: 'b' },
  ],
};

describe('저장 결과 반영', () => {
  it('저장 후 새 캐릭터에 서버 id를 붙인다 (AC04·AC12)', () => {
    const saved = applySavedIds(values, ['new-1', 'new-2'], ['11', '12']);
    expect(saved.characters.map((ch) => ch.id)).toEqual(['11', '12']);
  });

  it('저장 요청 뒤에 추가한 캐릭터에는 id를 붙이지 않는다', () => {
    const later = { ...values, characters: [...values.characters, { key: 'new-3', name: 'C', detail: 'c' }] };
    const saved = applySavedIds(later, ['new-1', 'new-2'], ['11', '12']);
    expect(saved.characters.map((ch) => ch.id)).toEqual(['11', '12', undefined]);
  });
});

describe('서버 issues → 화면 위치 (AC05·AC08·AC10·AC11)', () => {
  it('characters[i]를 저장 당시 key로 옮기고 description은 detail로 바꾼다', () => {
    const errors = toFieldErrors(
      [
        { field: 'title', code: 'REQUIRED', message: '제목' },
        { field: 'characters', code: 'CHARACTER_COUNT_OUT_OF_RANGE', message: '인원' },
        { field: 'characters[1].name', code: 'NAME_DUPLICATE', message: '중복' },
        { field: 'characters[0].description', code: 'REQUIRED', message: '상세' },
        { field: 'characters[5].name', code: 'REQUIRED', message: '없는 위치' },
      ],
      ['k0', 'k1'],
    );
    expect(errors).toEqual({ title: '제목', characters: '인원', 'k1.name': '중복', 'k0.detail': '상세' });
  });
});
