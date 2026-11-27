// CHAT-US-02 입력창 `@` 칩 줄: 태그로 쓸 수 없는 이름의 칩, `:`가 있는 이름, 칩 삽입 한도
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { ChatComposer } from '@/features/chat/components/room/ChatComposer';
import { useSpeakers } from '@/features/chat/hooks/useSpeakers';
import type { MessageDraft } from '@/features/chat/messageDraft';
import type { ChatMessagePartInput, ConversationSession } from '@/shared/story-types';

const session = (overrides: Partial<ConversationSession>): ConversationSession => ({
  id: 19,
  story_title: '달빛 정원',
  model: null,
  read_only: false,
  play_name: '여행자',
  messages: [],
  characters: [
    { id: 2, name: '윤슬' },
    { id: 3, name: '서윤' },
  ],
  ...overrides,
});

function Composer({
  value,
  initial = '',
  onSend,
}: {
  value: ConversationSession;
  initial?: string;
  onSend: jest.Mock;
}) {
  const { names, chips } = useSpeakers(value);
  const [draft, setDraft] = useState<MessageDraft>({ text: initial });
  return (
    <ChatComposer
      draft={draft}
      update={(change) => setDraft(change)}
      names={names}
      chips={chips}
      blockedReason={null}
      onSend={(parts: ChatMessagePartInput[]) => onSend(parts) as boolean}
    />
  );
}

const input = () => screen.getByLabelText('메시지 입력');
const type = async (more: string) => fireEvent.changeText(input(), `${input().props.value}${more}`);

it('CHAT-US-02-AC01: 플레이 이름이 `나레이터`면 유저 칩은 태그로 쓸 수 없어 비활성이고 이유를 알려 준다', async () => {
  const onSend = jest.fn(() => true);
  await render(<Composer value={session({ play_name: '나레이터' })} onSend={onSend} />);
  await type('@');
  const chips = screen.getAllByRole('button', { name: /로 말하기$/ });
  expect(chips.map((chip) => chip.props.accessibilityLabel)).toEqual([
    '나레이터로 말하기',
    '나레이터로 말하기',
    '윤슬로 말하기',
    '서윤으로 말하기',
  ]);
  const [narratorChip, userChip] = chips;
  expect(narratorChip).toBeEnabled();
  expect(userChip).toBeDisabled();
  // 네이티브는 accessibilityState, 웹은 aria-disabled(react-native View가 jest에서는 accessibilityState로 합친다).
  expect(userChip.props.accessibilityState).toMatchObject({ disabled: true });
  expect(userChip.props.accessibilityHint).toBe(
    '이 이름은 나레이터와 같아 태그로 쓸 수 없어요. @ 없이 쓰면 이 이름의 대사가 돼요',
  );
  await fireEvent.press(userChip);
  expect(input()).toHaveDisplayValue('@');
  // 태그 없이 쓴 글은 유저 대사로 보낸다.
  await fireEvent.changeText(input(), '내 말');
  await fireEvent.press(screen.getByRole('button', { name: '메시지 전송' }));
  expect(onSend).toHaveBeenCalledWith([{ speaker_kind: 'user', character_id: null, body: '내 말' }]);
});

it('CHAT-US-02-AC02: `:`가 있는 플레이 이름 칩으로 쓴 줄은 앞 캐릭터 부분에 붙지 않고 유저 부분으로 보낸다', async () => {
  const onSend = jest.fn(() => true);
  await render(<Composer value={session({ play_name: 'Re:Zero' })} onSend={onSend} />);
  await type('@');
  await fireEvent.press(screen.getByRole('button', { name: '윤슬로 말하기' }));
  await type('안녕\n');
  await type('@');
  await fireEvent.press(screen.getByRole('button', { name: 'Re:Zero(으)로 말하기' }));
  await type('나는 유저');
  expect(input()).toHaveDisplayValue('@윤슬: 안녕\n@Re:Zero: 나는 유저');
  await fireEvent.press(screen.getByRole('button', { name: '메시지 전송' }));
  expect(onSend).toHaveBeenCalledWith([
    { speaker_kind: 'character', character_id: 2, body: '안녕' },
    { speaker_kind: 'user', character_id: null, body: '나는 유저' },
  ]);
});

it('CHAT-US-02-AC04: 칩으로 넣은 태그 때문에 본문 합산이 한도를 넘으면 넣지 않고 이유를 안내한다', async () => {
  // 한도를 넘은 채 되돌아온 글(5,005자). 줄 맨 앞에 `@`를 치면 `서윤:`이 태그가 되어 5,000자로 줄어든다.
  const head = `${'a'.repeat(4998)}\n`;
  await render(<Composer value={session({})} initial={`${head}서윤: hi`} onSend={jest.fn()} />);
  await fireEvent.changeText(input(), `${head}@서윤: hi`);
  expect(screen.getByText('5,000 / 5,000자')).toBeOnTheScreen();
  // 다른 칩을 고르면 `서윤: `이 본문이 되어 5,004자가 된다.
  await fireEvent.press(screen.getByRole('button', { name: '윤슬로 말하기' }));
  expect(input()).toHaveDisplayValue(`${head}@서윤: hi`);
  expect(screen.getByText('메시지는 모든 발화자를 합해 5,000자까지 보낼 수 있습니다.')).toBeOnTheScreen();
  expect(screen.queryAllByRole('button', { name: /로 말하기$/ })).toHaveLength(0);
});
