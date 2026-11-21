// CREATE-US-01-AC02 기본 설정 탭: 서버 판정 안내를 지금 입력값과 맞춰 표시한다.
// CREATE-US-05-AC08 스토리 편집 화면의 유저 프로필 탭 연결 (프리셋 편집기 조립)
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as baseRender, screen, within } from '@testing-library/react-native';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { manipulateAsync } from 'expo-image-manipulator';
import type { ReactElement, ReactNode } from 'react';
import {
  PanResponder,
  type GestureResponderEvent,
  type PanResponderCallbacks,
  type PanResponderGestureState,
} from 'react-native';

import { ApiError, type FieldIssue } from '@/lib/api-client';
import { uploadImage } from '@/shared/media/api';
import { defaultExpression } from '@/shared/story-types';

import { saveStoryBasic } from '../api';
import type { CommonSaveDocument, CommonSaveRepository } from '../commonRepository';
import { StoryEditorScreen } from '../components/StoryEditorScreen';
import { storyCreationKey } from '../hooks/useStoryPresets';
import type { EditorStory } from '../types';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../api', () => ({ ...jest.requireActual('../api'), saveStoryBasic: jest.fn() }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { PNG: 'png', JPEG: 'jpeg', WEBP: 'webp' },
}));
jest.mock('@/shared/media/api', () => ({ ...jest.requireActual('@/shared/media/api'), uploadImage: jest.fn() }));

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

function seed(story: Partial<EditorStory>, id = '1') {
  client.setQueryData<EditorStory>(['stories', 'detail', id], storyOf(story, id));
}

beforeEach(() => {
  client.clear();
  jest.mocked(saveStoryBasic).mockReset();
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
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} />);
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
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} />);
    await fireEvent.changeText(screen.getByLabelText('제목'), '  \n ');
    expect(screen.getByText(MSG.title)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('제목'), '\u0085');
    expect(screen.getByText(MSG.title)).toBeOnTheScreen();
  });

  it('캐릭터 인원 안내는 인원이 1~10명이 되면 사라지고, 다시 0명이 되면 돌아온다', async () => {
    seed({ title: '가', subtitle: '나', world: '다', issues: [missing[3]] });
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} />);
    expect(screen.getByText(MSG.count)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('+ 캐릭터 추가'));
    expect(screen.queryByText(MSG.count)).toBeNull();
    expect(screen.queryByText(NOTICE)).toBeNull();
    // 새 캐릭터의 빈 이름·상세는 서버 판정 전이므로 앱이 따로 안내를 만들지 않는다
    expect(screen.queryByText(MSG.name)).toBeNull();

    await fireEvent.press(screen.getByText('삭제'));
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
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} />);

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
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} />);

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
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} />);
    expect(screen.getByText(/1자 넘었어요/)).toBeOnTheScreen();
  });

  describe('서버 합산 글자 수 초과 안내 뒤 줄이기 (AC09)', () => {
    const LONG = '서버 판정: 기본 설정 합산 3000자 초과';
    const tooLong: FieldIssue = { field: 'basic_text', code: 'BASIC_TEXT_TOO_LONG', message: LONG };
    // 캐릭터 이름·상세 3자 + 세계관 2998자 = 3001자
    const base = { title: '', subtitle: '', characters: [{ id: '11', name: '민', detail: '상세' }] };

    it('넘는 동안은 지금 글자 수만 보이고, 한도 안으로 줄이면 서버 안내와 상단 안내가 사라진다', async () => {
      seed({ ...base, world: '가'.repeat(2998), issues: [tooLong] });
      await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} />);
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
      await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} />);

      await fireEvent.changeText(screen.getByLabelText('세계관 · 서사'), '가'.repeat(2997));
      expect(screen.queryByText(LONG)).toBeNull();
      expect(screen.getByText(MSG.duplicate)).toBeOnTheScreen();
      expect(screen.getByText(MSG.tags)).toBeOnTheScreen();
      expect(screen.getByText(NOTICE)).toBeOnTheScreen();
    });
  });
});

// ---- CREATE-US-05-AC08: 유저 프로필 탭 (프리셋 편집기 조립) ----

function presetRepository() {
  const stored: CommonSaveDocument = {
    id: '1',
    title: '스토리 1',
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
  return {
    load: jest.fn(async () => stored),
    save: jest.fn<ReturnType<CommonSaveRepository['save']>, Parameters<CommonSaveRepository['save']>>(async (doc) => ({
      ...doc,
      presets: doc.presets?.map((preset, index) => ({ ...preset, id: String(index + 1) })),
    })),
  } satisfies CommonSaveRepository;
}

/** 프리셋 탭 테스트용 스토리: 캐릭터 한 명이 있는 임시 저장본 */
function seedPresetStory(id: string, characterName: string) {
  seed({ title: `스토리 ${id}`, characters: [{ id: `${id}1`, name: characterName, detail: '' }] }, id);
  client.setQueryData(storyCreationKey(id), { id, saveState: 'draft', presets: [] });
}

async function openTab(name: string) {
  await fireEvent.press(screen.getByRole('tab', { name }));
}

async function addPreset(name: string, detail = '') {
  await fireEvent.press(screen.getByRole('button', { name: '+ 프로필 추가' }));
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

  it('유저 프로필 탭을 열면 서버에서 받은 빈 프리셋 편집기를 보여 준다', async () => {
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} />);
    expect(screen.queryByRole('button', { name: '+ 프로필 추가' })).toBeNull();

    await openTab('유저 프로필');

    expect(screen.getByRole('button', { name: '+ 프로필 추가' })).toBeTruthy();
    expect(screen.getByText('아직 추천 프로필이 없어요.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '임시 저장' })).toBeDisabled();
    expect(screen.queryByText('유저 프로필 탭은 아직 연결되지 않았어요.')).toBeNull();
  });

  it('편집기로 추가·수정·순서 변경한 내용이 탭을 오가도 남아 있다', async () => {
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} />);
    await openTab('유저 프로필');

    await addPreset('여행자', '길을 잃은 여행자');
    await addPreset('기사');
    expect(presetNames()).toEqual(['여행자', '기사']);
    expect(screen.getAllByText('이미지를 선택해 주세요.')).toHaveLength(2);

    await fireEvent.press(screen.getByRole('button', { name: '프로필 1 아래로 이동' }));
    expect(presetNames()).toEqual(['기사', '여행자']);

    await openTab('기본 설정');
    expect(screen.queryByRole('button', { name: '+ 프로필 추가' })).toBeNull();
    await openTab('인트로');
    await openTab('유저 프로필');

    expect(presetNames()).toEqual(['기사', '여행자']);
    expect(screen.getByLabelText('프로필 2 상세').props.value).toBe('길을 잃은 여행자');
  });

  it('기본 설정에서 지금 입력 중인 캐릭터 이름으로 중복을 안내한다', async () => {
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} />);
    await openTab('유저 프로필');
    await addPreset('세라');
    expect(screen.queryByText(/등장 캐릭터 '세라'와 같은 이름이에요/)).toBeNull();

    // 저장하지 않은 기본 설정 입력값(캐릭터 이름)을 바꾸면 그 이름을 기준으로 안내한다
    await openTab('기본 설정');
    await fireEvent.changeText(screen.getByDisplayValue('루나'), '세라');
    await openTab('유저 프로필');

    expect(screen.getByText(/등장 캐릭터 '세라'와 같은 이름이에요/)).toBeTruthy();
  });

  it('유저 프로필 탭에서는 기본 저장 버튼을 프리셋 저장처럼 보여 주지 않는다', async () => {
    const repository = presetRepository();
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} presetRepository={repository} />);
    expect(screen.getByRole('button', { name: '임시 저장' })).toBeTruthy();

    await openTab('유저 프로필');
    await addPreset('{{user}}');

    await fireEvent.press(screen.getByRole('button', { name: '임시 저장' }));
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ presets: [expect.objectContaining({ name: '{{user}}', detail: '' })] }),
      'draft',
      'manual',
      expect.any(String),
      'temporary',
    );
    expect(screen.queryByRole('button', { name: '변경 내용 저장' })).toBeNull();
    expect(screen.queryByRole('button', { name: '다시 저장' })).toBeNull();
    expect(screen.queryByRole('button', { name: '사진만 다시 저장' })).toBeNull();
    expect(screen.queryByText(/마지막 저장/)).toBeNull();
    expect(saveStoryBasic).not.toHaveBeenCalled();
  });

  it('앨범·자르기·업로드가 끝나기 전에는 저장하지 않고 완료 뒤 새 사진 ID를 저장한다', async () => {
    const repository = presetRepository();
    const picker = Promise.withResolvers<Awaited<ReturnType<typeof launchImageLibraryAsync>>>();
    const upload = Promise.withResolvers<Awaited<ReturnType<typeof uploadImage>>>();
    jest.mocked(launchImageLibraryAsync).mockReturnValueOnce(picker.promise);
    jest.mocked(manipulateAsync).mockResolvedValueOnce({ uri: 'file:///cropped.png', width: 300, height: 300 });
    jest.mocked(uploadImage).mockReturnValueOnce(upload.promise);
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} presetRepository={repository} />);
    await openTab('유저 프로필');
    await addPreset('여행자');
    const saveButton = () => screen.getByRole('button', { name: '임시 저장' });
    const expectSaveBlocked = async () => {
      expect(saveButton()).toBeDisabled();
      await fireEvent.press(saveButton());
      expect(repository.save).not.toHaveBeenCalled();
    };

    await fireEvent.press(screen.getByLabelText('프로필 1 이미지 선택'));
    expect(launchImageLibraryAsync).toHaveBeenCalled();
    await expectSaveBlocked();
    await openTab('기본 설정');
    expect(screen.getByRole('tab', { name: '유저 프로필', selected: true })).toBeTruthy();
    await act(async () => {
      picker.resolve({
        canceled: false,
        assets: [{ uri: 'file:///picked.png', width: 400, height: 400, mimeType: 'image/png', fileSize: 100 }],
      });
    });
    expect(screen.getByText('이미지 자르기 (1:1)')).toBeTruthy();
    await expectSaveBlocked();
    await fireEvent.press(screen.getByLabelText('확인'));
    expect(uploadImage).toHaveBeenCalledWith(expect.anything(), 'profile');
    await expectSaveBlocked();
    await act(async () => {
      upload.resolve({ imageId: 77, uri: 'https://api.test/image-files/77', mimeType: 'image/png', byteSize: 100 });
    });
    expect(saveButton()).toBeEnabled();
    await fireEvent.press(saveButton());
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.save.mock.calls[0][0].presets).toEqual([expect.objectContaining({ imageId: 77 })]);
  });

  it('다른 탭의 기본 저장은 그대로 동작하고 프리셋을 함께 보내지 않는다', async () => {
    jest.mocked(saveStoryBasic).mockResolvedValue(storyOf({ title: '스토리 1' }));
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} />);
    await openTab('유저 프로필');
    await addPreset('여행자');
    await openTab('기본 설정');

    await fireEvent.press(screen.getByRole('button', { name: '임시 저장' }));

    expect(saveStoryBasic).toHaveBeenCalledTimes(1);
    const [id, sent] = jest.mocked(saveStoryBasic).mock.calls[0];
    expect(id).toBe('1');
    expect(sent).not.toHaveProperty('userProfilePresets');
    expect(sent).toMatchObject({ title: '스토리 1', characters: [{ id: '11', name: '루나', detail: '' }] });
  });

  it('스토리가 바뀌면(라우트 key) 다른 스토리의 프리셋을 보여 주지 않는다', async () => {
    const view = await render(<StoryEditorScreen key="1" storyId="1" onBack={jest.fn()} />);
    await openTab('유저 프로필');
    await addPreset('여행자');

    await view.rerender(<StoryEditorScreen key="2" storyId="2" onBack={jest.fn()} />);
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
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} />);
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
