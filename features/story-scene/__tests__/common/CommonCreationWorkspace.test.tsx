import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as baseRender, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { defaultExpression, type CreationSaveDocument, type FewshotCharacter } from '@/shared/story-types';
import type { CommonSaveRepository, EditorStory } from '@/features/story-publish';
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
      },
    ],
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
it('탭 이동으로 표현·퓨샷을 공통 임시 저장하고 비공개 확정 후 재진입 복원한다', async () => {
  const { repository, save, stored } = fixture();
  const view = await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByLabelText('커스텀 문체')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('커스텀 문체'), '  수정 원문 {{user}}\n');
  await fireEvent.press(screen.getByRole('tab', { name: '대화 예시' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  await fireEvent.press(screen.getByRole('button', { name: '예시 추가' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 편집' }));
  await fireEvent.press(screen.getByRole('button', { name: '@ 발화자 선택' }));
  await fireEvent.press(screen.getByRole('button', { name: '나레이터 선택' }));
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), ' *원문* {{user}} ');
  await fireEvent.press(screen.getByRole('button', { name: '말풍선 추가' }));
  await fireEvent.press(screen.getByRole('tab', { name: '저장·공개' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  await fireEvent.press(screen.getByRole('tab', { name: '비공개' }));
  await fireEvent.press(screen.getByRole('button', { name: '비공개 저장' }));
  await waitFor(() => expect(stored().saveState).toBe('private'));
  expect(stored().speech.style).toEqual({ mode: 'custom', text: '  수정 원문 {{user}}\n' });
  expect(stored().fewshots[0].messages[0].body).toBe(' *원문* {{user}} ');
  await view.unmount();
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByLabelText('커스텀 문체').props.value).toBe('  수정 원문 {{user}}\n'));
  await fireEvent.press(screen.getByRole('tab', { name: '대화 예시' }));
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
  await fireEvent.press(screen.getByRole('tab', { name: '저장·공개' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  for (const target of ['비공개', '공개']) {
    await fireEvent.press(screen.getByRole('tab', { name: target }));
    expect(screen.getByText('커스텀 문체는 1000자 이내로 작성해 주세요.')).toBeTruthy();
    expect(screen.getByText('퓨샷 전체를 2000자 이내로 작성해 주세요.')).toBeTruthy();
    expect(screen.getByRole('button', { name: `${target} 저장` })).toBeDisabled();
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
  await fireEvent.press(screen.getByRole('tab', { name: '저장·공개' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  const sent = save.mock.calls[0][0];
  await fireEvent.press(screen.getByRole('tab', { name: '말투·서술' }));
  await fireEvent.changeText(screen.getByLabelText('커스텀 문체'), '저장 중 새 문체');
  await fireEvent.press(screen.getByRole('tab', { name: '대화 예시' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 추가' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 편집' }));
  await fireEvent.press(screen.getByRole('button', { name: '@ 발화자 선택' }));
  await fireEvent.press(screen.getByRole('button', { name: '유저 선택' }));
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), '저장 중 새 퓨샷');
  await fireEvent.press(screen.getByRole('button', { name: '말풍선 추가' }));
  await act(async () => finish({ ...sent, saveState: 'draft' }));
  await fireEvent.press(screen.getByRole('tab', { name: '저장·공개' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(stored().speech.style).toEqual({ mode: 'custom', text: '저장 중 새 문체' });
  expect(stored().fewshots[0].messages[0].body).toBe('저장 중 새 퓨샷');
});
