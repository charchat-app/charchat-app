// CREATE-US-01-AC02 기본 설정 탭: 서버 판정 안내를 지금 입력값과 맞춰 표시한다.
// CREATE-US-05-AC08 스토리 편집 화면의 유저 프로필 탭 연결 (프리셋 편집기 조립)
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as baseRender, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import {
  PanResponder,
  type GestureResponderEvent,
  type PanResponderCallbacks,
  type PanResponderGestureState,
} from 'react-native';

import { ApiError, type FieldIssue } from '@/lib/api-client';
import { defaultExpression } from '@/shared/story-types';

import { getStory, saveStoryBasic } from '../api';
import type { CommonSaveDocument, CommonSaveRepository } from '../commonRepository';
import { StoryEditorScreen } from '../components/StoryEditorScreen';
import { storyCreationKey } from '../hooks/useStoryPresets';
import type { EditorStory } from '../types';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
// 상세 조회(getStory)는 공통 저장 성공 뒤 상세 무효화가 실제로 다시 부르는 경계라서 가짜로 둔다.
jest.mock('../api', () => ({ ...jest.requireActual('../api'), saveStoryBasic: jest.fn(), getStory: jest.fn() }));
// 유저 프로필 프리셋은 공통 저장(/creation)으로 불러오고 저장한다. 이 파일은 화면 조립·입력 검증이 대상이므로
// 저장소만 가짜로 둔다. 요청 본문·응답 해석은 storyEditorPresets.test.tsx가 검증한다.
const mockCommonLoad = jest.fn<ReturnType<CommonSaveRepository['load']>, Parameters<CommonSaveRepository['load']>>();
const mockCommonSave = jest.fn<ReturnType<CommonSaveRepository['save']>, Parameters<CommonSaveRepository['save']>>();
jest.mock('../commonRepository', () => ({
  ...jest.requireActual('../commonRepository'),
  createCommonSaveRepository: () => ({
    load: (...args: Parameters<CommonSaveRepository['load']>) => mockCommonLoad(...args),
    save: (...args: Parameters<CommonSaveRepository['save']>) => mockCommonSave(...args),
  }),
}));

notifyManager.setScheduler((callback) => callback());
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const render = (element: ReactElement) => baseRender(element, { wrapper });

const NOTICE = '공개·비공개로 저장하려면 표시된 항목을 채워 주세요.';
const MSG = {
  title: '제목을 입력하세요.',
  subtitle: '한 줄 소개를 입력하세요.',
  world: '세계관을 입력하세요.',
  count: '캐릭터는 1~10명 등록해 주세요.',
  name: '캐릭터 이름을 입력하세요.',
  detail: '캐릭터 상세를 입력하세요.',
  duplicate: '같은 이름의 캐릭터가 있어요.',
  tags: '해시태그를 확인해 주세요.',
};

function storyOf(story: Partial<EditorStory>, id = '1'): EditorStory {
  return {
    id,
    title: '',
    subtitle: '',
    world: '',
    tags: [],
    characters: [],
    saveState: '임시 저장',
    updatedAt: '2026-11-17T00:00:00Z',
    issues: [],
    ...story,
  };
}

/** 공통 저장 문서: 저장된 프리셋이 없는 임시 저장 스토리 */
function creationOf(id: string, presets: CommonSaveDocument['presets'] = []): CommonSaveDocument {
  return {
    id,
    title: `스토리 ${id}`,
    saveState: 'draft',
    updatedAt: '2026-11-17T00:00:00Z',
    speech: defaultExpression(),
    characters: [],
    fewshots: [],
    intros: [],
    relations: [],
    affinities: [],
    presets,
  };
}

/** 상세와 공통 저장(프리셋)을 캐시에 넣어 화면이 처음 열릴 때 조회하지 않게 한다. */
function seed(story: Partial<EditorStory>, id = '1') {
  client.setQueryData<EditorStory>(['stories', 'detail', id], storyOf(story, id));
  client.setQueryData(storyCreationKey(id), creationOf(id));
}

beforeEach(() => {
  client.clear();
  jest.mocked(saveStoryBasic).mockReset();
  jest.mocked(getStory).mockReset();
  // 처리하지 않은 상세 재조회는 실패로 드러낸다 (캐시를 채운 테스트에서는 부르지 않는다)
  jest.mocked(getStory).mockRejectedValue(new Error('처리하지 않은 상세 조회'));
  mockCommonLoad.mockReset();
  mockCommonSave.mockReset();
  // 처리하지 않은 공통 저장 호출은 실패로 드러낸다
  mockCommonLoad.mockRejectedValue(new Error('처리하지 않은 공통 저장 조회'));
  mockCommonSave.mockRejectedValue(new Error('처리하지 않은 공통 저장'));
});

describe('CREATE-US-01-AC02: 서버 누락 안내를 지금 입력값과 맞춘다', () => {
  const missing: FieldIssue[] = [
    { field: 'title', code: 'REQUIRED', message: MSG.title },
    { field: 'subtitle', code: 'REQUIRED', message: MSG.subtitle },
    { field: 'world', code: 'REQUIRED', message: MSG.world },
    { field: 'characters', code: 'CHARACTER_COUNT_OUT_OF_RANGE', message: MSG.count },
  ];

  it('채운 항목의 누락 안내는 다시 저장하지 않아도 사라지고, 다시 지우면 돌아온다', async () => {
    seed({ issues: missing });
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} />);
    for (const message of Object.values(MSG).slice(0, 4)) expect(screen.getByText(message)).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('제목'), '비 오는 서점');
    await fireEvent.changeText(screen.getByLabelText('한 줄 소개'), '단골 손님');
    await fireEvent.changeText(screen.getByLabelText('세계관 · 서사'), '골목 끝 서점');
    expect(screen.queryByText(MSG.title)).toBeNull();
    expect(screen.queryByText(MSG.subtitle)).toBeNull();
    expect(screen.queryByText(MSG.world)).toBeNull();
    // 인원 안내는 아직 캐릭터가 없으므로 남는다
    expect(screen.getByText(MSG.count)).toBeOnTheScreen();
    expect(screen.getByText(NOTICE)).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('제목'), '');
    expect(screen.getByText(MSG.title)).toBeOnTheScreen();
  });

  it('공백만 입력하면 여전히 누락으로 본다', async () => {
    seed({ issues: missing });
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} />);
    await fireEvent.changeText(screen.getByLabelText('제목'), '  \n ');
    expect(screen.getByText(MSG.title)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('제목'), '\u0085');
    expect(screen.getByText(MSG.title)).toBeOnTheScreen();
  });

  it('캐릭터 인원 안내는 인원이 1~10명이 되면 사라지고, 다시 0명이 되면 돌아온다', async () => {
    seed({ title: '가', subtitle: '나', world: '다', issues: [missing[3]] });
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} />);
    expect(screen.getByText(MSG.count)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('+ 캐릭터 추가'));
    expect(screen.queryByText(MSG.count)).toBeNull();
    expect(screen.queryByText(NOTICE)).toBeNull();
    // 새 캐릭터의 빈 이름·상세는 서버 판정 전이므로 앱이 따로 안내를 만들지 않는다
    expect(screen.queryByText(MSG.name)).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: '캐릭터 1 삭제' }));
    expect(screen.getByText(MSG.count)).toBeOnTheScreen();
  });

  it('캐릭터 이름·상세 누락 안내는 그 칸을 채우면 사라지고, 관련 없는 안내는 남는다', async () => {
    seed({
      title: '가',
      subtitle: '나',
      world: '다',
      tags: ['태그'],
      characters: [
        { id: '11', name: '', detail: '' },
        { id: '12', name: '민', detail: '상세' },
      ],
      issues: [
        { field: 'characters[0].name', code: 'REQUIRED', message: MSG.name },
        { field: 'characters[0].description', code: 'REQUIRED', message: MSG.detail },
        { field: 'characters[1].name', code: 'NAME_DUPLICATE', message: MSG.duplicate },
        { field: 'tags', code: 'INVALID_TAGS', message: MSG.tags },
      ],
    });
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} />);

    await fireEvent.changeText(screen.getByLabelText('캐릭터 1 이름'), '서연');
    expect(screen.queryByText(MSG.name)).toBeNull();
    expect(screen.getByText(MSG.detail)).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('캐릭터 2 이름'), '민수');
    // 중복·태그처럼 앱이 다시 판정하지 않는 안내는 다음 저장 결과까지 유지한다
    expect(screen.getByText(MSG.duplicate)).toBeOnTheScreen();
    expect(screen.getByText(MSG.tags)).toBeOnTheScreen();
    expect(screen.getByText(NOTICE)).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('캐릭터 1 이름'), ' ');
    expect(screen.getByText(MSG.name)).toBeOnTheScreen();
  });

  it('저장 실패 안내는 유지하고, 실패 응답의 누락 안내만 입력에 맞춰 사라진다', async () => {
    seed({ issues: [{ field: 'world', code: 'REQUIRED', message: '이전 저장본 세계관 안내' }] });
    jest
      .mocked(saveStoryBasic)
      .mockRejectedValue(
        new ApiError(422, 'STORY_INCOMPLETE', '조건 미충족', [
          { field: 'title', code: 'REQUIRED', message: MSG.title },
        ]),
      );
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} />);

    await fireEvent.press(screen.getByRole('button', { name: '임시 저장' }));
    const failure = '저장 조건을 충족하지 않아 저장하지 않았어요. 입력한 내용은 그대로예요.';
    expect(await screen.findByText(failure)).toBeOnTheScreen();
    expect(screen.getByText(MSG.title)).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('제목'), '비 오는 서점');
    expect(screen.queryByText(MSG.title)).toBeNull();
    // 실패 응답의 안내가 모두 해소돼도 이전 저장본 안내로 되돌아가지 않는다
    expect(screen.queryByText('이전 저장본 세계관 안내')).toBeNull();
    expect(screen.getByText(failure)).toBeOnTheScreen();
  });

  it('합산 3000자 초과 안내는 그대로 표시한다 (AC09)', async () => {
    seed({ world: '가'.repeat(3001), characters: [{ id: '11', name: '', detail: '' }] });
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} />);
    expect(screen.getByText(/1자 넘었어요/)).toBeOnTheScreen();
  });

  describe('서버 합산 글자 수 초과 안내 뒤 줄이기 (AC09)', () => {
    const LONG = '서버 판정: 기본 설정 합산 3000자 초과';
    const tooLong: FieldIssue = { field: 'basic_text', code: 'BASIC_TEXT_TOO_LONG', message: LONG };
    // 캐릭터 이름·상세 3자 + 세계관 2998자 = 3001자
    const base = { title: '', subtitle: '', characters: [{ id: '11', name: '민', detail: '상세' }] };

    it('넘는 동안은 지금 글자 수만 보이고, 한도 안으로 줄이면 서버 안내와 상단 안내가 사라진다', async () => {
      seed({ ...base, world: '가'.repeat(2998), issues: [tooLong] });
      await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} />);
      expect(screen.getByText(/1자 넘었어요/)).toBeOnTheScreen();
      // 같은 내용의 서버 문구는 겹쳐 보이지 않는다
      expect(screen.queryByText(LONG)).toBeNull();
      expect(screen.getByText(NOTICE)).toBeOnTheScreen();

      await fireEvent.changeText(screen.getByLabelText('세계관 · 서사'), '가'.repeat(2997));
      expect(screen.queryByText(/넘었어요/)).toBeNull();
      expect(screen.queryByText(LONG)).toBeNull();
      expect(screen.queryByText(NOTICE)).toBeNull();

      // 다시 넘기면 상단 안내도 돌아온다
      await fireEvent.changeText(screen.getByLabelText('세계관 · 서사'), '가'.repeat(2999));
      expect(screen.getByText(/2자 넘었어요/)).toBeOnTheScreen();
      expect(screen.getByText(NOTICE)).toBeOnTheScreen();
    });

    it('줄여도 이름 중복·태그 안내는 다음 저장 결과까지 남는다', async () => {
      seed({
        ...base,
        world: '가'.repeat(2998),
        tags: ['태그'],
        issues: [
          tooLong,
          { field: 'characters[0].name', code: 'NAME_DUPLICATE', message: MSG.duplicate },
          { field: 'tags', code: 'INVALID_TAGS', message: MSG.tags },
        ],
      });
      await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} />);

      await fireEvent.changeText(screen.getByLabelText('세계관 · 서사'), '가'.repeat(2997));
      expect(screen.queryByText(LONG)).toBeNull();
      expect(screen.getByText(MSG.duplicate)).toBeOnTheScreen();
      expect(screen.getByText(MSG.tags)).toBeOnTheScreen();
      expect(screen.getByText(NOTICE)).toBeOnTheScreen();
    });
  });
});

// ---- CREATE-US-05-AC08: 유저 프로필 탭 (프리셋 편집기 조립) ----

// 저장 연결 전 프로토타입 안내. 지금은 기본 정보와 함께 저장되므로 보이면 안 된다.
const NOT_PERSISTED = /유저 프로필은 아직 저장되지 않아요/;
const SAVED_WITH_BASIC = '저장하면 기본 정보와 함께 저장돼요.';

/** 프리셋 탭 테스트용 스토리: 캐릭터 한 명이 있는 임시 저장본 */
function seedPresetStory(id: string, characterName: string) {
  seed({ title: `스토리 ${id}`, characters: [{ id: `${id}1`, name: characterName, detail: '' }] }, id);
}

async function openTab(name: string) {
  await fireEvent.press(screen.getByRole('tab', { name }));
}

async function addPreset(name: string, detail = '') {
  await fireEvent.press(screen.getByRole('button', { name: '+ 추천 프로필 추가' }));
  const count = screen.getAllByLabelText(/^프로필 \d+ 이름$/).length;
  await fireEvent.changeText(screen.getByLabelText(`프로필 ${count} 이름`), name);
  if (detail) await fireEvent.changeText(screen.getByLabelText(`프로필 ${count} 상세`), detail);
}

const presetNames = () => screen.getAllByLabelText(/^프로필 \d+ 이름$/).map((el) => el.props.value as string);

describe('CREATE-US-05-AC08: 유저 프로필 탭 연결', () => {
  beforeEach(() => {
    seedPresetStory('1', '루나');
    seedPresetStory('2', '카일');
  });

  it('유저 프로필 탭을 열면 프리셋 편집기와 기본 정보와 함께 저장된다는 안내를 보여 준다', async () => {
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} />);
    expect(screen.queryByRole('button', { name: '+ 추천 프로필 추가' })).toBeNull();

    await openTab('유저 프로필');

    expect(screen.getByRole('button', { name: '+ 추천 프로필 추가' })).toBeTruthy();
    expect(screen.getByText('아직 추천 프로필이 없어요.')).toBeTruthy();
    expect(screen.getByText(SAVED_WITH_BASIC)).toBeTruthy();
    expect(screen.queryByText(NOT_PERSISTED)).toBeNull();
    expect(screen.queryByText('유저 프로필 탭은 아직 연결되지 않았어요.')).toBeNull();
    // 캐시에 넣은 공통 저장 문서로 채우므로 열 때 다시 조회하지 않는다
    expect(mockCommonLoad).not.toHaveBeenCalled();
  });

  it('편집기로 추가·수정·순서 변경한 내용이 탭을 오가도 남아 있다', async () => {
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} />);
    await openTab('유저 프로필');

    await addPreset('여행자', '길을 잃은 여행자');
    await addPreset('기사');
    expect(presetNames()).toEqual(['여행자', '기사']);
    // 사진을 고르지 않은 두 카드는 각각 이미지 선택 안내를 보여 준다
    const IMAGE_PROMPT = '이미지를 선택해 주세요.';
    const imagePromptPerCard = () =>
      screen.getAllByTestId(/^preset-item-/).map((card) => within(card).queryAllByText(IMAGE_PROMPT).length);
    expect(imagePromptPerCard()).toEqual([1, 1]);

    // CREATE-US-12: 화면에 보이는 위·아래 버튼은 없고, 손잡이의 접근성 동작으로 옮긴다
    expect(screen.queryAllByRole('button', { name: /(위로|아래로) 이동$/ })).toHaveLength(0);
    await fireEvent(screen.getByLabelText('프로필 1 순서 손잡이(길게 눌러 끌기)'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(presetNames()).toEqual(['기사', '여행자']);
    expect(imagePromptPerCard()).toEqual([1, 1]);

    await openTab('기본 설정');
    expect(screen.queryByRole('button', { name: '+ 추천 프로필 추가' })).toBeNull();
    await openTab('인트로');
    await openTab('유저 프로필');

    expect(presetNames()).toEqual(['기사', '여행자']);
    expect(screen.getByLabelText('프로필 2 상세').props.value).toBe('길을 잃은 여행자');
    expect(imagePromptPerCard()).toEqual([1, 1]);
  });

  it('기본 설정에서 지금 입력 중인 캐릭터 이름으로 중복을 안내한다', async () => {
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} />);
    await openTab('유저 프로필');
    await addPreset('세라');
    expect(screen.queryByText(/등장 캐릭터 '세라'와 같은 이름이에요/)).toBeNull();

    // 저장하지 않은 기본 설정 입력값(캐릭터 이름)을 바꾸면 그 이름을 기준으로 안내한다
    await openTab('기본 설정');
    await fireEvent.changeText(screen.getByDisplayValue('루나'), '세라');
    await openTab('유저 프로필');

    expect(screen.getByText(/등장 캐릭터 '세라'와 같은 이름이에요/)).toBeTruthy();
  });

  it('유저 프로필 탭에서도 공통 저장 버튼을 보여 주고, 고친 프리셋은 기본 정보와 한 요청으로 보낸다', async () => {
    mockCommonLoad.mockResolvedValue(creationOf('1'));
    mockCommonSave.mockImplementation(async (document) => ({
      ...document,
      presets: (document.presets ?? []).map((p, i) => ({ ...p, id: p.id ?? String(100 + i) })),
    }));
    // 저장 성공 뒤 상세 무효화로 다시 받는 저장본: 보낸 기본 정보 그대로, 저장 시각만 새로워진다
    const refreshed = storyOf({
      title: '스토리 1',
      characters: [{ id: '11', name: '루나', detail: '' }],
      updatedAt: '2026-11-18T00:00:00Z',
    });
    jest.mocked(getStory).mockResolvedValue(refreshed);
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} />);
    await openTab('유저 프로필');
    await addPreset('여행자', '길을 잃은 여행자');

    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: '임시 저장' }));
    });

    // 프리셋이 바뀌면 기본 정보만 보내는 API를 쓰지 않는다
    expect(saveStoryBasic).not.toHaveBeenCalled();
    // 저장 직전 최신 공통 문서를 한 번 다시 불러온 뒤 한 번 보낸다
    expect(mockCommonLoad).toHaveBeenCalledTimes(1);
    expect(mockCommonSave).toHaveBeenCalledTimes(1);
    const [document, state, , , kind] = mockCommonSave.mock.calls[0];
    expect(state).toBe('draft');
    // CREATE-US-05-AC06(최신 정책): 미등록 스토리의 하단 「임시 저장」은 kind temporary를 명시한다
    expect(kind).toBe('temporary');
    expect(document.basic).toMatchObject({ title: '스토리 1', characters: [{ id: '11', name: '루나', detail: '' }] });
    expect(document.presets).toEqual([{ name: '여행자', detail: '길을 잃은 여행자', imageId: null, photoUrl: null }]);
    // 실제 무효화가 상세를 다시 불러오고, 화면은 그 저장본으로 편집 가능한 상태를 유지한다
    await waitFor(() => expect(getStory).toHaveBeenCalledWith('1'));
    await waitFor(() => expect(client.getQueryData(['stories', 'detail', '1'])).toEqual(refreshed));
    expect(client.getQueryState(['stories', 'detail', '1'])?.status).toBe('success');
    expect(screen.getByRole('tab', { name: '유저 프로필' })).toBeTruthy();
    expect(screen.getByText(SAVED_WITH_BASIC)).toBeTruthy();
    expect(screen.getByDisplayValue('여행자')).toBeTruthy();
    expect(screen.queryByText(NOT_PERSISTED)).toBeNull();
    expect(screen.getByRole('button', { name: '임시 저장' })).toBeEnabled();
  });

  it('프리셋을 바꾸지 않았으면 기본 저장만 보내고 공통 저장은 보내지 않는다', async () => {
    jest.mocked(saveStoryBasic).mockResolvedValue(storyOf({ title: '스토리 1' }));
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} />);
    // 탭만 오가고 프리셋은 그대로 둔다
    await openTab('유저 프로필');
    await openTab('기본 설정');

    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: '임시 저장' }));
    });

    expect(saveStoryBasic).toHaveBeenCalledTimes(1);
    const [id, sent] = jest.mocked(saveStoryBasic).mock.calls[0];
    expect(id).toBe('1');
    expect(sent).not.toHaveProperty('userProfilePresets');
    expect(sent).toMatchObject({ title: '스토리 1', characters: [{ id: '11', name: '루나', detail: '' }] });
    expect(mockCommonLoad).not.toHaveBeenCalled();
    expect(mockCommonSave).not.toHaveBeenCalled();
  });

  it('스토리가 바뀌면(라우트 key) 다른 스토리의 프리셋을 보여 주지 않는다', async () => {
    const view = await render(<StoryEditorScreen key="1" storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} />);
    await openTab('유저 프로필');
    await addPreset('여행자');

    await view.rerender(<StoryEditorScreen key="2" storyId="2" onBack={jest.fn()} onDeleted={jest.fn()} />);
    await openTab('유저 프로필');

    expect(screen.getByText('아직 추천 프로필이 없어요.')).toBeTruthy();
    expect(screen.queryByDisplayValue('여행자')).toBeNull();
  });
});

// ---- 끄는 동안 바깥 스크롤 멈춤: 편집기 손잡이의 PanResponder 콜백을 그대로 부른다 ----

const noEvent = null as unknown as GestureResponderEvent;
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

function required<T>(fn: T | undefined, name: string): T {
  if (fn === undefined) throw new Error(`PanResponder 콜백 ${name}이(가) 없다`);
  return fn;
}

describe('CREATE-US-05-AC08: 프리셋을 끄는 동안 화면 스크롤', () => {
  beforeEach(() => {
    seedPresetStory('1', '루나');
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('손잡이로 끄는 동안 편집 화면 스크롤을 멈추고, 놓으면 다시 켠다', async () => {
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} />);
    await openTab('유저 프로필');
    await addPreset('여행자');

    const configs: PanResponderCallbacks[] = [];
    const create = PanResponder.create;
    jest.spyOn(PanResponder, 'create').mockImplementation((config) => {
      configs.push(config);
      return create(config);
    });
    // 새 항목을 추가하면 그 항목의 손잡이 응답기가 만들어진다
    await addPreset('기사');
    const body = screen.getByTestId('story-editor-body');
    expect(body.props.scrollEnabled).toBe(true);
    const item = screen.getAllByTestId(/^preset-item-/)[1];
    expect(within(item).getByDisplayValue('기사')).toBeTruthy();
    const config = configs[configs.length - 1];

    expect(required(config.onStartShouldSetPanResponder, 'start')(noEvent, gesture(0))).toBe(true);
    await act(async () => {
      required(config.onPanResponderGrant, 'grant')(noEvent, gesture(0));
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('story-editor-body').props.scrollEnabled).toBe(false);

    await act(async () => {
      required(config.onPanResponderRelease, 'release')(noEvent, gesture(0));
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('story-editor-body').props.scrollEnabled).toBe(true);
  });
});
