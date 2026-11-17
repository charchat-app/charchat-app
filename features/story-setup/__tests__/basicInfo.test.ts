import { fromDraft, parseTags, toDraftPatch } from '../basicInfo';

describe('기본 설정 저장 조각 (CREATE-US-01)', () => {
  it('저장본 → 입력값 → 저장 조각이 원문을 바꾸지 않는다 (AC01)', () => {
    const draft = { title: ' 달빛 서점', subtitle: '부제', world: '첫 줄\n둘째 줄', tags: ['로맨스', 'Romance'] };
    expect(toDraftPatch(fromDraft(draft))).toEqual(draft);
  });

  it('필수값이 비어도 입력을 그대로 둔다 (AC02)', () => {
    expect(toDraftPatch({ title: '', subtitle: '  ', world: '', tagsText: '' })).toEqual({
      title: '',
      subtitle: '  ',
      world: '',
      tags: [],
    });
  });

  it('해시태그는 쉼표로 나누고 빈 항목만 버린다 (AC06 태그 없음 허용)', () => {
    expect(parseTags('로맨스, 일상 ,, 로판 ')).toEqual(['로맨스', '일상', '로판']);
    expect(parseTags('')).toEqual([]);
    expect(parseTags(' , ')).toEqual([]);
  });
});
