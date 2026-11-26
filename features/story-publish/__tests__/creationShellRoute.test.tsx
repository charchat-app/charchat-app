// CREATE-US-12 제작 셸 라우트 넘기기: 같은 스토리 안에서 요청한 구역(section)을 실어 편집 화면 ↔ 작업 화면을 오간다.
// 직접 연 주소(/create/[storyId], /create/scene/[storyId])는 그대로 열리고, section이 없으면 첫 구역으로 연다.
// expo-router·화면 컴포넌트는 가짜로 바꾼다. 실제 스택 동작은 Expo 실행 화면에서 확인한다.
import { act, render } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import StoryEditorRoute from '@/app/(tabs)/create/[storyId]';
import StorySceneRoute from '@/app/(tabs)/create/scene/[storyId]';
import type { StoryEditorScreen } from '@/features/story-publish';

type EditorProps = ComponentProps<typeof StoryEditorScreen>;
type WorkspaceProps = {
  initialSection?: string;
  guardDraftLeave?: boolean;
  onBack?: () => void;
  onOpenEditor?: (section: string) => void;
  onDeleted?: () => void;
  isRouteFocused?: () => boolean;
};

const mockRouter = { back: jest.fn(), canGoBack: jest.fn(), dismissTo: jest.fn(), replace: jest.fn(), push: jest.fn() };
const mockNavigation = { isFocused: jest.fn() };
let mockEditorProps: EditorProps | undefined;
let mockParams: Record<string, string> = { storyId: '7' };
const mockWorkspaceProps = jest.fn<null, [WorkspaceProps]>();

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useNavigation: () => mockNavigation,
  useLocalSearchParams: () => mockParams,
  usePreventRemove: jest.fn(),
  useFocusEffect: jest.fn(),
}));
jest.mock('@/features/story-scene', () => ({
  ...jest.requireActual('../../story-scene/hooks/useUnsavedCreationGuard'),
  CreationWorkspace: (props: WorkspaceProps) => mockWorkspaceProps(props),
}));
jest.mock('@/features/story-publish', () => ({
  ...jest.requireActual('../creationSections'),
  StoryEditorScreen: (props: EditorProps) => {
    mockEditorProps = props;
    return null;
  },
  useForgetStoryEditorCache: () => jest.fn(),
}));

beforeEach(() => {
  Object.values(mockRouter).forEach((fn) => fn.mockReset());
  mockNavigation.isFocused.mockReset();
  mockNavigation.isFocused.mockReturnValue(true);
  mockWorkspaceProps.mockReset();
  mockWorkspaceProps.mockReturnValue(null);
  mockEditorProps = undefined;
  mockParams = { storyId: '7' };
});

const lastWorkspace = (): WorkspaceProps => mockWorkspaceProps.mock.lastCall?.[0] ?? {};

describe('CREATE-US-12: 편집 라우트', () => {
  it('CREATE-US-12: section=profile이면 유저 프로필 구역으로 연다. 없거나 모르는 값이면 첫 구역이다', async () => {
    mockParams = { storyId: '7', section: 'profile' };
    await render(<StoryEditorRoute />);
    expect(mockEditorProps?.initialSection).toBe('profile');

    mockParams = { storyId: '7', section: 'unknown' };
    await render(<StoryEditorRoute />);
    expect(mockEditorProps?.initialSection).toBeUndefined();
  });

  it('CREATE-US-12: onOpenScene(intro)는 같은 스토리 작업 화면을 요청 구역과 함께 push로 연다', async () => {
    await render(<StoryEditorRoute />);

    await act(async () => mockEditorProps?.onOpenScene?.('intro'));

    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/create/scene/[storyId]',
      params: { storyId: '7', fromEditor: '1', section: 'intro' },
    });
  });
});

describe('CREATE-US-12: 작업 라우트', () => {
  it('CREATE-US-12: section=state이면 초기 상태 구역으로 열고, 직접 연 주소도 작성 중 미저장 편집을 가드한다', async () => {
    mockParams = { storyId: '7', section: 'state' };
    await render(<StorySceneRoute />);

    expect(lastWorkspace().initialSection).toBe('state');
    expect(lastWorkspace().guardDraftLeave).toBe(true);
  });

  it('CREATE-US-12: onOpenEditor(profile)는 같은 스토리 편집 화면까지 dismissTo로 닫고 구역을 싣는다', async () => {
    mockParams = { storyId: '7', fromEditor: '1' };
    await render(<StorySceneRoute />);

    await act(async () => lastWorkspace().onOpenEditor?.('profile'));

    expect(mockRouter.dismissTo).toHaveBeenCalledWith({
      pathname: '/create/[storyId]',
      params: { storyId: '7', section: 'profile' },
    });
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('CREATE-US-12: 머리글 뒤로 가기와 삭제 성공은 목록까지 닫는다(직접 연 주소 포함)', async () => {
    await render(<StorySceneRoute />);

    await act(async () => lastWorkspace().onBack?.());
    expect(mockRouter.dismissTo).toHaveBeenLastCalledWith('/create');

    await act(async () => lastWorkspace().onDeleted?.());
    expect(mockRouter.dismissTo).toHaveBeenCalledTimes(2);
    expect(mockRouter.dismissTo).toHaveBeenLastCalledWith('/create');
  });

  it('CREATE-US-12 회귀: 삭제 이동 전 포커스 판단은 내비게이션의 isFocused를 따른다', async () => {
    await render(<StorySceneRoute />);
    const { isRouteFocused } = lastWorkspace();

    mockNavigation.isFocused.mockReturnValue(false);
    expect(isRouteFocused?.()).toBe(false);
    mockNavigation.isFocused.mockReturnValue(true);
    expect(isRouteFocused?.()).toBe(true);
  });
});
