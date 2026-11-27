// CHAT-US-03 작성 중 입력 기기 보관: 저장 키·형식·탭 간 삭제 경합
import { decodeDraft, encodeDraft } from '@/features/chat/draftCodec';
import { chatDraftKey, persistDraft, readDraft } from '@/features/chat/draftPersistence';
import type { DraftStorage } from '@/features/chat/draftStorage.types';
import { emptyDraft, type MessageDraft, type SpeakerNames } from '@/features/chat/messageDraft';

const entries = new Map<string, string>();
const local: DraftStorage = {
  getItem: (key) => entries.get(key) ?? null,
  setItem: (key, value) => void entries.set(key, value),
  removeItem: (key) => void entries.delete(key),
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  entries.clear();
});

it('CHAT-US-03-AC05: 보관 키는 계정·대화방마다 다르고 ID가 올바르지 않으면 보관하지 않는다', () => {
  expect(chatDraftKey('8', '19')).toBe('charchat:chat-draft:v1:8:19');
  expect(chatDraftKey('8', '20')).not.toBe(chatDraftKey('8', '19'));
  expect(chatDraftKey('9', '19')).not.toBe(chatDraftKey('8', '19'));
  for (const [owner, session] of [
    [null, '19'],
    ['0', '19'],
    ['8', 'abc'],
    ['8', '-1'],
  ] as const) {
    expect(chatDraftKey(owner, session)).toBeNull();
  }
});

const names: SpeakerNames = { playName: '여행자', characters: [{ id: 2, name: '윤슬' }] };

it('CHAT-US-03-AC05: `@이름:` 줄을 포함한 입력창 글자를 그대로 보관·복원하고, 빈 입력과 깨진 보관분은 버린다', () => {
  const draft: MessageDraft = { text: '먼저\n@윤슬:   *서술*\n대사  \n@나레이터: 바람\n쓰던 줄 😀' };
  expect(JSON.parse(encodeDraft(draft))).toEqual({ v: 2, text: draft.text });
  expect(decodeDraft(encodeDraft(draft), names)).toEqual(draft);
  expect(encodeDraft(emptyDraft())).toBe('');
  for (const broken of ['', 'not json', '{"v":3,"text":"x"}', '{"v":2,"text":1}', '{"v":2,"text":""}', '[]']) {
    expect(decodeDraft(broken, names)).toBeNull();
  }
  expect(
    decodeDraft(
      JSON.stringify({
        v: 1,
        parts: [{ speaker: { kind: 'character' }, body: 'x' }],
        speaker: { kind: 'user' },
        text: '',
      }),
      names,
    ),
  ).toBeNull();
});

it('CHAT-US-03-AC05: 이전 형식(v1, 발화자별 부분) 보관분은 버리지 않고 세션 이름으로 `@이름:` 줄 글자로 바꿔 복원한다', () => {
  const v1 = (parts: unknown[], speaker: unknown, text: string) => JSON.stringify({ v: 1, parts, speaker, text });
  // 맨 앞 유저 부분은 태그를 생략하고, 입력 중이던 발화자가 유저가 아니면 그 태그 줄을 남겨 이어 쓰게 한다.
  expect(
    decodeDraft(
      v1(
        [
          { speaker: { kind: 'user' }, body: '안녕' },
          { speaker: { kind: 'character', characterId: 2 }, body: '  *서술*\n대사  ' },
        ],
        { kind: 'narrator' },
        '',
      ),
      names,
    ),
  ).toEqual({ text: '안녕\n@윤슬:   *서술*\n대사  \n@나레이터: ' });
  expect(decodeDraft(v1([], { kind: 'user' }, '쓰던 줄'), names)).toEqual({ text: '쓰던 줄' });
  expect(decodeDraft(v1([{ speaker: { kind: 'narrator' }, body: '바람' }], { kind: 'user' }, '나'), names)).toEqual({
    text: '@나레이터: 바람\n@여행자: 나',
  });
  // 아무것도 없던 v1 보관분은 복원할 것이 없다.
  expect(decodeDraft(v1([], { kind: 'user' }, ''), names)).toBeNull();
});

it.each([null, '기존 저장본'])(
  'CHAT-US-03-AC07: 다른 탭에서 지우면 이전 저장본(%s)과 아직 예약 중인 입력을 되살리지 않는다',
  (saved) => {
    // 탭마다 별도 Storage 객체와 예약 작업을 가지지만, 같은 origin의 데이터는 공유한다.
    const tabA = { ...local };
    const tabB = { ...local };
    const key = chatDraftKey('8', '19')!;
    const otherRoom = chatDraftKey('8', '20')!;
    const otherOwner = chatDraftKey('9', '19')!;
    if (saved !== null) entries.set(key, saved);
    entries.set(otherRoom, '다른 방');
    entries.set(otherOwner, '다른 계정');
    expect(readDraft(tabA, key)).toBe(saved ?? '');
    const edit = (tab: DraftStorage, text: string) => persistDraft(tab, key, text, () => true, jest.fn());

    edit(tabA, '아직 저장하지 않은 입력');
    edit(tabB, '');
    if (saved !== null) expect(readDraft(tabA, key)).toBe('');
    jest.advanceTimersByTime(500);
    expect(readDraft(tabB, key)).toBe('');

    edit(tabA, '지운 뒤 새 입력');
    jest.advanceTimersByTime(499);
    expect(readDraft(tabB, key)).toBe('');
    jest.advanceTimersByTime(1);
    expect(readDraft(tabB, key)).toBe('지운 뒤 새 입력');
    expect(readDraft(tabB, otherRoom)).toBe('다른 방');
    expect(readDraft(tabB, otherOwner)).toBe('다른 계정');
  },
);

it('CHAT-US-03-AC07: 쓰기 직전에 다른 탭이 지우면 늦게 기록된 원문도 되살리지 않는다', () => {
  const key = chatDraftKey('8', '19')!;
  const tabB = { ...local };
  let duringWrite: string | undefined;
  const tabA: DraftStorage = {
    ...local,
    setItem: (itemKey, text) => {
      persistDraft(tabB, key, '', () => true, jest.fn());
      local.setItem(itemKey, text);
      duringWrite = readDraft(tabB, key);
    },
  };
  persistDraft(tabA, key, '경합 중인 초안', () => true, jest.fn());
  jest.advanceTimersByTime(500);
  expect(duringWrite).toBe('');
  expect(readDraft(tabB, key)).toBe('');
  expect(Array.from(entries.values())).not.toContain('경합 중인 초안');
});

it('CHAT-US-03-AC06: 마지막 변경부터 500ms를 다시 기다려 마지막 내용만 보관한다', () => {
  const key = chatDraftKey('8', '19')!;
  const setItem = jest.spyOn(local, 'setItem');
  persistDraft(local, key, '첫', () => true, jest.fn());
  jest.advanceTimersByTime(400);
  persistDraft(local, key, '첫 줄', () => true, jest.fn());
  jest.advanceTimersByTime(499);
  expect(setItem).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(setItem).toHaveBeenCalledTimes(1);
  expect(readDraft(local, key)).toBe('첫 줄');
});
