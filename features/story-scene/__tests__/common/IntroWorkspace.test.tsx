import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as baseRender, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import {
  PanResponder,
  type GestureResponderEvent,
  type PanResponderCallbacks,
  type PanResponderGestureState,
} from 'react-native';
import { defaultExpression, emptyScene, type CreationSaveDocument, type FewshotCharacter } from '@/shared/story-types';
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
  setStoryCharacters([{ id: '5', name: '하린', position: 0 }]);
});
function fixture(initial: Partial<CreationSaveDocument> = {}) {
  let data: CreationSaveDocument = {
    id: '1',
    title: '가상',
    saveState: 'draft',
    updatedAt: '2026-11-17T00:00:00Z',
    speech: defaultExpression(),
    characters: [{ id: '5', name: '하린', position: 0 }],
    fewshots: [],
    intros: [],
    relations: [],
    affinities: [],
    ...initial,
  };
  let next = 100;
  const save = jest.fn(async (document: CreationSaveDocument, state: CreationSaveDocument['saveState']) => {
    data = {
      ...document,
      saveState: state,
      intros: document.intros.map((intro) => ({
        ...intro,
        id: intro.id ?? `${next++}`,
        messages: intro.messages.map((message) => ({ ...message, id: message.id ?? `${next++}` })),
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

async function addBubble(speaker: string, body: string) {
  // CREATE-US-12 인트로 본문은 작성 줄 위 발화자 탭(.speaker-strip)에서 고른다. 나레이터·유저는 탭,
  // 캐릭터는 드롭다운 하나를 펼쳐 고른다. 추가 뒤에도 직전 발화자가 남는다.
  if (speaker.startsWith('캐릭터 ')) {
    await fireEvent.press(screen.getByRole('combobox', { name: '캐릭터 발화자' }));
    await fireEvent.press(screen.getByRole('menuitem', { name: speaker }));
  } else {
    await fireEvent.press(screen.getByRole('button', { name: speaker }));
  }
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), body);
  await fireEvent.press(screen.getByRole('button', { name: '말풍선 추가' }));
}

it('인트로를 작성·정렬·삭제하고 완성 조건을 지킨 뒤 비공개 저장·재진입 복원한다', async () => {
  const { repository, save, stored } = fixture();
  const view = await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('tab', { name: '인트로' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('tab', { name: '인트로' }));
  expect(screen.getByText(/작성한 인트로가 없습니다/)).toBeTruthy();

  // 0개 상태: 임시 저장은 되지만 공개·비공개는 막힌다.
  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  await fireEvent.press(screen.getByRole('radio', { name: '비공개' }));
  expect(screen.getByText('인트로를 1개 이상 작성해 주세요.')).toBeTruthy();
  expect(screen.getByRole('button', { name: '비공개로 저장' })).toBeDisabled();

  await fireEvent.press(screen.getByRole('tab', { name: '인트로' }));
  for (let i = 0; i < 5; i++) await fireEvent.press(screen.getByRole('button', { name: '인트로 추가' }));
  expect(screen.getByRole('button', { name: '인트로 추가' })).toBeDisabled();
  expect(screen.getByText('인트로는 최대 5개예요.')).toBeTruthy();
  for (const n of [5, 4, 3]) {
    await fireEvent.press(screen.getByRole('button', { name: `인트로 ${n} 삭제` }));
    await fireEvent.press(screen.getByRole('button', { name: '인트로 삭제 확인' }));
  }
  expect(screen.getByText('기본 인트로')).toBeTruthy();
  expect(screen.getByRole('button', { name: '인트로 2 삭제' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '인트로 3 삭제' })).toBeNull();

  await fireEvent.changeText(screen.getByLabelText('인트로 1 상황 제목'), '비 오는 골목');
  await fireEvent.changeText(screen.getByLabelText('인트로 2 상황 제목'), '😀'.repeat(31));
  expect(screen.getByText('31 / 30자 · 1자 초과')).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: '인트로 1 본문 편집' }));
  // 목업 .example-top: 가운데 제목은 인트로 제목만 쓴다.
  expect(screen.getByRole('header', { name: '비 오는 골목' })).toBeTruthy();
  // CREATE-US-12 목업 renderExample(intro): 본문 편집은 탭 줄·하단 저장 줄 없이 전체 화면으로 연다.
  expect(screen.queryByRole('tab', { name: '인트로' })).toBeNull();
  expect(screen.queryByRole('button', { name: '임시 저장' })).toBeNull();
  expect(screen.queryByText('첫 장면을 써 주세요')).toBeNull();
  await addBubble('나레이터 선택', ' *비가 내린다* ');
  await addBubble('캐릭터 1: 하린 선택', '안녕, {{user}}.');
  await addBubble('유저 선택', '...');
  expect(screen.getByText(/^\d+ \/ 2,000자 · 이 인트로 본문$/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '인트로 목록으로' }));
  // 목록으로 돌아오면 탭 줄과 하단 저장 줄이 다시 보인다.
  expect(screen.getByRole('tab', { name: '인트로', selected: true })).toBeTruthy();
  expect(screen.getByRole('button', { name: '임시 저장' })).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: '인트로 2 본문 편집' }));
  await addBubble('나레이터 선택', '두 번째 시작');
  await fireEvent.press(screen.getByRole('button', { name: '인트로 목록으로' }));

  // 제목 31자는 임시 저장만 허용한다.
  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  await waitFor(() => expect(save).toHaveBeenCalled());
  await fireEvent.press(screen.getByRole('radio', { name: '비공개' }));
  expect(screen.getByText('인트로 상황 제목은 30자 이내로 작성해 주세요.')).toBeTruthy();
  expect(screen.getByRole('button', { name: '비공개로 저장' })).toBeDisabled();
  expect(stored().intros[1].title).toBe('😀'.repeat(31));

  // CREATE-US-12: 인트로 목록은 카드마다 여섯 점 손잡이만 두고, 눈에 보이는 위·아래 이동 화살표는 없다. 첫 번째가 기본이다.
  await fireEvent.press(screen.getByRole('tab', { name: '인트로' }));
  await fireEvent.changeText(screen.getByLabelText('인트로 2 상황 제목'), '😀'.repeat(30));
  expect(screen.queryAllByRole('button', { name: /(위로|아래로) 이동$/ })).toHaveLength(0);
  expect(screen.getAllByRole('adjustable').map((grip) => grip.props.accessibilityLabel)).toEqual([
    '인트로 1 드래그로 순서 변경',
    '인트로 2 드래그로 순서 변경',
  ]);
  expect(screen.getAllByTestId('reorder-grip-dots')).toHaveLength(2);
  expect(screen.queryAllByText(/^[↕↑↓]/)).toHaveLength(0);
  expect(screen.getByLabelText('인트로 1 상황 제목').props.value).toBe('비 오는 골목');

  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  await fireEvent.press(screen.getByRole('radio', { name: '비공개' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '비공개로 저장' })).not.toBeDisabled());
  await fireEvent.press(screen.getByRole('button', { name: '비공개로 저장' }));
  await waitFor(() => expect(stored().saveState).toBe('private'));
  // 목록 순서 그대로 저장한다.
  expect(stored().intros.map((intro) => intro.title)).toEqual(['비 오는 골목', '😀'.repeat(30)]);
  expect(stored().intros[0].messages.map((m) => [m.speakerKind, m.characterId, m.body])).toEqual([
    ['narrator', null, ' *비가 내린다* '],
    ['character', '5', '안녕, {{user}}.'],
    ['user', null, '...'],
  ]);
  expect(stored().intros[1].messages.map((m) => m.body)).toEqual(['두 번째 시작']);

  await view.unmount();
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('tab', { name: '인트로' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('tab', { name: '인트로' }));
  await waitFor(() => expect(screen.getByLabelText('인트로 1 상황 제목').props.value).toBe('비 오는 골목'));
  expect(screen.getByLabelText('인트로 2 상황 제목').props.value).toBe('😀'.repeat(30));
  await fireEvent.press(screen.getByRole('button', { name: '인트로 1 본문 편집' }));
  // 이름표와 하단 상태 카드에 모두 이름이 보인다.
  expect(screen.getAllByText(/^(👤 )?하린$/).length).toBeGreaterThan(1);
  // 전체 화면 편집에서는 저장 상태 줄을 숨기므로 목록으로 돌아와 확인한다.
  await fireEvent.press(screen.getByRole('button', { name: '인트로 목록으로' }));
  expect(screen.getByText('저장한 설정과 같습니다.')).toBeTruthy();
  // 단계가 많은 전체 흐름 검사라 기본 5초보다 넉넉히 둔다.
}, 30000);

it('CREATE-US-12: 인트로 목록은 손잡이로만 끌어 clientKey 그대로 순서를 바꾸고, 첫 번째가 기본 인트로가 되어 저장된다', async () => {
  // 행마다 렌더할 때 PanResponder 설정이 새로 만들어지지만 같은 행의 설정은 모두 같은 최신 값을 본다.
  // 이 화면의 PanResponder는 인트로 행뿐이고 행은 항상 목록 순서(intro-30, intro-40)로 함께 그려진다.
  const configurations: PanResponderCallbacks[] = [];
  const create = PanResponder.create;
  const createSpy = jest.spyOn(PanResponder, 'create').mockImplementation((config) => {
    configurations.push(config);
    return create(config);
  });
  const intro = (id: string, title: string, body: string) => ({
    id,
    clientKey: `intro-${id}`,
    title,
    messages: [
      { id: `${id}1`, clientKey: `intro-message-${id}1`, speakerKind: 'narrator' as const, characterId: null, body },
    ],
    scene: emptyScene(),
  });
  const { repository, save, stored } = fixture({
    intros: [intro('30', '첫 만남', '첫 본문'), intro('40', '두 번째 만남', '둘째 본문')],
  });
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('tab', { name: '인트로' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('tab', { name: '인트로' }));
  await waitFor(() => expect(screen.getByLabelText('인트로 1 상황 제목').props.value).toBe('첫 만남'));
  const rowOf = (key: string) => within(screen.getByTestId(`reorder-row-${key}`));
  expect(rowOf('intro-30').getByText('기본 인트로')).toBeTruthy();
  expect(rowOf('intro-40').getByText('인트로 2')).toBeTruthy();

  // 드래그 응답은 손잡이에만 걸린다. 카드·머리글 줄·본문은 드래그를 받지 않는다.
  for (const key of ['intro-30', 'intro-40']) {
    expect(screen.getByTestId(`reorder-handle-${key}`).props.onMoveShouldSetResponder).toEqual(expect.any(Function));
    expect(screen.getByTestId(`reorder-row-${key}`).props.onMoveShouldSetResponder).toBeUndefined();
    expect(screen.getByTestId(`reorder-controls-${key}`).props.onMoveShouldSetResponder).toBeUndefined();
  }
  expect(screen.queryAllByRole('button', { name: /(위로|아래로) 이동$/ })).toHaveLength(0);

  // 끄는 동안 목록 스크롤을 잠그고, 놓으면 푼다.
  for (const [key, y] of [
    ['intro-30', 0],
    ['intro-40', 210],
  ] as const) {
    await fireEvent(screen.getByTestId(`reorder-row-${key}`), 'layout', {
      nativeEvent: { layout: { x: 0, y, width: 300, height: 200 } },
    });
  }
  const first = configurations[0];
  const event = null as unknown as GestureResponderEvent;
  const gesture = (dy: number): PanResponderGestureState => ({
    stateID: 1,
    moveX: 0,
    moveY: dy,
    x0: 0,
    y0: 0,
    dx: 0,
    dy,
    vx: 0,
    vy: 0,
    numberActiveTouches: 1,
  });
  // 콜백이 없으면 조용히 건너뛰지 않고 실패한다.
  const required = <T,>(fn: T | undefined, name: string): T => {
    if (fn === undefined) throw new Error(`PanResponder 콜백 ${name}이(가) 없다`);
    return fn;
  };
  expect(first).toBeDefined();
  const grant = required(first.onPanResponderGrant, 'onPanResponderGrant');
  const move = required(first.onPanResponderMove, 'onPanResponderMove');
  const release = required(first.onPanResponderRelease, 'onPanResponderRelease');
  expect(screen.getByTestId('intro-list-scroll').props.scrollEnabled).toBe(true);
  await act(async () => {
    grant(event, gesture(0));
  });
  expect(screen.getByTestId('intro-list-scroll').props.scrollEnabled).toBe(false);
  await act(async () => {
    move(event, gesture(210));
  });
  await act(async () => {
    release(event, gesture(210));
  });
  expect(screen.getByTestId('intro-list-scroll').props.scrollEnabled).toBe(true);

  // 같은 clientKey의 카드가 통째로 옮겨지고, 기본 표시는 새 첫 번째 카드로 넘어간다.
  expect(rowOf('intro-40').getByText('기본 인트로')).toBeTruthy();
  expect(rowOf('intro-30').getByText('인트로 2')).toBeTruthy();
  expect(screen.getByLabelText('인트로 1 상황 제목').props.value).toBe('두 번째 만남');
  expect(screen.getByLabelText('인트로 2 상황 제목').props.value).toBe('첫 만남');

  // 저장하면 옮긴 순서와 id·말풍선이 그대로 반영된다.
  await fireEvent.press(screen.getByRole('button', { name: '임시 저장' }));
  await waitFor(() => expect(save).toHaveBeenCalled());
  expect(stored().intros.map((item) => [item.id, item.clientKey, item.title, item.messages[0].body])).toEqual([
    ['40', 'intro-40', '두 번째 만남', '둘째 본문'],
    ['30', 'intro-30', '첫 만남', '첫 본문'],
  ]);
  // 이 파일의 다른 테스트로 PanResponder.create 감시가 새지 않게 되돌린다.
  createSpy.mockRestore();
});

it('캐릭터 삭제 시 그 인물의 인트로 말풍선만 제거하고 이름 변경은 이름표만 바꾼다', async () => {
  const { repository } = fixture({
    intros: [
      {
        id: '30',
        clientKey: 'intro-30',
        title: '첫 만남',
        messages: [
          {
            id: '31',
            clientKey: 'intro-message-31',
            speakerKind: 'narrator',
            characterId: null,
            body: '하린이 웃는다.',
          },
          { id: '32', clientKey: 'intro-message-32', speakerKind: 'character', characterId: '5', body: '하린 대사' },
          { id: '33', clientKey: 'intro-message-33', speakerKind: 'user', characterId: null, body: '유저 대사' },
        ],
        scene: emptyScene(),
      },
    ],
  });
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('tab', { name: '인트로' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('tab', { name: '인트로' }));
  await fireEvent.press(screen.getByRole('button', { name: '인트로 1 본문 편집' }));
  await act(() => setStoryCharacters([{ id: '5', name: '새 이름', position: 0 }]));
  expect(screen.getAllByText('새 이름').length).toBeGreaterThan(0);
  expect(screen.queryByText('하린')).toBeNull();
  expect(screen.getByText('하린 대사')).toBeTruthy();
  await act(() => setStoryCharacters([]));
  await waitFor(() => expect(screen.queryByText('하린 대사')).toBeNull());
  expect(screen.getByText('하린이 웃는다.')).toBeTruthy();
  expect(screen.getByText('유저 대사')).toBeTruthy();
  // 삭제 반영은 저장본에도 적용되어 변경 없음으로 본다(저장 상태 줄은 목록 화면에서 보인다).
  await fireEvent.press(screen.getByRole('button', { name: '인트로 목록으로' }));
  expect(screen.getByText('저장한 설정과 같습니다.')).toBeTruthy();
});

it('인트로 화면에서 말풍선 순서 유지·삭제·수정 취소/완료·삽입, 2000자 초과 보존과 첫 인트로 삭제 시 기본 변경을 처리한다', async () => {
  const msg = (id: string, speakerKind: 'narrator' | 'character' | 'user', body: string) => ({
    id,
    clientKey: `intro-message-${id}`,
    speakerKind,
    characterId: speakerKind === 'character' ? '5' : null,
    body,
  });
  const { repository, save, stored } = fixture({
    intros: [
      {
        id: '40',
        clientKey: 'intro-40',
        title: '첫째',
        messages: [msg('41', 'narrator', 'a1'), msg('42', 'character', 'a2'), msg('43', 'user', 'a3')],
        scene: emptyScene(),
      },
      { id: '50', clientKey: 'intro-50', title: '둘째', messages: [msg('51', 'narrator', 'b1')], scene: emptyScene() },
    ],
  });
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('tab', { name: '인트로' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('tab', { name: '인트로' }));
  await fireEvent.press(screen.getByRole('button', { name: '인트로 1 본문 편집' }));

  // CREATE-US-12: 인트로 말풍선에는 드래그 손잡이·이동 버튼·접근성 순서 변경 동작이 없고 저장된 순서대로 보인다.
  const chat = within(screen.getByTestId('chat-messages'));
  expect(chat.queryAllByRole('button', { name: /(위로|아래로) 이동$/ })).toHaveLength(0);
  expect(chat.queryAllByRole('adjustable')).toHaveLength(0);
  expect(chat.queryAllByLabelText(/드래그로 순서 변경$/)).toHaveLength(0);
  expect(chat.queryAllByText(/^[↕↑↓]/)).toHaveLength(0);
  expect(chat.getByRole('button', { name: '1번 본문 수정' })).toHaveTextContent('a1');
  expect(chat.getByRole('button', { name: '2번 본문 수정' })).toHaveTextContent('a2');
  // AC08: 선택한 말풍선만 삭제한다.
  await fireEvent.press(screen.getByRole('button', { name: '3번 말풍선 삭제' }));
  expect(screen.queryByText('a3')).toBeNull();
  // AC11: 제자리 수정 취소는 원문 유지, 완료는 반영. 삽입은 커서 위치에 원문 표기만 넣는다.
  await fireEvent.press(screen.getByRole('button', { name: '2번 본문 수정' }));
  await fireEvent.changeText(screen.getByLabelText('말풍선 본문 수정'), '버릴 내용');
  await fireEvent.press(screen.getByRole('button', { name: '수정 취소' }));
  expect(screen.getByText('a2')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '2번 본문 수정' }));
  await fireEvent.changeText(screen.getByLabelText('말풍선 본문 수정'), 'a2 수정');
  await fireEvent(screen.getByLabelText('말풍선 본문 수정'), 'selectionChange', {
    nativeEvent: { selection: { start: 5, end: 5 } },
  });
  await fireEvent.press(screen.getByRole('button', { name: '{{user}} 삽입' }));
  expect(screen.getByLabelText('말풍선 본문 수정').props.value).toBe('a2 수정{{user}}');
  await fireEvent.press(screen.getByRole('button', { name: '수정 완료' }));

  // AC03: 2000자를 넘겨도 입력을 자르지 않고 초과를 표시한다.
  await addBubble('나레이터 선택', '가'.repeat(2000));
  await fireEvent.press(screen.getByRole('button', { name: '인트로 목록으로' }));
  expect(screen.getByText(/자 초과/)).toBeTruthy();
  expect(screen.getByText(/초과 원문도 임시 저장할 수 있습니다/)).toBeTruthy();

  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  await waitFor(() => expect(save).toHaveBeenCalled());
  expect(stored().saveState).toBe('draft');
  expect(stored().intros[0].messages[2].body).toBe('가'.repeat(2000));
  await fireEvent.press(screen.getByRole('radio', { name: '비공개' }));
  expect(screen.getByText('인트로 본문은 인트로마다 2000자 이내로 작성해 주세요.')).toBeTruthy();
  expect(screen.getByRole('button', { name: '비공개로 저장' })).toBeDisabled();

  // 초과 말풍선을 지우면 비공개 저장이 가능하고 원래 순서·수정 결과가 그대로 저장된다.
  await fireEvent.press(screen.getByRole('tab', { name: '인트로' }));
  await fireEvent.press(screen.getByRole('button', { name: '인트로 1 본문 편집' }));
  await fireEvent.press(screen.getByRole('button', { name: '3번 말풍선 삭제' }));
  await fireEvent.press(screen.getByRole('button', { name: '인트로 목록으로' }));
  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  await fireEvent.press(screen.getByRole('radio', { name: '비공개' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '비공개로 저장' })).not.toBeDisabled());
  await fireEvent.press(screen.getByRole('button', { name: '비공개로 저장' }));
  await waitFor(() => expect(stored().saveState).toBe('private'));
  expect(stored().intros[0].messages.map((m) => [m.speakerKind, m.body])).toEqual([
    ['narrator', 'a1'],
    ['character', 'a2 수정{{user}}'],
  ]);
  expect(stored().intros[1].messages.map((m) => m.body)).toEqual(['b1']);

  // AC09: 첫 번째 인트로를 지우면 남은 첫 번째가 기본이 된다.
  await fireEvent.press(screen.getByRole('tab', { name: '인트로' }));
  await fireEvent.press(screen.getByRole('button', { name: '인트로 1 삭제' }));
  expect(screen.getByText(/다음 인트로가 기본이 됩니다/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '인트로 삭제 확인' }));
  expect(screen.getByLabelText('인트로 1 상황 제목').props.value).toBe('둘째');
  expect(screen.getByText('기본 인트로')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '인트로 2 삭제' })).toBeNull();
}, 30000);
