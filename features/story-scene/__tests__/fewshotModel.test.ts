import { applyAllocatedIds, insertAtSelection, moveByKey, type FewshotGroup } from '@/shared/story-types';
import { dropTarget } from '../components/ReorderList';

const group = (key: string, id: string | null = null): FewshotGroup => ({ id, clientKey: key, messages: [] });
it('묶음·메시지의 고정 ID를 바꾸거나 원본을 수정하지 않고 순서를 이동한다', () => {
  const original = [group('a', '1'), group('b', '2'), group('c', '3')];
  expect(moveByKey(original, 'a', 'c').map((item) => item.id)).toEqual(['2', '3', '1']);
  expect(original.map((item) => item.id)).toEqual(['1', '2', '3']);
  expect(moveByKey(original, 'missing', 'a')).toBe(original);
});
it('서버 발급 ID만 합치고 저장 중의 추가·본문 수정·삭제를 유지한다', () => {
  const current: FewshotGroup[] = [
    {
      ...group('g'),
      messages: [
        { id: null, clientKey: 'm', body: '나중 수정', speakerKind: 'user', characterId: null },
        { id: null, clientKey: 'later', body: '나중 추가', speakerKind: 'narrator', characterId: null },
      ],
    },
  ];
  const saved = [
    { ...group('g', '10'), messages: [{ ...current[0].messages[0], id: '20', body: '저장한 본문' }] },
    group('deleted', '11'),
  ];
  const result = applyAllocatedIds(current, saved);
  expect(result).toHaveLength(1);
  expect(result[0].id).toBe('10');
  expect(result[0].messages.map((item) => [item.id, item.body])).toEqual([
    ['20', '나중 수정'],
    [null, '나중 추가'],
  ]);
});
it('선택 영역에 치환 표기를 원문 삽입하고 드래그는 같은 목록의 실제 위치로 계산한다', () => {
  expect(insertAtSelection('앞뒤끝', { start: 1, end: 2 }, '{{user}}')).toEqual({
    text: '앞{{user}}끝',
    selection: { start: 9, end: 9 },
  });
  const layouts = new Map([
    ['a', { x: 0, y: 0, width: 300, height: 50 }],
    ['b', { x: 0, y: 60, width: 300, height: 100 }],
  ]);
  expect(dropTarget(layouts, ['a', 'b'], 'a', 90)).toBe('b');
});
