import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as baseRender, screen, waitFor } from '@testing-library/react-native';
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
function fixture() {
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
  expect(screen.getByRole('button', { name: '비공개 저장' })).toBeDisabled();

  await openTab('초기 상태');
  await type('하린→유저 호감도', '-35');
  await openTab('저장·공개');
  await openTab('비공개');
  await waitFor(() => expect(screen.getByRole('button', { name: '비공개 저장' })).not.toBeDisabled());
  await press('비공개 저장');
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
