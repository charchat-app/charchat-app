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

describe('BasicInfoForm 합산 글자 수·순서 버튼', () => {
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

  it('↓ 버튼으로 캐릭터 순서를 바꾼다 (AC14 보조 조작)', async () => {
    const onChange = jest.fn();
    await render(
      <QueryClientProvider client={new QueryClient()}>
        <BasicInfoForm values={twoChars} onChange={onChange} />
      </QueryClientProvider>,
    );
    await fireEvent.press(screen.getByLabelText('캐릭터 1 아래로 이동'));
    const update = onChange.mock.calls[0][0] as (v: BasicInfoValues) => BasicInfoValues;
    expect(update(twoChars).characters.map((c) => c.key)).toEqual(['k2', 'k1']);
    expect(screen.getByLabelText('캐릭터 1 위로 이동')).toBeDisabled();
  });
});
