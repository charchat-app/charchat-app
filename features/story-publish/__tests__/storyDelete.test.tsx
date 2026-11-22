// CREATE-US-07-AC10 스토리 삭제: 편집 화면 → 삭제 확인 → DELETE /creation/stories/{id} → 캐시 정리 → 목록으로 이동
// 실제 서버 요청은 보내지 않는다. api-client의 apiRequest만 가짜로 바꾸고 api.ts·훅·화면은 실제 코드를 쓴다.
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as baseRender, screen } from '@testing-library/react-native';
import { useState, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import type { GestureResponderEvent } from 'react-native';

import type { Button } from '@/components/ui';
import { ApiError, apiRequest } from '@/lib/api-client';
import { defaultExpression, toExpressionRow } from '@/shared/story-types';

import { deleteStory } from '../api';
import type { CommonSaveDocument } from '../commonRepository';
import { StoryEditorScreen } from '../components/StoryEditorScreen';
import { StoryListScreen } from '../components/StoryListScreen';
import { storyKeys } from '../hooks/useStories';
import { storyImagesKey } from '../hooks/useStoryImages';
import { storyCreationKey } from '../hooks/useStoryPresets';
import type { StoryImagesSnapshot } from '../imagesRepository';
import type { EditorStory, StorySummary } from '../types';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiRequest: jest.fn() };
});

// 버튼 라벨별로 마지막으로 렌더된 onPress를 기억한다. disabled가 화면에 반영되기 전 같은 틱에 들어온 누름을
// 재현하려고, 비활성 버튼의 컴포넌트 콜백을 직접 부른다 (호스트 props.onPress는 없을 수 있어 쓰지 않는다).
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

/** 화면에 있는 버튼의 컴포넌트 콜백을 disabled와 상관없이 부른다. 콜백이 없으면 테스트를 실패시킨다. */
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
const rows: StorySummary[] = [
  { id: '7', title: '달빛 정원', saveState: '임시 저장', updatedAt: '2026-11-17T00:00:00Z' },
  { id: '8', title: '다른 스토리', saveState: '공개', updatedAt: '2026-11-17T00:00:00Z' },
];

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// 편집 화면은 사진 목록(GET /creation/stories/{id}/images)과 유저 프로필 프리셋이 든 공통 저장
// (GET /creation/stories/{id}/creation)도 조회한다. 삭제 검증과 무관한 이 요청들이 아래 가짜 응답
// (특히 mock*Once)을 먼저 소비하지 않도록 둘 다 캐시에 미리 넣어 둔다.
const noImages: StoryImagesSnapshot = {
  values: { story: [], characters: [] },
  saveState: 'draft',
  savedAt: '2026-11-17T00:00:00Z',
  workingCopySavedAt: null,
};
function creationOf(id: string, title: string): CommonSaveDocument {
  return {
    id,
    title,
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
function seedStory(id: string, value: EditorStory) {
  client.setQueryData(storyKeys.detail(id), value);
  client.setQueryData(storyImagesKey(id), noImages);
  client.setQueryData(storyCreationKey(id), creationOf(id, value.title));
}

const creationPath = (id: string) => `/creation/stories/${id}/creation`;
function creationCalls(id: string) {
  return request.mock.calls.filter(([path]) => path === creationPath(id));
}

/** 삭제 성공 전용 이동 콜백. 일반 뒤로 가기(onBack)와 구분해서 검증한다. */
const onDeleted = jest.fn();

beforeEach(() => {
  request.mockReset();
  onDeleted.mockReset();
  mockPressHandlers.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  seedStory('7', story);
  client.setQueryData(storyKeys.list(), rows);
});

async function openDeleteConfirm() {
  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  await fireEvent.press(screen.getByRole('button', { name: '스토리 삭제' }));
}

function deleteCalls() {
  return request.mock.calls.filter(([, init]) => init?.method === 'DELETE');
}

describe('deleteStory', () => {
  it('CREATE-US-07-AC10: DELETE /creation/stories/{id}로 요청하고 204(본문 없음)를 성공으로 본다', async () => {
    request.mockResolvedValueOnce(undefined);

    await expect(deleteStory('7')).resolves.toBeUndefined();

    expect(request).toHaveBeenCalledWith('/creation/stories/7', { method: 'DELETE' });
  });

  it('CREATE-US-07-AC10: 서버 오류는 ApiError 그대로 돌려준다', async () => {
    const failure = new ApiError(404, 'STORY_NOT_FOUND', '스토리를 찾을 수 없어요.');
    request.mockRejectedValueOnce(failure);

    await expect(deleteStory('7')).rejects.toBe(failure);
  });
});

describe('StoryEditorScreen 스토리 삭제', () => {
  it('CREATE-US-07-AC10: 공개 범위 탭에서 삭제 확인을 열면 경고를 보여 주고 아직 요청하지 않는다', async () => {
    await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={jest.fn()} />);

    await openDeleteConfirm();

    expect(screen.getByText(/달빛 정원.*삭제할까요/)).toBeTruthy();
    expect(screen.getByText(/복구할 수 없/)).toBeTruthy();
    expect(deleteCalls()).toHaveLength(0);
  });

  it('CREATE-US-07-AC10: 취소하면 요청하지 않고 화면에 머문다', async () => {
    const onBack = jest.fn();
    await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={onBack} />);
    await openDeleteConfirm();

    await fireEvent.press(screen.getByRole('button', { name: '취소' }));

    expect(screen.queryByText(/삭제할까요/)).toBeNull();
    expect(screen.getByRole('button', { name: '스토리 삭제' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '임시 저장' })).toBeEnabled();
    expect(deleteCalls()).toHaveLength(0);
    expect(onBack).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('CREATE-US-07-AC10: 204 성공 뒤에만 목록 캐시를 정리하고, 일반 뒤로 가기가 아닌 삭제 전용 이동을 한 번 부른다', async () => {
    const d = deferred();
    request.mockImplementation((_path, init) =>
      init?.method === 'DELETE' ? (d.promise as Promise<never>) : Promise.reject(new Error('unexpected')),
    );
    const onBack = jest.fn();
    await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={onBack} />);
    await openDeleteConfirm();

    await fireEvent.press(screen.getByRole('button', { name: '삭제' }));

    expect(deleteCalls()).toEqual([['/creation/stories/7', { method: 'DELETE' }]]);
    // 응답 전: 이동하지 않고 캐시도 그대로
    expect(onDeleted).not.toHaveBeenCalled();
    expect(client.getQueryData<StorySummary[]>(storyKeys.list())?.map((s) => s.id)).toEqual(['7', '8']);
    expect(client.getQueryState(storyKeys.list())?.isInvalidated).toBe(false);

    await act(async () => d.resolve());

    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
    expect(client.getQueryData<StorySummary[]>(storyKeys.list())?.map((s) => s.id)).toEqual(['8']);
    expect(client.getQueryState(storyKeys.list())?.isInvalidated).toBe(true);
    expect(client.getQueryState(storyKeys.detail('7'))?.isInvalidated).toBe(true);
    expect(client.getQueryState(storyImagesKey('7'))?.isInvalidated).toBe(true);
    // 삭제된 스토리를 다시 불러오지 않는다 (편집 화면이 떠나기 전 404 화면이 깜빡이지 않게)
    expect(request.mock.calls.filter(([, init]) => init?.method !== 'DELETE')).toHaveLength(0);
    expect(client.getQueryState(storyCreationKey('7'))?.fetchStatus).toBe('idle');
  });

  it('CREATE-US-05/07-AC10: 프리셋(공통 저장) 조회는 삭제 전에만 하고, 삭제 뒤에는 넓게 무효화돼도 다시 조회하지 않는다', async () => {
    // 이 테스트만 공통 저장 캐시를 비워 실제 첫 조회가 일어나게 한다
    client.removeQueries({ queryKey: storyCreationKey('7') });
    const { story_id: _storyId, ...expression } = toExpressionRow('7', defaultExpression());
    request.mockImplementation(async (path, init) => {
      if (init?.method === 'DELETE') return undefined as never;
      if (path === creationPath('7')) {
        return {
          story_id: 7,
          title: '달빛 정원',
          save_state: 'draft',
          saved_at: '2026-11-17T00:00:00Z',
          expression,
          characters: [],
          fewshots: [],
          intros: [],
          relations: [],
          affinities: [],
          presets: [],
        } as never;
      }
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={jest.fn()} />);
    expect(creationCalls('7')).toHaveLength(1);
    await fireEvent.press(screen.getByRole('tab', { name: '유저 프로필' }));
    expect(screen.getByText('아직 추천 프로필이 없어요.')).toBeTruthy();

    await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
    await fireEvent.press(screen.getByRole('button', { name: '스토리 삭제' }));
    await fireEvent.press(screen.getByRole('button', { name: '삭제' }));
    expect(onDeleted).toHaveBeenCalledTimes(1);

    // 다른 저장(공통 저장 등)이 스토리 캐시 전체를 무효화해도 삭제된 스토리의 공통 저장은 다시 받지 않는다
    await act(async () => {
      await client.invalidateQueries({ queryKey: storyKeys.all });
    });
    expect(creationCalls('7')).toHaveLength(1);
    expect(request.mock.calls.filter(([, init]) => init?.method !== 'DELETE')).toHaveLength(1);
    expect(screen.getByText('스토리를 삭제했어요.')).toBeTruthy();
  });

  it('CREATE-US-07-AC10: 실패하면 이동하지 않고 캐시를 유지하며 오류를 보여 준다', async () => {
    request.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', '삭제하지 못했어요.'));
    const onBack = jest.fn();
    await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={onBack} />);
    await openDeleteConfirm();

    await fireEvent.press(screen.getByRole('button', { name: '삭제' }));

    expect(await screen.findByText('삭제하지 못했어요.')).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    // 편집 화면에 머물며 다시 시도할 수 있다
    expect(screen.getByRole('button', { name: '삭제' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '임시 저장' })).toBeEnabled();
    expect(client.getQueryData<StorySummary[]>(storyKeys.list())?.map((s) => s.id)).toEqual(['7', '8']);
    expect(client.getQueryState(storyKeys.list())?.isInvalidated).toBe(false);
    expect(client.getQueryState(storyKeys.detail('7'))?.isInvalidated).toBe(false);
  });

  describe('저장·삭제 상호 배제 (탭을 오가도 유지)', () => {
    it('CREATE-US-07-AC10: 삭제 중 탭을 바꿨다 돌아와도 진행 중으로 잠겨 있고, 다시 눌러도 요청은 한 번이다', async () => {
      const d = deferred();
      request.mockImplementation((_path, init) =>
        init?.method === 'DELETE' ? (d.promise as Promise<never>) : Promise.reject(new Error('unexpected')),
      );
      const onBack = jest.fn();
      await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={onBack} />);
      await openDeleteConfirm();
      await fireEvent.press(screen.getByRole('button', { name: '삭제' }));

      // 다른 탭으로 갔다 오면 확인 안내가 새로 만들어진다
      await fireEvent.press(screen.getByRole('tab', { name: '기본 설정' }));
      expect(screen.getByRole('button', { name: '임시 저장' })).toBeDisabled();
      await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));

      const again = screen.getByRole('button', { name: '삭제 중…' });
      expect(again).toBeDisabled();
      expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
      // disabled가 반영되기 전 같은 틱의 누름을 흉내 내 컴포넌트 콜백을 직접 부른다
      await pressIgnoringDisabled('삭제 중…');
      expect(deleteCalls()).toHaveLength(1);

      await act(async () => d.resolve());
      expect(onDeleted).toHaveBeenCalledTimes(1);
      expect(onBack).not.toHaveBeenCalled();
      expect(deleteCalls()).toHaveLength(1);
    });

    it('CREATE-US-07-AC10: 삭제 중 탭을 바꾼 사이 실패하면, 돌아왔을 때 오류를 보여 주고 다시 시도할 수 있다', async () => {
      const d = deferred();
      request.mockImplementationOnce(() => d.promise as Promise<never>);
      await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={jest.fn()} />);
      await openDeleteConfirm();
      await fireEvent.press(screen.getByRole('button', { name: '삭제' }));
      await fireEvent.press(screen.getByRole('tab', { name: '기본 설정' }));

      await act(async () => d.reject(new ApiError(500, 'INTERNAL', '삭제하지 못했어요.')));
      expect(screen.getByRole('button', { name: '임시 저장' })).toBeEnabled();
      await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));

      expect(screen.getByText('삭제하지 못했어요.')).toBeTruthy();
      expect(screen.getByRole('button', { name: '삭제' })).toBeEnabled();
    });

    it('CREATE-US-07-AC10: 삭제 중에는 저장 버튼이 잠기고, 같은 틱에 눌러도 저장 요청을 보내지 않는다', async () => {
      const d = deferred();
      request.mockImplementation((_path, init) =>
        init?.method === 'DELETE' ? (d.promise as Promise<never>) : Promise.reject(new Error('unexpected')),
      );
      await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={jest.fn()} />);
      await openDeleteConfirm();
      await fireEvent.press(screen.getByRole('button', { name: '삭제' }));

      const saveButton = screen.getByRole('button', { name: '임시 저장' });
      expect(saveButton).toBeDisabled();
      await pressIgnoringDisabled('임시 저장');

      expect(request.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
      await act(async () => d.resolve());
    });

    it('CREATE-US-07-AC10: 저장 중에는 삭제를 확인할 수 없고, 같은 틱에 눌러도 DELETE를 보내지 않는다', async () => {
      const saving = deferred();
      request.mockImplementation((_path, init) =>
        init?.method === 'PUT' ? (saving.promise as Promise<never>) : Promise.reject(new Error('unexpected')),
      );
      const onBack = jest.fn();
      await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={onBack} />);
      await openDeleteConfirm();

      await fireEvent.press(screen.getByRole('button', { name: '임시 저장' }));
      const confirm = screen.getByRole('button', { name: '삭제' });
      expect(confirm).toBeDisabled();
      expect(screen.getByRole('button', { name: '취소' })).toBeEnabled();
      await pressIgnoringDisabled('삭제');

      expect(deleteCalls()).toHaveLength(0);
      expect(onBack).not.toHaveBeenCalled();
      expect(screen.getByText('저장 중…')).toBeTruthy();
      await act(async () => saving.reject(new ApiError(500, 'INTERNAL', 'x')));
    });
  });

  describe('늦게 도착한 삭제 성공', () => {
    it('CREATE-US-07-AC10: 응답 전에 편집 화면이 언마운트되면 이동하지 않는다 (캐시는 정리한다)', async () => {
      const d = deferred();
      request.mockImplementationOnce(() => d.promise as Promise<never>);
      const onBack = jest.fn();
      const { unmount } = await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={onBack} />);
      await openDeleteConfirm();
      await fireEvent.press(screen.getByRole('button', { name: '삭제' }));

      await unmount();
      await act(async () => d.resolve());

      expect(onBack).not.toHaveBeenCalled();
      expect(onDeleted).not.toHaveBeenCalled();
      expect(client.getQueryData<StorySummary[]>(storyKeys.list())?.map((s) => s.id)).toEqual(['8']);
    });

    it('CREATE-US-07-AC10: 응답 전에 편집 화면이 포커스를 잃으면 이동하지 않고 삭제됨 안내를 남긴다', async () => {
      const d = deferred();
      request.mockImplementationOnce(() => d.promise as Promise<never>);
      const onBack = jest.fn();
      // 라우트가 넘기는 포커스 판단. 삭제 응답이 오기 전에 포커스를 잃게 바꾼다.
      let focused = true;
      await render(
        <StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={onBack} isRouteFocused={() => focused} />,
      );
      await openDeleteConfirm();
      await fireEvent.press(screen.getByRole('button', { name: '삭제' }));

      focused = false;
      await act(async () => d.resolve());

      expect(onBack).not.toHaveBeenCalled();
      expect(onDeleted).not.toHaveBeenCalled();
      expect(screen.getByText('스토리를 삭제했어요.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: '임시 저장' })).toBeNull();
      expect(client.getQueryData<StorySummary[]>(storyKeys.list())?.map((s) => s.id)).toEqual(['8']);

      // 돌아온 사용자가 직접 목록으로 돌아갈 수 있다 (일반 뒤로 가기)
      await fireEvent.press(screen.getByRole('button', { name: '목록으로 돌아가기' }));
      expect(onBack).toHaveBeenCalledTimes(1);
      expect(onDeleted).not.toHaveBeenCalled();
    });
  });

  describe('편집 화면을 닫았다가 같은 스토리를 다시 열어도 유지되는 상호 배제', () => {
    function putCalls() {
      return request.mock.calls.filter(([, init]) => init?.method === 'PUT');
    }

    it('CREATE-US-07-AC10: 삭제 중 닫고 다시 열면 진행 중으로 잠겨 저장·삭제를 더 보내지 않고, 성공해도 다시 연 화면은 이동하지 않는다', async () => {
      const d = deferred();
      request.mockImplementation((_path, init) =>
        init?.method === 'DELETE' ? (d.promise as Promise<never>) : Promise.reject(new Error('unexpected')),
      );
      const firstBack = jest.fn();
      const { unmount } = await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={firstBack} />);
      await openDeleteConfirm();
      await fireEvent.press(screen.getByRole('button', { name: '삭제' }));
      await unmount();

      const secondBack = jest.fn();
      await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={secondBack} />);

      expect(screen.getByRole('button', { name: '임시 저장' })).toBeDisabled();
      await pressIgnoringDisabled('임시 저장');
      expect(putCalls()).toHaveLength(0);

      await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
      expect(screen.getByRole('button', { name: '스토리 삭제' })).toBeDisabled();
      await pressIgnoringDisabled('스토리 삭제');
      expect(screen.getByRole('button', { name: '삭제 중…' })).toBeDisabled();
      await pressIgnoringDisabled('삭제 중…');
      expect(deleteCalls()).toHaveLength(1);

      await act(async () => d.resolve());

      expect(deleteCalls()).toHaveLength(1);
      expect(firstBack).not.toHaveBeenCalled();
      expect(secondBack).not.toHaveBeenCalled();
      expect(onDeleted).not.toHaveBeenCalled();
      expect(screen.getByText('스토리를 삭제했어요.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: '임시 저장' })).toBeNull();
      expect(client.getQueryData<StorySummary[]>(storyKeys.list())?.map((s) => s.id)).toEqual(['8']);
    });

    it('CREATE-US-07-AC10: 저장 중 닫고 다시 열면 삭제가 막히고, 닫힌 화면의 저장이 끝나면 잠금이 풀려 삭제할 수 있다', async () => {
      const saving = deferred();
      request.mockImplementation((_path, init) => {
        if (init?.method === 'PUT') return saving.promise as Promise<never>;
        if (init?.method === 'DELETE') return Promise.resolve(undefined as never);
        return Promise.reject(new Error('unexpected'));
      });
      const { unmount } = await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={jest.fn()} />);
      await fireEvent.press(screen.getByRole('button', { name: '임시 저장' }));
      expect(putCalls()).toHaveLength(1);
      await unmount();

      const onBack = jest.fn();
      await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={onBack} />);

      expect(screen.getByText('저장 중…')).toBeTruthy();
      expect(screen.getByRole('button', { name: '임시 저장' })).toBeDisabled();
      await pressIgnoringDisabled('임시 저장');
      expect(putCalls()).toHaveLength(1);

      await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
      expect(screen.getByRole('button', { name: '스토리 삭제' })).toBeDisabled();
      await pressIgnoringDisabled('스토리 삭제');
      expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled();
      await pressIgnoringDisabled('삭제');
      expect(deleteCalls()).toHaveLength(0);

      // 닫힌 화면이 시작한 저장이 끝나면 (실패여도) 잠금이 풀린다
      await act(async () => saving.reject(new ApiError(500, 'INTERNAL', 'x')));
      expect(screen.getByRole('button', { name: '삭제' })).toBeEnabled();

      await fireEvent.press(screen.getByRole('button', { name: '삭제' }));
      expect(deleteCalls()).toHaveLength(1);
      expect(onDeleted).toHaveBeenCalledTimes(1);
      expect(onBack).not.toHaveBeenCalled();
    });

    it('CREATE-US-07-AC10: 다시 연 화면은 진행 중이던 저장이 성공하면 최신 입력을 표시하고 늦은 조회를 무시한다', async () => {
      let finishSave!: (value: unknown) => void;
      const pending = new Promise<unknown>((resolve) => {
        finishSave = resolve;
      });
      request.mockImplementation((_path, init) =>
        init?.method === 'PUT' ? (pending as Promise<never>) : Promise.reject(new Error('unexpected')),
      );
      const { unmount } = await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={jest.fn()} />);
      await fireEvent.press(screen.getByRole('button', { name: '임시 저장' }));
      await unmount();
      await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={jest.fn()} />);
      let finishRead!: (value: EditorStory) => void;
      const staleRead = client
        .fetchQuery({
          queryKey: storyKeys.detail('7'),
          staleTime: 0,
          queryFn: () =>
            new Promise<EditorStory>((resolve) => {
              finishRead = resolve;
            }),
        })
        .catch(() => undefined);
      await act(async () =>
        finishSave({ id: 7, title: '새로 저장한 제목', characters: [], tags: [], save_state: 'draft', issues: [] }),
      );
      await act(async () => {
        finishRead(story);
        await staleRead;
      });
      expect(screen.getByLabelText('제목')).toHaveDisplayValue('새로 저장한 제목');
      expect(client.getQueryData<EditorStory>(storyKeys.detail('7'))?.title).toBe('새로 저장한 제목');
    });

    it('CREATE-US-07-AC10: 닫힌 화면의 삭제가 실패하면 다시 연 화면에서 다시 시도할 수 있다', async () => {
      const first = deferred();
      request.mockImplementationOnce(() => first.promise as Promise<never>).mockResolvedValueOnce(undefined);
      const { unmount } = await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={jest.fn()} />);
      await openDeleteConfirm();
      await fireEvent.press(screen.getByRole('button', { name: '삭제' }));
      await unmount();

      const onBack = jest.fn();
      await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={onBack} />);
      expect(screen.getByRole('button', { name: '임시 저장' })).toBeDisabled();

      await act(async () => first.reject(new ApiError(500, 'INTERNAL', '삭제하지 못했어요.')));
      expect(screen.getByText('삭제하지 못했어요.')).toBeTruthy();
      expect(screen.getByRole('button', { name: '임시 저장' })).toBeEnabled();
      await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
      await fireEvent.press(screen.getByRole('button', { name: '스토리 삭제' }));
      await fireEvent.press(screen.getByRole('button', { name: '삭제' }));

      expect(deleteCalls()).toHaveLength(2);
      expect(onDeleted).toHaveBeenCalledTimes(1);
      expect(onBack).not.toHaveBeenCalled();
    });

    it('CREATE-US-07-AC10: 다시 연 화면에서 조회도 실패하면 삭제 실패를 함께 보여 준다', async () => {
      const first = deferred();
      request.mockImplementation((_path, init) =>
        init?.method === 'DELETE'
          ? (first.promise as Promise<never>)
          : Promise.reject(new ApiError(404, 'STORY_NOT_FOUND', '스토리를 찾을 수 없어요.')),
      );
      const { unmount } = await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={jest.fn()} />);
      await openDeleteConfirm();
      await fireEvent.press(screen.getByRole('button', { name: '삭제' }));
      await unmount();
      await client.invalidateQueries({ queryKey: storyKeys.detail('7'), refetchType: 'none' });
      await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={jest.fn()} />);
      expect(await screen.findByText('스토리를 찾을 수 없어요.')).toBeTruthy();
      await act(async () => first.reject(new ApiError(500, 'INTERNAL', '삭제하지 못했어요.')));
      expect(screen.getByText('삭제하지 못했어요.')).toBeTruthy();
    });

    it('CREATE-US-07-AC10: 삭제가 끝난 스토리를 다시 열면 남은 캐시로 편집 화면을 열지 않고 다시 조회하지 않는다', async () => {
      request.mockResolvedValueOnce(undefined);
      const { unmount } = await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={jest.fn()} />);
      await openDeleteConfirm();
      await fireEvent.press(screen.getByRole('button', { name: '삭제' }));
      expect(deleteCalls()).toHaveLength(1);
      await unmount();
      request.mockClear();
      // 남은 캐시가 무효(오래됨)여도 삭제된 스토리의 상세·사진을 다시 조회하지 않아야 한다
      expect(client.getQueryState(storyKeys.detail('7'))?.isInvalidated).toBe(true);
      expect(client.getQueryState(storyImagesKey('7'))?.isInvalidated).toBe(true);

      onDeleted.mockClear();
      const onBack = jest.fn();
      await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={onBack} />);

      expect(screen.getByText('스토리를 삭제했어요.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: '임시 저장' })).toBeNull();
      expect(request).not.toHaveBeenCalled();
      await fireEvent.press(screen.getByRole('button', { name: '목록으로 돌아가기' }));
      expect(onBack).toHaveBeenCalledTimes(1);
      expect(onDeleted).not.toHaveBeenCalled();
    });

    it('CREATE-US-07-AC10: 한 스토리의 삭제 잠금은 다른 스토리와 다른 QueryClient에 영향을 주지 않는다', async () => {
      const d = deferred();
      request.mockImplementation((_path, init) =>
        init?.method === 'DELETE' ? (d.promise as Promise<never>) : new Promise<never>(() => undefined),
      );
      const { unmount } = await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={jest.fn()} />);
      await openDeleteConfirm();
      await fireEvent.press(screen.getByRole('button', { name: '삭제' }));
      await unmount();

      // 같은 QueryClient의 다른 스토리
      seedStory('8', { ...story, id: '8', title: '다른 스토리' });
      const other = await render(<StoryEditorScreen storyId="8" onDeleted={onDeleted} onBack={jest.fn()} />);
      await fireEvent.press(screen.getByRole('button', { name: '임시 저장' }));
      expect(request.mock.calls.filter(([path, init]) => init?.method === 'PUT' && path.endsWith('/8'))).toHaveLength(
        1,
      );
      await other.unmount();

      // 다른 QueryClient의 같은 스토리
      const shared = client;
      client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
      seedStory('7', story);
      await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={jest.fn()} />);
      expect(screen.getByRole('button', { name: '임시 저장' })).toBeEnabled();

      client = shared;
      await act(async () => d.resolve());
    });

    it('CREATE-US-07-AC10: 같은 스토리 편집 화면이 둘 열려 있어도 삭제는 한 번이고, 늦은 이동은 시작한 포커스 화면만 한다', async () => {
      const d = deferred();
      request.mockImplementation((_path, init) =>
        init?.method === 'DELETE' ? (d.promise as Promise<never>) : Promise.reject(new Error('unexpected')),
      );
      const initiatorBack = jest.fn();
      const otherBack = jest.fn();
      const otherDeleted = jest.fn();
      await render(
        <>
          <StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={initiatorBack} />
          <StoryEditorScreen storyId="7" onDeleted={otherDeleted} onBack={otherBack} isRouteFocused={() => false} />
        </>,
      );
      const [tabA, tabB] = screen.getAllByRole('tab', { name: '공개 범위' });
      await fireEvent.press(tabA);
      await fireEvent.press(tabB);
      const [openA, openB] = screen.getAllByRole('button', { name: '스토리 삭제' });
      await fireEvent.press(openA);
      await fireEvent.press(openB);

      await fireEvent.press(screen.getAllByRole('button', { name: '삭제' })[0]);
      // 다른 화면도 진행 중으로 잠긴다
      expect(screen.getAllByRole('button', { name: '삭제 중…' })).toHaveLength(2);
      screen.getAllByRole('button', { name: '삭제 중…' }).forEach((b) => expect(b).toBeDisabled());
      expect(deleteCalls()).toHaveLength(1);

      await act(async () => d.resolve());

      expect(deleteCalls()).toHaveLength(1);
      expect(onDeleted).toHaveBeenCalledTimes(1);
      expect(initiatorBack).not.toHaveBeenCalled();
      expect(otherDeleted).not.toHaveBeenCalled();
      expect(otherBack).not.toHaveBeenCalled();
      expect(screen.getAllByText('스토리를 삭제했어요.')).toHaveLength(2);
    });
  });

  describe('삭제 전에 시작된 조회', () => {
    it('CREATE-US-07-AC10: 진행 중이던 목록·상세 조회가 늦게 도착해도 삭제한 스토리를 되살리지 않는다', async () => {
      const del = deferred();
      request.mockImplementationOnce(() => del.promise as Promise<never>);
      await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={jest.fn()} />);
      await openDeleteConfirm();

      // 삭제 응답보다 먼저 시작해 나중에 도착하는 옛 조회
      let resolveList!: (rows: StorySummary[]) => void;
      let resolveDetail!: (s: EditorStory) => void;
      const staleList = client
        .fetchQuery({
          queryKey: storyKeys.list(),
          queryFn: () => new Promise<StorySummary[]>((res) => (resolveList = res)),
          staleTime: 0,
        })
        .catch(() => undefined);
      const staleDetail = client
        .fetchQuery({
          queryKey: storyKeys.detail('7'),
          queryFn: () => new Promise<EditorStory>((res) => (resolveDetail = res)),
          staleTime: 0,
        })
        .catch(() => undefined);

      await fireEvent.press(screen.getByRole('button', { name: '삭제' }));
      await act(async () => del.resolve());
      await act(async () => {
        resolveList(rows);
        resolveDetail({ ...story, title: '옛 응답' });
        await Promise.all([staleList, staleDetail]);
      });

      expect(client.getQueryData<StorySummary[]>(storyKeys.list())?.map((s) => s.id)).toEqual(['8']);
      expect(client.getQueryData<EditorStory>(storyKeys.detail('7'))?.title).toBe('달빛 정원');
      expect(client.getQueryState(storyKeys.list())?.isInvalidated).toBe(true);
      expect(client.getQueryState(storyKeys.detail('7'))?.isInvalidated).toBe(true);
    });
  });

  it('CREATE-US-07-AC10: 삭제 진입점을 더해도 기존 저장 버튼과 기본 설정 탭은 그대로다', async () => {
    await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={jest.fn()} />);

    expect(screen.getByRole('button', { name: '임시 저장' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '스토리 삭제' })).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});

describe('삭제 후 목록 안내 (한 번만)', () => {
  const DELETED = '스토리를 삭제했어요.';

  /** DELETE는 성공, 목록 재조회는 끝나지 않게 둬서 캐시에 남은 목록을 그대로 보여 준다. */
  function deleteSucceeds() {
    request.mockImplementation((_path, init) =>
      init?.method === 'DELETE' ? Promise.resolve(undefined as never) : new Promise<never>(() => undefined),
    );
  }

  async function deleteFromEditor() {
    await openDeleteConfirm();
    await fireEvent.press(screen.getByRole('button', { name: '삭제' }));
  }

  it('CREATE-US-07-AC10: 딥 링크처럼 목록이 새로 열리면 삭제 안내를 보여 주고, 다시 열면 반복하지 않는다', async () => {
    deleteSucceeds();
    const editor = await render(<StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={jest.fn()} />);
    await deleteFromEditor();
    expect(onDeleted).toHaveBeenCalledTimes(1);
    await editor.unmount();

    const list = await render(<StoryListScreen onOpen={jest.fn()} />);
    expect(screen.getByText(DELETED)).toBeTruthy();
    expect(screen.queryByText('달빛 정원')).toBeNull();
    await list.unmount();

    // 뒤로 가기·다시 마운트로 같은 안내가 다시 나오지 않는다
    await render(<StoryListScreen onOpen={jest.fn()} />);
    expect(screen.queryByText(DELETED)).toBeNull();
  });

  it('CREATE-US-07-AC10: 이미 열려 있던 목록(목록에서 진입)도 삭제 안내를 받고, 다른 스토리를 열면 안내를 지운다', async () => {
    deleteSucceeds();
    const onOpen = jest.fn();
    // 실제 라우트의 dismissTo처럼 삭제 성공 이동 시 편집 화면을 닫아 목록만 남긴다.
    function ListWithEditor() {
      const [editorOpen, setEditorOpen] = useState(true);
      return (
        <>
          <StoryListScreen onOpen={onOpen} />
          {editorOpen ? (
            <StoryEditorScreen
              storyId="7"
              onDeleted={() => {
                onDeleted();
                setEditorOpen(false);
              }}
              onBack={jest.fn()}
            />
          ) : null}
        </>
      );
    }
    await render(<ListWithEditor />);
    expect(screen.queryByText(DELETED)).toBeNull();

    await deleteFromEditor();

    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(screen.getByText(DELETED)).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: '다른 스토리 편집' }));
    expect(onOpen).toHaveBeenCalledWith('8');
    expect(screen.queryByText(DELETED)).toBeNull();
  });

  it('CREATE-US-07-AC10: 포커스를 잃은 뒤 성공했거나 실패·취소하면 목록에 삭제 안내를 남기지 않는다', async () => {
    // 포커스를 잃은 뒤 성공
    deleteSucceeds();
    const unfocused = await render(
      <StoryEditorScreen storyId="7" onDeleted={onDeleted} onBack={jest.fn()} isRouteFocused={() => false} />,
    );
    await deleteFromEditor();
    expect(onDeleted).not.toHaveBeenCalled();
    await unfocused.unmount();
    const afterUnfocused = await render(<StoryListScreen onOpen={jest.fn()} />);
    expect(screen.queryByText(DELETED)).toBeNull();
    await afterUnfocused.unmount();

    // 다른 스토리: 실패 뒤 취소
    seedStory('8', { ...story, id: '8', title: '다른 스토리' });
    request.mockReset();
    request.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', '삭제하지 못했어요.'));
    const failed = await render(<StoryEditorScreen storyId="8" onDeleted={onDeleted} onBack={jest.fn()} />);
    await deleteFromEditor();
    expect(await screen.findByText('삭제하지 못했어요.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '취소' }));
    expect(onDeleted).not.toHaveBeenCalled();
    await failed.unmount();
    await render(<StoryListScreen onOpen={jest.fn()} />);
    expect(screen.queryByText(DELETED)).toBeNull();
  });
});
