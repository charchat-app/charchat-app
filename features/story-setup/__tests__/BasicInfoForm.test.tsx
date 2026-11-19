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
