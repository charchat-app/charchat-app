// CREATE-US-07-AC03/07/09 화면 간 쓰기 잠금: 2~4번 공통 저장(useCommonSave)과 기본 설정 편집 화면(StoryEditorScreen)이
// 같은 QueryClient·스토리 id의 잠금(useStoryWriteLock)을 함께 써서 저장이 겹치지 않고, 막힌 직접 저장은 조용히 버리지 않는다.
// 실제 서버 요청은 보내지 않는다. 편집 화면은 api-client의 apiRequest만, 공통 저장은 저장소만 가짜로 바꾼다.
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render as baseRender,
  renderHook as baseRenderHook,
  screen,
} from '@testing-library/react-native';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import type { GestureResponderEvent } from 'react-native';

import type { Button } from '@/components/ui';
import { apiRequest } from '@/lib/api-client';
import { defaultExpression, type CreationSaveDocument } from '@/shared/story-types';

import type { CommonSaveDocument, CommonSaveRepository } from '../commonRepository';
import { StoryEditorScreen } from '../components/StoryEditorScreen';
import { useCommonSave } from '../hooks/useCommonSave';
import { storyKeys } from '../hooks/useStories';
import { storyImagesKey } from '../hooks/useStoryImages';
import { storyCreationKey } from '../hooks/useStoryPresets';
import { useStoryWriteLock, writeBlockedMessage } from '../hooks/useStoryWriteLock';
import type { StoryImagesSnapshot } from '../imagesRepository';
import type { EditorStory } from '../types';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiRequest: jest.fn() };
});

// 비활성 버튼도 같은 틱에 눌린 경우를 재현하려고 라벨별 마지막 onPress를 기억한다 (storyDelete.test.tsx와 같은 방식).
const mockPressHandlers = new Map<string, NonNullable<ComponentProps<typeof Button>['onPress']>>();
jest.mock('@/components/ui', () => {
  const actual = jest.requireActual<typeof import('@/components/ui')>('@/components/ui');
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  return {
    ...actual,
    Button: (props: ComponentProps<typeof Button>) => {
      if (props.onPress) mockPressHandlers.set(props.label, props.onPress);
      return createElement(actual.Button, props);
    },
  };
});

async function pressIgnoringDisabled(label: string) {
  expect(screen.getByRole('button', { name: label })).toBeTruthy();
  const handler = mockPressHandlers.get(label);
  if (!handler) throw new Error(`'${label}' 버튼에 onPress가 없어요`);
  await act(async () => handler({ nativeEvent: {} } as GestureResponderEvent));
}

const request = apiRequest as jest.MockedFunction<typeof apiRequest>;

notifyManager.setScheduler((callback) => callback());
let client = new QueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const render = (element: ReactElement) => baseRender(element, { wrapper });
const renderHook: typeof baseRenderHook = (callback, options) => baseRenderHook(callback, { wrapper, ...options });

const SAVE_BLOCKED = writeBlockedMessage('save');

function creationDoc(id = '7'): CommonSaveDocument {
  return {
    id,
    title: '달빛 정원',
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
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const repo = (save: CommonSaveRepository['save']): CommonSaveRepository => ({ load: jest.fn(), save });

const commonOptions = (storyId = '7', document: CreationSaveDocument = creationDoc(storyId)) => ({
  storyId,
  document,
  dirty: true,
  loading: false,
  pendingInput: false,
  captureCommit: () => jest.fn(),
});

/** 2~4번 공통 저장 화면과 기본 설정 편집 화면이 같은 QueryClient에서 같은 스토리 잠금을 보는 상황 */
function useTwoScreens(save: CommonSaveRepository['save'], storyId = '7', otherId = storyId) {
  return {
    common: useCommonSave(repo(save), commonOptions(storyId)),
    other: useStoryWriteLock(otherId),
  };
}

beforeEach(() => {
  request.mockReset();
  mockPressHandlers.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
});

describe('useCommonSave × useStoryWriteLock (같은 QueryClient·스토리)', () => {
  it('CREATE-US-07-AC03/07/09: 다른 화면이 저장 중이면 직접 저장을 보내지 않고 다시 시도할 수 있게 안내한다. 자동 저장은 조용히 건너뛴다', async () => {
    const save = jest.fn(async (doc: CreationSaveDocument) => doc);
    const { result } = await renderHook(() => useTwoScreens(save));
    let release!: () => void;
    await act(async () => {
      release = result.current.other.acquire('save')!;
    });
    expect(release).toBeTruthy();

    let auto!: boolean;
    await act(async () => {
      auto = await result.current.common.save('draft', 'auto');
    });
    expect(auto).toBe(false);
    expect(result.current.common.error).toBeNull();

    let manual!: boolean;
    await act(async () => {
      manual = await result.current.common.save('draft', 'manual', 'temporary');
    });
    expect(manual).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(result.current.common.error).toBe(SAVE_BLOCKED);
    expect(result.current.common.saving).toBe(false);
    // 막힌 동안 잠금 상태는 다른 화면의 저장 그대로다(공통 저장이 잠금을 빼앗거나 풀지 않는다).
    expect(result.current.other.status).toBe('save');

    await act(async () => release());
    await act(async () => {
      manual = await result.current.common.save('draft', 'manual', 'temporary');
    });
    expect(manual).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.common.error).toBeNull();
    expect(result.current.other.status).toBe('idle');
  });

  it('CREATE-US-07-AC03/07/09: 공통 저장이 진행 중이면 같은 스토리의 다른 화면은 잠금을 얻지 못하고, 끝나면(실패 포함) 풀린다', async () => {
    const first = deferred<CreationSaveDocument>();
    const save = jest.fn(() => first.promise);
    const { result } = await renderHook(() => useTwoScreens(save));
    let run!: Promise<boolean>;
    await act(async () => {
      run = result.current.common.save('draft');
    });
    expect(result.current.other.status).toBe('save');
    expect(result.current.other.acquire('save')).toBeNull();
    expect(result.current.other.acquire('delete')).toBeNull();

    await act(async () => {
      first.reject(new Error('lost'));
      await run;
    });
    expect(result.current.common.pendingSave).toBe(true);
    expect(result.current.other.status).toBe('idle');
  });

  it('CREATE-US-07-AC03/07/09: 성패 불명확 재시도가 다른 화면에 막혀도 재시도를 남기고, 풀린 뒤 같은 키·같은 본문으로 다시 보낸다', async () => {
    const save = jest
      .fn()
      .mockRejectedValueOnce(new Error('lost'))
      .mockImplementation(async (doc: CreationSaveDocument) => doc);
    const { result } = await renderHook(() => useTwoScreens(save));
    await act(() => result.current.common.save('draft'));
    expect(result.current.common.pendingSave).toBe(true);

    let release!: () => void;
    await act(async () => {
      release = result.current.other.acquire('save')!;
    });
    await act(() => result.current.common.save('draft'));
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.common.pendingSave).toBe(true);
    expect(result.current.common.error).toBe(SAVE_BLOCKED);

    await act(async () => release());
    await act(() => result.current.common.save('draft'));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]).toEqual(save.mock.calls[0]);
    expect(result.current.common.pendingSave).toBe(false);
  });

  it('CREATE-US-07-AC03/07/09: 이 화면의 자동 임시 저장 중 누른 직접 저장은 자기 잠금에 막히지 않고 이어서 보낸다', async () => {
    const auto = deferred<CreationSaveDocument>();
    const save = jest
      .fn()
      .mockImplementationOnce(() => auto.promise)
      .mockImplementation(async (doc: CreationSaveDocument) => doc);
    const { result } = await renderHook(() => useTwoScreens(save));
    let autoRun!: Promise<boolean>;
    let manualRun!: Promise<boolean>;
    await act(async () => {
      autoRun = result.current.common.save('draft', 'auto');
    });
    await act(async () => {
      manualRun = result.current.common.save('draft', 'manual', 'save');
    });
    expect(result.current.common.waiting).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);

    let manual!: boolean;
    await act(async () => {
      auto.resolve(creationDoc());
      await autoRun;
      manual = await manualRun;
    });
    expect(manual).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1].slice(1, 3)).toEqual(['draft', 'manual']);
    expect(save.mock.calls[1][3]).not.toBe(save.mock.calls[0][3]);
    expect(result.current.common.error).toBeNull();
    expect(result.current.other.status).toBe('idle');
  });

  it('CREATE-US-07-AC03/07/09: 다른 스토리·다른 QueryClient의 잠금은 공통 저장을 막지 않는다', async () => {
    const save = jest.fn(async (doc: CreationSaveDocument) => doc);
    const { result } = await renderHook(() => useTwoScreens(save, '7', '8'));
    await act(async () => {
      result.current.other.acquire('save');
    });
    await act(() => result.current.common.save('draft', 'manual', 'temporary'));
    expect(save).toHaveBeenCalledTimes(1);

    const otherClient = new QueryClient();
    const held = await baseRenderHook(() => useStoryWriteLock('7'), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={otherClient}>{children}</QueryClientProvider>
      ),
    });
    await act(async () => {
      held.result.current.acquire('save');
    });
    await act(() => result.current.common.save('draft', 'manual', 'temporary'));
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe('StoryEditorScreen × 공통 저장 (같은 QueryClient·스토리)', () => {
  const story: EditorStory = {
    id: '7',
    title: '달빛 정원',
    subtitle: '',
    world: '',
    tags: [],
    characters: [],
    saveState: '임시 저장',
    updatedAt: '2026-11-17T00:00:00Z',
    issues: [],
  };
  const noImages: StoryImagesSnapshot = {
    values: { story: [], characters: [] },
    saveState: 'draft',
    savedAt: '2026-11-17T00:00:00Z',
    workingCopySavedAt: null,
  };
  let common!: ReturnType<typeof useCommonSave>;
  function CommonScreen({ save }: { save: CommonSaveRepository['save'] }) {
    common = useCommonSave(repo(save), commonOptions());
    return null;
  }
  // 공통 저장이 성공하면 스토리 캐시를 무효화해 편집 화면의 조회가 다시 나간다. 그 조회는 끝나지 않게 두어
  // 캐시된 화면을 그대로 유지한다(이 테스트는 잠금만 본다).
  const editorRequests = (put: Promise<never>) =>
    request.mockImplementation((_path, init) => (init?.method === 'PUT' ? put : new Promise<never>(() => {})));
  const putCalls = () =>
    request.mock.calls.filter(([path, init]) => init?.method === 'PUT' && path === '/creation/stories/7');

  beforeEach(() => {
    client.setQueryData(storyKeys.detail('7'), story);
    client.setQueryData(storyImagesKey('7'), noImages);
    client.setQueryData(storyCreationKey('7'), creationDoc());
  });

  it('CREATE-US-07-AC03/07/09: 공통 저장 중에는 편집 화면이 저장을 보내지 않고, 같은 틱에 눌려도 안내한 뒤 풀리면 다시 저장할 수 있다', async () => {
    const commonSave = deferred<CreationSaveDocument>();
    const editorSave = deferred<never>();
    editorRequests(editorSave.promise);
    await render(
      <>
        <StoryEditorScreen storyId="7" onDeleted={jest.fn()} onBack={jest.fn()} />
        <CommonScreen save={() => commonSave.promise} />
      </>,
    );
    let run!: Promise<boolean>;
    await act(async () => {
      run = common.save('draft', 'manual', 'temporary');
    });
    expect(screen.getByText('저장 중…')).toBeTruthy();
    expect(screen.getByRole('button', { name: '임시 저장' })).toBeDisabled();

    await pressIgnoringDisabled('임시 저장');
    expect(putCalls()).toHaveLength(0);

    await act(async () => {
      commonSave.resolve(creationDoc());
      await run;
    });
    // 막혔던 저장은 조용히 사라지지 않고, 입력을 그대로 둔 채 다시 저장할 수 있다고 알린다.
    expect(screen.getByText(SAVE_BLOCKED)).toBeTruthy();
    expect(screen.getByDisplayValue('달빛 정원')).toBeTruthy();
    expect(screen.getByRole('button', { name: '임시 저장' })).toBeEnabled();

    await fireEvent.press(screen.getByRole('button', { name: '임시 저장' }));
    expect(putCalls()).toHaveLength(1);
    expect(screen.queryByText(SAVE_BLOCKED)).toBeNull();
    await act(async () => editorSave.reject(new Error('end')));
  });

  it('CREATE-US-07-AC03/07/09: 편집 화면 저장 중에는 공통 직접 저장을 보내지 않고 안내하며, 끝나면 보낼 수 있다', async () => {
    const editorSave = deferred<never>();
    editorRequests(editorSave.promise);
    const save = jest.fn(async (doc: CreationSaveDocument) => doc);
    await render(
      <>
        <StoryEditorScreen storyId="7" onDeleted={jest.fn()} onBack={jest.fn()} />
        <CommonScreen save={save} />
      </>,
    );
    await fireEvent.press(screen.getByRole('button', { name: '임시 저장' }));
    expect(putCalls()).toHaveLength(1);

    await act(() => common.save('draft', 'manual', 'temporary'));
    expect(save).not.toHaveBeenCalled();
    expect(common.error).toBe(SAVE_BLOCKED);

    await act(async () => editorSave.reject(new Error('lost')));
    await act(() => common.save('draft', 'manual', 'temporary'));
    expect(save).toHaveBeenCalledTimes(1);
    expect(common.error).toBeNull();
  });
});
