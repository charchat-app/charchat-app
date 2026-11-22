// CREATE-US-07-AC10 스토리 삭제 확인
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { AccessibilityInfo } from 'react-native';

import type { Button } from '@/components/ui';
import { ApiError } from '@/lib/api-client';

import { StoryDeleteConfirm } from '../components/StoryDeleteConfirm';

// true이면 Button이 disabled를 무시한다. 다시 렌더되기 전(disabled가 아직 반영되지 않은)
// 같은 창에서 들어온 누름을 재현해, 컴포넌트의 동기 잠금만으로 막히는지 확인한다.
let mockStaleRender = false;
jest.mock('@/components/ui', () => {
  const actual = jest.requireActual<typeof import('@/components/ui')>('@/components/ui');
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  return {
    ...actual,
    Button: (props: ComponentProps<typeof Button>) =>
      createElement(actual.Button, { ...props, disabled: mockStaleRender ? false : props.disabled }),
  };
});

afterEach(() => {
  mockStaleRender = false;
  jest.restoreAllMocks();
});

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('StoryDeleteConfirm', () => {
  it('CREATE-US-07-AC10: 복구할 수 없다는 점과 기존 이용자 대화가 중단된다는 점을 경고한다', async () => {
    await render(<StoryDeleteConfirm storyTitle="달빛 정원" onConfirm={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByText(/달빛 정원/)).toBeTruthy();
    expect(screen.getByText(/복구할 수 없/)).toBeTruthy();
    expect(screen.getByText(/기존 이용자.*대화.*중단/)).toBeTruthy();
  });

  it('CREATE-US-07-AC10: 제목이 비어 있으면 대체 이름으로 안내한다', async () => {
    await render(<StoryDeleteConfirm storyTitle="" onConfirm={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByText(/제목 없는 스토리/)).toBeTruthy();
  });

  it('CREATE-US-07-AC10: 취소는 삭제를 호출하지 않고 onCancel만 호출한다', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(<StoryDeleteConfirm storyTitle="a" onConfirm={onConfirm} onCancel={onCancel} />);

    await fireEvent.press(screen.getByRole('button', { name: '취소' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('CREATE-US-07-AC10: 삭제 확인을 누르면 onConfirm을 호출한다', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    await render(<StoryDeleteConfirm storyTitle="a" onConfirm={onConfirm} onCancel={jest.fn()} />);

    await fireEvent.press(screen.getByRole('button', { name: '삭제' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('CREATE-US-07-AC10: 진행 중에는 연속으로 눌러도 한 번만 호출하고 취소도 막는다', async () => {
    const d = deferred();
    const onConfirm = jest.fn(() => d.promise);
    const onCancel = jest.fn();
    await render(<StoryDeleteConfirm storyTitle="a" onConfirm={onConfirm} onCancel={onCancel} />);

    const button = screen.getByRole('button', { name: '삭제' });
    await fireEvent.press(button);
    await fireEvent.press(button);
    await fireEvent.press(screen.getByRole('button', { name: '삭제 중…' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: '취소' }));
    expect(onCancel).not.toHaveBeenCalled();

    await act(async () => d.resolve());
  });

  it('CREATE-US-07-AC10: 실패하면 서버 메시지를 보여 주고 다시 시도할 수 있다', async () => {
    const onConfirm = jest
      .fn()
      .mockRejectedValueOnce(new ApiError(500, 'server error', '삭제하지 못했어요.'))
      .mockResolvedValueOnce(undefined);
    const onCancel = jest.fn();
    await render(<StoryDeleteConfirm storyTitle="a" onConfirm={onConfirm} onCancel={onCancel} />);

    await fireEvent.press(screen.getByRole('button', { name: '삭제' }));

    expect(await screen.findByText('삭제하지 못했어요.')).toBeTruthy();
    expect(onCancel).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: '삭제' }));

    expect(onConfirm).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('삭제하지 못했어요.')).toBeNull();
  });

  it('CREATE-US-07-AC10: ApiError가 아닌 실패는 일반 오류 문구를 보여 준다', async () => {
    const onConfirm = jest.fn().mockRejectedValue(new Error('boom'));
    await render(<StoryDeleteConfirm storyTitle="a" onConfirm={onConfirm} onCancel={jest.fn()} />);

    await fireEvent.press(screen.getByRole('button', { name: '삭제' }));

    expect(await screen.findByText('알 수 없는 오류가 발생했습니다.')).toBeTruthy();
  });

  it('CREATE-US-07-AC10: onConfirm이 동기로 던져도 오류로 처리하고 다시 누를 수 있다', async () => {
    const onConfirm = jest.fn(() => {
      throw new Error('sync');
    });
    await render(<StoryDeleteConfirm storyTitle="a" onConfirm={onConfirm} onCancel={jest.fn()} />);

    await fireEvent.press(screen.getByRole('button', { name: '삭제' }));

    expect(await screen.findByText('알 수 없는 오류가 발생했습니다.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '삭제' }));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('CREATE-US-07-AC10: 완료 전에 언마운트돼도 오류 없이 끝난다', async () => {
    const d = deferred();
    const onConfirm = jest.fn(() => d.promise);
    const { unmount } = await render(<StoryDeleteConfirm storyTitle="a" onConfirm={onConfirm} onCancel={jest.fn()} />);

    await fireEvent.press(screen.getByRole('button', { name: '삭제' }));
    await unmount();

    await act(async () => d.reject(new Error('late')));
  });

  it('CREATE-US-07-AC10: 진행 중임을 보조 기술에 알리고 삭제 버튼을 busy로 표시한다', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const d = deferred();
    await render(<StoryDeleteConfirm storyTitle="a" onConfirm={() => d.promise} onCancel={jest.fn()} />);

    expect(screen.queryByText('스토리를 삭제하는 중이에요.')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '삭제' }));

    const status = screen.getByText('스토리를 삭제하는 중이에요.');
    expect(status.props.accessibilityLiveRegion).toBe('polite');
    expect(announce).toHaveBeenCalledWith('스토리를 삭제하는 중이에요.');
    expect(screen.getByRole('button', { name: '삭제 중…' }).props.accessibilityState).toEqual(
      expect.objectContaining({ busy: true, disabled: true }),
    );

    await act(async () => d.reject(new Error('x')));
    expect(screen.queryByText('스토리를 삭제하는 중이에요.')).toBeNull();
    expect(screen.getByRole('button', { name: '삭제' }).props.accessibilityState).toEqual(
      expect.objectContaining({ busy: false, disabled: false }),
    );
  });

  it('CREATE-US-07-AC10: 호스트가 삭제 중이면(pending) 새로 만들어진 안내도 진행 중으로 잠긴다', async () => {
    await render(<StoryDeleteConfirm storyTitle="a" onConfirm={jest.fn()} onCancel={jest.fn()} pending />);

    expect(screen.getByRole('button', { name: '삭제 중…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
    expect(screen.getByText('스토리를 삭제하는 중이에요.')).toBeTruthy();
  });

  it('CREATE-US-07-AC10: 호스트가 저장 중이면(blocked) 삭제 확인만 막고 취소는 허용한다', async () => {
    await render(<StoryDeleteConfirm storyTitle="a" onConfirm={jest.fn()} onCancel={jest.fn()} blocked />);

    expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '취소' })).toBeEnabled();
  });

  it('CREATE-US-07-AC10: 호스트가 기억한 실패 문구를 보여 준다', async () => {
    await render(
      <StoryDeleteConfirm storyTitle="a" onConfirm={jest.fn()} onCancel={jest.fn()} error="삭제하지 못했어요." />,
    );

    expect(screen.getByText('삭제하지 못했어요.')).toBeTruthy();
  });

  describe('다시 렌더되기 전 같은 창의 경쟁 동작', () => {
    beforeEach(() => {
      mockStaleRender = true;
    });

    it('CREATE-US-07-AC10: 취소 직후 들어온 삭제 확인은 무시한다', async () => {
      const onConfirm = jest.fn(() => Promise.resolve());
      const onCancel = jest.fn();
      await render(<StoryDeleteConfirm storyTitle="a" onConfirm={onConfirm} onCancel={onCancel} />);

      await fireEvent.press(screen.getByRole('button', { name: '취소' }));
      await fireEvent.press(screen.getByRole('button', { name: '삭제' }));
      await fireEvent.press(screen.getByRole('button', { name: '취소' }));

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('CREATE-US-07-AC10: 삭제 진행 중 들어온 취소와 중복 확인은 무시한다', async () => {
      const d = deferred();
      const onConfirm = jest.fn(() => d.promise);
      const onCancel = jest.fn();
      await render(<StoryDeleteConfirm storyTitle="a" onConfirm={onConfirm} onCancel={onCancel} />);

      const confirmButton = screen.getByRole('button', { name: '삭제' });
      await fireEvent.press(confirmButton);
      await fireEvent.press(confirmButton);
      await fireEvent.press(screen.getByRole('button', { name: '취소' }));

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();

      await act(async () => d.resolve());
    });

    it('CREATE-US-07-AC10: 삭제 성공 뒤에는 언마운트 전이라도 다시 확인하거나 취소할 수 없다', async () => {
      const onConfirm = jest.fn(() => Promise.resolve());
      const onCancel = jest.fn();
      await render(<StoryDeleteConfirm storyTitle="a" onConfirm={onConfirm} onCancel={onCancel} />);

      await fireEvent.press(screen.getByRole('button', { name: '삭제' }));
      await act(async () => {});
      await fireEvent.press(screen.getByRole('button', { name: '삭제 중…' }));
      await fireEvent.press(screen.getByRole('button', { name: '취소' }));

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('CREATE-US-07-AC10: 실패한 뒤에는 잠금이 풀려 다시 시도할 수 있다', async () => {
      const first = deferred();
      let calls = 0;
      const onConfirm = jest.fn(() => (++calls === 1 ? first.promise : Promise.resolve()));
      await render(<StoryDeleteConfirm storyTitle="a" onConfirm={onConfirm} onCancel={jest.fn()} />);

      const confirmButton = screen.getByRole('button', { name: '삭제' });
      await fireEvent.press(confirmButton);
      await fireEvent.press(confirmButton);
      expect(onConfirm).toHaveBeenCalledTimes(1);

      await act(async () => first.reject(new Error('fail')));
      await fireEvent.press(screen.getByRole('button', { name: '삭제' }));
      expect(onConfirm).toHaveBeenCalledTimes(2);
    });
  });
});
