// CREATE-US-07 「말투·서술」 탭 연결: 편집 라우트가 onOpenSpeech를 2~4번 작업 화면(/create/scene/[storyId]) push로
// 잇는지, 두 번 눌러도 한 번만 쌓는지, fromEditor로 연 작업 화면이 돌아갈 뒤로 가기 버튼을 머리글에 넘기는지 확인한다.
// expo-router·화면 컴포넌트는 가짜로 바꾼다. 실제 스택 동작은 Expo 실행 화면에서 확인한다.
import { act, render } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import StoryEditorRoute from '@/app/(tabs)/create/[storyId]';
import StorySceneRoute from '@/app/(tabs)/create/scene/[storyId]';
import type { StoryEditorScreen } from '@/features/story-publish';

type EditorProps = ComponentProps<typeof StoryEditorScreen>;

const mockRouter = { back: jest.fn(), canGoBack: jest.fn(), dismissTo: jest.fn(), replace: jest.fn(), push: jest.fn() };
const mockNavigation = { isFocused: jest.fn() };
const mockFocusEffects: (() => void | (() => void))[] = [];
const mockForgetEditorCache = jest.fn();
const mockEditorEvents: string[] = [];
let mockEditorProps: EditorProps | undefined;
let mockParams: Record<string, string> = { storyId: '7' };

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useNavigation: () => mockNavigation,
  useLocalSearchParams: () => mockParams,
  usePreventRemove: jest.fn(),
  useFocusEffect: (effect: () => void | (() => void)) => {
    mockFocusEffects.push(effect);
  },
}));
jest.mock('@/features/story-scene', () => ({
  ...jest.requireActual('../../story-scene/hooks/useUnsavedCreationGuard'),
  CreationWorkspace: (props: { guardDraftLeave?: boolean; onBack?: () => void }) => mockWorkspaceProps(props) ?? null,
}));
const mockWorkspaceProps = jest.fn();
jest.mock('@/features/story-publish', () => ({
  StoryEditorScreen: (props: EditorProps) => {
    mockEditorProps = props;
    // 마운트·언마운트 순서를 기록해 캐시 정리보다 먼저 다시 마운트하지 않는지 본다.
    // jest.mock 팩토리는 바깥 범위 변수를 참조할 수 없어 require로 가져온다.
    const { useEffect } = require('react') as typeof import('react');
    useEffect(() => {
      mockEditorEvents.push('mount');
      return () => {
        mockEditorEvents.push('unmount');
      };
    }, []);
    return null;
  },
  useForgetStoryEditorCache: () => mockForgetEditorCache,
}));

async function renderEditor(): Promise<EditorProps> {
  await render(<StoryEditorRoute />);
  if (!mockEditorProps) throw new Error('편집 화면이 렌더되지 않았어요');
  return mockEditorProps;
}

beforeEach(() => {
  Object.values(mockRouter).forEach((fn) => fn.mockReset());
  Object.values(mockNavigation).forEach((fn) => fn.mockReset());
  mockWorkspaceProps.mockReset();
  mockFocusEffects.length = 0;
  mockForgetEditorCache.mockReset();
  mockForgetEditorCache.mockImplementation(() => mockEditorEvents.push('forget'));
  mockEditorEvents.length = 0;
  mockEditorProps = undefined;
  mockParams = { storyId: '7' };
  mockNavigation.isFocused.mockReturnValue(true);
});

describe('CREATE-US-07: 편집 라우트의 말투·서술 연결', () => {
  it('onOpenSpeech는 같은 storyId의 작업 화면을 push로 연다', async () => {
    const { onOpenSpeech } = await renderEditor();

    await act(async () => onOpenSpeech?.());

    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/create/scene/[storyId]',
      params: { storyId: '7', fromEditor: '1' },
    });
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  it('두 번 눌러도 한 번만 쌓고, 편집 화면에 다시 포커스되면 다시 열 수 있다', async () => {
    const { onOpenSpeech } = await renderEditor();

    await act(async () => {
      onOpenSpeech?.();
      onOpenSpeech?.();
    });
    expect(mockRouter.push).toHaveBeenCalledTimes(1);

    // 작업 화면에서 돌아와 편집 화면이 다시 포커스된다
    await act(async () => mockFocusEffects.at(-1)?.());
    await act(async () => onOpenSpeech?.());
    expect(mockRouter.push).toHaveBeenCalledTimes(2);
  });

  // 리뷰 P1 회귀: 작업 화면의 저장·공개가 자동 임시 저장된 새 캐릭터를 정본에 반영한 뒤 dismissTo로 돌아오면,
  // 남아 있던 편집 화면이 예전 캐릭터 id·비교 기준을 그대로 써서는 안 된다.
  it('넘긴 동안 편집 화면을 내리고, 돌아오면 편집 캐시를 지운 뒤 새로 마운트한다', async () => {
    const { onOpenSpeech } = await renderEditor();
    expect(mockEditorEvents).toEqual(['mount']);
    const cleanup = await act(async () => mockFocusEffects.at(-1)?.());

    await act(async () => onOpenSpeech?.());
    // push 뒤 편집 화면이 포커스를 잃는다
    await act(async () => (typeof cleanup === 'function' ? cleanup() : undefined));
    expect(mockEditorEvents).toEqual(['mount', 'unmount']);
    expect(mockForgetEditorCache).not.toHaveBeenCalled();

    // dismissTo로 돌아와 다시 포커스된다
    await act(async () => mockFocusEffects.at(-1)?.());
    expect(mockForgetEditorCache).toHaveBeenCalledTimes(1);
    expect(mockEditorEvents).toEqual(['mount', 'unmount', 'forget', 'mount']);
    expect(mockEditorProps?.storyId).toBe('7');
  });

  it('넘기지 않은 포커스 이동은 편집 화면을 내리거나 캐시를 지우지 않는다', async () => {
    await renderEditor();
    const cleanup = await act(async () => mockFocusEffects.at(-1)?.());
    await act(async () => (typeof cleanup === 'function' ? cleanup() : undefined));
    await act(async () => mockFocusEffects.at(-1)?.());

    expect(mockEditorEvents).toEqual(['mount']);
    expect(mockForgetEditorCache).not.toHaveBeenCalled();
  });

  it('편집 화면이 포커스되지 않았으면 열지 않는다', async () => {
    mockNavigation.isFocused.mockReturnValue(false);
    const { onOpenSpeech } = await renderEditor();

    await act(async () => onOpenSpeech?.());

    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});

describe('CREATE-US-07: 작업 화면에서 돌아가기', () => {
  it('fromEditor=1이면 머리글 뒤로 가기를 넘기고, 누르면 같은 스토리 편집 화면까지 dismissTo로 닫는다', async () => {
    mockParams = { storyId: '7', fromEditor: '1' };
    await render(<StorySceneRoute />);

    const { onBack } = mockWorkspaceProps.mock.lastCall?.[0] ?? {};
    expect(onBack).toEqual(expect.any(Function));
    await act(async () => onBack?.());
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/create/[storyId]', params: { storyId: '7' } });
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockWorkspaceProps).toHaveBeenLastCalledWith(expect.objectContaining({ guardDraftLeave: true }));
  });

  it('직접 열면(fromEditor 없음) 뒤로 가기를 보이지 않고 완성 스토리만 가드한다', async () => {
    await render(<StorySceneRoute />);

    expect(mockWorkspaceProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ onBack: undefined, guardDraftLeave: false }),
    );
  });
});
