// CREATE-US-07 편집 화면의 「말투·서술」 탭 연결: 라우트가 넘긴 onOpenSpeech로만 2~4번 작업 화면을 연다.
// 입력을 버리지 않도록 저장되지 않은 변경·저장·업로드 중에는 이동하지 않고 안내만 한다.
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as baseRender, screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

import { defaultExpression } from '@/shared/story-types';

import { getStory, saveStoryBasic } from '../api';
import type { CommonSaveDocument, CommonSaveRepository } from '../commonRepository';
import { StoryEditorScreen } from '../components/StoryEditorScreen';
import { storyCreationKey } from '../hooks/useStoryPresets';
import { useStoryWriteLock } from '../hooks/useStoryWriteLock';
import type { EditorStory } from '../types';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../api', () => ({ ...jest.requireActual('../api'), saveStoryBasic: jest.fn(), getStory: jest.fn() }));
const mockCommonLoad = jest.fn<ReturnType<CommonSaveRepository['load']>, Parameters<CommonSaveRepository['load']>>();
const mockCommonSave = jest.fn<ReturnType<CommonSaveRepository['save']>, Parameters<CommonSaveRepository['save']>>();
jest.mock('../commonRepository', () => ({
  ...jest.requireActual('../commonRepository'),
  createCommonSaveRepository: () => ({
    load: (...args: Parameters<CommonSaveRepository['load']>) => mockCommonLoad(...args),
    save: (...args: Parameters<CommonSaveRepository['save']>) => mockCommonSave(...args),
  }),
}));

notifyManager.setScheduler((callback) => callback());
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const render = (element: ReactElement) => baseRender(element, { wrapper });

const DIRTY_MESSAGE = '저장하지 않은 변경이 있어 말투·서술로 이동하지 않았어요. 입력은 그대로예요. 먼저 저장해 주세요.';
const BUSY_MESSAGE = '저장하는 중에는 말투·서술로 이동할 수 없어요. 저장이 끝난 뒤 다시 눌러 주세요.';
const PLACEHOLDER = '말투·서술 탭은 아직 연결되지 않았어요.';

function seed(story: Partial<EditorStory> = {}, id = '1') {
  client.setQueryData<EditorStory>(['stories', 'detail', id], {
    id,
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
    id,
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
  client.setQueryData(storyCreationKey(id), creation);
}

const pressSpeechTab = () => act(async () => fireEvent.press(screen.getByRole('tab', { name: '말투·서술' })));

beforeEach(() => {
  client.clear();
  jest.mocked(saveStoryBasic).mockReset();
  jest.mocked(getStory).mockReset();
  jest.mocked(getStory).mockRejectedValue(new Error('처리하지 않은 상세 조회'));
  mockCommonLoad.mockReset();
  mockCommonSave.mockReset();
  mockCommonLoad.mockRejectedValue(new Error('처리하지 않은 공통 저장 조회'));
  mockCommonSave.mockRejectedValue(new Error('처리하지 않은 공통 저장'));
});

describe('CREATE-US-07: 말투·서술 탭은 2~4번 작업 화면으로 넘긴다', () => {
  it('저장된 그대로면 onOpenSpeech를 한 번 부르고 기본 설정 탭에 머문다', async () => {
    seed();
    const onOpenSpeech = jest.fn();
    await render(
      <StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} onOpenSpeech={onOpenSpeech} />,
    );

    await pressSpeechTab();

    expect(onOpenSpeech).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(PLACEHOLDER)).toBeNull();
    expect(screen.getByRole('tab', { name: '기본 설정' })).toBeSelected();
    expect(screen.getByDisplayValue('비 오는 서점')).toBeOnTheScreen();
  });

  it('미등록 스토리라도 저장하지 않은 기본 정보가 있으면 이동하지 않고 안내하며 입력을 남긴다', async () => {
    seed();
    const onOpenSpeech = jest.fn();
    await render(
      <StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} onOpenSpeech={onOpenSpeech} />,
    );
    await act(async () => fireEvent.changeText(screen.getByLabelText('제목'), '맑은 서점'));

    await pressSpeechTab();

    expect(onOpenSpeech).not.toHaveBeenCalled();
    expect(screen.getByText(DIRTY_MESSAGE)).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: '기본 설정' })).toBeSelected();
    expect(screen.getByDisplayValue('맑은 서점')).toBeOnTheScreen();
    // 막은 이동이 저장을 대신 보내지 않는다
    expect(saveStoryBasic).not.toHaveBeenCalled();
    expect(mockCommonSave).not.toHaveBeenCalled();
  });

  it('완성 스토리의 저장하지 않은 변경도 이동하지 않는다', async () => {
    seed({ saveState: '비공개' });
    const onOpenSpeech = jest.fn();
    await render(
      <StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} onOpenSpeech={onOpenSpeech} />,
    );
    await act(async () => fireEvent.changeText(screen.getByLabelText('한 줄 소개'), '새 손님'));

    await pressSpeechTab();

    expect(onOpenSpeech).not.toHaveBeenCalled();
    expect(screen.getByText(DIRTY_MESSAGE)).toBeOnTheScreen();
    expect(screen.getByDisplayValue('새 손님')).toBeOnTheScreen();
  });

  it('저장 중에는 이동하지 않고 안내한다', async () => {
    seed();
    // 끝나지 않는 저장
    jest.mocked(saveStoryBasic).mockReturnValue(new Promise(() => undefined));
    const onOpenSpeech = jest.fn();
    await render(
      <StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} onOpenSpeech={onOpenSpeech} />,
    );
    await act(async () => fireEvent.changeText(screen.getByLabelText('제목'), '맑은 서점'));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: '임시 저장' })));

    await pressSpeechTab();

    expect(onOpenSpeech).not.toHaveBeenCalled();
    expect(screen.getByText(BUSY_MESSAGE)).toBeOnTheScreen();
  });

  it('같은 틱에 다른 화면이 쓰기 잠금을 잡으면 렌더 전이라도 이동하지 않는다', async () => {
    // 잠금 저장소는 QueryClient 단위로 남으므로(앞 테스트의 끝나지 않는 저장) 다른 스토리로 확인한다.
    seed({}, '2');
    const onOpenSpeech = jest.fn();
    let lock: ReturnType<typeof useStoryWriteLock> | undefined;
    function OtherWriter() {
      lock = useStoryWriteLock('2');
      return null;
    }
    await render(
      <>
        <OtherWriter />
        <StoryEditorScreen storyId="2" onBack={jest.fn()} onDeleted={jest.fn()} onOpenSpeech={onOpenSpeech} />
      </>,
    );

    const held: { release: (() => void) | null } = { release: null };
    try {
      await act(async () => {
        // 잠금과 탭 누름을 한 act 안에서 처리해, 편집 화면이 다시 렌더되기 전에 누른다.
        held.release = lock?.acquire('save') ?? null;
        fireEvent.press(screen.getByRole('tab', { name: '말투·서술' }));
      });

      expect(held.release).not.toBeNull();
      expect(onOpenSpeech).not.toHaveBeenCalled();
      expect(screen.getByText(BUSY_MESSAGE)).toBeOnTheScreen();
    } finally {
      // 잠금 저장소는 QueryClient 단위라 다음 테스트로 새지 않게 푼다.
      await act(async () => held.release?.());
    }
  });

  it('포커스를 잃은 편집 화면은 이동하지 않는다', async () => {
    seed();
    const onOpenSpeech = jest.fn();
    await render(
      <StoryEditorScreen
        storyId="1"
        onBack={jest.fn()}
        onDeleted={jest.fn()}
        onOpenSpeech={onOpenSpeech}
        isRouteFocused={() => false}
      />,
    );

    await pressSpeechTab();

    expect(onOpenSpeech).not.toHaveBeenCalled();
  });

  it('onOpenSpeech가 없으면 기존처럼 탭을 바꾸고 준비 중 안내를 보인다', async () => {
    seed();
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} />);

    await pressSpeechTab();

    expect(screen.getByText(PLACEHOLDER)).toBeOnTheScreen();
  });

  it('인트로·초기 상태 탭은 onOpenSpeech를 부르지 않고 기존처럼 탭만 바꾼다', async () => {
    seed();
    const onOpenSpeech = jest.fn();
    await render(
      <StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} onOpenSpeech={onOpenSpeech} />,
    );

    await act(async () => fireEvent.press(screen.getByRole('tab', { name: '인트로' })));
    expect(screen.getByText('인트로 탭은 아직 연결되지 않았어요.')).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByRole('tab', { name: '초기 상태' })));
    expect(screen.getByText('초기 상태 탭은 아직 연결되지 않았어요.')).toBeOnTheScreen();

    expect(onOpenSpeech).not.toHaveBeenCalled();
  });
});
