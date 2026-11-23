// CHAT-US-02 입력창 메시지 구성 규칙
import {
  detectSpeakerTrigger,
  draftLength,
  emptyDraft,
  fromMessageParts,
  inputMaxLength,
  limitText,
  MESSAGE_MAX_LENGTH,
  type MessageDraft,
  removePart,
  switchSpeaker,
  toMessageParts,
  validateDraft,
} from '@/features/chat/messageDraft';

const yoon = { kind: 'character', characterId: 2 } as const;
const narrator = { kind: 'narrator' } as const;

describe('CHAT-US-02-AC01·AC02: 발화자 전환과 부분 구성', () => {
  it('CHAT-US-02-AC01: 발화자를 고르지 않으면 유저 캐릭터로 보낸다', () => {
    expect(toMessageParts({ ...emptyDraft(), text: '안녕' })).toEqual([
      { speaker_kind: 'user', character_id: null, body: '안녕' },
    ]);
  });

  it('CHAT-US-02-AC02: 발화자를 바꾸면 입력 중인 글을 이전 발화자 부분으로 확정하고 작성 순서를 지킨다', () => {
    let draft: MessageDraft = { ...emptyDraft(), text: '안녕' };
    draft = switchSpeaker(draft, yoon);
    draft = { ...draft, text: '*웃는다* 반가워' };
    draft = switchSpeaker(draft, narrator);
    draft = { ...draft, text: '바람이 분다' };
    expect(toMessageParts(draft)).toEqual([
      { speaker_kind: 'user', character_id: null, body: '안녕' },
      { speaker_kind: 'character', character_id: 2, body: '*웃는다* 반가워' },
      { speaker_kind: 'narrator', character_id: null, body: '바람이 분다' },
    ]);
  });

  it('CHAT-US-02-AC02: 빈 글에서 발화자만 바꾸면 부분을 만들지 않고, 부분을 지울 수 있다', () => {
    const switched = switchSpeaker({ ...emptyDraft(), text: '  ' }, yoon);
    expect(switched).toEqual({ parts: [], speaker: yoon, text: '' });
    const twoParts = switchSpeaker(switchSpeaker({ ...emptyDraft(), text: '하나' }, yoon), narrator);
    expect(twoParts.parts).toHaveLength(1);
    expect(removePart(twoParts, 0).parts).toEqual([]);
  });

  it('CHAT-US-02-AC02: @를 하나 새로 입력했을 때만 발화자 선택으로 보고 @는 본문에서 뺀다', () => {
    expect(detectSpeakerTrigger('안녕', '안녕@')).toBe('안녕');
    expect(detectSpeakerTrigger('안녕', '@안녕')).toBe('안녕');
    expect(detectSpeakerTrigger('안녕', '안녕!')).toBeNull();
    expect(detectSpeakerTrigger('', 'a@b')).toBeNull();
  });

  it('CHAT-US-02-AC16: 거절된 부분을 순서·발화자 그대로 되돌린다', () => {
    const parts = [
      { speaker_kind: 'user', character_id: null, body: '하나' },
      { speaker_kind: 'character', character_id: 2, body: '둘' },
    ] as const;
    expect(toMessageParts(fromMessageParts([...parts]))).toEqual(parts);
  });
});

describe('CHAT-US-02-AC04: 5,000자 한도와 빈 입력', () => {
  it('CHAT-US-02-AC04: 모든 부분의 공백·줄바꿈·서식 기호를 코드 포인트로 합산한다', () => {
    const draft: MessageDraft = {
      parts: [{ speaker: narrator, body: '*a b*\n' }],
      speaker: { kind: 'user' },
      text: '😀**',
    };
    expect(draftLength(draft)).toBe(6 + 3);
  });

  it('CHAT-US-02-AC04: 한도를 넘는 입력은 남은 길이만큼만 받아 기존 내용을 지킨다', () => {
    expect(limitText('abcdef', 4)).toBe('abcd');
    expect(limitText('😀😀😀', 2)).toBe('😀😀');
    const draft: MessageDraft = {
      parts: [{ speaker: narrator, body: 'x'.repeat(4990) }],
      speaker: { kind: 'user' },
      text: '😀',
    };
    // 이모지 한 글자는 UTF-16 두 단위이므로 maxLength에 한 단위를 더 준다.
    expect(inputMaxLength(draft)).toBe(10 + 1);
  });

  it('CHAT-US-02-AC04: 빈 입력과 한도 초과를 구분해 전송하지 않는다', () => {
    expect(validateDraft(emptyDraft())).toBe('empty');
    expect(validateDraft({ ...emptyDraft(), text: ' \n ' })).toBe('empty');
    expect(validateDraft({ ...emptyDraft(), text: 'a'.repeat(MESSAGE_MAX_LENGTH) })).toBeNull();
    expect(validateDraft({ ...emptyDraft(), text: 'a'.repeat(MESSAGE_MAX_LENGTH + 1) })).toBe('too_long');
  });
});
