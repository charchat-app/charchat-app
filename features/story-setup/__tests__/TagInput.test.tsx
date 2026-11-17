import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { fetchTagSuggestions } from '../api';
import { TagInput } from '../components/TagInput';
import type { BasicInfoValues } from '../types';

jest.mock('../api', () => ({ fetchTagSuggestions: jest.fn() }));
const mockFetch = fetchTagSuggestions as jest.MockedFunction<typeof fetchTagSuggestions>;

const initial: BasicInfoValues = { title: '', subtitle: '', world: '', tags: [], characters: [] };

function Harness({ start = initial }: { start?: BasicInfoValues }) {
  const [values, setValues] = useState(start);
  return <TagInput tags={values.tags} onChange={(update) => setValues(update)} />;
}

async function renderInput(start?: BasicInfoValues) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <Harness start={start} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  mockFetch.mockReset();
});
afterEach(() => jest.useRealTimers());

describe('TagInput', () => {
  it('한 글자 입력으로 후보와 공개 스토리 수를 보여 주고, 누르면 추가한다 (AC17)', async () => {
    mockFetch.mockResolvedValue([
      { name: '로맨스', publicStoryCount: 3 },
      { name: '로판', publicStoryCount: 1 },
    ]);
    await renderInput();

    await fireEvent.changeText(screen.getByLabelText('해시태그 입력'), '로');
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(mockFetch).toHaveBeenCalledWith('로');
    expect(await screen.findByText('공개 스토리 3개')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('로맨스 태그 추가, 공개 스토리 3개'));
    expect(screen.getByLabelText('로맨스 태그 삭제')).toBeOnTheScreen();
  });

  it('후보에 없어도 입력한 태그를 그대로 추가한다 (AC18)', async () => {
    mockFetch.mockResolvedValue([]);
    await renderInput();

    await fireEvent.changeText(screen.getByLabelText('해시태그 입력'), '서점물');
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(await screen.findByText('검색 결과에 없어요. 입력한 태그를 그대로 추가할 수 있어요.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '추가' }));

    expect(screen.getByLabelText('서점물 태그 삭제')).toBeOnTheScreen();
  });

  it('11자 태그는 잘라내지 않고 추가한 뒤 이유를 보여 준다 (AC13)', async () => {
    mockFetch.mockResolvedValue([]);
    await renderInput();

    await fireEvent.changeText(screen.getByLabelText('해시태그 입력'), '가나다라마바사아자차카');
    expect(screen.getByText('11/10자')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '추가' }));

    expect(screen.getByLabelText('가나다라마바사아자차카 태그 삭제')).toBeOnTheScreen();
    expect(screen.getByText('#가나다라마바사아자차카: 11자예요. 해시태그는 10자까지 쓸 수 있어요.')).toBeOnTheScreen();
  });

  it('10개를 넘으면 개수를 빨갛게 표시하고 이유를 알려 준다 (AC15)', async () => {
    mockFetch.mockResolvedValue([]);
    await renderInput({ ...initial, tags: Array.from({ length: 10 }, (_, i) => `태그${i}`) });
    expect(screen.queryByText(/최대 10개까지/)).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('해시태그 입력'), '열한번째');
    await fireEvent.press(screen.getByRole('button', { name: '추가' }));

    expect(screen.getByText('11/10개')).toBeOnTheScreen();
    expect(screen.getByText(/최대 10개까지 등록할 수 있어요/)).toBeOnTheScreen();
  });

  it('쉼표를 입력하면 앞부분을 태그로 추가한다', async () => {
    mockFetch.mockResolvedValue([]);
    await renderInput();

    await fireEvent.changeText(screen.getByLabelText('해시태그 입력'), '로맨스, 판타지,');
    expect(screen.getByLabelText('로맨스 태그 삭제')).toBeOnTheScreen();
    expect(screen.getByLabelText('판타지 태그 삭제')).toBeOnTheScreen();
  });

  it('같은 태그로 취급되는 표기는 추가하지 않고 이유를 알려 준다', async () => {
    mockFetch.mockResolvedValue([{ name: 'Romance', publicStoryCount: 2 }]);
    await renderInput({ ...initial, tags: ['Romance'] });

    await fireEvent.changeText(screen.getByLabelText('해시태그 입력'), 'romance');
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    // 이미 추가한 태그는 후보에서도 뺀다
    expect(await screen.findByText('검색 결과에 없어요. 입력한 태그를 그대로 추가할 수 있어요.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '추가' }));

    expect(screen.queryByLabelText('romance 태그 삭제')).toBeNull();
    expect(screen.getByText(/'romance'는 'Romance'와 같은 태그예요/)).toBeOnTheScreen();
  });
});
