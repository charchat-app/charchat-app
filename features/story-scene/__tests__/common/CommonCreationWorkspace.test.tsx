import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as baseRender, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { defaultExpression, emptyScene, type CreationSaveDocument, type FewshotCharacter } from '@/shared/story-types';
import type { CommonSaveRepository, EditorStory } from '@/features/story-publish';
import { ApiError } from '@/lib/api-client';
import { usePreventRemove } from 'expo-router';
import { Alert } from 'react-native';
import { CommonCreationWorkspace } from '../../components/CommonCreationWorkspace';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ usePreventRemove: jest.fn() }));
// 스토리 조회 캐시(story-publish의 storyKeys.detail(id)와 같은 키). 기본 정보 저장이 성공하면 이 캐시가 갱신된다.
// 캐시 변경 알림을 다음 틱으로 미루지 않아 act 안에서 바로 화면에 반영되게 한다.
notifyManager.setScheduler((callback) => callback());
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
function setStoryCharacters(people: FewshotCharacter[]) {
  client.setQueryData<EditorStory>(['stories', 'detail', '1'], {
    id: '1',
    title: '가상',
    subtitle: '',
    world: '',
    tags: [],
    characters: people.map((person) => ({ id: person.id, name: person.name ?? '', detail: '' })),
    saveState: '임시 저장',
    updatedAt: '2026-11-17T00:00:00Z',
    issues: [],
  });
}
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const render = (element: ReactElement) => baseRender(element, { wrapper });
beforeEach(() => {
  client.clear();
  setStoryCharacters([]);
});
function fixture(overlong = false) {
  let data: CreationSaveDocument = {
    id: '1',
    title: '가상',
    saveState: 'draft',
    updatedAt: '2026-11-17T00:00:00Z',
    speech: { ...defaultExpression(), style: { mode: 'custom', text: overlong ? '가'.repeat(1001) : '원문 {{user}}' } },
    characters: [],
    fewshots: overlong
      ? [
          {
            id: '10',
            clientKey: 'g',
            messages: [
              { id: '20', clientKey: 'm', speakerKind: 'narrator', characterId: null, body: '나'.repeat(2001) },
            ],
          },
        ]
      : [],
    intros: [
      {
        id: '30',
        clientKey: 'intro-30',
        title: '첫 만남',
        messages: [
          { id: '31', clientKey: 'intro-message-31', speakerKind: 'narrator', characterId: null, body: '*비*' },
        ],
        scene: emptyScene(),
      },
    ],
    relations: [],
    affinities: [],
  };
  const save = jest.fn(async (document: CreationSaveDocument, state: CreationSaveDocument['saveState']) => {
    data = {
      ...document,
      saveState: state,
      fewshots: document.fewshots.map((group, i) => ({
        ...group,
        id: group.id ?? `${i + 10}`,
        messages: group.messages.map((message, j) => ({ ...message, id: message.id ?? `${j + 20}` })),
      })),
    };
    return structuredClone(data);
  });
  const repository: CommonSaveRepository = {
    load: jest.fn(async () => structuredClone(data)),
    save,
  };
  return { repository, save, stored: () => data };
}
// CREATE-US-07: 편집 화면에서 push로 쌓이면 뒤로 가기로 제거되므로 작성 중 스토리의 미저장 편집도 가드를 켠다.
it.each([
  [false, false],
  [true, true],
])('작성 중 스토리 미저장 편집의 이탈 가드: guardDraftLeave=%s → %s', async (guardDraftLeave, guarded) => {
  const { repository } = fixture();
  await render(<CommonCreationWorkspace repository={repository} storyId="1" guardDraftLeave={guardDraftLeave} />);
  await waitFor(() => expect(screen.getByLabelText('커스텀 문체')).toBeTruthy());
  expect(jest.mocked(usePreventRemove).mock.calls.at(-1)?.[0]).toBe(false);
  await fireEvent.changeText(screen.getByLabelText('커스텀 문체'), '바뀐 문체');
  expect(jest.mocked(usePreventRemove).mock.calls.at(-1)?.[0]).toBe(guarded);
});
// CREATE-US-07: push로 쌓인 화면은 머리글 뒤로 가기를 보이고, 미저장 편집이면 확인 뒤에만 제거된다.
it('onBack이 있으면 머리글 뒤로 가기를 보이고 누르면 부른다. 없으면 보이지 않는다', async () => {
  const { repository } = fixture();
  const onBack = jest.fn();
  const view = await render(<CommonCreationWorkspace repository={repository} storyId="1" onBack={onBack} />);
  await waitFor(() => expect(screen.getByLabelText('커스텀 문체')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: '목록으로 돌아가기' }));
  expect(onBack).toHaveBeenCalledTimes(1);
  await view.unmount();
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByLabelText('커스텀 문체')).toBeTruthy());
  expect(screen.queryByRole('button', { name: '목록으로 돌아가기' })).toBeNull();
});
it('미저장 편집 중 머리글 뒤로 가기는 확인 뒤 가드를 끄고 onBack을 부른다', async () => {
  const { repository } = fixture();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const onBack = jest.fn();
  await render(<CommonCreationWorkspace repository={repository} storyId="1" guardDraftLeave onBack={onBack} />);
  await waitFor(() => expect(screen.getByLabelText('커스텀 문체')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('커스텀 문체'), '바뀐 문체');
  await fireEvent.press(screen.getByRole('button', { name: '목록으로 돌아가기' }));
  expect(onBack).not.toHaveBeenCalled();
  const buttons = alert.mock.lastCall?.[2] ?? [];
  await act(async () => buttons.find((b) => b.text === '나가기')?.onPress?.());
  expect(jest.mocked(usePreventRemove).mock.calls.at(-1)?.[0]).toBe(false);
  expect(onBack).toHaveBeenCalledTimes(1);
  alert.mockRestore();
});
it('탭 이동으로 표현·퓨샷을 공통 임시 저장하고 비공개 확정 후 재진입 복원한다', async () => {
  const { repository, save, stored } = fixture();
  const view = await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByLabelText('커스텀 문체')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('커스텀 문체'), '  수정 원문 {{user}}\n');
  // CREATE-US-12 대화 예시는 말투·서술 탭 안으로 옮겨졌다. 다른 탭으로 갔다 돌아와 탭 이동 자동 임시 저장을 그대로 본다.
  await fireEvent.press(screen.getByRole('tab', { name: '인트로' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  await fireEvent.press(screen.getByRole('tab', { name: '말투·서술' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 추가' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 편집' }));
  // CREATE-US-12 전체 화면 대화 편집기: 작성 줄의 발화자 탭을 바로 고르고, 「확인」으로 닫아야 탭 머리글이 다시 보인다.
  await fireEvent.press(screen.getByRole('button', { name: '나레이터 선택' }));
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), ' *원문* {{user}} ');
  await fireEvent.press(screen.getByRole('button', { name: '말풍선 추가' }));
  await fireEvent.press(screen.getByRole('button', { name: '확인' }));
  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  await fireEvent.press(screen.getByRole('radio', { name: '비공개' }));
  await fireEvent.press(screen.getByRole('button', { name: '비공개로 저장' }));
  await waitFor(() => expect(stored().saveState).toBe('private'));
  expect(stored().speech.style).toEqual({ mode: 'custom', text: '  수정 원문 {{user}}\n' });
  expect(stored().fewshots[0].messages[0].body).toBe(' *원문* {{user}} ');
  await view.unmount();
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByLabelText('커스텀 문체').props.value).toBe('  수정 원문 {{user}}\n'));
  // 대화 예시는 처음 보이는 말투·서술 탭에 함께 있다.
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 편집' }));
  expect(screen.getByText('원문')).toBeTruthy();
  expect(save).toHaveBeenCalledTimes(3);
  // 탭 이동·재진입까지 도는 긴 흐름이라 전체 실행 중 부하에도 넉넉히 둔다.
}, 30000);
it('1000자·2000자 초과 사유를 모두 안내하고 공개·비공개를 막되 전체 임시 저장과 원문을 유지한다', async () => {
  const { repository, save, stored } = fixture(true);
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByLabelText('커스텀 문체')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('커스텀 문체'), '가'.repeat(1002));
  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  for (const target of ['비공개', '공개']) {
    await fireEvent.press(screen.getByRole('radio', { name: target }));
    expect(screen.getByText('커스텀 문체는 1000자 이내로 작성해 주세요.')).toBeTruthy();
    expect(screen.getByText('퓨샷 전체를 2000자 이내로 작성해 주세요.')).toBeTruthy();
    expect(screen.getByRole('button', { name: `${target}로 저장` })).toBeDisabled();
  }
  expect(stored().saveState).toBe('draft');
  expect(stored().fewshots[0].messages[0].body).toHaveLength(2001);
  expect(stored().speech.style).toEqual({ mode: 'custom', text: '가'.repeat(1002) });
});

it('공통 저장 중 추가한 표현·퓨샷을 늦은 응답으로 덮어쓰지 않는다', async () => {
  const { repository, save, stored } = fixture();
  let finish!: (value: CreationSaveDocument) => void;
  save.mockImplementationOnce(
    () =>
      new Promise<CreationSaveDocument>((resolve) => {
        finish = resolve;
      }),
  );
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByLabelText('커스텀 문체')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('커스텀 문체'), '첫 저장');
  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  const sent = save.mock.calls[0][0];
  await fireEvent.press(screen.getByRole('tab', { name: '말투·서술' }));
  await fireEvent.changeText(screen.getByLabelText('커스텀 문체'), '저장 중 새 문체');
  // 대화 예시는 같은 말투·서술 탭에 있다.
  await fireEvent.press(screen.getByRole('button', { name: '예시 추가' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 편집' }));
  // CREATE-US-12 전체 화면 대화 편집기: 발화자를 바로 고르고, 첫 저장 응답 전에 「확인」으로 닫아 목록으로 돌아온다.
  await fireEvent.press(screen.getByRole('button', { name: '유저 선택' }));
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), '저장 중 새 퓨샷');
  await fireEvent.press(screen.getByRole('button', { name: '말풍선 추가' }));
  await fireEvent.press(screen.getByRole('button', { name: '확인' }));
  await act(async () => finish({ ...sent, saveState: 'draft' }));
  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(stored().speech.style).toEqual({ mode: 'custom', text: '저장 중 새 문체' });
  expect(stored().fewshots[0].messages[0].body).toBe('저장 중 새 퓨샷');
});
it('저장 성패를 모르면 상단 실패 안내에 재시도 버튼을 보여 주고 어느 탭에서든 같은 요청으로 다시 저장한다', async () => {
  const { repository, save, stored } = fixture();
  save.mockRejectedValueOnce(new Error('lost'));
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByLabelText('커스텀 문체')).toBeTruthy());
  expect(screen.queryByRole('button', { name: '실패한 저장 다시 시도' })).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('커스텀 문체'), '재시도할 문체');
  await fireEvent.press(screen.getByRole('tab', { name: '인트로' }));
  await waitFor(() => expect(screen.getByText(/저장 성공 여부를 확인하지 못했습니다/)).toBeTruthy());
  // 공개 범위 탭이 아닌 곳에서도 상단 안내의 버튼으로 재시도한다.
  await fireEvent.press(screen.getByRole('button', { name: '실패한 저장 다시 시도' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[1]).toEqual(save.mock.calls[0]);
  await waitFor(() => expect(screen.queryByRole('button', { name: '실패한 저장 다시 시도' })).toBeNull());
  expect(stored().speech.style).toEqual({ mode: 'custom', text: '재시도할 문체' });
});

it('비공개 스토리의 임시 저장본을 불러오면 안내하고, 임시 저장과 저장(반영)을 나눠 보낸다 (2026-11-20 결정)', async () => {
  const { repository: base, stored } = fixture();
  let data: CreationSaveDocument = { ...stored(), saveState: 'private', workingCopySavedAt: '2026-11-20T07:00:00Z' };
  const save = jest.fn(
    async (
      document: CreationSaveDocument,
      state: CreationSaveDocument['saveState'],
      _mode: string,
      _key: string,
      kind?: 'temporary' | 'save',
    ) => {
      // 서버처럼: 임시 저장은 공개 상태를 바꾸지 않고 임시 저장본 시각을 남기며, 저장은 임시 저장본을 비운다.
      data =
        kind === 'temporary'
          ? { ...document, saveState: data.saveState, workingCopySavedAt: '2026-11-20T08:00:00Z' }
          : { ...document, saveState: state, workingCopySavedAt: null };
      return structuredClone(data);
    },
  );
  const repository: CommonSaveRepository = { ...base, load: jest.fn(async () => structuredClone(data)), save };
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByText(/임시 저장한 내용이에요/)).toBeTruthy());
  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  expect(screen.getByRole('radio', { name: '미등록' })).toBeTruthy();

  // 바뀐 내용이 없어도 임시 저장본이 있으면 "저장"으로 반영한다.
  await fireEvent.press(screen.getByRole('button', { name: '비공개로 저장' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][4]).toBe('save');
  await waitFor(() => expect(screen.queryByText(/임시 저장한 내용이에요/)).toBeNull());

  // 다시 고친 뒤 임시 저장은 공개 상태를 바꾸지 않고 임시 저장본으로 남긴다.
  await fireEvent.press(screen.getByRole('tab', { name: '말투·서술' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  await fireEvent.changeText(screen.getByLabelText('커스텀 문체'), '고치는 중');
  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[1][4]).toBe('temporary');
  expect(stored().saveState).toBe('draft');
  expect(data.saveState).toBe('private');
  await waitFor(() => expect(screen.getByText(/임시 저장한 내용이에요/)).toBeTruthy());
  // 비공개·공개 스토리를 미등록으로 되돌리는 저장은 막는다.
  await fireEvent.press(screen.getByRole('radio', { name: '미등록' }));
  expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '임시 저장' })).not.toBeDisabled();
}, 30000);

/** 서버처럼 임시 저장과 저장(반영)을 나눠 처리하는 비공개 스토리 저장소. 첫 응답은 직접 끝낼 수 있다. */
function privateFixture() {
  const { repository: base, stored } = fixture();
  let data: CreationSaveDocument = { ...stored(), saveState: 'private', workingCopySavedAt: null };
  let finishFirst: (() => void) | null = null;
  const save = jest.fn(
    async (
      document: CreationSaveDocument,
      state: CreationSaveDocument['saveState'],
      _mode: string,
      _key: string,
      kind?: 'temporary' | 'save',
    ) => {
      if (save.mock.calls.length === 1) {
        await new Promise<void>((resolve) => {
          finishFirst = resolve;
        });
      }
      data =
        kind === 'temporary'
          ? { ...document, saveState: data.saveState, workingCopySavedAt: '2026-11-20T08:00:00Z' }
          : { ...document, saveState: state, workingCopySavedAt: null };
      return structuredClone(data);
    },
  );
  const repository: CommonSaveRepository = { ...base, load: jest.fn(async () => structuredClone(data)), save };
  return { repository, save, data: () => data, finishFirst: () => finishFirst?.() };
}

it('탭 이동으로 자동 임시 저장이 시작된 직후 저장을 눌러도 무시하지 않고, 끝난 뒤 최신 내용을 반영한다 (2026-11-20 결정)', async () => {
  const { repository, save, data, finishFirst } = privateFixture();
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByLabelText('커스텀 문체')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('커스텀 문체'), '자동 저장 직후 반영할 문체');
  // 탭 이동 → 자동 임시 저장 시작(응답 대기 중)
  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][4]).toBe('temporary');

  // 자동 임시 저장만 진행 중이면 저장 버튼은 눌린다. 누르면 기다렸다가 이어서 보낸다.
  const saveButton = screen.getByRole('button', { name: '비공개로 저장' });
  expect(saveButton).not.toBeDisabled();
  await fireEvent.press(saveButton);
  expect(screen.getByText('자동 임시 저장이 끝나면 이어서 저장합니다.')).toBeTruthy();
  expect(screen.getByRole('button', { name: '비공개로 저장' })).toBeDisabled();
  expect(save).toHaveBeenCalledTimes(1);

  await act(async () => finishFirst());
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[1][1]).toBe('private');
  expect(save.mock.calls[1][4]).toBe('save');
  expect(save.mock.calls[1][0].speech.style).toEqual({ mode: 'custom', text: '자동 저장 직후 반영할 문체' });
  // 반영 후에는 임시 저장본이 비고 공개 상태는 유지된다(이전 내용이 남지 않음).
  await waitFor(() => expect(data().workingCopySavedAt).toBeNull());
  expect(data().saveState).toBe('private');
  expect(data().speech.style).toEqual({ mode: 'custom', text: '자동 저장 직후 반영할 문체' });
  await waitFor(() => expect(screen.getByText('저장한 설정과 같습니다.')).toBeTruthy());
}, 30000);

it('자동 임시 저장을 기다리던 저장은 앞선 저장의 성패를 모르면 보내지 않고 재시도 안내를 남긴다', async () => {
  const { repository, save } = privateFixture();
  save.mockImplementationOnce(async () => {
    throw new Error('lost');
  });
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByLabelText('커스텀 문체')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('커스텀 문체'), '성패 모름');
  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  await waitFor(() => expect(screen.getByText(/저장 성공 여부를 확인하지 못했습니다/)).toBeTruthy());
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: '실패한 저장 다시 시도' })).toBeTruthy();
});

it('저장 범위와 다시 불러오기 동작을 화면에서 알린다', async () => {
  const { repository, save } = privateFixture();
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByLabelText('커스텀 문체')).toBeTruthy());
  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  expect(within(screen.getByLabelText('비공개 설명')).getByText('완성된 스토리를 나만 사용할 수 있어요.')).toBeTruthy();
  expect(screen.getByText('공개 후에는 비공개로, 완성 저장 후에는 미등록으로 바꿀 수 없어요.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '저장한 전체 설정 다시 불러오기' })).toBeNull();

  // 바꾼 내용이 남아 있으면(자동 임시 저장이 거절된 경우) 확인창에서도 임시 저장본을 불러온다고 알린다.
  save.mockImplementationOnce(async () => {
    throw new ApiError(422, 'REJECTED_FOR_TEST', '거절');
  });
  await fireEvent.press(screen.getByRole('tab', { name: '말투·서술' }));
  await fireEvent.changeText(screen.getByLabelText('커스텀 문체'), '버릴 변경');
  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  await waitFor(() => expect(screen.getByText('저장하지 않은 변경이 있습니다.')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: '최신 편집 내용 다시 불러오기' }));
  expect(screen.getByText('저장하지 않은 변경 내용이 사라집니다.')).toBeTruthy();
  expect(screen.getByRole('button', { name: '변경 버리고 최신 편집 내용 불러오기' })).toBeTruthy();
}, 30000);

it('사진만 임시 저장돼 있어도 저장을 보내 함께 반영하고, 안내를 보여 준다 (안 B)', async () => {
  const { repository: base, stored } = fixture();
  let data: CreationSaveDocument = {
    ...stored(),
    saveState: 'private',
    workingCopySavedAt: null,
    imagesWorkingCopySavedAt: '2026-11-20T08:00:00Z',
  };
  const save = jest.fn(
    async (
      document: CreationSaveDocument,
      state: CreationSaveDocument['saveState'],
      _mode?: string,
      _key?: string,
      _kind?: 'temporary' | 'save',
    ) => {
      // 서버처럼: 저장(반영)하면 사진 임시 저장본도 함께 반영되어 비워진다.
      data = { ...document, saveState: state, workingCopySavedAt: null, imagesWorkingCopySavedAt: null };
      return structuredClone(data);
    },
  );
  const repository: CommonSaveRepository = { ...base, load: jest.fn(async () => structuredClone(data)), save };
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByText(/임시 저장한 사진이 있어요/)).toBeTruthy());
  expect(screen.getByText('임시 저장한 내용과 같습니다.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));

  // 2~4번은 바뀐 것이 없지만 사진 임시 저장본이 있으므로 「저장」을 보낸다.
  await fireEvent.press(screen.getByRole('button', { name: '비공개로 저장' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][4]).toBe('save');
  await waitFor(() => expect(screen.queryByText(/임시 저장한 사진이 있어요/)).toBeNull());
}, 30000);
