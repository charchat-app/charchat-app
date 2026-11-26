// CREATE-US-12 내 스토리 목록의 목업 v15 배치: 목록 머리(제목·개수), 세로로 긴 카드(표지 자리·상태·제목·저장 시각),
// 카드 오른쪽 아래 원형 편집(44px), 화면 오른쪽 아래 + 새 스토리(58px·라운드 19), 목록 아래 여백.
// 기존 동작(편집 열기·대화 시작 조건·생성 대기/오류·빈 상태)이 그대로인지 함께 확인한다.
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ApiError } from '@/lib/api-client';

import { StoryListScreen } from '../components/StoryListScreen';
import type { StorySummary } from '../types';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

type ListState = { isPending: boolean; isError: boolean; data: StorySummary[]; error: Error | null };
type CreateState = { isPending: boolean; error: Error | null };

const mockList: ListState = { isPending: false, isError: false, data: [], error: null };
const mockCreate: CreateState = { isPending: false, error: null };
const mockMutate = jest.fn();
const mockRefetch = jest.fn();

jest.mock('../hooks/useStories', () => ({
  useMyStories: () => ({ ...mockList, refetch: mockRefetch }),
  useCreateStory: () => ({ ...mockCreate, mutate: mockMutate }),
}));

jest.mock('../hooks/useDeletedNotice', () => ({
  useDeletedNotice: () => ({ visible: false, dismiss: jest.fn() }),
}));

const rows: StorySummary[] = [
  { id: '7', title: '달빛 정원', saveState: '임시 저장', updatedAt: '2026-11-17T00:00:00Z' },
  { id: '8', title: '새벽 항해', saveState: '공개', updatedAt: '2026-11-18T00:00:00Z' },
  { id: '9', title: '', saveState: '비공개', updatedAt: '2026-11-19T00:00:00Z' },
];

beforeEach(() => {
  Object.assign(mockList, { isPending: false, isError: false, data: rows, error: null });
  Object.assign(mockCreate, { isPending: false, error: null });
  mockMutate.mockReset();
  mockRefetch.mockReset();
});

const flat = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) ?? {};

describe('CREATE-US-12: 내 스토리 목록 (목업 v15)', () => {
  it('목록 머리에 「스토리 목록」과 실제 개수를 보여 준다', async () => {
    await render(<StoryListScreen onOpen={jest.fn()} />);
    expect(screen.getByText('스토리 목록')).toBeTruthy();
    expect(screen.getByText('3개')).toBeTruthy();
  });

  it('카드마다 표지 자리(순번)·상태·제목을 보여 주고, 제목이 없으면 「제목 없는 스토리」로 쓴다', async () => {
    await render(<StoryListScreen onOpen={jest.fn()} />);
    expect(screen.getByText('01', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('03', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('달빛 정원')).toBeTruthy();
    expect(screen.getByText('제목 없는 스토리')).toBeTruthy();
    expect(screen.getByText('임시 저장')).toBeTruthy();
    expect(screen.getAllByText('공개').length).toBeGreaterThan(0);
  });

  it('원형 44px 편집 버튼(「제목 편집」)으로 스토리를 연다', async () => {
    const onOpen = jest.fn();
    await render(<StoryListScreen onOpen={onOpen} />);
    const edit = screen.getByRole('button', { name: '새벽 항해 편집' });
    expect(flat(edit)).toMatchObject({ width: 44, height: 44, borderRadius: 22 });
    await fireEvent.press(edit);
    expect(onOpen).toHaveBeenCalledWith('8');
    await fireEvent.press(screen.getByRole('button', { name: '제목 없는 스토리 편집' }));
    expect(onOpen).toHaveBeenLastCalledWith('9');
  });

  it('대화 시작은 onStartChat이 있고 공개·비공개일 때만 보이며, 이용 현황 버튼은 두지 않는다', async () => {
    const onStartChat = jest.fn();
    await render(<StoryListScreen onOpen={jest.fn()} onStartChat={onStartChat} />);
    expect(screen.queryByRole('button', { name: '달빛 정원 대화 시작' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '새벽 항해 대화 시작' }));
    expect(onStartChat).toHaveBeenCalledWith('8');
    expect(screen.getByRole('button', { name: '제목 없는 스토리 대화 시작' })).toBeTruthy();
    expect(screen.queryByText('이용 현황')).toBeNull();
  });

  it('onStartChat이 없으면 대화 시작을 보이지 않는다', async () => {
    await render(<StoryListScreen onOpen={jest.fn()} />);
    expect(screen.queryByText('대화 시작')).toBeNull();
  });

  it('오른쪽 아래 + 버튼(「새 스토리」, 58px·라운드 19)으로 만들고, 성공하면 새 스토리를 연다', async () => {
    const onOpen = jest.fn();
    mockMutate.mockImplementation((_: undefined, opts: { onSuccess: (s: StorySummary) => void }) =>
      opts.onSuccess({ ...rows[0], id: '42' }),
    );
    await render(<StoryListScreen onOpen={onOpen} />);
    const fab = screen.getByRole('button', { name: '새 스토리' });
    expect(flat(fab)).toMatchObject({ position: 'absolute', width: 58, height: 58, borderRadius: 19 });
    expect(flat(fab).right).toBeGreaterThan(0);
    expect(flat(fab).bottom).toBeGreaterThan(0);
    await fireEvent.press(fab);
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('42');
  });

  it('목록 아래 여백이 + 버튼에 가리지 않을 만큼 크다', async () => {
    await render(<StoryListScreen onOpen={jest.fn()} />);
    const list = screen.getByTestId('story-list');
    const pad = StyleSheet.flatten(list.props.contentContainerStyle) as { paddingBottom?: number };
    expect(pad.paddingBottom ?? 0).toBeGreaterThanOrEqual(58 + 20);
  });

  it('편집·새 스토리는 글자 기호가 아닌 목업 아이콘으로 그리고, 목록 스크롤 막대를 숨긴다', async () => {
    await render(<StoryListScreen onOpen={jest.fn()} />);
    expect(screen.queryByText('✎')).toBeNull();
    expect(screen.queryByText('+')).toBeNull();
    // 아이콘은 장식용이라 접근성 트리에서 숨긴다. 버튼 안에서 숨김 요소까지 포함해 찾는다.
    const hidden = { includeHiddenElements: true };
    const edit = screen.getByRole('button', { name: '새벽 항해 편집' });
    expect(within(edit).getByTestId('story-edit-icon-8', hidden)).toBeTruthy();
    const fab = screen.getByRole('button', { name: '새 스토리' });
    expect(within(fab).getByTestId('story-new-icon', hidden)).toBeTruthy();
    const list = screen.getByTestId('story-list');
    expect(list.props.showsVerticalScrollIndicator).toBe(false);
    expect(list.props.showsHorizontalScrollIndicator).toBe(false);
  });

  it('생성 중에는 + 버튼을 막고, 생성 오류는 안내한다', async () => {
    mockCreate.isPending = true;
    mockCreate.error = new ApiError(500, 'server_error', '스토리를 만들지 못했어요.');
    await render(<StoryListScreen onOpen={jest.fn()} />);
    const fab = screen.getByRole('button', { name: '새 스토리' });
    expect(fab).toBeDisabled();
    await fireEvent.press(fab);
    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByText('스토리를 만들지 못했어요.')).toBeTruthy();
  });

  it('빈 목록에서도 + 버튼과 「새 스토리 만들기」가 있고, 생성 중엔 + 버튼이 막힌다', async () => {
    mockList.data = [];
    await render(<StoryListScreen onOpen={jest.fn()} />);
    expect(screen.getByText('첫 이야기를 만들어 보세요')).toBeTruthy();
    expect(screen.getByText('0개')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '새 스토리 만들기' }));
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '새 스토리' })).toBeEnabled();
  });

  it('불러오기 실패 시 다시 시도할 수 있다', async () => {
    Object.assign(mockList, { isError: true, data: undefined, error: new Error('x') });
    await render(<StoryListScreen onOpen={jest.fn()} />);
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
    expect(mockRefetch).toHaveBeenCalled();
  });
});
