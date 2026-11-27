// CHAT-US-02 입력창 메시지 구성 규칙: `@이름:` 태그 파싱, 5,000자 한도, `@` 칩 줄, 되돌리기
import {
  detectSpeakerTrigger,
  draftLength,
  emptyDraft,
  fromMessageParts,
  insertSpeakerTag,
  limitInput,
  MESSAGE_MAX_LENGTH,
  parseUserText,
  type SpeakerNames,
  toMessageParts,
  validateDraft,
} from '@/features/chat/messageDraft';
import type { ChatMessagePartInput } from '@/shared/story-types';

const names: SpeakerNames = {
  playName: '쀠',
  characters: [
    { id: 2, name: '한서윤' },
    { id: 3, name: '윤슬' },
  ],
};
const user = (body: string): ChatMessagePartInput => ({ speaker_kind: 'user', character_id: null, body });
const character = (id: number, body: string): ChatMessagePartInput => ({
  speaker_kind: 'character',
  character_id: id,
  body,
});
const narrator = (body: string): ChatMessagePartInput => ({ speaker_kind: 'narrator', character_id: null, body });

describe('CHAT-US-02-AC01·AC02: parseUserText 줄 머리 `@이름:` 태그로 발화자별 부분을 나눈다', () => {
  it.each<[string, string, ChatMessagePartInput[]]>([
    ['CHAT-US-02-AC01: 태그 없음 → 유저 대사', '안녕하세요', [user('안녕하세요')]],
    ['CHAT-US-02-AC01: 태그 없는 여러 줄 → 한 유저 부분', '첫 줄\n둘째 줄', [user('첫 줄\n둘째 줄')]],
    ['CHAT-US-02-AC02: 유저(플레이 이름) 태그', '@쀠: 고마워요, 선배.', [user('고마워요, 선배.')]],
    ['CHAT-US-02-AC02: 캐릭터 태그', '@한서윤: 응, 나도 거의 끝났어.', [character(2, '응, 나도 거의 끝났어.')]],
    ['CHAT-US-02-AC02: 나레이터 태그', '@나레이터: 바람이 분다', [narrator('바람이 분다')]],
    [
      'CHAT-US-02-AC02: 여러 화자를 작성 순서대로',
      '@쀠: 고마워요, 선배.\n@한서윤: 응, 나도 거의 끝났어.\n@나레이터: 창밖이 어두워진다.',
      [user('고마워요, 선배.'), character(2, '응, 나도 거의 끝났어.'), narrator('창밖이 어두워진다.')],
    ],
    [
      'CHAT-US-02-AC01: 첫 태그 앞의 글 → 유저 부분(AI 응답 파서와 달리 나레이터가 아님)',
      '먼저 쓴 말\n@윤슬: 대답',
      [user('먼저 쓴 말'), character(3, '대답')],
    ],
    [
      'CHAT-US-02-AC02: 모르는 이름의 태그 줄 → 태그 포함 원문을 현재 부분에 이어 붙임',
      '@윤슬: 안녕\n@없는사람: 누구지',
      [character(3, '안녕\n@없는사람: 누구지')],
    ],
    [
      'CHAT-US-02-AC01: 맨 앞의 모르는 이름 태그 줄 → 유저 부분',
      '@없는사람: 누구지\n@윤슬: 글쎄',
      [user('@없는사람: 누구지'), character(3, '글쎄')],
    ],
    [
      'CHAT-US-02-AC02·AC03: 태그 뒤 여러 줄은 그 화자 부분으로 이어지고 서식 기호는 그대로',
      '@윤슬: *고개를 든다*\n정말 **반가워**',
      [character(3, '*고개를 든다*\n정말 **반가워**')],
    ],
    [
      'CHAT-US-02-AC02: 빈 줄·앞뒤 공백 정리, 빈 부분은 버림',
      '\n  \n@윤슬:   \n\n@나레이터:   바람  \n\n',
      [narrator('바람')],
    ],
    [
      'CHAT-US-02-AC02: CRLF 줄바꿈',
      '안녕\r\n@윤슬: 반가워\r\n또 보자',
      [user('안녕'), character(3, '반가워\n또 보자')],
    ],
    [
      'CHAT-US-02-AC02: 같은 화자가 연속돼도 합치지 않음',
      '@윤슬: 하나\n@윤슬: 둘',
      [character(3, '하나'), character(3, '둘')],
    ],
    ['CHAT-US-02-AC02: `@이름:` 뒤 공백 없음', '@윤슬:붙여 씀', [character(3, '붙여 씀')]],
    [
      'CHAT-US-02-AC02: 줄 중간의 `@이름:`이나 앞에 공백이 있는 줄은 태그가 아님',
      '안녕 @윤슬: 하이\n @윤슬: 띄움',
      [user('안녕 @윤슬: 하이\n @윤슬: 띄움')],
    ],
    ['CHAT-US-02-AC02: 콜론 없는 `@이름`은 본문', '@윤슬 안녕', [user('@윤슬 안녕')]],
    ['CHAT-US-02-AC04: 공백뿐인 입력 → 부분 없음', '  \n\t ', []],
  ])('%s', (_name, text, expected) => {
    expect(parseUserText(text, names)).toEqual(expected);
  });

  it('CHAT-US-02-AC02: 플레이 이름이 캐릭터 이름과 겹치면 유저를 우선하고, `나레이터`는 항상 나레이터다', () => {
    const clash: SpeakerNames = { playName: '윤슬', characters: [{ id: 3, name: '윤슬' }] };
    expect(parseUserText('@윤슬: 누구?', clash)).toEqual([user('누구?')]);
    const narratorName: SpeakerNames = { playName: '나레이터', characters: [] };
    expect(parseUserText('@나레이터: 바람', narratorName)).toEqual([narrator('바람')]);
  });

  it('CHAT-US-02-AC01: 보낼 부분은 입력창 글자에서 만든다', () => {
    expect(toMessageParts({ text: '안녕\n@윤슬: 반가워' }, names)).toEqual([user('안녕'), character(3, '반가워')]);
  });
});

describe('CHAT-US-02-AC02: `@` 칩 줄', () => {
  it('CHAT-US-02-AC02: `@`를 하나 새로 입력했을 때만 그 위치를 돌려준다', () => {
    expect(detectSpeakerTrigger('안녕', '안녕@')).toBe(2);
    expect(detectSpeakerTrigger('안녕', '@안녕')).toBe(0);
    // `@`가 이어지면 어느 쪽이 새로 친 글자인지 알 수 없다. 앞부분이 처음 달라지는 위치(뒤쪽 `@`)를 돌려준다.
    // (칩을 누르면 그 `@`가 태그가 되고, 앞의 `@`는 본문에 남는다: `a@` + `\n@이름: b`.)
    expect(detectSpeakerTrigger('a@b', 'a@@b')).toBe(2);
    expect(detectSpeakerTrigger('안녕', '안녕!')).toBeNull();
    expect(detectSpeakerTrigger('', 'a@b')).toBeNull();
    expect(detectSpeakerTrigger('안녕@', '안녕')).toBeNull();
  });

  it.each<[string, string, number, string, number]>([
    ['빈 입력의 `@`', '@', 0, '@한서윤: ', 6],
    ['줄 맨 앞의 `@`', '안녕\n@', 3, '안녕\n@한서윤: ', 9],
    ['줄 중간의 `@`(앞에 줄바꿈을 넣음)', '안녕@', 2, '안녕\n@한서윤: ', 9],
    ['뒤에 글이 있는 `@`', '@뒤 글', 0, '@한서윤: 뒤 글', 6],
  ])(
    'CHAT-US-02-AC02: 칩을 누르면 %s를 `@이름: `로 바꾸고 커서를 그 뒤에 둔다',
    (_name, text, at, expected, cursor) => {
      expect(insertSpeakerTag(text, at, '한서윤')).toEqual({ text: expected, cursor });
    },
  );

  it('CHAT-US-02-AC02: 그 자리에 `@`가 없으면 바꾸지 않는다', () => {
    expect(insertSpeakerTag('안녕', 1, '한서윤')).toBeNull();
  });
});

describe('CHAT-US-02-AC02: 이름에 `:`가 있거나 플레이 이름이 `나레이터`인 세션', () => {
  // 서버는 플레이 이름·캐릭터 이름에 `:`를 허용한다. 플레이 이름 `나레이터`도 허용한다.
  const colon: SpeakerNames = {
    playName: 'Re:Zero',
    characters: [
      { id: 2, name: '윤슬' },
      { id: 4, name: 'A:B' },
      { id: 5, name: 'A' },
    ],
  };

  it.each<[string, string, ChatMessagePartInput[]]>([
    ['플레이 이름 `Re:Zero` 태그 → 유저', '@Re:Zero: 나는 유저', [user('나는 유저')]],
    [
      '캐릭터 줄 뒤의 `@Re:Zero:` 줄은 유저 부분(앞 캐릭터에 붙지 않음)',
      '@윤슬: 안녕\n@Re:Zero: 나는 유저',
      [character(2, '안녕'), user('나는 유저')],
    ],
    ['`:`가 있는 캐릭터 이름', '@A:B: 콜론 캐릭터', [character(4, '콜론 캐릭터')]],
    ['긴 이름을 먼저 맞춘다(`A:B`가 `A`보다 먼저)', '@A:B:붙여 씀', [character(4, '붙여 씀')]],
    ['짧은 이름도 그대로 맞춘다', '@A: 짧은 이름', [character(5, '짧은 이름')]],
    ['`:` 뒤 탭 하나는 태그에 포함', '@Re:Zero:\t탭 뒤', [user('탭 뒤')]],
    ['이름 앞부분만 맞는 태그는 모르는 이름', '@윤슬: 하나\n@Re: 둘', [character(2, '하나\n@Re: 둘')]],
  ])('CHAT-US-02-AC02: %s', (_name, text, expected) => {
    expect(parseUserText(text, colon)).toEqual(expected);
  });

  it('CHAT-US-02-AC16: `:`가 있는 이름도 부분 → 글자 → 파싱이 같은 부분이다', () => {
    const parts = [
      character(2, 'x'),
      user('me'),
      character(4, '콜론'),
      narrator('바람'),
      character(5, '짧게'),
      user('끝'),
    ];
    expect(toMessageParts(fromMessageParts(parts, colon), colon)).toEqual(parts);
  });

  it('CHAT-US-02-AC01·AC16: 플레이 이름이 `나레이터`여도 `@나레이터:`는 나레이터이고, 태그 없는 맨 앞 유저 부분은 그대로 되돌린다', () => {
    const narratorName: SpeakerNames = { playName: '나레이터', characters: [{ id: 2, name: '윤슬' }] };
    expect(parseUserText('내 말\n@나레이터: 바람', narratorName)).toEqual([user('내 말'), narrator('바람')]);
    const parts = [user('내 말'), character(2, '응'), narrator('바람')];
    const restored = fromMessageParts(parts, narratorName);
    expect(restored.text).toBe('내 말\n@윤슬: 응\n@나레이터: 바람');
    expect(toMessageParts(restored, narratorName)).toEqual(parts);
  });

  it('CHAT-US-02-AC16: (남은 한계) 플레이 이름이 `나레이터`면 맨 앞이 아닌 유저 부분은 나레이터로 되돌아온다', () => {
    const narratorName: SpeakerNames = { playName: '나레이터', characters: [] };
    expect(toMessageParts(fromMessageParts([narrator('바람'), user('내 말')], narratorName), narratorName)).toEqual([
      narrator('바람'),
      narrator('내 말'),
    ]);
  });
});

describe('CHAT-US-02-AC04: 5,000자 한도와 빈 입력', () => {
  it('CHAT-US-02-AC04: 태그 접두어는 빼고 모든 부분 본문의 공백·줄바꿈·서식 기호를 코드 포인트로 합산한다', () => {
    // '*a b*\n**' (8) + '😀' (1). `@나레이터: `·`@쀠: `와 부분 앞뒤 공백은 세지 않는다.
    expect(draftLength({ text: '@나레이터: *a b*\n**  \n@쀠: 😀' }, names)).toBe(8 + 1);
  });

  it('CHAT-US-02-AC04: 한도를 넘는 추가 입력은 남은 길이만큼만 받고 기존 내용은 지킨다', () => {
    const base = `${'a'.repeat(4990)}\n@나레이터: `;
    expect(limitInput(base, `${base}${'b'.repeat(25)}`, names)).toBe(`${base}${'b'.repeat(10)}`);
    // 가운데에 끼워 넣어도 새로 들어온 글자만 자른다(이모지는 한 글자).
    const full = 'x'.repeat(MESSAGE_MAX_LENGTH - 1);
    expect(limitInput(full, `xx😀😀${full.slice(2)}`, names)).toBe(`xx😀${full.slice(2)}`);
    // 한도 안에서는 그대로 받는다.
    expect(limitInput('ab', 'abc', names)).toBe('abc');
  });

  it('CHAT-US-02-AC04: 이미 한도를 넘었으면 더 늘리는 입력은 막고 줄이는 입력은 받는다', () => {
    const over = 'a'.repeat(MESSAGE_MAX_LENGTH + 3);
    expect(limitInput(over, `${over}b`, names)).toBe(over);
    expect(limitInput(over, over.slice(1), names)).toBe(over.slice(1));
  });

  it('CHAT-US-02-AC04: 한도 근처에서 태그의 `:`를 지워 본문 합산이 늘어도 지우기는 받고, 전송 때 한도 초과로 막는다', () => {
    const prev = `${'a'.repeat(4998)}\n@윤슬: bb`;
    expect(draftLength({ text: prev }, names)).toBe(5000);
    const next = `${'a'.repeat(4998)}\n@윤슬 bb`;
    expect(limitInput(prev, next, names)).toBe(next);
    expect(validateDraft({ text: next }, names)).toBe('too_long');
    // 맨 앞 `@`를 지워도 같다.
    expect(limitInput(prev, `${'a'.repeat(4998)}\n윤슬: bb`, names)).toBe(`${'a'.repeat(4998)}\n윤슬: bb`);
  });

  it('CHAT-US-02-AC04: 빈 입력과 한도 초과를 구분해 전송하지 않는다', () => {
    expect(validateDraft(emptyDraft(), names)).toBe('empty');
    expect(validateDraft({ text: ' \n ' }, names)).toBe('empty');
    expect(validateDraft({ text: '@윤슬:   ' }, names)).toBe('empty');
    expect(validateDraft({ text: 'a'.repeat(MESSAGE_MAX_LENGTH) }, names)).toBeNull();
    expect(validateDraft({ text: `@나레이터: ${'a'.repeat(MESSAGE_MAX_LENGTH)}` }, names)).toBeNull();
    expect(validateDraft({ text: 'a'.repeat(MESSAGE_MAX_LENGTH + 1) }, names)).toBe('too_long');
  });
});

describe('CHAT-US-02-AC16: 거절된 전송 되돌리기', () => {
  it('CHAT-US-02-AC16: 부분을 `@이름: 본문` 줄로 입력창 글자에 되돌리고(맨 앞 유저는 태그 생략), 다시 보내면 같은 부분이다', () => {
    const parts = [user('하나'), character(3, '둘\n셋'), narrator('바람'), user('넷')];
    const restored = fromMessageParts(parts, names);
    expect(restored).toEqual({ text: '하나\n@윤슬: 둘\n셋\n@나레이터: 바람\n@쀠: 넷' });
    expect(toMessageParts(restored, names)).toEqual(parts);
  });

  it('CHAT-US-02-AC16: 맨 앞이 유저가 아니면 첫 줄부터 태그를 단다', () => {
    expect(fromMessageParts([character(2, '먼저'), user('나')], names)).toEqual({ text: '@한서윤: 먼저\n@쀠: 나' });
  });
});
