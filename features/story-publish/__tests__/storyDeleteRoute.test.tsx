// CREATE-US-07-AC10 삭제 성공 뒤 이동: 편집 라우트(app/(tabs)/create/[storyId])가 삭제 성공과 일반 뒤로 가기를
// 서로 다른 라우터 동작에 연결하는지만 확인한다. expo-router와 편집 화면은 가짜로 바꾼다.
// 실제 스택 동작(목록에서 진입·딥 링크 모두 목록 하나만 남음)은 Expo 웹(Chrome) 수동 QA로 확인했다.
import { act, render } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { Platform } from 'react-native';

import StoryEditorRoute from '@/app/(tabs)/create/[storyId]';
import type { StoryEditorScreen } from '@/features/story-publish';

type EditorProps = ComponentProps<typeof StoryEditorScreen>;

const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(),
  dismissTo: jest.fn(),
  replace: jest.fn(),
};
const mockIsFocused = jest.fn();
const mockUsePreventRemove = jest.fn();
// 안정된 참조의 캐시 정리 콜백. 이 테스트는 삭제 뒤 이동만 보므로 호출 여부는 확인하지 않는다.
const mockForgetEditorCache = jest.fn();
let mockEditorProps: EditorProps | undefined;

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useNavigation: () => ({ isFocused: mockIsFocused }),
  useLocalSearchParams: () => ({ storyId: '7' }),
  usePreventRemove: (...args: unknown[]) => mockUsePreventRemove(...args),
  useFocusEffect: jest.fn(),
}));
jest.mock('@/features/story-scene', () => jest.requireActual('../../story-scene/hooks/useUnsavedCreationGuard'));
jest.mock('@/features/story-publish', () => ({
  StoryEditorScreen: (props: EditorProps) => {
    mockEditorProps = props;
    return null;
  },
  useForgetStoryEditorCache: () => mockForgetEditorCache,
}));

async function renderRoute(): Promise<EditorProps> {
  await render(<StoryEditorRoute />);
  if (!mockEditorProps) throw new Error('편집 화면이 렌더되지 않았어요');
  return mockEditorProps;
}

beforeEach(() => {
  Object.values(mockRouter).forEach((fn) => fn.mockReset());
  mockIsFocused.mockReset();
  mockUsePreventRemove.mockReset();
  mockEditorProps = undefined;
});

describe('편집 라우트의 이동 연결', () => {
  it('CREATE-US-07-AC10: 라우트 파라미터의 storyId를 편집 화면에 넘긴다', async () => {
    const { storyId } = await renderRoute();

    expect(storyId).toBe('7');
  });

  it('CREATE-US-07-AC10: 삭제 성공은 dismissTo로 목록까지 닫고 일반 뒤로 가기를 쓰지 않는다', async () => {
    mockRouter.canGoBack.mockReturnValue(true);
    const { onDeleted, onUnsavedChange } = await renderRoute();
    await act(async () => onUnsavedChange?.(true));
    expect(mockUsePreventRemove.mock.lastCall?.[0]).toBe(true);
    await act(async () => onDeleted());
    expect(mockUsePreventRemove.mock.lastCall?.[0]).toBe(false);

    expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1);
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/create');
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('CREATE-US-07-AC10: 일반 뒤로 가기는 스택이 있으면 back을 부르고 dismissTo를 쓰지 않는다', async () => {
    mockRouter.canGoBack.mockReturnValue(true);
    const { onBack } = await renderRoute();

    onBack();

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  it('CREATE-US-07-AC10: 일반 뒤로 가기는 딥 링크처럼 스택이 없으면 목록으로 바꾼다', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    const { onBack } = await renderRoute();

    onBack();

    expect(mockRouter.replace).toHaveBeenCalledWith('/create');
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  it('CREATE-US-07-AC10: 포커스 판단은 내비게이션의 isFocused를 따른다', async () => {
    const { isRouteFocused } = await renderRoute();

    mockIsFocused.mockReturnValue(false);
    expect(isRouteFocused?.()).toBe(false);
    mockIsFocused.mockReturnValue(true);
    expect(isRouteFocused?.()).toBe(true);
  });
});

// CREATE-US-07-AC11 미저장 이탈 확인: 라우트가 공용 가드(useUnsavedCreationGuard)를 실제로 거쳐
// Expo 웹의 확인 창으로 이탈을 막는지 본다. expo-router의 usePreventRemove는 설치본과 같은 규칙으로 흉내 낸다
// (막혀 있으면 removePrevented 콜백만 부르고, repeat는 막기를 풀고 원래 동작을 다시 dispatch한다).
// 저장·삭제는 편집 화면(가짜) 안에만 있으므로, 라우트가 삭제 후 이동(dismissTo)을 일으키지 않는지로 확인한다.
describe('CREATE-US-07-AC11 편집 라우트의 미저장 이탈 확인(Expo 웹)', () => {
  type RemoveAction = { type: string };
  type PreventCallback = (event: { data: { action: RemoveAction }; repeat: () => void }) => void;
  const mockDispatch = jest.fn();
  const mockRepeat = jest.fn();
  const mockConfirm = jest.fn();
  const originalConfirm = Object.getOwnPropertyDescriptor(globalThis, 'confirm');

  /** 설치된 usePreventRemove의 removePrevented 처리와 같은 순서로 이탈을 시도한다. */
  function attemptLeave(action: RemoveAction) {
    const [prevent, callback] = (mockUsePreventRemove.mock.lastCall ?? []) as [boolean?, PreventCallback?];
    if (!prevent) {
      mockDispatch(action);
      return;
    }
    callback?.({
      data: { action },
      repeat: () => {
        mockRepeat();
        mockDispatch(action);
      },
    });
  }

  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web');
    mockDispatch.mockReset();
    mockRepeat.mockReset();
    mockConfirm.mockReset();
    Object.defineProperty(globalThis, 'confirm', { value: mockConfirm, configurable: true, writable: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalConfirm) Object.defineProperty(globalThis, 'confirm', originalConfirm);
    else Reflect.deleteProperty(globalThis, 'confirm');
  });

  // 시스템 뒤로 가기·제스처처럼 헤더 버튼이 아닌 화면 제거는 기존 가드(usePreventRemove)가 맡는다.
  it('CREATE-US-07-AC11: 시스템 이탈은 미저장 상태에서 취소하면 머물고, 나가기 확정에서만 이탈을 한 번 다시 실행한다', async () => {
    mockRouter.canGoBack.mockReturnValue(true);
    const { onUnsavedChange } = await renderRoute();
    await act(async () => onUnsavedChange?.(true));
    expect(mockUsePreventRemove.mock.lastCall?.[0]).toBe(true);
    const systemBack = () => attemptLeave({ type: 'GO_BACK' });

    // 취소: 확인 창만 뜨고 이탈은 다시 실행되지 않는다. 막기는 그대로 켜져 있다.
    mockConfirm.mockReturnValue(false);
    await act(async () => systemBack());
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledWith('저장하지 않은 변경 내용이 사라집니다. 나가시겠습니까?');
    expect(mockRepeat).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockUsePreventRemove.mock.lastCall?.[0]).toBe(true);

    // 확정: 막혔던 GO_BACK을 정확히 한 번 다시 실행하고, 이후 막기를 끈다.
    mockConfirm.mockReturnValue(true);
    await act(async () => systemBack());
    expect(mockConfirm).toHaveBeenCalledTimes(2);
    expect(mockRepeat).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
    expect(mockUsePreventRemove.mock.lastCall?.[0]).toBe(false);

    // 이탈 확인은 저장·삭제를 시작하지 않는다: 삭제 후 이동도, 다른 라우터 이동도 없다.
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  // Expo 웹 딥 링크에서는 헤더의 back/replace가 탭 이동이 되어 usePreventRemove를 거치지 않는다(실제 브라우저 RED).
  // 그래서 라우터 이동이 가드 콜백을 부르지 않는 경우에도 헤더 버튼이 직접 확인해야 한다.
  describe('라우터 이동이 가드에 걸리지 않는 경우(딥 링크)', () => {
    beforeEach(() => {
      mockRouter.back.mockImplementation(() => mockDispatch({ type: 'GO_BACK' }));
      mockRouter.replace.mockImplementation(() => mockDispatch({ type: 'REPLACE' }));
      mockRouter.dismissTo.mockImplementation(() => attemptLeave({ type: 'POP_TO' }));
    });

    it.each([true, false])(
      'CREATE-US-07-AC11: 미저장 헤더 뒤로 가기는 취소하면 이동하지 않는다 (canGoBack=%s)',
      async (canGoBack) => {
        mockRouter.canGoBack.mockReturnValue(canGoBack);
        const { onUnsavedChange } = await renderRoute();
        await act(async () => onUnsavedChange?.(true));
        if (!mockEditorProps) throw new Error('편집 화면이 렌더되지 않았어요');
        const { onBack } = mockEditorProps;

        mockConfirm.mockReturnValue(false);
        await act(async () => onBack());

        expect(mockConfirm).toHaveBeenCalledTimes(1);
        expect(mockConfirm).toHaveBeenCalledWith('저장하지 않은 변경 내용이 사라집니다. 나가시겠습니까?');
        expect(mockDispatch).not.toHaveBeenCalled();
        expect(mockRouter.back).not.toHaveBeenCalled();
        expect(mockRouter.replace).not.toHaveBeenCalled();
        expect(mockRouter.dismissTo).not.toHaveBeenCalled();
        expect(mockUsePreventRemove.mock.lastCall?.[0]).toBe(true);
      },
    );

    it.each([true, false])(
      'CREATE-US-07-AC11: 미저장 헤더 뒤로 가기는 확정하면 확인 한 번 뒤 dismissTo로 목록에 간다 (canGoBack=%s)',
      async (canGoBack) => {
        mockRouter.canGoBack.mockReturnValue(canGoBack);
        const { onUnsavedChange } = await renderRoute();
        await act(async () => onUnsavedChange?.(true));
        if (!mockEditorProps) throw new Error('편집 화면이 렌더되지 않았어요');
        const { onBack } = mockEditorProps;

        mockConfirm.mockReturnValue(true);
        await act(async () => onBack());

        // 확인 창은 한 번만: 막기를 끈 뒤 이동하므로 가드 콜백이 다시 묻지 않는다.
        expect(mockConfirm).toHaveBeenCalledTimes(1);
        expect(mockUsePreventRemove.mock.lastCall?.[0]).toBe(false);
        expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1);
        expect(mockRouter.dismissTo).toHaveBeenCalledWith('/create');
        expect(mockDispatch).toHaveBeenCalledTimes(1);
        expect(mockDispatch).toHaveBeenCalledWith({ type: 'POP_TO' });
        expect(mockRepeat).not.toHaveBeenCalled();
        expect(mockRouter.back).not.toHaveBeenCalled();
        expect(mockRouter.replace).not.toHaveBeenCalled();
      },
    );

    it('CREATE-US-07-AC11: 미저장이 없으면 확인 없이 기존 뒤로 가기를 쓴다', async () => {
      mockRouter.canGoBack.mockReturnValue(false);
      const { onBack } = await renderRoute();

      await act(async () => onBack());

      expect(mockConfirm).not.toHaveBeenCalled();
      expect(mockRouter.replace).toHaveBeenCalledWith('/create');
      expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    });
  });
});
