// CREATE-US-05-AC06·AC07 이미지 업로드와 수동 저장의 경쟁 조건.
// 앨범 고르기·자르기·업로드 promise를 API 경계(expo-image-picker, expo-image-manipulator, apiRequest)에서 붙잡아 둔 채
// 「임시 저장」·「변경 내용 저장」을 눌러도 이전 이미지로 저장 요청을 보내지 않고, 풀어 준 뒤에는 새 이미지 id를 보내는지 확인한다.
// 탭 전환으로 업로드 주인(편집기)이 언마운트되어 업로드 결과를 잃지 않는지, 취소·실패 뒤 다시 저장할 수 있는지도 본다.
// apiRequest를 대신한 가짜 응답으로 검증한 결과이며, 실제 서버와 맞춰 본 결과가 아니다.
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as baseRender, screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

import { defaultExpression, toExpressionRow } from '@/shared/story-types';

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
const IMAGES_GET = 'GET /creation/stories/1/images';
const IMAGES_PUT = 'PUT /creation/stories/1/images';
const UPLOAD_PROFILE = 'POST /creation/images?target=profile';
const UPLOAD_CHARACTER = 'POST /creation/images?target=character';
const UPLOAD_STORY = 'POST /creation/images?target=story';
const UPLOAD_WAIT = /이미지를 올리는 중이에요/;

type Init = { method?: string; body?: string; headers?: HeadersInit };
type Handler = (init: Init) => unknown;
let handlers: Record<string, Handler[]>;
let calls: { route: string; init: Init }[];

function on(route: string, ...responses: Handler[]) {
  handlers[route] = [...(handlers[route] ?? []), ...responses];
}
const bodyOf = (route: string, index = 0) =>
  JSON.parse(calls.filter((c) => c.route === route)[index].init.body ?? '{}') as Record<string, unknown>;
const callsTo = (route: string) => calls.filter((c) => c.route === route).length;
/** 저장 계열 요청(공통 저장·기본 정보·사진 목록 쓰기) 수 */
const writes = () => callsTo(SAVE) + callsTo(BASIC) + callsTo(IMAGES_PUT);

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const { story_id: _storyId, ...expression } = toExpressionRow('1', defaultExpression());
const imageFile = (id: number) => ({
  image_id: id,
  mime_type: 'image/png',
  byte_size: 10,
  url: `http://api.test/api/v1/creation/image-files/${id}`,
});
const PICKED = {
  canceled: false,
  assets: [{ uri: 'file:///p.png', mimeType: 'image/png', fileName: 'p.png', fileSize: 1000, width: 400, height: 400 }],
} as ImagePicker.ImagePickerResult;
const CROPPED = { uri: 'file:///c.png', width: 400, height: 400 };

type PresetDto = { id: number; name: string | null; image_id: number | null; description: string | null };
/** 저장된 프리셋: 이전 이미지 4번이 붙어 있다. */
const STORED: PresetDto[] = [{ id: 6, name: '기사', image_id: 4, description: null }];

/** 서버 상태(가짜): 저장된 캐릭터와 얼굴 이미지. */
let server: { characters: { id: number; name: string }[]; faces: Record<number, number[]>; story: number[] };

function creationDto(extra: Record<string, unknown> = {}) {
  return {
    story_id: 1,
    title: '스토리',
    save_state: 'private',
    saved_at: '2026-11-17T00:00:00Z',
    expression,
    characters: server.characters.map((c, position) => ({ ...c, position })),
    fewshots: [],
    intros: [],
    relations: [],
    affinities: [],
    presets: STORED,
    ...extra,
  };
}
function imagesDto() {
  return {
    story_id: 1,
    save_state: 'private',
    saved_at: '2026-11-17T00:00:00Z',
    story_images: server.story.map(imageFile),
    characters: server.characters.map((c) => ({
      character_id: c.id,
      name: c.name,
      images: (server.faces[c.id] ?? []).map(imageFile),
    })),
    characters_missing_images: [],
  };
}
function detailDto() {
  return {
    id: 1,
    title: '스토리',
    subtitle: null,
    world_description: null,
    tags: [],
    characters: server.characters.map((c) => ({ ...c, description: null })),
    save_state: 'private',
    saved_at: '2026-11-18T00:00:00Z',
    issues: [],
  };
}
type SentBody = {
  basic?: { characters: { id: number | null; name: string | null }[] };
  images?: { characters?: { basic_index?: number; character_id?: number; image_ids: number[] }[] };
  presets?: (Omit<PresetDto, 'id'> & { id: number | null })[];
};
/** 서버처럼 한 번에 반영한다: 새 캐릭터에 id를 주고 얼굴·표지 목록을 연결한다. */
const atomicSave: Handler = (init) => {
  const body = JSON.parse(init.body ?? '{}') as SentBody & { images?: { story_image_ids?: number[] | null } };
  let next = 12;
  const roster = (body.basic?.characters ?? server.characters).map((c) => ({
    id: c.id ?? next++,
    name: c.name ?? '',
  }));
  for (const entry of body.images?.characters ?? []) {
    const target = entry.basic_index !== undefined ? roster[entry.basic_index].id : Number(entry.character_id);
    server.faces[target] = entry.image_ids;
  }
  const cover = body.images?.story_image_ids;
  if (cover !== undefined && cover !== null) server.story = cover;
  server.characters = roster;
  return creationDto({
    request_id: new Headers(init.headers).get('Idempotency-Key'),
    presets: body.presets ? body.presets.map((p) => ({ ...p, id: p.id ?? 100 })) : STORED,
  });
};

function seed() {
  client.setQueryData<EditorStory>(['stories', 'detail', '1'], {
    id: '1',
    title: '스토리',
    subtitle: '',
    world: '',
    tags: [],
    characters: [{ id: '11', name: '루나', detail: '' }],
    saveState: '비공개',
    updatedAt: '2026-11-17T00:00:00Z',
    issues: [],
  });
  const images: StoryImagesSnapshot = {
    saveState: 'private',
    savedAt: '2026-11-17T00:00:00Z',
    workingCopySavedAt: null,
    values: {
      story: [],
      characters: [
        {
          characterId: '11',
          name: '루나',
          images: [{ imageId: 3, mimeType: 'image/png', byteSize: 10, uri: 'http://api.test/x/3' }],
        },
      ],
    },
  };
  client.setQueryData(['stories', 'images', '1'], images);
}

beforeEach(() => {
  client.clear();
  handlers = {};
  calls = [];
  server = { characters: [{ id: 11, name: '루나' }], faces: { 11: [3] }, story: [] };
  apiMock.mockReset();
  apiMock.mockImplementation(async (path: string, init: Init = {}) => {
    const route = `${init.method ?? 'GET'} ${path}`;
    calls.push({ route, init });
    const queue = handlers[route];
    if (!queue?.length) throw new Error(`처리하지 않은 요청: ${route}`);
    const handler = queue.length > 1 ? queue.shift()! : queue[0];
    return handler(init);
  });
  on(CREATION, () => creationDto());
  on('GET /creation/stories/1', () => detailDto());
  on('GET /creation/stories', () => []);
  on(IMAGES_GET, () => imagesDto());
  on(SAVE, atomicSave);
  on(IMAGES_PUT, () => {
    throw new Error('원자 저장 경로에서 사진만 따로 저장하면 안 된다');
  });
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockReset();
  jest.mocked(manipulateAsync).mockReset();
});

/** 앨범 고르기·자르기·업로드를 각각 붙잡아 둔다. 업로드 경로는 대상별로 넘긴다. */
function holdUpload(uploadRoute: string) {
  const picker = deferred<ImagePicker.ImagePickerResult>();
  const crop = deferred<typeof CROPPED>();
  const upload = deferred<ReturnType<typeof imageFile>>();
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockImplementationOnce(() => picker.promise);
  jest.mocked(manipulateAsync).mockImplementationOnce(() => crop.promise);
  on(uploadRoute, () => upload.promise);
  return { picker, crop, upload };
}

const screenEl = <StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} />;

async function press(label: string | RegExp) {
  await act(async () => {
    await fireEvent.press(screen.getByLabelText(label));
  });
}
async function settle(job: () => void) {
  await act(async () => {
    job();
    await Promise.resolve();
  });
}
const pressTemporary = () => press('임시 저장');
const pressSave = () => press('변경 내용 저장');
async function openProfile() {
  await fireEvent.press(screen.getByRole('tab', { name: '유저 프로필' }));
}
const selectedTab = () =>
  ['유저 프로필', '기본 설정', '공개 범위'].find(
    (name) => screen.getByRole('tab', { name }).props.accessibilityState?.selected,
  );
const isDisabled = (label: string) => !!screen.getByRole('button', { name: label }).props.accessibilityState?.disabled;

/** 프로필을 고쳐 「임시 저장」이 보이게 한 뒤 프로필 1 이미지 업로드를 시작한다. */
async function startPresetUpload() {
  seed();
  const held = holdUpload(UPLOAD_PROFILE);
  await render(screenEl);
  await openProfile();
  await fireEvent.changeText(screen.getByLabelText('프로필 1 상세'), '왕국 기사');
  await press('프로필 1 이미지 선택');
  return held;
}

/** 붙잡힌 각 단계에서 두 수동 저장을 모두 눌러도 저장 요청이 나가지 않는지 확인한다. */
async function expectBothSavesHeld() {
  expect(isDisabled('임시 저장')).toBe(true);
  expect(isDisabled('변경 내용 저장')).toBe(true);
  expect(screen.getByText(UPLOAD_WAIT)).toBeTruthy();
  await pressTemporary();
  await pressSave();
  expect(writes()).toBe(0);
}

describe('CREATE-US-05-AC06·AC07 프리셋 이미지 업로드 중 수동 저장', () => {
  it.each([
    ['임시 저장', 'temporary'],
    ['변경 내용 저장', 'save'],
  ] as const)(
    'CREATE-US-05-AC06: 고르기·자르기·업로드가 끝나기 전에는 두 저장 모두 이전 이미지(4)를 보내지 않고, 끝난 뒤 「%s」은 새 id(77)를 보낸다',
    async (button, kind) => {
      const { picker, crop, upload } = await startPresetUpload();

      // 1) 앨범이 열려 있는 동안
      await expectBothSavesHeld();
      await settle(() => picker.resolve(PICKED));
      // 2) 자르기 창이 떠 있는 동안
      expect(screen.getByRole('button', { name: '확인' })).toBeTruthy();
      await expectBothSavesHeld();
      await press('확인');
      // 3) 자른 파일을 만드는 동안
      await expectBothSavesHeld();
      await settle(() => crop.resolve(CROPPED));
      // 4) 업로드 응답을 기다리는 동안
      expect(callsTo(UPLOAD_PROFILE)).toBe(1);
      await expectBothSavesHeld();

      await settle(() => upload.resolve(imageFile(77)));
      expect(screen.queryByText(UPLOAD_WAIT)).toBeNull();
      expect(isDisabled(button)).toBe(false);
      await press(button);

      expect(callsTo(SAVE)).toBe(1);
      const body = bodyOf(SAVE);
      expect(body.kind).toBe(kind);
      expect(body.presets).toEqual([{ id: 6, name: '기사', image_id: 77, description: '왕국 기사' }]);
    },
    20000,
  );

  it('CREATE-US-05-AC06: 업로드 시작과 같은 순간(다시 그리기 전)에 누른 저장도 보내지 않는다', async () => {
    seed();
    const { picker } = holdUpload(UPLOAD_PROFILE);
    await render(screenEl);
    await openProfile();
    await fireEvent.changeText(screen.getByLabelText('프로필 1 상세'), '왕국 기사');
    // 아직 활성 상태인 버튼을 미리 잡아 두고, 업로드 시작과 같은 act 안에서 누른다(사이에 다시 그리지 않는다).
    const select = screen.getByRole('button', { name: '프로필 1 이미지 선택' });
    const temporary = screen.getByRole('button', { name: '임시 저장' });
    const save = screen.getByRole('button', { name: '변경 내용 저장' });
    await act(async () => {
      const presses = [fireEvent.press(select), fireEvent.press(temporary), fireEvent.press(save)];
      await Promise.all(presses);
    });
    expect(writes()).toBe(0);
    await settle(() => picker.resolve({ canceled: true, assets: null } as ImagePicker.ImagePickerResult));
  }, 20000);

  describe('취소·실패하면 대기를 풀고 이전 이미지 그대로 저장할 수 있다', () => {
    it('앨범에서 취소', async () => {
      const { picker } = await startPresetUpload();
      await settle(() => picker.resolve({ canceled: true, assets: null } as ImagePicker.ImagePickerResult));
      expect(screen.queryByText(UPLOAD_WAIT)).toBeNull();
      await pressSave();
      expect(bodyOf(SAVE).presets).toEqual([{ id: 6, name: '기사', image_id: 4, description: '왕국 기사' }]);
    }, 20000);

    it('자르기 창에서 취소', async () => {
      const { picker } = await startPresetUpload();
      await settle(() => picker.resolve(PICKED));
      await press('취소');
      expect(screen.queryByText(UPLOAD_WAIT)).toBeNull();
      await pressTemporary();
      expect(bodyOf(SAVE)).toMatchObject({ kind: 'temporary' });
      expect(bodyOf(SAVE).presets).toEqual([{ id: 6, name: '기사', image_id: 4, description: '왕국 기사' }]);
    }, 20000);

    it('업로드 실패', async () => {
      const { picker, crop, upload } = await startPresetUpload();
      await settle(() => picker.resolve(PICKED));
      await press('확인');
      await settle(() => crop.resolve(CROPPED));
      await settle(() => upload.reject(new ApiError(413, 'IMAGE_TOO_LARGE', '5MB 이하만 올릴 수 있어요.')));
      expect(screen.getByText(/프로필 1 이미지: 5MB 이하만/)).toBeTruthy();
      expect(screen.queryByText(UPLOAD_WAIT)).toBeNull();
      await pressSave();
      expect(bodyOf(SAVE).presets).toEqual([{ id: 6, name: '기사', image_id: 4, description: '왕국 기사' }]);
    }, 20000);
  });

  it('CREATE-US-05-AC06: 업로드 중에는 탭을 바꾸지 않아 업로드 주인(편집기)이 언마운트되지 않고, 결과를 잃지 않는다', async () => {
    const { picker, crop, upload } = await startPresetUpload();
    await settle(() => picker.resolve(PICKED));

    // 자르기 창이 떠 있는 동안 다른 탭을 눌러도 머문다(자르기 창이 그대로 남는다)
    await fireEvent.press(screen.getByRole('tab', { name: '기본 설정' }));
    expect(selectedTab()).toBe('유저 프로필');
    expect(screen.getByRole('button', { name: '확인' })).toBeTruthy();

    await press('확인');
    await settle(() => crop.resolve(CROPPED));
    // 업로드 응답을 기다리는 동안에도 머문다
    await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
    expect(selectedTab()).toBe('유저 프로필');
    expect(screen.getByLabelText('프로필 1 상세')).toBeTruthy();

    await settle(() => upload.resolve(imageFile(77)));
    expect(screen.getByTestId('preset-photo-saved:6').props.source).toMatchObject({
      uri: 'http://api.test/api/v1/creation/image-files/77',
    });
    // 업로드가 끝나면 탭을 바꿀 수 있고, 돌아와도 새 이미지가 남아 있다
    await fireEvent.press(screen.getByRole('tab', { name: '기본 설정' }));
    expect(selectedTab()).toBe('기본 설정');
    await openProfile();
    await pressSave();
    expect(bodyOf(SAVE).presets).toEqual([{ id: 6, name: '기사', image_id: 77, description: '왕국 기사' }]);
  }, 20000);

  it('CREATE-US-05-AC06: 자르기·업로드 중 자르기 창 닫기 요청(onRequestClose)이 와도 끝날 때까지 저장을 막고, 끝난 뒤 새 id(77)를 보낸다', async () => {
    const { picker, crop, upload } = await startPresetUpload();
    await settle(() => picker.resolve(PICKED));
    await press('확인');
    const requestClose = async () => {
      let node = screen.getByTestId('crop-frame').parent;
      while (node && typeof node.props.onRequestClose !== 'function') node = node.parent;
      const close = node?.props.onRequestClose;
      expect(typeof close).toBe('function');
      await act(async () => close());
    };
    // 자른 파일을 만드는 동안 뒤로 가기
    await requestClose();
    await expectBothSavesHeld();
    await settle(() => crop.resolve(CROPPED));
    expect(callsTo(UPLOAD_PROFILE)).toBe(1);
    // 업로드 응답을 기다리는 동안 뒤로 가기
    await requestClose();
    await expectBothSavesHeld();

    await settle(() => upload.resolve(imageFile(77)));
    expect(screen.queryByText(UPLOAD_WAIT)).toBeNull();
    await pressSave();
    expect(bodyOf(SAVE).presets).toEqual([{ id: 6, name: '기사', image_id: 77, description: '왕국 기사' }]);
  }, 20000);

  it('업로드 중 화면이 언마운트되어도 끝난 업로드가 오류를 내지 않는다', async () => {
    const { picker, crop, upload } = await startPresetUpload();
    await settle(() => picker.resolve(PICKED));
    await press('확인');
    await settle(() => crop.resolve(CROPPED));
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await screen.unmount();
    await settle(() => upload.resolve(imageFile(77)));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    expect(writes()).toBe(0);
  }, 20000);
});

describe('CREATE-US-07-AC07 캐릭터·표지 이미지 업로드 중 수동 저장', () => {
  async function addCharacter(name: string) {
    await fireEvent.press(screen.getByText('+ 캐릭터 추가'));
    const inputs = screen.getAllByLabelText(/^캐릭터 \d+ 이름$/);
    await fireEvent.changeText(inputs[inputs.length - 1], name);
  }

  it('CREATE-US-07-AC07: 새 캐릭터 얼굴 업로드가 끝나기 전에는 저장하지 않고, 끝난 뒤 새 id(88)를 basic_index로 보낸다', async () => {
    seed();
    const { picker, crop, upload } = holdUpload(UPLOAD_CHARACTER);
    await render(screenEl);
    await addCharacter('세라');
    await press('세라 이미지 추가');

    expect(isDisabled('변경 내용 저장')).toBe(true);
    expect(screen.getByText(UPLOAD_WAIT)).toBeTruthy();
    await pressSave();
    await settle(() => picker.resolve(PICKED));
    await pressSave();
    // 자르기 창이 떠 있는 동안 다른 탭을 눌러도 머문다
    await fireEvent.press(screen.getByRole('tab', { name: '유저 프로필' }));
    expect(selectedTab()).toBe('기본 설정');
    await press('확인');
    await settle(() => crop.resolve(CROPPED));
    await pressSave();
    await fireEvent.press(screen.getByRole('tab', { name: '유저 프로필' }));
    expect(selectedTab()).toBe('기본 설정');
    // 이미지 없이 보냈다면 서버가 막는 저장이라 앱이 먼저 막은 안내가 나왔을 것이다. 요청도 안내도 없어야 한다.
    expect(writes()).toBe(0);
    expect(screen.queryByText(/캐릭터마다 이미지가 1장 이상 필요해요\. \(/)).toBeNull();

    await settle(() => upload.resolve(imageFile(88)));
    await pressSave();

    expect(callsTo(SAVE)).toBe(1);
    expect(bodyOf(SAVE).images).toEqual({ characters: [{ basic_index: 1, image_ids: [88] }] });
  }, 20000);

  it('CREATE-US-07-AC07: 업로드 중 이미지 목록 다시 불러오기가 실패해도 편집기가 남아 업로드 결과(88)를 잃지 않는다', async () => {
    seed();
    const { picker, crop, upload } = holdUpload(UPLOAD_CHARACTER);
    await render(screenEl);
    await addCharacter('세라');
    await press('세라 이미지 추가');
    await settle(() => picker.resolve(PICKED));
    await press('확인');
    await settle(() => crop.resolve(CROPPED));

    handlers[IMAGES_GET] = [
      () => {
        throw new Error('목록 실패');
      },
    ];
    await act(async () => {
      await client.refetchQueries({ queryKey: ['stories', 'images', '1'] });
    });
    expect(screen.getByText(/이미지를 불러오지 못했어요/)).toBeTruthy();
    // 편집기(업로드 주인)가 그대로 남아 대기를 유지한다
    expect(screen.getByLabelText('세라 이미지 추가')).toBeTruthy();
    expect(screen.getByText(UPLOAD_WAIT)).toBeTruthy();
    await pressSave();
    expect(writes()).toBe(0);

    await settle(() => upload.resolve(imageFile(88)));
    expect(screen.queryByText(UPLOAD_WAIT)).toBeNull();
    handlers[IMAGES_GET] = [() => imagesDto()];
    await pressSave();
    expect(callsTo(SAVE)).toBe(1);
    expect(bodyOf(SAVE).images).toEqual({ characters: [{ basic_index: 1, image_ids: [88] }] });
  }, 20000);

  it('CREATE-US-07-AC07: 표지 업로드가 끝나기 전에는 이전 표지로 저장하지 않고, 끝난 뒤 새 id(90)를 보낸다', async () => {
    seed();
    await render(screenEl);
    await addCharacter('세라');
    // 새 캐릭터 얼굴은 바로 올라가게 둔다(붙잡지 않는 경로)
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce(PICKED);
    jest.mocked(manipulateAsync).mockResolvedValueOnce(CROPPED);
    on(UPLOAD_CHARACTER, () => imageFile(88));
    await press('세라 이미지 추가');
    await press('확인');
    expect(screen.queryByText(UPLOAD_WAIT)).toBeNull();

    // 표지는 고르기·자르기·업로드를 붙잡는다
    const { picker, crop, upload } = holdUpload(UPLOAD_STORY);
    await press('스토리 이미지 추가');
    await pressSave();
    await settle(() => picker.resolve(PICKED));
    await press('확인');
    await pressSave();
    await settle(() => crop.resolve(CROPPED));
    await pressSave();
    expect(writes()).toBe(0);

    await settle(() => upload.resolve(imageFile(90)));
    await pressSave();
    expect(callsTo(SAVE)).toBe(1);
    expect(bodyOf(SAVE).images).toEqual({
      characters: [{ basic_index: 1, image_ids: [88] }],
      story_image_ids: [90],
    });
  }, 20000);
});
