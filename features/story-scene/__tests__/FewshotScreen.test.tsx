import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as baseRender, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { FewshotScreen } from '../components/FewshotScreen';
import type { EditorStory, FewshotRepository } from '@/features/story-publish';
import type { FewshotCharacter, FewshotGroup, FewshotsDocument } from '@/shared/story-types';

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
function fixture(
  fewshots: FewshotGroup[] = [],
  characters: FewshotCharacter[] = [{ id: '5', name: '하린', position: 0 }],
) {
  let value: FewshotsDocument = {
    id: '1',
    title: '가상 스토리',
    saveState: 'draft',
    updatedAt: '2026-11-17T00:00:00Z',
    characters,
    fewshots,
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
/** CREATE-US-12 작성 줄: 나레이터·유저는 탭, 캐릭터는 드롭다운 하나로 고른다. 드롭다운을 펼쳐 캐릭터를 고른다. */
async function pickCharacter(label: string) {
  await fireEvent.press(screen.getByRole('combobox', { name: '캐릭터 발화자' }));
  await fireEvent.press(within(screen.getByTestId('character-menu')).getByRole('menuitem', { name: label }));
}
/** 탭 줄 발화자(나레이터·유저) 또는 캐릭터 드롭다운 항목을 고른다. */
async function pickSpeaker(label: string) {
  if (label.startsWith('캐릭터 ')) await pickCharacter(label);
  else await fireEvent.press(screen.getByRole('button', { name: label }));
}
/** CREATE-US-12: 예시 목록·대화 편집기에는 드래그 손잡이·이동 버튼·접근성 순서 변경 동작이 없다. */
function expectNoReorderControls(
  scope: Pick<typeof screen, 'queryAllByRole' | 'queryAllByLabelText' | 'queryAllByText' | 'queryByText'> = screen,
) {
  expect(scope.queryAllByRole('button', { name: /(위로|아래로) 이동$/ })).toHaveLength(0);
  expect(scope.queryAllByRole('adjustable')).toHaveLength(0);
  expect(scope.queryAllByLabelText(/드래그로 순서 변경$/)).toHaveLength(0);
  expect(scope.queryAllByText(/^[↕↑↓]/)).toHaveLength(0);
  expect(scope.queryByText(/순서를 바꿀 수 있습니다/)).toBeNull();
}
it('예시·발화자를 추가하고 같은 영역에서 본문 수정·취소·삭제·저장·복원을 처리하고 말풍선 순서를 유지한다', async () => {
  const { repo, stored } = fixture();
  const view = await render(<FewshotScreen repository={repo} storyId="1" />);
  await waitFor(() => expect(screen.getByText(/작성한 대화 예시가 없습니다/)).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: '예시 추가' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 편집' }));
  // @ 바로가기는 발화자 목록을 열고, 고르면 @를 본문에서 뺀다.
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), '@');
  await fireEvent.press(screen.getByRole('button', { name: '발화자 목록에서 캐릭터 1: 하린 선택' }));
  expect(screen.getByLabelText('새 말풍선 본문').props.value).toBe('');
  expect(screen.getByRole('combobox', { name: '캐릭터 발화자' })).toHaveAccessibilityValue({ text: '하린' });
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), '  {{user}}\n*첫 본문*  ');
  // 대화 편집기를 연 동안 저장 조작은 숨고, 작성 중인 입력이 있으면 목록으로 나가는 「확인」도 막힌다.
  expect(screen.queryByRole('button', { name: '퓨샷 임시 저장' })).toBeNull();
  expect(screen.getByRole('button', { name: '확인' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: '말풍선 추가' }));
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), '두 번째');
  await fireEvent.press(screen.getByRole('button', { name: '말풍선 추가' }));
  await fireEvent.press(screen.getByRole('button', { name: '1번 본문 수정' }));
  await fireEvent.changeText(screen.getByLabelText('말풍선 본문 수정'), '취소할 내용');
  await fireEvent.press(screen.getByRole('button', { name: '수정 취소' }));
  await fireEvent.press(screen.getByRole('button', { name: '2번 본문 수정' }));
  await fireEvent.changeText(screen.getByLabelText('말풍선 본문 수정'), '수정한 두 번째');
  await fireEvent.press(screen.getByRole('button', { name: '수정 완료' }));
  // 말풍선이 여러 개여도 순서 변경 조작은 없다.
  expectNoReorderControls(within(screen.getByTestId('conversation-editor')));
  await fireEvent.press(screen.getByRole('button', { name: '확인' }));
  expectNoReorderControls();
  await fireEvent.press(screen.getByRole('button', { name: '퓨샷 임시 저장' }));
  await waitFor(() => expect(repo.save).toHaveBeenCalledTimes(1));
  // 추가한 순서 그대로 저장한다.
  expect(stored().fewshots[0].messages.map((message) => message.body)).toEqual([
    '  {{user}}\n*첫 본문*  ',
    '수정한 두 번째',
  ]);
  expect(stored().fewshots[0].messages[0].characterId).toBe('5');
  await view.unmount();
  await render(<FewshotScreen repository={repo} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('button', { name: '예시 1 편집' })).toBeTruthy());
  // 다시 불러와도 저장한 순서대로 보인다.
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 편집' }));
  expect(screen.getByRole('button', { name: '1번 본문 수정' })).toHaveTextContent(/첫 본문/);
  expect(screen.getByRole('button', { name: '2번 본문 수정' })).toHaveTextContent('수정한 두 번째');
  expectNoReorderControls();
  await fireEvent.press(screen.getByRole('button', { name: '예시 목록으로' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 편집' }));
  await fireEvent.press(screen.getByRole('button', { name: '1번 말풍선 삭제' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 목록으로' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 삭제' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 삭제 확인' }));
  await fireEvent.press(screen.getByRole('button', { name: '퓨샷 임시 저장' }));
  await waitFor(() => expect(stored().fewshots).toEqual([]));
});
it('CREATE-US-12: 예시 카드는 여섯 점 손잡이로 순서를 바꿔 저장·재조회 후에도 유지하고, 미저장 재조회는 확인 후에만 반영하며 말풍선 순서 조작은 없다', async () => {
  const group = (id: string, body: string): FewshotGroup => ({
    id,
    clientKey: `group-${id}`,
    messages: [{ id: `${id}0`, clientKey: `message-${id}0`, speakerKind: 'narrator', characterId: null, body }],
  });
  const { repo, stored } = fixture([group('10', '첫 예시'), group('11', '둘째 예시'), group('12', '셋째 예시')]);
  const view = await render(<FewshotScreen repository={repo} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('button', { name: '예시 3 편집' })).toBeTruthy());
  /** 카드 제목 순서대로 첫 말풍선 본문 */
  const cardOrder = () =>
    [1, 2, 3].map((n) => {
      const card = screen.getByRole('button', { name: `상황 예시 ${n} 펼쳐 편집` });
      return ['첫 예시', '둘째 예시', '셋째 예시'].find((body) => within(card).queryByText(body));
    });
  expect(cardOrder()).toEqual(['첫 예시', '둘째 예시', '셋째 예시']);

  // 카드마다 여섯 점 손잡이(조절 동작)가 있고, 위·아래 이동 버튼은 없다. 편집·삭제는 그대로 있다.
  const grips = screen.getAllByRole('adjustable');
  expect(grips).toHaveLength(3);
  expect(screen.getByLabelText('상황 예시 1 드래그로 순서 변경')).toBe(screen.getByTestId('reorder-handle-group-10'));
  expect(within(screen.getByTestId('reorder-handle-group-10')).getByTestId('reorder-grip-dots')).toBeTruthy();
  expect(screen.queryAllByRole('button', { name: /(위로|아래로) 이동$/ })).toHaveLength(0);
  expect(screen.getByRole('button', { name: '예시 1 편집' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '예시 2 삭제' })).toBeTruthy();

  // 첫 카드 손잡이로 한 칸 아래로 옮긴다(놓을 때 한 번 반영, 아직 저장하지 않는다).
  const moveFirst = screen.getByTestId('reorder-handle-group-10').props.onAccessibilityAction;
  expect(moveFirst).toEqual(expect.any(Function));
  await act(async () => moveFirst({ nativeEvent: { actionName: 'increment' } }));
  expect(cardOrder()).toEqual(['둘째 예시', '첫 예시', '셋째 예시']);
  expect(repo.save).not.toHaveBeenCalled();

  // 미저장 변경이 있으면 재조회는 확인을 먼저 묻고, 유지하면 바꾼 순서가 그대로다.
  await fireEvent.press(screen.getByRole('button', { name: '저장한 퓨샷 다시 불러오기' }));
  expect(repo.load).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: '퓨샷 변경 유지' }));
  expect(repo.load).toHaveBeenCalledTimes(1);
  expect(cardOrder()).toEqual(['둘째 예시', '첫 예시', '셋째 예시']);

  // 저장하면 바뀐 카드 순서가 그대로 반영된다(각 카드의 id·말풍선은 카드와 함께 움직인다).
  await fireEvent.press(screen.getByRole('button', { name: '퓨샷 임시 저장' }));
  await waitFor(() => expect(repo.save).toHaveBeenCalledTimes(1));
  expect(stored().fewshots.map((g) => [g.id, g.messages.map((m) => m.body)])).toEqual([
    ['11', ['둘째 예시']],
    ['10', ['첫 예시']],
    ['12', ['셋째 예시']],
  ]);

  // 다시 들어와도(재조회) 저장한 순서대로 보인다.
  await view.unmount();
  await render(<FewshotScreen repository={repo} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('button', { name: '예시 3 편집' })).toBeTruthy());
  expect(cardOrder()).toEqual(['둘째 예시', '첫 예시', '셋째 예시']);

  // 대화 편집기 안의 말풍선에는 순서 변경 조작이 없다.
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 편집' }));
  expectNoReorderControls(within(screen.getByTestId('conversation-editor')));
});

it('새 입력 중에도 공백·줄바꿈·서식 포함 전체 분량과 초과 상태를 갱신하고 확정 때 중복 합산하지 않는다', async () => {
  const { repo, stored } = fixture();
  await render(<FewshotScreen repository={repo} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('button', { name: '예시 추가' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: '예시 추가' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 편집' }));
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
  // 대화형 작성 줄은 별도 취소 버튼 없이 입력을 비워 새 입력을 버린다.
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), '');
  await waitFor(() => expect(screen.getByText('퓨샷 전체 1,990 / 2,000자')).toBeTruthy());
  expect(screen.queryByText(/초과 원문도 임시 저장할 수 있습니다/)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: '유저 선택' }));
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), raw);
  await fireEvent.press(screen.getByRole('button', { name: '말풍선 추가' }));
  await waitFor(() =>
    expect(screen.getByText(`퓨샷 전체 ${(1990 + raw.length).toLocaleString()} / 2,000자`)).toBeTruthy(),
  );
  await fireEvent.press(screen.getByRole('button', { name: '확인' }));
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
  await pickCharacter('캐릭터 1: 하린 선택');
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
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), '');
  await fireEvent.press(screen.getByRole('button', { name: '확인' }));
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
  await pickCharacter('캐릭터 1: 하린 선택');
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), '하린 원문');
  await fireEvent.press(screen.getByRole('button', { name: '말풍선 추가' }));
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), '남겨야 할 새 입력');
  await fireEvent.press(screen.getByRole('button', { name: '1번 본문 수정' }));
  await fireEvent.changeText(screen.getByLabelText('말풍선 본문 수정'), '삭제될 인물 수정 중');
  await act(() => setStoryCharacters([{ id: '5', name: '변경된 이름', position: 0 }]));
  // 말풍선 이름표가 새 이름으로 바뀌고, 열린 수정 입력은 그대로다.
  expect(within(screen.getByTestId('chat-messages')).getByText('변경된 이름')).toBeTruthy();
  expect(screen.getByLabelText('말풍선 본문 수정').props.value).toBe('삭제될 인물 수정 중');
  // 수정 중에는 작성 줄(캐릭터 드롭다운 포함)이 숨는다. 수정을 취소하면 드롭다운도 새 이름을 보여 주고 새 입력은 남아 있다.
  expect(screen.queryByRole('combobox', { name: '캐릭터 발화자' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: '수정 취소' }));
  expect(screen.getByRole('combobox', { name: '캐릭터 발화자' })).toHaveAccessibilityValue({ text: '변경된 이름' });
  expect(screen.getByLabelText('새 말풍선 본문').props.value).toBe('남겨야 할 새 입력');
  // 삭제될 인물의 말풍선을 다시 수정하는 중에 캐릭터를 지운다.
  await fireEvent.press(screen.getByRole('button', { name: '1번 본문 수정' }));
  await fireEvent.changeText(screen.getByLabelText('말풍선 본문 수정'), '삭제될 인물 수정 중');
  await act(() => setStoryCharacters([]));
  await waitFor(() => expect(screen.queryByLabelText('말풍선 본문 수정')).toBeNull());
  expect(screen.getByLabelText('새 말풍선 본문').props.value).toBe('남겨야 할 새 입력');
  expect(screen.queryByRole('button', { name: '1번 말풍선 삭제' })).toBeNull();
  // 캐릭터가 없으면 캐릭터 드롭다운도 없다. @ 발화자 목록에서도 빠진다.
  expect(screen.queryByRole('combobox', { name: '캐릭터 발화자' })).toBeNull();
  expect(screen.queryByRole('button', { name: '발화자 목록에서 캐릭터 1: 변경된 이름 선택' })).toBeNull();
  expect(screen.getByRole('button', { name: '말풍선 추가' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: '나레이터 선택' }));
  await fireEvent.press(screen.getByRole('button', { name: '말풍선 추가' }));
  await fireEvent.press(screen.getByRole('button', { name: '확인' }));
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
    await pickSpeaker(speaker);
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
  await fireEvent.press(screen.getByRole('button', { name: '확인' }));
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

it('대화 편집기: 빈·공백 본문은 추가하지 않고, 작성 중일 때만 나가기 안내를 보인다', async () => {
  const { repo, stored } = fixture();
  await render(<FewshotScreen repository={repo} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('button', { name: '예시 추가' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: '예시 추가' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 편집' }));
  const help = '말풍선을 추가하거나 수정을 마치면 나갈 수 있어요.';
  // 나레이터가 선택돼 있어도 본문이 비어 있으면 추가할 수 없고, 막힌 상태가 아니니 안내도 없다.
  expect(screen.getByRole('button', { name: '말풍선 추가' })).toBeDisabled();
  expect(screen.queryByText(help)).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), '  \n ');
  expect(screen.getByRole('button', { name: '말풍선 추가' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: '말풍선 추가' }));
  expect(screen.queryByRole('button', { name: '1번 말풍선 삭제' })).toBeNull();
  // 공백 입력도 작성 중이라 나가기가 막히고 안내가 보인다.
  expect(screen.getByRole('button', { name: '확인' })).toBeDisabled();
  expect(screen.getByText(help)).toBeTruthy();
  // 내용이 있으면 원문(앞뒤 공백 포함) 그대로 추가되고, 입력이 비면 안내가 사라진다.
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), ' 대사 ');
  expect(screen.getByRole('button', { name: '말풍선 추가' })).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name: '말풍선 추가' }));
  await waitFor(() => expect(screen.queryByText(help)).toBeNull());
  expect(screen.getByRole('button', { name: '확인' })).toBeEnabled();
  // 본문 수정 중에도 막히므로 안내를 보이고, 취소하면 사라진다.
  await fireEvent.press(screen.getByRole('button', { name: '1번 본문 수정' }));
  expect(screen.getByText(help)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '수정 취소' }));
  await waitFor(() => expect(screen.queryByText(help)).toBeNull());
  await fireEvent.press(screen.getByRole('button', { name: '확인' }));
  await fireEvent.press(screen.getByRole('button', { name: '퓨샷 임시 저장' }));
  await waitFor(() => expect(repo.save).toHaveBeenCalledTimes(1));
  expect(stored().fewshots[0].messages.map((message) => message.body)).toEqual([' 대사 ']);
});

it('대화 편집기를 연 동안에도 캐릭터 동기화 실패 안내를 보인다', async () => {
  // 스토리 캐시가 비면 조회하는데, 테스트에는 서버 주소가 없어 실패한다.
  client.clear();
  const { repo } = fixture([{ id: '10', clientKey: 'group-10', messages: [] }]);
  await render(<FewshotScreen repository={repo} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('button', { name: '예시 1 편집' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 편집' }));
  const editor = screen.getByTestId('conversation-editor');
  await waitFor(() => expect(within(editor).getByText(/캐릭터 변경을 확인하지 못했습니다/)).toBeTruthy());
});

// CREATE-US-12 회귀: 작성된 상황 예시를 열면 목록 대신 높이를 채우는 대화 편집기가 열린다.
// 말풍선은 스크롤 안 제자리에서 고치고 취소·적용은 하단 고정 수정 도구로 하며, 새 말풍선 입력줄은 스크롤 밖 하단에 고정된다.
// 초기 상태 카드는 인트로 전용이므로 대화 예시 편집기에는 없다.
// 의미 기반 조회로 찾을 수 없는 구조(편집기 전체·하단 입력줄)만 testID conversation-editor·conversation-composer로 찾는다.
it('CREATE-US-12: 작성된 상황 예시를 열면 전체 높이 대화 편집기·제자리 확인·하단 고정 입력줄을 보이고 초안을 보존한다', async () => {
  const { repo, stored } = fixture([
    {
      id: '10',
      clientKey: 'group-10',
      messages: [
        { id: '100', clientKey: 'message-100', speakerKind: 'character', characterId: '5', body: '하린의 첫 대사' },
        { id: '101', clientKey: 'message-101', speakerKind: 'user', characterId: null, body: '유저의 답' },
      ],
    },
  ]);
  await render(<FewshotScreen repository={repo} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('button', { name: '상황 예시 1 펼쳐 편집' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: '상황 예시 1 펼쳐 편집' }));

  // 전체 높이 대화 편집기가 목록을 대신한다.
  const editor = screen.getByTestId('conversation-editor');
  expect(editor).toHaveStyle({ flex: 1 });
  expect(screen.queryByRole('button', { name: '예시 추가' })).toBeNull();
  expect(screen.queryByRole('button', { name: '상황 예시 1 펼쳐 편집' })).toBeNull();
  expect(within(editor).getByText('하린의 첫 대사')).toBeTruthy();
  expect(within(editor).getByText('유저의 답')).toBeTruthy();

  // 초기 상태 카드(인트로 하단 상태창)는 대화 예시 편집기에 없다.
  expect(screen.queryByLabelText('이 인트로의 초기 상태')).toBeNull();
  expect(screen.queryByRole('button', { name: '초기 상태 설정하기' })).toBeNull();

  // 새 말풍선 입력줄은 편집기 안, 스크롤 영역 밖에 고정된다.
  const composer = within(editor).getByTestId('conversation-composer');
  let node = composer.parent;
  while (node) {
    expect(String(node.type)).not.toMatch(/ScrollView/);
    node = node.parent;
  }
  expect(within(composer).getByLabelText('새 말풍선 본문')).toBeTruthy();
  expect(within(composer).getByRole('button', { name: '말풍선 추가' })).toBeTruthy();

  // 새 입력 초안을 둔 채 기존 말풍선을 제자리에서 수정한다.
  await fireEvent.changeText(within(composer).getByLabelText('새 말풍선 본문'), '보존할 새 입력');
  await fireEvent.press(within(editor).getByRole('button', { name: '1번 본문 수정' }));
  const inlineField = within(editor).getByLabelText('말풍선 본문 수정');
  // 목업 v15 inlineMessageEditor·bubbleEditToolbar: 원문은 그 말풍선 자리(같은 모양)에서 고치고,
  // 하단 고정 줄은 작성 줄 대신 취소·삽입·적용 도구로 바뀐다. 새 입력칸은 수정 중에 숨는다.
  const bubble = within(editor).getByTestId('bubble-edit-character');
  expect(within(bubble).getByLabelText('말풍선 본문 수정')).toBe(inlineField);
  expect(within(composer).queryByLabelText('말풍선 본문 수정')).toBeNull();
  expect(within(composer).queryByLabelText('새 말풍선 본문')).toBeNull();
  const bar = within(composer).getByTestId('bubble-edit-bar');
  expect(within(bar).getByRole('button', { name: '수정 완료' })).toBeTruthy();
  expect(within(bar).getByRole('button', { name: '수정 취소' })).toBeTruthy();
  expect(inlineField.props.value).toBe('하린의 첫 대사');
  // 하단 삽입 도구는 말풍선 안 원문의 커서 위치에 넣는다.
  await fireEvent(inlineField, 'selectionChange', { nativeEvent: { selection: { start: 2, end: 2 } } });
  await fireEvent.press(within(bar).getByRole('button', { name: '{{user}} 삽입' }));
  expect(within(editor).getByLabelText('말풍선 본문 수정').props.value).toBe('하린{{user}}의 첫 대사');

  // 취소하면 원문과 새 입력 초안이 그대로 남는다.
  await fireEvent.changeText(within(editor).getByLabelText('말풍선 본문 수정'), '버릴 수정');
  await fireEvent.press(within(editor).getByRole('button', { name: '수정 취소' }));
  expect(within(editor).getByText('하린의 첫 대사')).toBeTruthy();
  expect(screen.getByLabelText('새 말풍선 본문').props.value).toBe('보존할 새 입력');

  // 완료하면 그 본문만 바뀌고 새 입력 초안은 유지된다.
  await fireEvent.press(within(editor).getByRole('button', { name: '1번 본문 수정' }));
  await fireEvent.changeText(within(editor).getByLabelText('말풍선 본문 수정'), '고친 첫 대사');
  await fireEvent.press(within(editor).getByRole('button', { name: '수정 완료' }));
  expect(within(editor).getByText('고친 첫 대사')).toBeTruthy();
  expect(screen.getByLabelText('새 말풍선 본문').props.value).toBe('보존할 새 입력');

  // 작성 줄의 발화자 탭으로 초안을 말풍선으로 추가한다.
  await fireEvent.press(within(composer).getByRole('button', { name: '나레이터 선택' }));
  await fireEvent.press(within(composer).getByRole('button', { name: '말풍선 추가' }));

  // 「확인」은 화면 상태에만 반영하고 목록으로 돌아간다. 저장은 돌아온 목록의 기존 저장 조작이 맡는다.
  await fireEvent.press(within(editor).getByRole('button', { name: '확인' }));
  expect(repo.save).not.toHaveBeenCalled();
  expect(screen.queryByTestId('conversation-editor')).toBeNull();
  expect(screen.getByText('3개 말풍선 · 눌러서 편집')).toBeTruthy();
  expect(screen.getByText('저장하지 않은 퓨샷 변경이 있습니다.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '퓨샷 임시 저장' }));
  await waitFor(() => expect(repo.save).toHaveBeenCalledTimes(1));
  expect(stored().fewshots[0].messages.map((m) => [m.body, m.speakerKind, m.characterId])).toEqual([
    ['고친 첫 대사', 'character', '5'],
    ['유저의 답', 'user', null],
    ['보존할 새 입력', 'narrator', null],
  ]);
});

// CREATE-US-12: 유저·나레이터 말풍선도 같은 모양으로 제자리 수정하고, 캐릭터는 드롭다운 하나로, @를 치면 간단한 발화자 목록으로 고른다.
it('CREATE-US-12: 발화자별 말풍선 모양으로 제자리 수정하고 캐릭터는 드롭다운, @ 입력은 발화자 목록으로 고른다', async () => {
  const people: FewshotCharacter[] = ['하린', '도윤', '서아', '민재', '지호'].map((name, index) => ({
    id: `${index + 5}`,
    name,
    position: index,
  }));
  setStoryCharacters(people);
  // 화면은 퓨샷 조회 응답의 발화자 목록(렌더 전 캐시보다 새 정보)을 쓰므로, 조회 응답에도 같은 5명을 담는다.
  const { repo, stored } = fixture(
    [
      {
        id: '10',
        clientKey: 'group-10',
        messages: [
          { id: '100', clientKey: 'message-100', speakerKind: 'user', characterId: null, body: '유저 대사' },
          { id: '101', clientKey: 'message-101', speakerKind: 'narrator', characterId: null, body: '서술' },
        ],
      },
    ],
    people,
  );
  await render(<FewshotScreen repository={repo} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('button', { name: '상황 예시 1 펼쳐 편집' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: '상황 예시 1 펼쳐 편집' }));
  const editor = screen.getByTestId('conversation-editor');
  const composer = within(editor).getByTestId('conversation-composer');

  // 유저·나레이터 말풍선은 각자 모양 그대로 수정하고, 수정 중에는 삭제 도구를 숨기거나 막는다.
  await fireEvent.press(within(editor).getByRole('button', { name: '1번 본문 수정' }));
  expect(within(editor).getByTestId('bubble-edit-user')).toBeTruthy();
  expect(within(editor).queryByRole('button', { name: '1번 말풍선 삭제' })).toBeNull();
  expect(within(editor).getByRole('button', { name: '2번 말풍선 삭제' })).toBeDisabled();
  await fireEvent.press(within(composer).getByRole('button', { name: '수정 취소' }));
  await fireEvent.press(within(editor).getByRole('button', { name: '2번 본문 수정' }));
  expect(within(editor).getByTestId('bubble-edit-narrator')).toBeTruthy();
  await fireEvent.changeText(within(editor).getByLabelText('말풍선 본문 수정'), '*고친 서술*');
  await fireEvent(within(editor).getByLabelText('말풍선 본문 수정'), 'selectionChange', {
    nativeEvent: { selection: { start: 7, end: 7 } },
  });
  await fireEvent.press(within(composer).getByRole('button', { name: '* 삽입' }));
  await fireEvent.press(within(composer).getByRole('button', { name: '수정 완료' }));
  expect(within(composer).queryByTestId('bubble-edit-bar')).toBeNull();

  // 나레이터·유저는 탭 줄에 고정되고, 캐릭터는 수와 관계없이 드롭다운 하나로 고른다(탭 줄에 캐릭터 버튼·「더 보기」 없음).
  expect(within(composer).getByRole('button', { name: '나레이터 선택' })).toBeTruthy();
  expect(within(composer).getByRole('button', { name: '유저 선택' })).toBeTruthy();
  const characterDropdown = () => within(composer).getByRole('combobox', { name: '캐릭터 발화자' });
  expect(within(composer).getAllByRole('combobox')).toHaveLength(1);
  expect(characterDropdown()).toHaveAccessibilityValue({ text: '선택 안 함' });
  expect(within(composer).queryByRole('button', { name: /^캐릭터 \d: / })).toBeNull();
  expect(within(composer).queryByRole('button', { name: /더 보기/ })).toBeNull();
  expect(within(composer).queryByTestId('character-menu')).toBeNull();
  // 펼치면 스토리에 등록된 캐릭터 5명이 모두 순서대로 보인다(개수 제한 없음).
  await fireEvent.press(characterDropdown());
  const characterMenu = within(within(composer).getByTestId('character-menu'));
  expect(characterMenu.getAllByRole('menuitem').map((item) => item.props.accessibilityLabel)).toEqual([
    '캐릭터 1: 하린 선택',
    '캐릭터 2: 도윤 선택',
    '캐릭터 3: 서아 선택',
    '캐릭터 4: 민재 선택',
    '캐릭터 5: 지호 선택',
  ]);
  await fireEvent.press(characterMenu.getByRole('menuitem', { name: '캐릭터 5: 지호 선택' }));
  expect(within(composer).queryByTestId('character-menu')).toBeNull();
  // 고른 캐릭터는 드롭다운에 선택된 값으로 보인다.
  expect(characterDropdown()).toHaveAccessibilityValue({ text: '지호' });
  expect(characterDropdown()).toBeSelected();
  // 나레이터를 고르면 캐릭터 드롭다운은 선택 해제로 돌아간다.
  await fireEvent.press(within(composer).getByRole('button', { name: '나레이터 선택' }));
  expect(characterDropdown()).toHaveAccessibilityValue({ text: '선택 안 함' });
  await pickCharacter('캐릭터 5: 지호 선택');
  await fireEvent.changeText(within(composer).getByLabelText('새 말풍선 본문'), '지호 대사');
  await fireEvent.press(within(composer).getByRole('button', { name: '말풍선 추가' }));

  // @를 치면 같은 목록이 열리고, 고르면 @는 본문에서 빠진다. 닫으면 @는 남는다.
  await fireEvent.changeText(within(composer).getByLabelText('새 말풍선 본문'), '@');
  expect(within(composer).getByTestId('speaker-menu')).toBeTruthy();
  await fireEvent.press(within(composer).getByRole('button', { name: '발화자 목록 닫기' }));
  expect(within(composer).queryByTestId('speaker-menu')).toBeNull();
  expect(within(composer).getByLabelText('새 말풍선 본문').props.value).toBe('@');
  await fireEvent.changeText(within(composer).getByLabelText('새 말풍선 본문'), '');
  await fireEvent.changeText(within(composer).getByLabelText('새 말풍선 본문'), '@');
  await fireEvent.press(within(composer).getByRole('button', { name: '발화자 목록에서 캐릭터 4: 민재 선택' }));
  expect(within(composer).getByLabelText('새 말풍선 본문').props.value).toBe('');
  await fireEvent.changeText(within(composer).getByLabelText('새 말풍선 본문'), '민재 대사');
  await fireEvent.press(within(composer).getByRole('button', { name: '말풍선 추가' }));

  // 순서 변경 조작은 없고, 불러온 말풍선 뒤에 새 말풍선이 차례로 붙는다.
  expectNoReorderControls(within(editor));
  await fireEvent.press(within(editor).getByRole('button', { name: '확인' }));
  await fireEvent.press(screen.getByRole('button', { name: '퓨샷 임시 저장' }));
  await waitFor(() => expect(repo.save).toHaveBeenCalledTimes(1));
  expect(stored().fewshots[0].messages.map((m) => [m.body, m.speakerKind, m.characterId])).toEqual([
    ['유저 대사', 'user', null],
    ['*고친 서술**', 'narrator', null],
    ['지호 대사', 'character', '9'],
    ['민재 대사', 'character', '8'],
  ]);
});
