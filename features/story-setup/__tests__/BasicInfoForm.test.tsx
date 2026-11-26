import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { BasicInfoForm } from '../components/BasicInfoForm';
import type { BasicInfoValues } from '../types';

const rendered: BasicInfoValues = {
  title: '',
  subtitle: '',
  world: '',
  tags: [],
  tagInput: '',
  characters: [{ key: 'new-1', name: '', detail: '' }],
};

describe('BasicInfoForm 입력 변경', () => {
  it('입력은 최신 값 기준으로 반영돼 저장 응답이 붙인 id를 지우지 않는다', async () => {
    const onChange = jest.fn();
    await render(
      <QueryClientProvider client={new QueryClient()}>
        <BasicInfoForm values={rendered} onChange={onChange} />
      </QueryClientProvider>,
    );

    await fireEvent.changeText(screen.getByLabelText('캐릭터 1 상세'), '서점 주인');

    // 화면이 그려진 뒤 저장 응답이 id를 붙인 최신 상태
    const latest: BasicInfoValues = { ...rendered, characters: [{ ...rendered.characters[0], id: '11' }] };
    const update = onChange.mock.calls[0][0] as (v: BasicInfoValues) => BasicInfoValues;
    expect(update(latest).characters[0]).toEqual({ key: 'new-1', id: '11', name: '', detail: '서점 주인' });
  });
});

describe('BasicInfoForm 합산 글자 수·순서 변경', () => {
  const twoChars: BasicInfoValues = {
    ...rendered,
    world: '가'.repeat(2999),
    characters: [
      { key: 'k1', id: '1', name: 'A', detail: '' },
      { key: 'k2', id: '2', name: 'B', detail: '' },
    ],
  };

  it('합계가 3000자를 넘으면 넘은 글자 수를 알려 준다 (AC09)', async () => {
    await render(
      <QueryClientProvider client={new QueryClient()}>
        <BasicInfoForm values={twoChars} onChange={jest.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/3,001 \/ 3,000자/)).toBeOnTheScreen();
    expect(screen.getByText(/1자 넘었어요/)).toBeOnTheScreen();
  });

  it('CREATE-US-12: 캐릭터 카드에 화면에 보이는 ↑·↓ 이동 버튼이 없다', async () => {
    await render(
      <QueryClientProvider client={new QueryClient()}>
        <BasicInfoForm values={twoChars} onChange={jest.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.queryAllByRole('button', { name: /(위로|아래로) 이동$/ })).toHaveLength(0);
    expect(screen.queryAllByText(/[↑↓]/)).toHaveLength(0);
    expect(screen.getByText('카드 왼쪽 위 점 손잡이를 길게 누른 채 끌어 순서를 바꿀 수 있어요.')).toBeOnTheScreen();
  });

  it('CREATE-US-12: 끌기 제스처는 점 6개 손잡이에만 붙고 카드 제목·본문에는 붙지 않는다', async () => {
    await render(
      <QueryClientProvider client={new QueryClient()}>
        <BasicInfoForm values={twoChars} onChange={jest.fn()} />
      </QueryClientProvider>,
    );
    const handle = screen.getByTestId('drag-handle-k1');
    expect(handle.props.onResponderGrant).toEqual(expect.any(Function));
    expect(handle.props.accessibilityLabel).toBe('캐릭터 1 순서 변경(길게 눌러 끌기)');
    // 손잡이 모양: 점 6개
    expect(screen.getByTestId('drag-grip-k1', { includeHiddenElements: true }).children).toHaveLength(3);
    for (const row of screen.getByTestId('drag-grip-k1', { includeHiddenElements: true }).children) {
      expect(typeof row === 'string' ? [] : row.children).toHaveLength(2);
    }
    // 카드 전체·제목·입력칸은 제스처를 받지 않는다(제목을 눌러도 끌기가 시작되지 않는다)
    expect(screen.getByTestId('drag-item-k1').props.onResponderGrant).toBeUndefined();
    expect(screen.getByText('캐릭터 1').props.onResponderGrant).toBeUndefined();
    expect(screen.getByText('캐릭터 1').parent?.props.onResponderGrant).toBeUndefined();
    expect(screen.getByLabelText('캐릭터 1 이름').props.onResponderGrant).toBeUndefined();
    // 삭제 버튼은 그대로 있다
    expect(screen.getByRole('button', { name: '캐릭터 1 삭제' })).toBeOnTheScreen();
  });

  it('CREATE-US-12: 캐릭터가 한 명이면 순서를 바꿀 수 없어 손잡이를 그리지 않는다', async () => {
    await render(
      <QueryClientProvider client={new QueryClient()}>
        <BasicInfoForm values={rendered} onChange={jest.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId('drag-handle-new-1')).toBeNull();
    expect(screen.queryByLabelText(/순서 변경/)).toBeNull();
  });

  it('CREATE-US-12: 편집 불가 동안 손잡이는 자리만 두고 감추며 화면 읽기에서도 숨긴다', async () => {
    await render(
      <QueryClientProvider client={new QueryClient()}>
        <BasicInfoForm values={twoChars} onChange={jest.fn()} editable={false} />
      </QueryClientProvider>,
    );
    const handle = screen.getByTestId('drag-handle-k1', { includeHiddenElements: true });
    expect(handle).toHaveStyle({ opacity: 0 });
    expect(handle.props.accessibilityElementsHidden).toBe(true);
    expect(handle.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('카드 머리의 접근성 동작(위로/아래로)으로 캐릭터 순서를 바꾼다 (AC14 보조 조작)', async () => {
    const onChange = jest.fn();
    await render(
      <QueryClientProvider client={new QueryClient()}>
        <BasicInfoForm values={twoChars} onChange={onChange} />
      </QueryClientProvider>,
    );
    const first = screen.getByLabelText('캐릭터 1 순서 변경(길게 눌러 끌기)');
    expect(first.props.accessibilityActions).toEqual([
      { name: 'decrement', label: '위로 이동' },
      { name: 'increment', label: '아래로 이동' },
    ]);
    // 첫 카드는 위로 옮길 자리가 없다
    await fireEvent(first, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent(first, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    const update = onChange.mock.calls[0][0] as (v: BasicInfoValues) => BasicInfoValues;
    expect(update(twoChars).characters.map((c) => c.key)).toEqual(['k2', 'k1']);
  });

  it('편집 불가 상태에서는 접근성 동작으로도 순서를 바꾸지 않는다', async () => {
    const onChange = jest.fn();
    await render(
      <QueryClientProvider client={new QueryClient()}>
        <BasicInfoForm values={twoChars} onChange={onChange} editable={false} />
      </QueryClientProvider>,
    );
    await fireEvent(
      screen.getByLabelText('캐릭터 1 순서 변경(길게 눌러 끌기)', { includeHiddenElements: true }),
      'accessibilityAction',
      {
        nativeEvent: { actionName: 'increment' },
      },
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});
