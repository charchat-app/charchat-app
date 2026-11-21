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
const chip = (name: string) => fireEvent.press(screen.getAllByRole('radio', { name })[0]);
const type = (label: string, value: string) => fireEvent.changeText(screen.getByLabelText(label), value);
async function openTab(name: string) {
  await fireEvent.press(screen.getByRole('tab', { name }));
}

it('인트로별 장면과 공통 관계·호감도를 작성·검증하고 비공개 저장 후 그대로 복원한다', async () => {
  const { repository, stored } = fixture();
  const view = await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('tab', { name: '초기 상태' })).toBeTruthy());
  await openTab('초기 상태');

  // 인트로 1(골목): 장소·일반 날짜·12시간제·캐릭터 상태
  await type('장소', '비 오는 골목');
  await chip('일반 날짜');
  await type('날짜 연', '2026');
  await type('날짜 월', '2');
  await type('날짜 일', '29');
  expect(screen.getByText('2월은 1~28일까지 입력할 수 있어요.')).toBeTruthy();
  // 방식 전환은 확인 후 날짜 입력만 지운다.
  await chip('경과일');
  expect(screen.getByText(/지금 입력한 날짜가 지워져요/)).toBeTruthy();
  await press('날짜 바꾸지 않기');
  expect(screen.getByLabelText('날짜 일').props.value).toBe('29');
  await chip('경과일');
  await press('날짜 지우고 바꾸기');
  expect(screen.queryByLabelText('날짜 일')).toBeNull();
  expect(screen.getByLabelText('장소').props.value).toBe('비 오는 골목');
  await type('기준 사건', '감금');
  await type('시작 일차', '3');
  expect(screen.getByText('표시: 감금 3일째')).toBeTruthy();
  await chip('12시간제');
  await type('시', '7');
  await type('분', '05');
  expect(screen.getByText('오전·오후와 시·분을 모두 입력해 주세요.')).toBeTruthy();
  await chip('오후');
  await type('하린 착장', '검은 코트');
  await type('하린 속마음', '...?');

  // 인트로 2(옥상)는 따로 편집되고 인트로 1 값이 섞이지 않는다.
  await chip('2. 옥상');
  expect(screen.getByLabelText('장소').props.value).toBe('');
  await type('장소', '옥상');
  await chip('1. 골목');
  expect(screen.getByLabelText('장소').props.value).toBe('비 오는 골목');

  // AC09: 관계 카드 없이도 캐릭터마다 상대별 호감도 0이 보인다. 유저 출발 호감도는 없다.
  expect(screen.getByLabelText('하린→유저 호감도').props.value).toBe('0');
  expect(screen.getByLabelText('도윤→하린 호감도').props.value).toBe('0');
  expect(screen.queryByLabelText('유저→하린 호감도')).toBeNull();
  await type('하린→유저 호감도', '');
  // 공통 관계: 하린→유저, 유저→도윤. 같은 인물은 양쪽에 고를 수 없다.
  await chip('하린');
  expect(screen.getAllByRole('radio', { name: '하린' })).toHaveLength(1);
  await fireEvent.press(screen.getAllByRole('radio', { name: '유저' })[1]);
  await press('관계 추가');
  await type('관계 1 관계명', '소꿉친구');
  await fireEvent.press(screen.getAllByRole('radio', { name: '유저' })[0]);
  await fireEvent.press(screen.getAllByRole('radio', { name: '도윤' })[1]);
  await press('관계 추가');
  expect(screen.queryByLabelText('관계 1 호감도')).toBeNull();

  // 지운 호감도는 임시 저장은 되지만 비공개 저장은 막는다.
  await openTab('저장·공개');
  await waitFor(() => expect(stored().relations).toHaveLength(2));
  expect(stored().affinities).toEqual([
    { sourceCharacterId: '5', targetKind: 'user', targetCharacterId: null, value: '' },
  ]);
  await openTab('비공개');
  expect(screen.getByText('초기 호감도는 -100~100 사이 정수로 입력해 주세요.')).toBeTruthy();
  expect(screen.getByRole('button', { name: '비공개로 저장' })).toBeDisabled();

  await openTab('초기 상태');
  await type('하린→유저 호감도', '-35');
  await openTab('저장·공개');
  await openTab('비공개');
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
  expect(screen.getByLabelText('도윤→유저 호감도').props.value).toBe('0');
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
  await type('도윤→하린 호감도', '20');
  await type('도윤→유저 호감도', '5');
  for (const [from, to] of [
    ['하린', '유저'],
    ['도윤', '하린'],
    ['도윤', '유저'],
  ]) {
    await fireEvent.press(screen.getAllByRole('radio', { name: from })[0]);
    await fireEvent.press(screen.getAllByRole('radio', { name: to }).slice(-1)[0]);
    await press('관계 추가');
  }
  expect(screen.getByText('관계 3 · 도윤 → 유저')).toBeTruthy();
  await act(() => setStoryCharacters([{ id: '6', name: '도윤', position: 0 }]));
  await waitFor(() => expect(screen.queryByLabelText('하린 착장')).toBeNull());
  expect(screen.getByLabelText('도윤 착장').props.value).toBe('교복');
  expect(screen.getByLabelText('장소').props.value).toBe('골목');
  expect(screen.getByText('관계 1 · 도윤 → 유저')).toBeTruthy();
  expect(screen.queryByText('관계 2 · 도윤 → 유저')).toBeNull();
  await openTab('저장·공개');
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
  await type('하린→도윤 호감도', '40');
  await fireEvent.press(screen.getAllByRole('radio', { name: '하린' })[0]);
  await fireEvent.press(screen.getAllByRole('radio', { name: '도윤' }).slice(-1)[0]);
  await press('관계 추가');
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
  expect(screen.getByLabelText('서아→유저 호감도').props.value).toBe('0');
  expect(screen.getByLabelText('서아→하린 호감도').props.value).toBe('0');
  expect(screen.getByLabelText('하린→서아 호감도').props.value).toBe('0');
  // 기존 값은 바뀌지 않는다.
  expect(screen.getByLabelText('장소').props.value).toBe('골목');
  expect(screen.getByLabelText('하린 착장').props.value).toBe('코트');
  expect(screen.getByLabelText('하린 속마음').props.value).toBe('긴장');
  expect(screen.getByLabelText('하린→도윤 호감도').props.value).toBe('40');
  expect(screen.getByText('관계 1 · 하린 → 도윤')).toBeTruthy();
  expect(screen.queryByText(/관계 2 ·/)).toBeNull();
  // 다른 인트로에서도 새 캐릭터는 미지정으로 시작한다.
  await chip('2. 옥상');
  expect(screen.getByLabelText('서아 착장').props.value).toBe('');

  await openTab('저장·공개');
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
  await openTab('초기 상태');
  expect(screen.getByText(/시각 · 미지정/)).toBeTruthy();
  await type('시', '7');
  expect(screen.getByText(/시각 · 7시 \(미완성\)/)).toBeTruthy();
  expect(screen.queryByText(/7:00/)).toBeNull();
  await type('분', '5');
  expect(screen.getByText(/시각 · 7:05/)).toBeTruthy();
});

it('캐릭터 삭제 정리와 겹친 늦은 변경도 최신 상태에 반영해 삭제된 인물의 행을 되살리지 않는다', async () => {
  const { repository, stored } = fixture();
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByRole('tab', { name: '초기 상태' })).toBeTruthy());
  await openTab('초기 상태');
  await type('하린 착장', '코트');
  await type('하린→도윤 호감도', '40');
  await type('도윤→하린 호감도', '30');
  for (const [from, to] of [
    ['하린', '도윤'],
    ['도윤', '유저'],
  ]) {
    await fireEvent.press(screen.getAllByRole('radio', { name: from })[0]);
    await fireEvent.press(screen.getAllByRole('radio', { name: to }).slice(-1)[0]);
    await press('관계 추가');
  }
  // 삭제 정리 전에 그려진 화면의 입력 핸들러(그 시점의 값을 들고 있음)를 잡아 둔다.
  const handler = (label: string): ((value: string) => void) => screen.getByLabelText(label).props.onChangeText;
  const stalePlace = handler('장소');
  const staleAffinity = handler('도윤→유저 호감도');
  const staleRelation = handler('관계 2 관계명');
  const staleDeletedClothing = handler('하린 착장');
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
  await openTab('저장·공개');
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
  await openTab('저장·공개');
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
  const add = async (from: string, to: string) => {
    await fireEvent.press(within(screen.getByLabelText('시작 캐릭터')).getByRole('radio', { name: from }));
    await fireEvent.press(within(screen.getByLabelText('대상 캐릭터')).getByRole('radio', { name: to }));
    await press('관계 추가');
  };
  await add('하린', '유저');
  await add('하린', '도윤');
  await type('관계 1 관계명', '소꿉친구');

  await press('관계 1 인물 바꾸기');
  const targets = within(screen.getByLabelText('관계 1 대상 캐릭터'));
  // 자기 자신(하린)과 이미 있는 하린→도윤 방향은 고를 수 없다.
  expect(targets.queryByRole('radio', { name: '하린' })).toBeNull();
  expect(targets.queryByRole('radio', { name: '도윤' })).toBeNull();
  // 시작 인물을 도윤으로 바꾸면 도윤→유저가 되고 관계명은 유지된다.
  await fireEvent.press(within(screen.getByLabelText('관계 1 시작 캐릭터')).getByRole('radio', { name: '도윤' }));
  expect(screen.getByText('관계 1 · 도윤 → 유저')).toBeTruthy();
  expect(screen.getByLabelText('관계 1 관계명').props.value).toBe('소꿉친구');
  // 방향을 한 번에 바꿀 수 있다(유저→도윤).
  await press('관계 1 방향 바꾸기');
  expect(screen.getByText('관계 1 · 유저 → 도윤')).toBeTruthy();
  await press('관계 1 방향 바꾸기');
  expect(screen.getByText('관계 1 · 도윤 → 유저')).toBeTruthy();

  await openTab('저장·공개');
  await waitFor(() =>
    expect(stored().relations.map((r) => [r.sourceCharacterId, r.targetKind, r.targetCharacterId, r.label])).toEqual([
      ['6', 'user', null, '소꿉친구'],
      ['5', 'character', '6', ''],
    ]),
  );
}, 30000);
