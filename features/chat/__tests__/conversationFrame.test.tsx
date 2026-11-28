// CHAT-US-02 대화방 스크롤: 맨 아래에서 시작하고, 보고 있는 동안 새 내용(스트리밍 응답)을 따라 내려간다
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ScrollView } from 'react-native';

import { ConversationFrame } from '@/features/chat/components/ConversationFrame';
import { Text } from '@/components/ui';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

const scrollToEnd = jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockImplementation(() => {});
// 실제로는 한 프레임 뒤에 내리지만, 테스트에서는 바로 실행해 호출 여부만 본다.
jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
  callback(0);
  return 0;
});

/** 화면 높이 500, 내용 높이 `height`에서 위에서 `offset`만큼 내려 본 스크롤 이벤트 */
function scrolled(offset: number, height = 2000) {
  return {
    nativeEvent: {
      contentOffset: { x: 0, y: offset },
      contentSize: { width: 390, height },
      layoutMeasurement: { width: 390, height: 500 },
    },
  };
}

async function frame(props: { followLatest?: boolean; jumpToLatestKey?: string | null } = {}) {
  return render(
    <ConversationFrame title="대화방" {...props}>
      <Text>대화</Text>
    </ConversationFrame>,
  );
}

beforeEach(() => scrollToEnd.mockClear());

it('CHAT-US-02: 대화방은 맨 아래에서 시작하고, 맨 아래를 보는 동안 늘어난 내용(스트리밍 응답)을 따라 내려간다', async () => {
  await frame({ followLatest: true });
  const view = screen.getByTestId('conversation-scroll');
  await fireEvent(view, 'contentSizeChange', 390, 1200);
  expect(scrollToEnd).toHaveBeenLastCalledWith({ animated: false });

  await fireEvent.scroll(view, scrolled(1500 - 40, 2000)); // 맨 아래에서 40px 안
  scrollToEnd.mockClear();
  await fireEvent(view, 'contentSizeChange', 390, 2100);
  expect(scrollToEnd).toHaveBeenCalledTimes(1);
});

it('CHAT-US-02: 위로 올려 읽는 중에는 새 내용이 와도 끌어내리지 않고, 다시 맨 아래로 오면 따라간다', async () => {
  await frame({ followLatest: true });
  const view = screen.getByTestId('conversation-scroll');
  await fireEvent.scroll(view, scrolled(200));
  await fireEvent(view, 'contentSizeChange', 390, 2100);
  await fireEvent(view, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 400 } } });
  expect(scrollToEnd).not.toHaveBeenCalled();

  await fireEvent.scroll(view, scrolled(1500));
  await fireEvent(view, 'contentSizeChange', 390, 2200);
  expect(scrollToEnd).toHaveBeenCalledTimes(1);
});

it('CHAT-US-02: 메시지를 보내면(jumpToLatestKey가 바뀌면) 읽던 위치와 관계없이 맨 아래로 내린다', async () => {
  const { rerender } = await frame({ followLatest: true, jumpToLatestKey: null });
  const view = screen.getByTestId('conversation-scroll');
  await fireEvent.scroll(view, scrolled(0));
  expect(scrollToEnd).not.toHaveBeenCalled();

  await rerender(
    <ConversationFrame title="대화방" followLatest jumpToLatestKey="req-1">
      <Text>대화</Text>
    </ConversationFrame>,
  );
  expect(scrollToEnd).toHaveBeenCalledWith({ animated: true });
  // 보낸 뒤에는 다시 맨 아래를 보는 상태라 이어지는 응답을 따라간다.
  scrollToEnd.mockClear();
  await fireEvent(screen.getByTestId('conversation-scroll'), 'contentSizeChange', 390, 2300);
  expect(scrollToEnd).toHaveBeenCalledTimes(1);
});

it('CHAT-US-01: followLatest가 없는 화면(목록·스토리 상세)은 위에서 시작하고 스크롤을 건드리지 않는다', async () => {
  await frame();
  const view = screen.getByTestId('conversation-scroll');
  await fireEvent(view, 'contentSizeChange', 390, 2100);
  expect(scrollToEnd).not.toHaveBeenCalled();
});
