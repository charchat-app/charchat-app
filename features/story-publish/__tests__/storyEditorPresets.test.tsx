// CREATE-US-05/07 편집 화면 유저 프로필 프리셋: 공통 저장(/creation)으로 불러오고 기본 정보와 한 요청으로 저장한다.
// 서버 프로토타입 계약(presets·basic 선택 영역) 기준으로 앱이 보내는 요청과 화면 반영을 검증한다.
// 실제 서버와 맞춰 본 결과가 아니다.
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as baseRender, screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

import { defaultExpression, toExpressionRow } from '@/shared/story-types';
import { MAX_PRESET_TEXT_LENGTH } from '@/shared/story-types/presets';

import { StoryEditorScreen } from '../components/StoryEditorScreen';
import type { StoryImagesSnapshot } from '../imagesRepository';
import type { EditorStory } from '../types';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));
jest.mock('@/lib/api-client', () => ({ ...jest.requireActual('@/lib/api-client'), apiRequest: jest.fn() }));
jest.mock('../commonRepository', () => {
  const actual = jest.requireActual<typeof import('../commonRepository')>('../commonRepository');
  return { ...actual, createCommonSaveRepository: () => actual.createCommonSaveRepository('http://api.test/api/v1') };
});
// eslint-disable-next-line import/first
import { ApiError, apiRequest } from '@/lib/api-client';
// eslint-disable-next-line import/first
import * as ImagePicker from 'expo-image-picker';
// eslint-disable-next-line import/first
import { manipulateAsync } from 'expo-image-manipulator';

notifyManager.setScheduler((callback) => callback());
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const render = (element: ReactElement) => baseRender(element, { wrapper });
const apiMock = apiRequest as jest.Mock;

const CREATION = 'GET /creation/stories/1/creation';
const SAVE = 'PUT /creation/stories/1/creation';
const BASIC = 'PUT /creation/stories/1';

type Init = { method?: string; body?: string; headers?: HeadersInit };
type Handler = (init: Init) => unknown;
let handlers: Record<string, Handler[]>;
let calls: { route: string; init: Init }[];

/** 경로별 응답을 차례로 꺼낸다. 마지막 응답은 계속 쓴다. */
function on(route: string, ...responses: Handler[]) {
  handlers[route] = [...(handlers[route] ?? []), ...responses];
}
const bodyOf = (route: string, index = 0) =>
  JSON.parse(calls.filter((c) => c.route === route)[index].init.body ?? '{}') as Record<string, unknown>;
const callsTo = (route: string) => calls.filter((c) => c.route === route).length;

const { story_id: _storyId, ...expression } = toExpressionRow('1', defaultExpression());

type PresetDto = {
  id: number;
  name: string | null;
  image_id: number | null;
  description: string | null;
  image_url?: string | null;
};
function creationDto(
  presets: PresetDto[] | undefined,
  extra: Record<string, unknown> = {},
  characters = [{ id: 11, name: '루나', position: 0 }],
) {
  return {
    story_id: 1,
    title: '스토리',
    save_state: 'draft',
    saved_at: '2026-11-17T00:00:00Z',
    expression,
    characters,
    fewshots: [],
    intros: [],
    relations: [],
    affinities: [],
    ...(presets === undefined ? {} : { presets }),
    ...extra,
  };
}
/** 저장 요청에 응답한다: 보낸 Idempotency-Key를 request_id로 돌려주고, 보낸 프리셋에 서버 id를 붙인다. */
function echoSave(extra: Record<string, unknown> = {}, nextId = 100): Handler {
  return (init) => {
    const body = JSON.parse(init.body ?? '{}') as { presets?: (Omit<PresetDto, 'id'> & { id: number | null })[] };
    const key = new Headers(init.headers).get('Idempotency-Key');
    let next = nextId;
    return creationDto(
      body.presets?.map((p) => ({ ...p, id: p.id ?? next++ })),
      { request_id: key, ...extra },
    );
  };
}

function storyOf(story: Partial<EditorStory> = {}): EditorStory {
  return {
    id: '1',
    title: '스토리',
    subtitle: '',
    world: '',
    tags: [],
    characters: [{ id: '11', name: '루나', detail: '' }],
    saveState: '임시 저장',
    updatedAt: '2026-11-17T00:00:00Z',
    issues: [],
    ...story,
  };
}
function seed(story: Partial<EditorStory> = {}) {
  client.setQueryData<EditorStory>(['stories', 'detail', '1'], storyOf(story));
  const images: StoryImagesSnapshot = {
    saveState: 'draft',
    savedAt: '2026-11-17T00:00:00Z',
    workingCopySavedAt: null,
    values: { story: [], characters: [{ characterId: '11', name: '루나', images: [] }] },
  };
  client.setQueryData(['stories', 'images', '1'], images);
}

const STORED: PresetDto[] = [
  { id: 5, name: '{{user}}', image_id: 3, description: '여행자' },
  { id: 6, name: '기사', image_id: 4, description: null },
];

beforeEach(() => {
  client.clear();
  handlers = {};
  calls = [];
  apiMock.mockReset();
  apiMock.mockImplementation(async (path: string, init: Init = {}) => {
    const route = `${init.method ?? 'GET'} ${path}`;
    calls.push({ route, init });
    const queue = handlers[route];
    if (!queue?.length) throw new Error(`처리하지 않은 요청: ${route}`);
    const handler = queue.length > 1 ? queue.shift()! : queue[0];
    return handler(init);
  });
  // 저장 뒤 상세·목록·사진 재조회
  on('GET /creation/stories/1', () => ({
    id: 1,
    title: '스토리',
    subtitle: null,
    world_description: null,
    tags: [],
    characters: [{ id: 11, name: '루나', description: null }],
    save_state: 'draft',
    saved_at: '2026-11-18T00:00:00Z',
    issues: [],
  }));
  on('GET /creation/stories', () => []);
  on('GET /creation/stories/1/images', () => ({
    story_id: 1,
    save_state: 'draft',
    saved_at: '2026-11-17T00:00:00Z',
    story_images: [],
    characters: [{ character_id: 11, name: '루나', images: [] }],
    characters_missing_images: [],
  }));
});

async function openProfile() {
  await fireEvent.press(screen.getByRole('tab', { name: '유저 프로필' }));
}
/**
 * 하단 기본 저장 버튼(미등록 「임시 저장」, 비공개·공개 「변경 내용 저장」, 실패 뒤 「다시 저장」)을 누른다.
 * 비공개·공개 스토리의 유저 프로필 탭에는 별도 「임시 저장」(CREATE-US-05-AC06)이 앞에 함께 있으므로 마지막 버튼을 누른다.
 */
async function pressSave() {
  const buttons = screen.getAllByRole('button', { name: /^(임시 저장|변경 내용 저장|다시 저장)$/ });
  await act(async () => {
    await fireEvent.press(buttons[buttons.length - 1]);
  });
}
const presetNames = () => screen.getAllByLabelText(/^프로필 \d+ 이름$/).map((el) => el.props.value as string);
const screenEl = <StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} />;

describe('CREATE-US-05 불러오기·복원', () => {
  it('공통 저장 조회의 프리셋을 순서·{{user}} 원문 그대로 복원한다', async () => {
    seed();
    on(CREATION, () => creationDto(STORED));
    await render(screenEl);
    await openProfile();

    expect(presetNames()).toEqual(['{{user}}', '기사']);
    expect(screen.getByLabelText('프로필 1 상세').props.value).toBe('여행자');
    // {{user}} 그대로인 이름은 "플레이하는 유저 이름 사용하기"가 켜진 상태다
    expect(
      screen.getByRole('button', { name: '프로필 1 플레이하는 유저 이름 사용하기' }).props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(
      screen.getByRole('button', { name: '프로필 2 플레이하는 유저 이름 사용하기' }).props.accessibilityState,
    ).toMatchObject({ selected: false });
    expect(callsTo(CREATION)).toBe(1);
  });

  describe('사진 미리보기: 응답 프리셋의 image_url(서버 상대 경로, 읽기 전용)', () => {
    const API = 'http://api.test';
    const previews = () => screen.queryAllByTestId(/^preset-photo-/);

    it('CREATE-US-05: 새로 불러온 공통 저장 조회의 image_url로 사진을 다시 보여 준다', async () => {
      seed();
      on(CREATION, () =>
        creationDto([
          { ...STORED[0], image_url: '/api/v1/creation/image-files/3' },
          { ...STORED[1], image_url: null },
          { id: 7, name: '상인', image_id: null, description: null, image_url: null },
        ]),
      );
      await render(screenEl);
      await openProfile();

      // 서버 주소 기준 전체 주소로 바꿔 ServerImage(인증 헤더)로 불러온다. url이 없는 사진은 미리보기가 비어 있다
      expect(previews().map((el) => (el.props.source as { uri: string }).uri)).toEqual([
        `${API}/api/v1/creation/image-files/3`,
      ]);
    });

    it('CREATE-US-05: image_url을 받아도 저장 요청에는 image_id만 보낸다', async () => {
      seed();
      on(CREATION, () => creationDto([{ ...STORED[0], image_url: '/api/v1/creation/image-files/3' }]));
      on(SAVE, echoSave());
      await render(screenEl);
      await openProfile();
      await fireEvent.changeText(screen.getByLabelText('프로필 1 상세'), '먼 길의 여행자');
      await pressSave();

      expect(bodyOf(SAVE).presets).toEqual([{ id: 5, name: '{{user}}', image_id: 3, description: '먼 길의 여행자' }]);
    });

    it('CREATE-US-05: image_url이 없는 이전 응답은 업로드한 사진을 이미지 id로 이어 보여 준다', async () => {
      seed();
      on(CREATION, () => creationDto([STORED[1]]));
      on(SAVE, echoSave()); // 응답에 image_url 없음(이전 서버)
      on('POST /creation/images?target=profile', () => ({
        image_id: 77,
        mime_type: 'image/png',
        byte_size: 10,
        url: `${API}/api/v1/creation/image-files/77`,
      }));
      jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
        canceled: false,
        assets: [
          { uri: 'file:///p.png', mimeType: 'image/png', fileName: 'p.png', fileSize: 1000, width: 400, height: 400 },
        ],
      } as ImagePicker.ImagePickerResult);
      jest.mocked(manipulateAsync).mockResolvedValue({ uri: 'file:///c.png', width: 400, height: 400 });
      await render(screenEl);
      await openProfile();
      expect(previews()).toHaveLength(0);

      await act(async () => {
        await fireEvent.press(screen.getByLabelText('프로필 1 이미지 선택'));
      });
      await act(async () => {
        await fireEvent.press(screen.getByLabelText('확인'));
      });
      await pressSave();

      expect(bodyOf(SAVE).presets).toEqual([{ id: 6, name: '기사', image_id: 77, description: null }]);
      expect(previews().map((el) => (el.props.source as { uri: string }).uri)).toEqual([
        `${API}/api/v1/creation/image-files/77`,
      ]);
    }, 20000);
  });

  it('응답에 presets가 없으면 빈 목록으로 지어내지 않고 편집·저장을 막는다', async () => {
    seed();
    on(CREATION, () => creationDto(undefined));
    on(BASIC, () => ({
      id: 1,
      title: '스토리',
      subtitle: null,
      world_description: null,
      tags: [],
      characters: [{ id: 11, name: '루나', description: null }],
      save_state: 'draft',
      saved_at: '2026-11-18T00:00:00Z',
      issues: [],
    }));
    await render(screenEl);
    await openProfile();
    expect(screen.queryByText('아직 추천 프로필이 없어요.')).toBeNull();
    expect(screen.getByText(/유저 프로필을 불러오지 못했어요/)).toBeTruthy();

    // 기본 정보 저장은 기존 경로로 동작하고, 공통 저장은 보내지 않는다
    await pressSave();
    expect(callsTo(BASIC)).toBe(1);
    expect(callsTo(SAVE)).toBe(0);
  });

  it('불러오기에 실패하면 오류와 다시 시도를 보여 주고, 다시 시도하면 채운다', async () => {
    seed();
    on(
      CREATION,
      () => {
        throw new ApiError(500, 'INTERNAL', '서버 오류');
      },
      () => creationDto(STORED),
    );
    await render(screenEl);
    await openProfile();
    expect(screen.getByText(/서버 오류/)).toBeTruthy();

    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: '프로필 다시 불러오기' }));
    });
    expect(presetNames()).toEqual(['{{user}}', '기사']);
  });

  it('스토리 id가 서버 형식이 아니면 요청하지 않고 오류로 보여 준다', async () => {
    client.setQueryData<EditorStory>(['stories', 'detail', 'seed-1'], { ...storyOf(), id: 'seed-1' });
    client.setQueryData(['stories', 'images', 'seed-1'], {
      saveState: 'draft',
      savedAt: '2026-11-17T00:00:00Z',
      workingCopySavedAt: null,
      values: { story: [], characters: [] },
    });
    await render(<StoryEditorScreen storyId="seed-1" onBack={jest.fn()} onDeleted={jest.fn()} />);
    await openProfile();
    expect(screen.getByText(/스토리 ID를 확인해 주세요/)).toBeTruthy();
    expect(calls.some((c) => c.route.includes('/creation/stories/seed-1/creation'))).toBe(false);
  });
});

describe('CREATE-US-05/07 저장: 기본 정보와 같은 저장 의도로 한 요청에', () => {
  it('바뀐 프리셋이 없으면 공통 저장을 보내지 않고 기존 기본 정보 저장을 쓴다', async () => {
    seed();
    on(CREATION, () => creationDto(STORED));
    on(BASIC, () => ({
      id: 1,
      title: '스토리',
      subtitle: null,
      world_description: null,
      tags: [],
      characters: [{ id: 11, name: '루나', description: null }],
      save_state: 'draft',
      saved_at: '2026-11-18T00:00:00Z',
      issues: [],
    }));
    await render(screenEl);
    await pressSave();
    expect(callsTo(BASIC)).toBe(1);
    expect(callsTo(SAVE)).toBe(0);
  });

  it('프리셋을 고치면 최신 2~4번을 다시 불러와 기본 정보·프리셋과 함께 한 번에 보내고, 정본으로 복원한다', async () => {
    seed();
    on(CREATION, () => creationDto(STORED));
    on(SAVE, echoSave());
    await render(screenEl);
    await openProfile();
    await fireEvent.changeText(screen.getByLabelText('프로필 2 상세'), '왕국 기사');
    await fireEvent.press(screen.getByRole('button', { name: '+ 프로필 추가' }));
    await fireEvent.changeText(screen.getByLabelText('프로필 3 이름'), '새 손님');

    await pressSave();

    expect(callsTo(BASIC)).toBe(0);
    expect(callsTo(CREATION)).toBe(2); // 처음 불러오기 + 저장 직전 최신 확인
    expect(callsTo(SAVE)).toBe(1);
    const body = bodyOf(SAVE);
    // CREATE-US-07-AC03/07: 편집 화면은 2~4번을 편집하지 않으므로 preserve_scene을 싣는다(호환용 2~4번도 함께)
    expect(body).toMatchObject({
      save_state: 'draft',
      kind: 'temporary',
      mode: 'manual',
      expression,
      preserve_scene: true,
    });
    expect(body.presets).toEqual([
      { id: 5, name: '{{user}}', image_id: 3, description: '여행자' },
      { id: 6, name: '기사', image_id: 4, description: '왕국 기사' },
      { id: null, name: '새 손님', image_id: null, description: null },
    ]);
    expect(body.basic).toEqual({
      title: '스토리',
      subtitle: null,
      world_description: null,
      tags: [],
      characters: [{ id: 11, name: '루나', description: null }],
    });
    expect(presetNames()).toEqual(['{{user}}', '기사', '새 손님']);

    // 정본으로 바꿨으므로 다시 저장해도 새 프로필을 또 만들지 않는다(바뀐 것이 없어 공통 저장을 보내지 않는다)
    on(BASIC, () => ({
      id: 1,
      title: '스토리',
      subtitle: null,
      world_description: null,
      tags: [],
      characters: [{ id: 11, name: '루나', description: null }],
      save_state: 'draft',
      saved_at: '2026-11-18T00:00:00Z',
      issues: [],
    }));
    await pressSave();
    expect(callsTo(SAVE)).toBe(1);
  });

  it('마지막 프리셋을 지우면 빈 배열을 명시해 보낸다', async () => {
    seed();
    on(CREATION, () => creationDto([STORED[0]]));
    on(SAVE, echoSave());
    await render(screenEl);
    await openProfile();
    await fireEvent.press(screen.getByRole('button', { name: '프로필 1 삭제' }));

    await pressSave();

    expect(bodyOf(SAVE).presets).toEqual([]);
    expect(screen.getByText('아직 추천 프로필이 없어요.')).toBeTruthy();
  });

  it('사진을 바꾸면 바뀐 이미지 id를 같은 프로필 id로 보낸다', async () => {
    seed();
    on(CREATION, () => creationDto([STORED[1]]));
    on(SAVE, echoSave());
    on('POST /creation/images?target=profile', () => ({
      image_id: 77,
      mime_type: 'image/png',
      byte_size: 10,
      url: 'http://api.test/api/v1/creation/image-files/77',
    }));
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///p.png', mimeType: 'image/png', fileName: 'p.png', fileSize: 1000, width: 400, height: 400 },
      ],
    } as ImagePicker.ImagePickerResult);
    jest.mocked(manipulateAsync).mockResolvedValue({ uri: 'file:///c.png', width: 400, height: 400 });
    await render(screenEl);
    await openProfile();

    await act(async () => {
      await fireEvent.press(screen.getByLabelText('프로필 1 이미지 선택'));
    });
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('확인'));
    });
    await pressSave();

    expect(bodyOf(SAVE).presets).toEqual([{ id: 6, name: '기사', image_id: 77, description: null }]);
  }, 20000);

  it('저장 직전 다시 불러온 프리셋이 처음과 다르면(다른 곳에서 수정) 덮어쓰지 않는다', async () => {
    seed();
    on(
      CREATION,
      () => creationDto(STORED),
      () => creationDto([STORED[1]]),
    );
    on(SAVE, echoSave());
    await render(screenEl);
    await openProfile();
    await fireEvent.changeText(screen.getByLabelText('프로필 2 상세'), '왕국 기사');

    await pressSave();

    expect(callsTo(SAVE)).toBe(0);
    expect(screen.getByText(/다른 곳에서 유저 프로필이 바뀌어 저장하지 않았어요/)).toBeTruthy();
    expect(screen.getByLabelText('프로필 2 상세').props.value).toBe('왕국 기사');
  });

  it('서버가 거절하면 입력을 그대로 두고 안내한다. 다시 저장은 새 요청이다', async () => {
    seed();
    on(CREATION, () => creationDto(STORED));
    on(
      SAVE,
      () => {
        throw new ApiError(422, 'PRESET_NAME_DUPLICATE', '프로필 이름이 겹쳐요.');
      },
      echoSave(),
    );
    await render(screenEl);
    await openProfile();
    await fireEvent.changeText(screen.getByLabelText('프로필 2 이름'), '기사단장');

    await pressSave();
    expect(screen.getByText('프로필 이름이 겹쳐요.')).toBeTruthy();
    expect(presetNames()).toEqual(['{{user}}', '기사단장']);

    await pressSave();
    expect(callsTo(SAVE)).toBe(2);
    const keys = calls.filter((c) => c.route === SAVE).map((c) => new Headers(c.init.headers).get('Idempotency-Key'));
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('성공 여부를 모르면 입력을 잠그고, 다시 저장하면 같은 요청·같은 키로 보낸다', async () => {
    seed();
    on(CREATION, () => creationDto(STORED));
    on(
      SAVE,
      () => {
        throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결하지 못했습니다.');
      },
      echoSave(),
    );
    await render(screenEl);
    await openProfile();
    await fireEvent.press(screen.getByRole('button', { name: '+ 프로필 추가' }));
    await fireEvent.changeText(screen.getByLabelText('프로필 3 이름'), '새 손님');

    await pressSave();
    expect(screen.getByText(/저장 성공 여부를 확인하지 못했어요/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ 프로필 추가' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });

    await pressSave();
    expect(callsTo(SAVE)).toBe(2);
    expect(callsTo(CREATION)).toBe(2); // 다시 보낼 때는 새로 불러오지 않는다
    expect(bodyOf(SAVE, 1)).toEqual(bodyOf(SAVE, 0));
    // CREATE-US-07-AC03/07: 다시 보낼 때도 preserve_scene을 그대로 싣는다
    expect(bodyOf(SAVE, 1)).toMatchObject({ preserve_scene: true });
    const keys = calls.filter((c) => c.route === SAVE).map((c) => new Headers(c.init.headers).get('Idempotency-Key'));
    expect(keys[0]).toBe(keys[1]);
    expect(presetNames()).toEqual(['{{user}}', '기사', '새 손님']);
  });

  it('새 캐릭터가 있는 미등록 스토리는 응답의 캐릭터 id를 입력에 붙인다', async () => {
    seed();
    on(CREATION, () => creationDto(STORED));
    on(SAVE, (init) => {
      const { mode } = JSON.parse(init.body ?? '{}') as { mode?: string };
      const savedCreation = {
        ...(mode === 'auto'
          ? creationDto(STORED, { request_id: new Headers(init.headers).get('Idempotency-Key') })
          : (echoSave()(init) as Record<string, unknown>)),
        characters: [
          { id: 11, name: '루나', position: 0 },
          { id: 12, name: '세라', position: 1 },
        ],
      };
      handlers[CREATION] = [() => savedCreation];
      return savedCreation;
    });
    on(BASIC, () => {
      throw new Error('기본 정보만 따로 보내면 안 된다');
    });
    await render(screenEl);
    await fireEvent.press(screen.getByText('+ 캐릭터 추가'));
    await fireEvent.changeText(screen.getByLabelText('캐릭터 2 이름'), '세라');
    await openProfile();
    await fireEvent.changeText(screen.getByLabelText('프로필 2 이름'), '기사단장');

    await pressSave();
    expect((bodyOf(SAVE).basic as { characters: unknown[] }).characters).toEqual([
      { id: 11, name: '루나', description: null },
      { id: null, name: '세라', description: null },
    ]);

    // 다음 저장은 같은 캐릭터를 수정한다(새로 만들지 않는다)
    await fireEvent.changeText(screen.getByLabelText('프로필 2 이름'), '기사');
    await pressSave();
    expect(bodyOf(SAVE, 0)).toMatchObject({ mode: 'auto', kind: 'temporary' });
    for (const index of [1, 2]) {
      expect(
        (bodyOf(SAVE, index).basic as { characters: { id: number | null }[] }).characters.map((c) => c.id),
      ).toEqual([11, 12]);
    }
  });
});

describe('CREATE-US-05/07 완성 저장 스토리: 한 요청으로 반영할 수 없는 변경은 보내지 않는다', () => {
  const completed = () => seed({ saveState: '비공개' });
  const privateDto = (presets: PresetDto[], extra: Record<string, unknown> = {}) =>
    creationDto(presets, { save_state: 'private', ...extra });

  it('바뀐 프리셋만 있으면 지금 공개 상태 그대로 저장으로 보낸다', async () => {
    completed();
    on(CREATION, () => privateDto(STORED));
    on(SAVE, echoSave({ save_state: 'private' }));
    await render(screenEl);
    await openProfile();
    await fireEvent.changeText(screen.getByLabelText('프로필 2 이름'), '기사단장');
    await pressSave();
    // CREATE-US-07-AC03/07: 최종 저장에도 preserve_scene을 싣는다
    expect(bodyOf(SAVE)).toMatchObject({ save_state: 'private', kind: 'save', preserve_scene: true });
  });

  it('새 캐릭터에 얼굴 이미지가 없으면 완성 조건을 충족하지 못해 보내지 않는다(CREATE-US-07-AC08)', async () => {
    completed();
    on(CREATION, () => privateDto(STORED));
    await render(screenEl);
    await fireEvent.press(screen.getByText('+ 캐릭터 추가'));
    await pressSave();
    expect(callsTo(SAVE)).toBe(0);
    expect(callsTo(BASIC)).toBe(0);
    expect(screen.getByText(/새 캐릭터/)).toBeTruthy();
  });

  it('임시 저장본(2~4번·사진)이 남아 있으면 함께 반영되므로 보내지 않는다', async () => {
    completed();
    on(
      CREATION,
      () => privateDto(STORED),
      () => privateDto(STORED, { working_copy_saved_at: '2026-11-18T00:00:00Z' }),
    );
    await render(screenEl);
    await openProfile();
    await fireEvent.changeText(screen.getByLabelText('프로필 2 이름'), '기사단장');
    await pressSave();
    expect(callsTo(SAVE)).toBe(0);
    expect(screen.getByText(/임시 저장한 내용/)).toBeTruthy();
  });
});

describe('CREATE-US-05-AC06 임시 저장: 미완성 프리셋을 원문 그대로 kind temporary로 보낸다', () => {
  // 사진·이름이 없고 상세가 글자 수 제한을 넘는 프리셋(완성 저장 조건을 충족하지 못하는 원문)
  const INCOMPLETE: PresetDto = { id: 7, name: '상인', image_id: null, description: null };
  const OVERLONG = '가'.repeat(MAX_PRESET_TEXT_LENGTH + 1);
  const sentToImages = () => calls.filter((c) => c.route.includes('/images') && c.route.split(' ')[0] !== 'GET');

  async function editIncompletePreset() {
    await openProfile();
    await fireEvent.changeText(screen.getByLabelText('프로필 2 이름'), '');
    await fireEvent.changeText(screen.getByLabelText('프로필 2 상세'), OVERLONG);
  }
  async function pressTemporary() {
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: '임시 저장' }));
    });
  }

  it.each([
    ['비공개', 'private'],
    ['공개', 'public'],
  ] as const)(
    'CREATE-US-05-AC06: %s 스토리에서 「임시 저장」을 누르면 프리셋 원문과 공개 상태 그대로 kind temporary로 보낸다',
    async (label, state) => {
      seed({ saveState: label });
      on(CREATION, () => creationDto([STORED[0], INCOMPLETE], { save_state: state }));
      on(SAVE, echoSave({ save_state: state }));
      await render(screenEl);
      await editIncompletePreset();

      // 「변경 내용 저장」(완성 저장)이 아니라 별도의 「임시 저장」을 누른다
      expect(screen.getByRole('button', { name: '변경 내용 저장' })).toBeTruthy();
      await pressTemporary();

      expect(callsTo(SAVE)).toBe(1);
      const body = bodyOf(SAVE);
      expect(body).toMatchObject({ kind: 'temporary', save_state: state, preserve_scene: true });
      // 비우거나 자르거나 막지 않고 입력 원문 그대로 보낸다
      expect(body.presets).toEqual([
        { id: 5, name: '{{user}}', image_id: 3, description: '여행자' },
        { id: 7, name: null, image_id: null, description: OVERLONG },
      ]);
      // images는 「저장」(kind save)에서만 받으므로 임시 저장에는 싣지 않는다
      expect(body).not.toHaveProperty('images');
      // 임시 저장 뒤 기본 정보 저장·사진 저장을 따로 보내지 않는다
      expect(callsTo(BASIC)).toBe(0);
      expect(sentToImages()).toEqual([]);
      // 공개 상태는 바뀌지 않고, 입력은 원문 그대로 남는다
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getByLabelText('프로필 2 이름').props.value).toBe('');
      expect(screen.getByLabelText('프로필 2 상세').props.value).toBe(OVERLONG);
    },
  );

  it('임시 저장 거절 후에는 최종 저장과 임시 저장 재시도를 구분한다', async () => {
    seed({ saveState: '비공개' });
    on(CREATION, () => creationDto([STORED[0], INCOMPLETE], { save_state: 'private' }));
    on(
      SAVE,
      () => {
        throw new ApiError(422, 'INVALID_INPUT', '임시 저장을 완료하지 못했어요.');
      },
      echoSave({ save_state: 'private' }),
    );
    await render(screenEl);
    await editIncompletePreset();
    await pressTemporary();
    expect(screen.getByRole('button', { name: '변경 내용 저장' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '임시 저장 다시 시도' }));
    expect(callsTo(SAVE)).toBe(2);
    expect(bodyOf(SAVE, 1)).toMatchObject({ kind: 'temporary', save_state: 'private' });
  });

  it('CREATE-US-05-AC06: 미등록 스토리의 하단 「임시 저장」도 프리셋을 고쳤으면 kind temporary를 명시해 보낸다', async () => {
    seed();
    on(CREATION, () => creationDto([STORED[0], INCOMPLETE]));
    on(SAVE, echoSave());
    await render(screenEl);
    await editIncompletePreset();

    await pressTemporary();

    expect(callsTo(SAVE)).toBe(1);
    const body = bodyOf(SAVE);
    expect(body.kind).toBe('temporary');
    expect(body.save_state).toBe('draft');
    expect(body.presets).toEqual([
      { id: 5, name: '{{user}}', image_id: 3, description: '여행자' },
      { id: 7, name: null, image_id: null, description: OVERLONG },
    ]);
    expect(callsTo(BASIC)).toBe(0);
    expect(sentToImages()).toEqual([]);
  });
});

describe('동시 쓰기', () => {
  it('저장 중 두 번 눌러도 공통 저장은 한 번만 보낸다', async () => {
    seed();
    let finish: (value: unknown) => void = () => undefined;
    on(CREATION, () => creationDto(STORED));
    on(SAVE, (init) => new Promise((resolve) => (finish = () => resolve(echoSave()(init)))));
    await render(screenEl);
    await openProfile();
    await fireEvent.changeText(screen.getByLabelText('프로필 2 이름'), '기사단장');
    const button = screen.getByRole('button', { name: '임시 저장' });
    await act(async () => {
      void fireEvent.press(button);
      void fireEvent.press(button);
    });
    expect(screen.getByRole('button', { name: '+ 프로필 추가' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await act(async () => finish(undefined));
    expect(callsTo(SAVE)).toBe(1);
  });
});
