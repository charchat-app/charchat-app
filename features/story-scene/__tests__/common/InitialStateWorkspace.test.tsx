import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as baseRender, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
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
  setStoryCharacters([
    { id: '5', name: '하린', position: 0 },
    { id: '6', name: '도윤', position: 1 },
  ]);
});
const narrator = (id: string) => ({
  id,
  clientKey: `m-${id}`,
  speakerKind: 'narrator' as const,
  characterId: null,
  body: '*비*',
});
function fixture(overrides: Partial<CreationSaveDocument> = {}) {
  let data: CreationSaveDocument = {
    id: '1',
    title: '가상',
    saveState: 'draft',
    updatedAt: '2026-11-17T00:00:00Z',
    speech: defaultExpression(),
    characters: [
      { id: '5', name: '하린', position: 0 },
      { id: '6', name: '도윤', position: 1 },
    ],
    fewshots: [],
    intros: [
      { id: '30', clientKey: 'intro-30', title: '골목', messages: [narrator('31')], scene: emptyScene() },
      { id: '40', clientKey: 'intro-40', title: '옥상', messages: [narrator('41')], scene: emptyScene() },
    ],
    relations: [],
    affinities: [],
    ...overrides,
  };
  const save = jest.fn(async (document: CreationSaveDocument, state: CreationSaveDocument['saveState']) => {
    data = { ...document, saveState: state };
    return structuredClone(data);
  });
  const repository: CommonSaveRepository = {
    load: jest.fn(async () => structuredClone(data)),
    save,
  };
  return { repository, save, stored: () => data };
}
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
const type = (label: string, value: string) => fireEvent.changeText(screen.getByLabelText(label), value);
/** CREATE-US-12 목업 select를 옮긴 SceneDropdown: 접힌 칸(combobox)과 펼친 목록(menu) */
const dropdown = (name: string) => screen.getByRole('combobox', { name });
const menu = (name: string) => within(screen.getByLabelText(`${name} 목록`));
/** 드롭다운을 펼쳐 항목 하나를 고른다(실제 화면과 같은 두 번 누르기). */
async function pick(name: string, option: string) {
  await fireEvent.press(dropdown(name));
  await fireEvent.press(menu(name).getByRole('menuitem', { name: option }));
}
/** 새 관계 카드를 열고 시작·대상을 고른다. 둘 다 고르면 관계가 추가된다. */
async function addRelation(from: string, to: string) {
  await press('+ 인물 사이 관계 추가');
  await pick('새 관계 시작 캐릭터', from);
  await pick('새 관계 대상 캐릭터', to);
}
/** 관계 카드가 없는 방향의 호감도 칸을 그 방향으로 맞춘다. 화면에는 고른 한 방향의 칸만 있다. */
async function pickAffinity(from: string, to: string) {
  if (selectedText('호감도 출발 캐릭터') !== from) await pick('호감도 출발 캐릭터', from);
  if (selectedText('호감도 상대') !== to) await pick('호감도 상대', to);
}
/** 관계 카드 밖 호감도 칸을 그 방향으로 맞춘 뒤 값을 입력한다. */
async function typeAffinity(from: string, to: string, value: string) {
  await pickAffinity(from, to);
  await type(`${from}→${to} 호감도`, value);
}
/** 관계 카드 밖 호감도 칸을 그 방향으로 맞춘 뒤 값을 읽는다. */
async function affinityShown(from: string, to: string) {
  await pickAffinity(from, to);
  return screen.getByLabelText(`${from}→${to} 호감도`).props.value;
}
/** 드롭다운이 지금 보여 주는 값(고른 이름표 또는 안내 문구) */
const selectedText = (name: string): string | undefined => dropdown(name).props.accessibilityValue?.text;
/** 장면을 편집 중인 인트로(편집할 인트로 드롭다운의 값) */
const editingIntro = () => selectedText('편집할 인트로');
const chooseIntro = (title: string) => pick('편집할 인트로', title);
async function openTab(name: string) {
  await fireEvent.press(screen.getByRole('tab', { name }));
}
/** CREATE-US-12 공개 범위 탭의 저장 상태 카드(라디오) 고르기 */
async function chooseState(name: string) {
  await fireEvent.press(screen.getByRole('radio', { name }));
}
/** CREATE-US-12 관계 카드는 머리글 「관계 N」과 방향 표시로 나뉘어, 카드 이름(관계 N · 시작 → 대상)으로 찾는다. */
const relationCard = (name: string | RegExp) => screen.queryByLabelText(name);

it('인트로별 장면과 공통 관계·호감도를 작성·검증하고 비공개 저장 후 그대로 복원한다', async () => {
  const { repository, stored } = fixture();
  const view = await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('tab', { name: '초기 상태' })).toBeTruthy());
  await openTab('초기 상태');

  // 인트로 1(골목): 장소·일반 날짜·12시간제·캐릭터 상태
  await type('장소', '비 오는 골목');
  await pick('날짜 방식', '일반 날짜');
  await type('날짜 연', '2026');
  await type('날짜 월', '2');
  await type('날짜 일', '29');
  expect(screen.getByText('2월은 1~28일까지 입력할 수 있어요.')).toBeTruthy();
  // 방식 전환은 확인 후 날짜 입력만 지운다.
  await pick('날짜 방식', '경과일');
  expect(screen.getByText(/지금 입력한 날짜가 지워져요/)).toBeTruthy();
  await press('날짜 바꾸지 않기');
  expect(screen.getByLabelText('날짜 일').props.value).toBe('29');
  expect(selectedText('날짜 방식')).toBe('일반 날짜');
  await pick('날짜 방식', '경과일');
  await press('날짜 지우고 바꾸기');
  expect(screen.queryByLabelText('날짜 일')).toBeNull();
  expect(screen.getByLabelText('장소').props.value).toBe('비 오는 골목');
  await type('기준 사건', '감금');
  await type('시작 일차', '3');
  expect(screen.getByText('표시: 감금 3일째')).toBeTruthy();
  await pick('시간제', '12시간제');
  await type('시', '7');
  await type('분', '05');
  expect(screen.getByText('오전·오후와 시·분을 모두 입력해 주세요.')).toBeTruthy();
  await pick('오전/오후', '오후');
  await type('하린 착장', '검은 코트');
  await type('하린 속마음', '...?');

  // 인트로 2(옥상)는 따로 편집되고 인트로 1 값이 섞이지 않는다.
  await chooseIntro('옥상');
  expect(editingIntro()).toBe('옥상');
  expect(screen.getByLabelText('장소').props.value).toBe('');
  await type('장소', '옥상');
  await chooseIntro('골목');
  expect(screen.getByLabelText('장소').props.value).toBe('비 오는 골목');

  // AC09: 관계 카드 없이도 캐릭터마다 상대별 호감도 0이 보인다(한 번에 고른 한 방향씩). 유저 출발 호감도는 없다.
  expect(await affinityShown('하린', '유저')).toBe('0');
  expect(await affinityShown('도윤', '하린')).toBe('0');
  expect(screen.queryByLabelText('유저→하린 호감도')).toBeNull();
  await fireEvent.press(dropdown('호감도 출발 캐릭터'));
  expect(menu('호감도 출발 캐릭터').queryByRole('menuitem', { name: '유저' })).toBeNull();
  await fireEvent.press(dropdown('호감도 출발 캐릭터'));
  await typeAffinity('하린', '유저', '');
  // 공통 관계: 하린→유저, 유저→도윤. 같은 인물은 양쪽에 고를 수 없다.
  await press('+ 인물 사이 관계 추가');
  await pick('새 관계 시작 캐릭터', '하린');
  await fireEvent.press(dropdown('새 관계 대상 캐릭터'));
  expect(menu('새 관계 대상 캐릭터').getByRole('menuitem', { name: '하린' })).toBeDisabled();
  await fireEvent.press(menu('새 관계 대상 캐릭터').getByRole('menuitem', { name: '유저' }));
  expect(relationCard('관계 1 · 하린 → 유저')).toBeTruthy();
  await type('관계 1 관계명', '소꿉친구');
  await addRelation('유저', '도윤');
  expect(relationCard('관계 2 · 유저 → 도윤')).toBeTruthy();
  expect(screen.queryByLabelText('관계 1 호감도')).toBeNull();
  // 캐릭터가 시작인 관계 카드는 그 방향의 호감도 칸을 카드 안에 둔다(카드 밖 칸과 겹치지 않는다).
  expect(screen.getAllByLabelText('하린→유저 호감도')).toHaveLength(1);

  // 지운 호감도는 임시 저장은 되지만 비공개 저장은 막는다.
  await openTab('공개 범위');
  await waitFor(() => expect(stored().relations).toHaveLength(2));
  expect(stored().affinities).toEqual([
    { sourceCharacterId: '5', targetKind: 'user', targetCharacterId: null, value: '' },
  ]);
  await chooseState('비공개');
  expect(screen.getByText('초기 호감도는 -100~100 사이 정수로 입력해 주세요.')).toBeTruthy();
  expect(screen.getByRole('button', { name: '비공개로 저장' })).toBeDisabled();

  await openTab('초기 상태');
  await type('하린→유저 호감도', '-35');
  await openTab('공개 범위');
  await chooseState('비공개');
  await waitFor(() => expect(screen.getByRole('button', { name: '비공개로 저장' })).not.toBeDisabled());
  await press('비공개로 저장');
  await waitFor(() => expect(stored().saveState).toBe('private'));
  const [first, second] = stored().intros.map((intro) => intro.scene);
  expect(first).toMatchObject({
    place: '비 오는 골목',
    dateMode: 'elapsed',
    referenceEvent: '감금',
    elapsedDay: '3',
    year: '',
    timeFormat: '12h',
    hour: '7',
    minute: '05',
    meridiem: 'pm',
    characters: [{ characterId: '5', clothing: '검은 코트', innerThought: '...?' }],
  });
  expect(second).toMatchObject({ place: '옥상', dateMode: null, characters: [] });
  expect(stored().relations.map((r) => [r.sourceKind, r.targetKind, r.label])).toEqual([
    ['character', 'user', '소꿉친구'],
    ['user', 'character', ''],
  ]);
  expect(stored().affinities.map((a) => a.value)).toEqual(['-35']);

  await view.unmount();
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('tab', { name: '초기 상태' })).toBeTruthy());
  await openTab('초기 상태');
  await waitFor(() => expect(screen.getByLabelText('기준 사건').props.value).toBe('감금'));
  expect(screen.getByLabelText('하린→유저 호감도').props.value).toBe('-35');
  expect(await affinityShown('도윤', '유저')).toBe('0');
  // 인트로 하단 상태 카드(AC08·18)
  await openTab('인트로');
  await press('인트로 1 본문 편집');
  expect(screen.getAllByText('📅 날짜 · 감금 3일째').length).toBeGreaterThan(0);
  expect(screen.getAllByText('⏰ 시각 · 오후 7:05').length).toBeGreaterThan(0);
  expect(screen.getAllByText('👔 착장 · 검은 코트').length).toBeGreaterThan(0);
  expect(screen.getAllByText('👔 착장 · 미지정').length).toBeGreaterThan(0);
}, 30000);

it('캐릭터 삭제 시 그 인물의 착장·속마음과 출발/도착 관계만 제거한다', async () => {
  const { repository, stored } = fixture();
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('tab', { name: '초기 상태' })).toBeTruthy());
  await openTab('초기 상태');
  await type('장소', '골목');
  await type('하린 착장', '코트');
  await type('도윤 착장', '교복');
  await typeAffinity('도윤', '하린', '20');
  await typeAffinity('도윤', '유저', '5');
  for (const [from, to] of [
    ['하린', '유저'],
    ['도윤', '하린'],
    ['도윤', '유저'],
  ]) {
    await addRelation(from, to);
  }
  // 관계 카드가 생긴 방향의 호감도는 카드 안 칸이 그대로 이어받는다.
  expect(screen.getByLabelText('도윤→유저 호감도').props.value).toBe('5');
  expect(relationCard('관계 3 · 도윤 → 유저')).toBeTruthy();
  await act(() => setStoryCharacters([{ id: '6', name: '도윤', position: 0 }]));
  await waitFor(() => expect(screen.queryByLabelText('하린 착장')).toBeNull());
  expect(screen.getByLabelText('도윤 착장').props.value).toBe('교복');
  expect(screen.getByLabelText('장소').props.value).toBe('골목');
  expect(relationCard('관계 1 · 도윤 → 유저')).toBeTruthy();
  expect(relationCard('관계 2 · 도윤 → 유저')).toBeNull();
  await openTab('공개 범위');
  await waitFor(() => expect(stored().relations).toHaveLength(1));
  expect(stored().affinities).toEqual([
    { sourceCharacterId: '6', targetKind: 'user', targetCharacterId: null, value: '5' },
  ]);
  expect(stored().intros[0].scene.characters).toEqual([{ characterId: '6', clothing: '교복', innerThought: '' }]);
}, 30000);

it('새 캐릭터를 추가하면 착장·속마음은 미지정, 호감도는 0, 관계는 미지정으로 시작하고 기존 값은 그대로다 (AC15)', async () => {
  const { repository, stored } = fixture();
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('tab', { name: '초기 상태' })).toBeTruthy());
  await openTab('초기 상태');
  await type('장소', '골목');
  await type('하린 착장', '코트');
  await type('하린 속마음', '긴장');
  await typeAffinity('하린', '도윤', '40');
  await addRelation('하린', '도윤');
  await type('관계 1 관계명', '라이벌');

  await act(() =>
    setStoryCharacters([
      { id: '5', name: '하린', position: 0 },
      { id: '6', name: '도윤', position: 1 },
      { id: '7', name: '서아', position: 2 },
    ]),
  );
  await waitFor(() => expect(screen.getByLabelText('서아 착장')).toBeTruthy());
  // 새 캐릭터는 비어 있고 상대별 호감도는 0으로 보인다.
  expect(screen.getByLabelText('서아 착장').props.value).toBe('');
  expect(screen.getByLabelText('서아 속마음').props.value).toBe('');
  expect(await affinityShown('서아', '유저')).toBe('0');
  expect(await affinityShown('서아', '하린')).toBe('0');
  expect(await affinityShown('하린', '서아')).toBe('0');
  // 기존 값은 바뀌지 않는다.
  expect(screen.getByLabelText('장소').props.value).toBe('골목');
  expect(screen.getByLabelText('하린 착장').props.value).toBe('코트');
  expect(screen.getByLabelText('하린 속마음').props.value).toBe('긴장');
  expect(screen.getByLabelText('하린→도윤 호감도').props.value).toBe('40');
  expect(relationCard('관계 1 · 하린 → 도윤')).toBeTruthy();
  expect(relationCard(/관계 2 ·/)).toBeNull();
  // 다른 인트로에서도 새 캐릭터는 미지정으로 시작한다.
  await chooseIntro('옥상');
  expect(screen.getByLabelText('서아 착장').props.value).toBe('');

  await openTab('공개 범위');
  await waitFor(() => expect(stored().relations).toHaveLength(1));
  expect(stored().relations[0]).toMatchObject({ sourceCharacterId: '5', targetCharacterId: '6', label: '라이벌' });
  expect(stored().affinities).toEqual([
    { sourceCharacterId: '5', targetKind: 'character', targetCharacterId: '6', value: '40' },
  ]);
  expect(stored().intros[0].scene.characters).toEqual([{ characterId: '5', clothing: '코트', innerThought: '긴장' }]);
  expect(stored().intros[1].scene.characters).toEqual([]);
}, 30000);

it('CREATE-US-04-AC03·AC18: 시만 입력한 미완성 시각은 상태 카드에 완성된 값으로 채워 보이지 않는다', async () => {
  const { repository } = fixture();
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('tab', { name: '초기 상태' })).toBeTruthy());
  // CREATE-US-12 목업: 초기 상태창(.initial-preview)은 인트로 본문 편집 아래에 있다. 입력은 초기 상태 탭에서 한다.
  const summary = () => within(screen.getByLabelText('이 인트로의 초기 상태'));
  await openTab('인트로');
  await press('인트로 1 본문 편집');
  expect(summary().getByText(/시각 · 미지정/)).toBeTruthy();
  // 상태창의 「초기 상태 설정하기」는 초기 상태 탭으로 옮긴다.
  await press('초기 상태 설정하기');
  expect(screen.getByRole('tab', { name: '초기 상태', selected: true })).toBeTruthy();
  await type('시', '7');
  // 옮기는 데 성공하면 본문 편집(전체 화면)은 닫힌다. 인트로 탭으로 돌아오면 목록이 보이고, 다시 열어 확인한다.
  await openTab('인트로');
  expect(screen.queryByLabelText('이 인트로의 초기 상태')).toBeNull();
  await press('인트로 1 본문 편집');
  expect(summary().getByText(/시각 · 7시 \(미완성\)/)).toBeTruthy();
  expect(summary().queryByText(/7:00/)).toBeNull();
  // 본문 편집 전체 화면에서는 탭이 숨겨지므로 상태창의 버튼으로 초기 상태 탭에 간다.
  await press('초기 상태 설정하기');
  await type('분', '5');
  await openTab('인트로');
  await press('인트로 1 본문 편집');
  expect(summary().getByText(/시각 · 7:05/)).toBeTruthy();
});

it('CREATE-US-12: 「초기 상태 설정하기」는 본문을 편집하던 인트로의 장면을 연다(두 번째 인트로 포함)', async () => {
  const { repository } = fixture({
    intros: [
      {
        id: '30',
        clientKey: 'intro-30',
        title: '골목',
        messages: [narrator('31')],
        scene: { ...emptyScene(), place: '골목 입구' },
      },
      {
        id: '40',
        clientKey: 'intro-40',
        title: '옥상',
        messages: [narrator('41')],
        scene: { ...emptyScene(), place: '학교 옥상' },
      },
    ],
  });
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('tab', { name: '인트로' })).toBeTruthy());
  // 두 번째 인트로에서 넘어가면 그 인트로의 장면이 보인다(첫 번째로 되돌아가지 않는다).
  await openTab('인트로');
  await press('인트로 2 본문 편집');
  await press('초기 상태 설정하기');
  expect(screen.getByRole('tab', { name: '초기 상태', selected: true })).toBeTruthy();
  expect(editingIntro()).toBe('옥상');
  expect(screen.getByLabelText('장소').props.value).toBe('학교 옥상');

  // 이어서 첫 번째 인트로에서 넘어가면 이전 선택(2번)이 남지 않는다.
  await openTab('인트로');
  await press('인트로 1 본문 편집');
  await press('초기 상태 설정하기');
  expect(editingIntro()).toBe('골목');
  expect(screen.getByLabelText('장소').props.value).toBe('골목 입구');

  // 다시 두 번째 인트로로 넘어가도 정확히 그 장면을 연다.
  await openTab('인트로');
  await press('인트로 2 본문 편집');
  await press('초기 상태 설정하기');
  expect(editingIntro()).toBe('옥상');
  expect(screen.getByLabelText('장소').props.value).toBe('학교 옥상');

  // 드롭다운으로 고른 인트로는 탭을 오가도 유지된다(바로가기 없이 바꾸지 않는다).
  await chooseIntro('골목');
  await openTab('말투·서술');
  await openTab('초기 상태');
  expect(editingIntro()).toBe('골목');
  expect(screen.getByLabelText('장소').props.value).toBe('골목 입구');
}, 30000);

it('CREATE-US-12: 인트로 상태창의 「초기 상태 설정하기」는 작성 중인 말풍선이 있으면 누를 수 없다', async () => {
  const { repository } = fixture();
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('tab', { name: '인트로' })).toBeTruthy());
  await openTab('인트로');
  await press('인트로 1 본문 편집');
  expect(screen.getByRole('button', { name: '초기 상태 설정하기' })).not.toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), '추가 전 입력');
  expect(screen.getByRole('button', { name: '초기 상태 설정하기' })).toBeDisabled();
});

it('저장된 관계·호감도의 인물이 삭제되면 저장본에도 같게 정리해 변경으로 보지 않는다', async () => {
  const { repository } = fixture({
    relations: [
      {
        clientKey: 'r1',
        sourceKind: 'character',
        sourceCharacterId: '5',
        targetKind: 'character',
        targetCharacterId: '6',
        label: '라이벌',
      },
    ],
    affinities: [{ sourceCharacterId: '5', targetKind: 'character', targetCharacterId: '6', value: '40' }],
  });
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('tab', { name: '초기 상태' })).toBeTruthy());
  await openTab('초기 상태');
  expect(screen.getByLabelText('관계 1 관계명').props.value).toBe('라이벌');

  await act(() => setStoryCharacters([{ id: '6', name: '도윤', position: 0 }]));
  await waitFor(() => expect(screen.queryByLabelText('관계 1 관계명')).toBeNull());
  expect(screen.queryByText(/하린/)).toBeNull();
  expect(screen.queryByText('저장하지 않은 변경이 있습니다.')).toBeNull();
});

it('캐릭터 삭제 정리와 겹친 늦은 변경도 최신 상태에 반영해 삭제된 인물의 행을 되살리지 않는다', async () => {
  const { repository, stored } = fixture();
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('tab', { name: '초기 상태' })).toBeTruthy());
  await openTab('초기 상태');
  await type('하린 착장', '코트');
  await typeAffinity('하린', '도윤', '40');
  await typeAffinity('도윤', '하린', '30');
  for (const [from, to] of [
    ['하린', '도윤'],
    ['도윤', '유저'],
  ]) {
    await addRelation(from, to);
  }
  // 삭제 정리 전에 그려진 화면의 입력 핸들러(그 시점의 값을 들고 있음)를 잡아 둔다.
  const handler = (label: string): ((value: string) => void) => screen.getByLabelText(label).props.onChangeText;
  const stalePlace = handler('장소');
  const staleAffinity = handler('도윤→유저 호감도');
  const staleRelation = handler('관계 2 관계명');
  const staleDeletedClothing = handler('하린 착장');
  // 하린→유저는 관계 카드가 없어 카드 밖 호감도 칸에서 그 방향을 골라야 칸이 보인다.
  await pickAffinity('하린', '유저');
  const staleDeletedAffinity = handler('하린→유저 호감도');

  await act(() => setStoryCharacters([{ id: '6', name: '도윤', position: 0 }]));
  await waitFor(() => expect(screen.queryByLabelText('하린 착장')).toBeNull());
  await act(() => {
    stalePlace('골목');
    staleAffinity('7');
    staleRelation('친구');
    staleDeletedClothing('되살리면 안 됨');
    staleDeletedAffinity('9');
  });

  expect(screen.getByLabelText('장소').props.value).toBe('골목');
  expect(screen.queryByText(/하린/)).toBeNull();
  await openTab('공개 범위');
  await waitFor(() => expect(stored().intros[0].scene.place).toBe('골목'));
  expect(stored().intros[0].scene.characters).toEqual([]);
  expect(stored().affinities).toEqual([
    { sourceCharacterId: '6', targetKind: 'user', targetCharacterId: null, value: '7' },
  ]);
  expect(stored().relations).toHaveLength(1);
  expect(stored().relations[0]).toMatchObject({ sourceCharacterId: '6', targetKind: 'user', label: '친구' });
}, 30000);

it('호감도를 바꿨다가 원래 값으로 되돌리면 행 순서가 달라져도 변경 없음으로 본다', async () => {
  const { repository, save } = fixture({
    affinities: [
      { sourceCharacterId: '5', targetKind: 'user', targetCharacterId: null, value: '10' },
      { sourceCharacterId: '6', targetKind: 'user', targetCharacterId: null, value: '20' },
    ],
  });
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('tab', { name: '초기 상태' })).toBeTruthy());
  await openTab('초기 상태');
  expect(screen.getByText('저장한 설정과 같습니다.')).toBeTruthy();
  await type('하린→유저 호감도', '30');
  expect(screen.getByText('저장하지 않은 변경이 있습니다.')).toBeTruthy();
  await type('하린→유저 호감도', '10');
  expect(screen.getByText('저장한 설정과 같습니다.')).toBeTruthy();
  // 변경이 없으므로 탭을 옮겨도 자동 저장하지 않는다.
  await openTab('공개 범위');
  expect(save).not.toHaveBeenCalled();
});

it('CREATE-US-04-AC11·AC12: 착장·속마음은 한도를 넘어도 자르지 않고 글자 수와 초과량을 보여 준다', async () => {
  const { repository } = fixture();
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('tab', { name: '초기 상태' })).toBeTruthy());
  await openTab('초기 상태');
  const long = '가'.repeat(301);
  await type('하린 착장', long);
  expect(screen.getByLabelText('하린 착장').props.value).toBe(long);
  expect(screen.getByText('301 / 300자 · 1자 초과')).toBeTruthy();
});

it('CREATE-US-04-AC10: 이미 만든 관계의 시작·대상 인물을 바꿀 수 있고, 자기 자신이나 같은 방향 중복으로는 바꿀 수 없다', async () => {
  const { repository, stored } = fixture();
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('tab', { name: '초기 상태' })).toBeTruthy());
  await openTab('초기 상태');
  await addRelation('하린', '유저');
  await addRelation('하린', '도윤');
  await type('관계 1 관계명', '소꿉친구');

  await fireEvent.press(dropdown('관계 1 대상 캐릭터'));
  const targets = menu('관계 1 대상 캐릭터');
  // 자기 자신(하린)과 이미 있는 하린→도윤 방향은 목록에 보이지만 이유와 함께 고를 수 없다.
  const self = targets.getByRole('menuitem', { name: '하린' });
  expect(self).toBeDisabled();
  expect(self.props.accessibilityHint).toBe('반대쪽에서 선택됨');
  const duplicate = targets.getByRole('menuitem', { name: '도윤' });
  expect(duplicate).toBeDisabled();
  expect(duplicate.props.accessibilityHint).toBe('이미 있는 관계');
  // 막힌 항목을 눌러도 대상은 그대로다.
  await fireEvent.press(duplicate);
  expect(relationCard('관계 1 · 하린 → 유저')).toBeTruthy();
  expect(targets.getByRole('menuitem', { name: '유저' })).not.toBeDisabled();
  await fireEvent.press(dropdown('관계 1 대상 캐릭터'));
  // 시작 인물을 도윤으로 바꾸면 도윤→유저가 되고 관계명은 유지된다.
  await pick('관계 1 시작 캐릭터', '도윤');
  expect(relationCard('관계 1 · 도윤 → 유저')).toBeTruthy();
  expect(screen.getByLabelText('관계 1 관계명').props.value).toBe('소꿉친구');
  // 목업 .state-pair: 카드 안 방향 표시(시작 → 대상)는 드롭다운 선택을 따라 바뀐다.
  expect(screen.getByLabelText('방향: 도윤 → 유저')).toBeTruthy();
  // CREATE-US-12: 방향 표시의 화살표는 보기 전용이며, 목업에 없는 방향 맞바꾸기 버튼은 없다.
  expect(screen.queryByLabelText('관계 1 방향 바꾸기')).toBeNull();
  expect(screen.queryAllByRole('button', { name: /방향 바꾸기$/ })).toHaveLength(0);
  expect(screen.getAllByText('→').length).toBeGreaterThan(0);

  await openTab('공개 범위');
  await waitFor(() =>
    expect(stored().relations.map((r) => [r.sourceCharacterId, r.targetKind, r.targetCharacterId, r.label])).toEqual([
      ['6', 'user', null, '소꿉친구'],
      ['5', 'character', '6', ''],
    ]),
  );
}, 30000);

it('CREATE-US-04-AC10: 새 관계 카드는 두 인물을 모두 고르기 전에는 관계명을 받지 않고, 관계가 된 뒤 입력한 관계명이 저장된다', async () => {
  const { repository, stored } = fixture();
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('tab', { name: '초기 상태' })).toBeTruthy());
  await openTab('초기 상태');

  await press('+ 인물 사이 관계 추가');
  // 아무도 고르지 않았을 때와 한 명만 골랐을 때 모두 관계명 칸이 없고, 안내만 보인다.
  expect(screen.queryByLabelText('새 관계 관계명')).toBeNull();
  await pick('새 관계 시작 캐릭터', '하린');
  expect(relationCard('새 관계')).toBeTruthy();
  expect(screen.queryByLabelText('새 관계 관계명')).toBeNull();
  expect(screen.queryByLabelText(/관계명$/)).toBeNull();
  expect(screen.getByText(/두 인물을 모두 고르면 관계가 추가되고, 관계명을 입력할 수 있어요/)).toBeTruthy();

  // 대상까지 고르면 실제 관계 카드가 되고 그 카드의 관계명은 비어 있으며 입력할 수 있다.
  await pick('새 관계 대상 캐릭터', '도윤');
  expect(relationCard('새 관계')).toBeNull();
  expect(relationCard('관계 1 · 하린 → 도윤')).toBeTruthy();
  expect(screen.getByLabelText('관계 1 관계명').props.value).toBe('');
  await type('관계 1 관계명', '라이벌');
  expect(screen.getByLabelText('관계 1 관계명').props.value).toBe('라이벌');
  // 캐릭터가 시작인 관계의 호감도 칸은 그대로 카드 안에 있다.
  expect(screen.getAllByLabelText('하린→도윤 호감도')).toHaveLength(1);

  await openTab('공개 범위');
  await waitFor(() =>
    expect(stored().relations.map((r) => [r.sourceCharacterId, r.targetKind, r.targetCharacterId, r.label])).toEqual([
      ['5', 'character', '6', '라이벌'],
    ]),
  );
}, 30000);
