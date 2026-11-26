// CREATE-US-12 제작 화면 셸(편집 화면 쪽): 목업 v15 순서의 6개 탭, 압축 머리글(제목·상태), 다른 구역 넘기기.
// 2~4번·공개 범위 구역은 라우트가 넘긴 onOpenScene으로만 연다. 저장하지 않은 입력이 있으면 넘기지 않는다.
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as baseRender, screen, within } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

import { defaultExpression } from '@/shared/story-types';

import { getStory, saveStoryBasic } from '../api';
import type { CommonSaveDocument, CommonSaveRepository } from '../commonRepository';
import { StoryEditorScreen } from '../components/StoryEditorScreen';
import { storyCreationKey } from '../hooks/useStoryPresets';
import type { EditorStory } from '../types';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../api', () => ({ ...jest.requireActual('../api'), saveStoryBasic: jest.fn(), getStory: jest.fn() }));
const mockCommonSave = jest.fn<ReturnType<CommonSaveRepository['save']>, Parameters<CommonSaveRepository['save']>>();
jest.mock('../commonRepository', () => ({
  ...jest.requireActual('../commonRepository'),
  createCommonSaveRepository: () => ({
    load: () => Promise.reject(new Error('처리하지 않은 공통 저장 조회')),
    save: (...args: Parameters<CommonSaveRepository['save']>) => mockCommonSave(...args),
  }),
}));

notifyManager.setScheduler((callback) => callback());
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const render = (element: ReactElement) => baseRender(element, { wrapper });

/** 목업 v15 renderEditor의 tabs 순서 */
const MOCKUP_TABS = ['기본 설정', '말투·서술', '인트로', '초기 상태', '유저 프로필', '공개 범위'];

function seed(story: Partial<EditorStory> = {}) {
  client.setQueryData<EditorStory>(['stories', 'detail', '1'], {
    id: '1',
    title: '비 오는 서점',
    subtitle: '단골 손님',
    world: '골목 끝 서점',
    tags: [],
    characters: [{ id: '11', name: '루나', detail: '점원' }],
    saveState: '임시 저장',
    updatedAt: '2026-11-17T00:00:00Z',
    issues: [],
    ...story,
  });
  const creation: CommonSaveDocument = {
    id: '1',
    title: '비 오는 서점',
    saveState: 'draft',
    updatedAt: '2026-11-17T00:00:00Z',
    speech: defaultExpression(),
    characters: [],
    fewshots: [],
    intros: [],
    relations: [],
    affinities: [],
    presets: [],
  };
  client.setQueryData(storyCreationKey('1'), creation);
}

// 탭 줄 ScrollView는 접근성 요소가 아니라 role로 찾을 수 없어 testID로 찾는다(탭은 각각 접근성 요소로 남긴다).
const tabList = () => screen.getByTestId('editor-tabs');
const tabNames = () =>
  within(tabList())
    .getAllByRole('tab')
    .map((tab) => within(tab).getByText(/.+/).props.children);

beforeEach(() => {
  client.clear();
  jest.mocked(saveStoryBasic).mockReset();
  jest.mocked(getStory).mockReset();
  jest.mocked(getStory).mockRejectedValue(new Error('처리하지 않은 상세 조회'));
  mockCommonSave.mockReset();
  mockCommonSave.mockRejectedValue(new Error('처리하지 않은 공통 저장'));
});

describe('CREATE-US-12: 편집 화면 셸', () => {
  it('CREATE-US-12: 목업 순서의 6개 탭을 가로 스크롤 탭 줄에 보이고 머리글에 제목·상태를 보인다', async () => {
    seed();
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} onOpenScene={jest.fn()} />);

    expect(tabNames()).toEqual(MOCKUP_TABS);
    expect(tabList().props.horizontal).toBe(true);
    expect(tabList().props.accessibilityRole).toBe('tablist');
    expect(screen.getByRole('header', { name: '비 오는 서점' })).toBeOnTheScreen();
    // 하단 고정 줄의 「임시 저장」 버튼과 겹치지 않도록 머리글 안의 상태 배지만 본다.
    expect(within(screen.getByTestId('editor-header')).getByText('임시 저장', { exact: true })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '목록으로 돌아가기' })).toBeOnTheScreen();
  });

  it.each([
    ['말투·서술', 'speech'],
    ['인트로', 'intro'],
    ['초기 상태', 'state'],
    ['공개 범위', 'visibility'],
  ])(
    'CREATE-US-12: 저장된 그대로면 「%s」 탭은 onOpenScene(%s)으로 넘기고 기본 설정에 머문다',
    async (tab, section) => {
      seed();
      const onOpenScene = jest.fn();
      await render(
        <StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} onOpenScene={onOpenScene} />,
      );

      await act(async () => fireEvent.press(screen.getByRole('tab', { name: tab })));

      expect(onOpenScene).toHaveBeenCalledTimes(1);
      expect(onOpenScene).toHaveBeenCalledWith(section);
      expect(screen.getByRole('tab', { name: '기본 설정' })).toBeSelected();
    },
  );

  it('CREATE-US-12: 저장하지 않은 기본 정보가 있으면 인트로로 넘기지 않고 안내하며 입력·저장 요청을 그대로 둔다', async () => {
    seed();
    const onOpenScene = jest.fn();
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} onOpenScene={onOpenScene} />);
    await act(async () => fireEvent.changeText(screen.getByLabelText('제목'), '맑은 서점'));

    await act(async () => fireEvent.press(screen.getByRole('tab', { name: '인트로' })));

    expect(onOpenScene).not.toHaveBeenCalled();
    expect(
      screen.getByText('저장하지 않은 변경이 있어 인트로로 이동하지 않았어요. 입력은 그대로예요. 먼저 저장해 주세요.'),
    ).toBeOnTheScreen();
    expect(screen.getByDisplayValue('맑은 서점')).toBeOnTheScreen();
    expect(saveStoryBasic).not.toHaveBeenCalled();
    expect(mockCommonSave).not.toHaveBeenCalled();
  });

  it('CREATE-US-12: 요청한 구역(initialSection=profile)으로 열면 유저 프로필 탭이 선택된다', async () => {
    seed();
    await render(
      <StoryEditorScreen
        storyId="1"
        onBack={jest.fn()}
        onDeleted={jest.fn()}
        onOpenScene={jest.fn()}
        initialSection="profile"
      />,
    );

    expect(screen.getByRole('tab', { name: '유저 프로필' })).toBeSelected();
  });
});
