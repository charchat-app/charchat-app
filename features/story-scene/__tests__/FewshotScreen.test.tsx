import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as baseRender, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { FewshotScreen } from '../components/FewshotScreen';
import type { EditorStory, FewshotRepository } from '@/features/story-publish';
import type { FewshotCharacter, FewshotsDocument } from '@/shared/story-types';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
// 화면 전체 흐름(입력·정렬·저장·재진입)이라 느린 CI에서 기본 5초를 넘을 수 있다.
jest.setTimeout(30000);
// 캐시 변경 알림을 다음 틱으로 미루지 않아 act 안에서 바로 화면에 반영되게 한다.
notifyManager.setScheduler((callback) => callback());
// story-publish의 storyKeys.detail(id)와 같은 키. 기본 정보 저장이 성공하면 story-publish가 이 캐시를 갱신한다.
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
function setStoryCharacters(people: FewshotCharacter[]) {
  client.setQueryData<EditorStory>(['stories', 'detail', '1'], {
    id: '1',
    title: '가상 스토리',
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
  setStoryCharacters([{ id: '5', name: '하린', position: 0 }]);
});
function fixture() {
  let value: FewshotsDocument = {
    id: '1',
    title: '가상 스토리',
    saveState: 'draft',
    updatedAt: '2026-11-17T00:00:00Z',
    characters: [{ id: '5', name: '하린', position: 0 }],
    fewshots: [],
  };
  const repo: jest.Mocked<FewshotRepository> = {
    load: jest.fn(async (_id: string, _signal?: AbortSignal): Promise<FewshotsDocument> =>
      JSON.parse(JSON.stringify(value)),
    ),
    save: jest.fn(async (document: FewshotsDocument, _requestId: string): Promise<FewshotsDocument> => {
      value = {
        ...document,
        fewshots: document.fewshots.map((group, index) => ({
          ...group,
          id: group.id ?? `${index + 10}`,
          messages: group.messages.map((message, order) => ({ ...message, id: message.id ?? `${order + 100}` })),
        })),
      };
      return JSON.parse(JSON.stringify(value));
    }),
  };
  return { repo, stored: () => value };
}
it('예시·발화자를 추가하고 같은 영역에서 본문 수정·취소·정렬·삭제·저장·복원을 처리한다', async () => {
  const { repo, stored } = fixture();
  const view = await render(<FewshotScreen repository={repo} storyId="1" />);
  await waitFor(() => expect(screen.getByText(/작성한 대화 예시가 없습니다/)).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: '예시 추가' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 편집' }));
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), '@');
  await fireEvent.press(screen.getByRole('button', { name: '캐릭터 1: 하린 선택' }));
  expect(screen.getByLabelText('새 말풍선 본문').props.value).toBe('');
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), '  {{user}}\n*첫 본문*  ');
  expect(screen.getByRole('button', { name: '퓨샷 임시 저장' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: '말풍선 추가' }));
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), '두 번째');
  await fireEvent.press(screen.getByRole('button', { name: '말풍선 추가' }));
  await fireEvent.press(screen.getByRole('button', { name: '1번 본문 수정' }));
  await fireEvent.changeText(screen.getByLabelText('말풍선 본문 수정'), '취소할 내용');
  await fireEvent.press(screen.getByRole('button', { name: '수정 취소' }));
  await fireEvent.press(screen.getByRole('button', { name: '2번 본문 수정' }));
  await fireEvent.changeText(screen.getByLabelText('말풍선 본문 수정'), '수정한 두 번째');
  await fireEvent.press(screen.getByRole('button', { name: '수정 완료' }));
  await fireEvent.press(screen.getByRole('button', { name: '말풍선 1 아래로 이동' }));
  await fireEvent.press(screen.getByRole('button', { name: '퓨샷 임시 저장' }));
  await waitFor(() => expect(repo.save).toHaveBeenCalledTimes(1));
  expect(stored().fewshots[0].messages.map((message) => message.body)).toEqual([
    '수정한 두 번째',
    '  {{user}}\n*첫 본문*  ',
  ]);
  expect(stored().fewshots[0].messages[1].characterId).toBe('5');
  await view.unmount();
  await render(<FewshotScreen repository={repo} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('button', { name: '예시 1 편집' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 편집' }));
  await fireEvent.press(screen.getByRole('button', { name: '1번 말풍선 삭제' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 목록으로' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 삭제' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 삭제 확인' }));
  await fireEvent.press(screen.getByRole('button', { name: '퓨샷 임시 저장' }));
  await waitFor(() => expect(stored().fewshots).toEqual([]));
});
it('묶음 순서를 바꾸고 미저장 재조회는 확인 후에만 반영한다', async () => {
  const { repo } = fixture();
  await render(<FewshotScreen repository={repo} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('button', { name: '예시 추가' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: '예시 추가' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 추가' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 아래로 이동' }));
  await fireEvent.press(screen.getByRole('button', { name: '저장한 퓨샷 다시 불러오기' }));
  expect(repo.load).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: '퓨샷 변경 유지' }));
  expect(screen.getByRole('button', { name: '예시 2 편집' })).toBeTruthy();
});

it('새 입력 중에도 공백·줄바꿈·서식 포함 전체 분량과 초과 상태를 갱신하고 확정 때 중복 합산하지 않는다', async () => {
  const { repo, stored } = fixture();
  await render(<FewshotScreen repository={repo} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('button', { name: '예시 추가' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: '예시 추가' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 편집' }));
  await fireEvent.press(screen.getByRole('button', { name: '@ 발화자 선택' }));
  await fireEvent.press(screen.getByRole('button', { name: '나레이터 선택' }));
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), '가'.repeat(1990));
  await fireEvent.press(screen.getByRole('button', { name: '말풍선 추가' }));
  const raw = ' {{user}}\n**강조** ';
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), raw);
  await waitFor(() =>
    expect(screen.getByText(`퓨샷 전체 ${(1990 + raw.length).toLocaleString()} / 2,000자`)).toBeTruthy(),
  );
  expect(screen.getByText(/초과 원문도 임시 저장할 수 있습니다/)).toBeTruthy();
  expect(repo.save).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: '새 입력 취소' }));
  await waitFor(() => expect(screen.getByText('퓨샷 전체 1,990 / 2,000자')).toBeTruthy());
  expect(screen.queryByText(/초과 원문도 임시 저장할 수 있습니다/)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: '@ 발화자 선택' }));
  await fireEvent.press(screen.getByRole('button', { name: '유저 선택' }));
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), raw);
  await fireEvent.press(screen.getByRole('button', { name: '말풍선 추가' }));
  await waitFor(() =>
    expect(screen.getByText(`퓨샷 전체 ${(1990 + raw.length).toLocaleString()} / 2,000자`)).toBeTruthy(),
  );
  await fireEvent.press(screen.getByRole('button', { name: '퓨샷 임시 저장' }));
  await waitFor(() => expect(repo.save).toHaveBeenCalledTimes(1));
  expect(stored().fewshots[0].messages[1].body).toBe(raw);
});

it('새 입력을 보존한 채 기존 본문을 제자리 수정하고 취소·완료 때 합계를 정확히 반영한다', async () => {
  const { repo, stored } = fixture();
  await render(<FewshotScreen repository={repo} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('button', { name: '예시 추가' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: '예시 추가' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 편집' }));
  await fireEvent.press(screen.getByRole('button', { name: '@ 발화자 선택' }));
  await fireEvent.press(screen.getByRole('button', { name: '캐릭터 1: 하린 선택' }));
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), '원문');
  await fireEvent.press(screen.getByRole('button', { name: '말풍선 추가' }));
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), '새 입력');
  await fireEvent.press(screen.getByRole('button', { name: '1번 본문 수정' }));
  expect(screen.getByLabelText('말풍선 본문 수정').props.autoFocus).toBe(true);
  await fireEvent.changeText(screen.getByLabelText('말풍선 본문 수정'), '수정한 원문');
  await waitFor(() => expect(screen.getByText('퓨샷 전체 10 / 2,000자')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: '수정 취소' }));
  await waitFor(() => expect(screen.getByText('퓨샷 전체 6 / 2,000자')).toBeTruthy());
  expect(screen.getByLabelText('새 말풍선 본문').props.value).toBe('새 입력');
  await fireEvent.press(screen.getByRole('button', { name: '1번 본문 수정' }));
  await fireEvent.changeText(screen.getByLabelText('말풍선 본문 수정'), '변경');
  await fireEvent.press(screen.getByRole('button', { name: '수정 완료' }));
  await fireEvent.press(screen.getByRole('button', { name: '새 입력 취소' }));
  await fireEvent.press(screen.getByRole('button', { name: '퓨샷 임시 저장' }));
  await waitFor(() => expect(repo.save).toHaveBeenCalledTimes(1));
  expect(stored().fewshots[0].messages.map(({ body, characterId }) => ({ body, characterId }))).toEqual([
    { body: '변경', characterId: '5' },
  ]);
});

it('열린 편집의 캐릭터 이름표·선택 목록을 갱신하고 삭제된 본문 편집을 닫되 새 입력은 보존한다', async () => {
  const { repo, stored } = fixture();
  await render(<FewshotScreen repository={repo} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('button', { name: '예시 추가' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: '예시 추가' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 편집' }));
  await fireEvent.press(screen.getByRole('button', { name: '@ 발화자 선택' }));
  await fireEvent.press(screen.getByRole('button', { name: '캐릭터 1: 하린 선택' }));
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), '하린 원문');
  await fireEvent.press(screen.getByRole('button', { name: '말풍선 추가' }));
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), '남겨야 할 새 입력');
  await fireEvent.press(screen.getByRole('button', { name: '1번 본문 수정' }));
  await fireEvent.changeText(screen.getByLabelText('말풍선 본문 수정'), '삭제될 인물 수정 중');
  await act(() => setStoryCharacters([{ id: '5', name: '변경된 이름', position: 0 }]));
  expect(screen.getByText('변경된 이름')).toBeTruthy();
  expect(screen.getByLabelText('말풍선 본문 수정').props.value).toBe('삭제될 인물 수정 중');
  await act(() => setStoryCharacters([]));
  await waitFor(() => expect(screen.queryByLabelText('말풍선 본문 수정')).toBeNull());
  expect(screen.getByLabelText('새 말풍선 본문').props.value).toBe('남겨야 할 새 입력');
  expect(screen.queryByRole('button', { name: '1번 말풍선 삭제' })).toBeNull();
  expect(screen.queryByRole('button', { name: '캐릭터 1: 변경된 이름 선택' })).toBeNull();
  expect(screen.getByRole('button', { name: '말풍선 추가' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: '나레이터 선택' }));
  await fireEvent.press(screen.getByRole('button', { name: '말풍선 추가' }));
  await fireEvent.press(screen.getByRole('button', { name: '퓨샷 임시 저장' }));
  await waitFor(() => expect(repo.save).toHaveBeenCalledTimes(1));
  expect(stored().fewshots[0].messages.map((message) => [message.body, message.speakerKind])).toEqual([
    ['남겨야 할 새 입력', 'narrator'],
  ]);
});

it('같은 발화자가 연속돼도 병합·재배열하지 않고 저장 후 다시 열어도 순서를 유지한다 (AC10)', async () => {
  const { repo, stored } = fixture();
  const view = await render(<FewshotScreen repository={repo} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('button', { name: '예시 추가' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: '예시 추가' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 편집' }));
  const add = async (speaker: string, body: string) => {
    await fireEvent.press(screen.getByRole('button', { name: /^@ 발화자/ }));
    await fireEvent.press(screen.getByRole('button', { name: speaker }));
    await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), body);
    await fireEvent.press(screen.getByRole('button', { name: '말풍선 추가' }));
  };
  const plan: [string, string][] = [
    ['캐릭터 1: 하린 선택', '하린1'],
    ['캐릭터 1: 하린 선택', '하린2'],
    ['유저 선택', '나1'],
    ['유저 선택', '나2'],
    ['유저 선택', '나3'],
    ['캐릭터 1: 하린 선택', '하린3'],
  ];
  for (const [speaker, body] of plan) await add(speaker, body);
  await fireEvent.press(screen.getByRole('button', { name: '퓨샷 임시 저장' }));
  await waitFor(() => expect(repo.save).toHaveBeenCalledTimes(1));
  const expected = [
    ['하린1', 'character'],
    ['하린2', 'character'],
    ['나1', 'user'],
    ['나2', 'user'],
    ['나3', 'user'],
    ['하린3', 'character'],
  ];
  expect(stored().fewshots[0].messages.map((m) => [m.body, m.speakerKind])).toEqual(expected);
  await view.unmount();
  await render(<FewshotScreen repository={repo} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('button', { name: '예시 1 편집' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 편집' }));
  // 다시 연 화면에서도 말풍선 6개가 각각 따로 보인다.
  for (let n = 1; n <= 6; n += 1) expect(screen.getByRole('button', { name: `${n}번 말풍선 삭제` })).toBeTruthy();
  for (const [body] of expected) expect(screen.getByText(body)).toBeTruthy();
});
