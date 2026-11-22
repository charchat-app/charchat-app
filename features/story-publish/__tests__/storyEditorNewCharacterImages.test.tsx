// CREATE-US-07-AC07·AC08 비공개·공개 스토리의 새 캐릭터 + 얼굴 이미지(+ 프리셋)를 공통 「저장」 한 요청으로 반영한다.
// 서버 계약(wt-server-us05-07-integration save_visibility/schemas.py의 images.characters
// {basic_index | character_id, image_ids}, 선택 images.story_image_ids: 없음·null 유지, [] 비움) 기준으로
// 앱이 보내는 요청과 화면 반영을 검증한다. story_image_ids는 서버에 병행 추가 중인 계약이다.
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
// eslint-disable-next-line import/first
import { createCommonSaveRepository, type CommonSaveDocument } from '../commonRepository';

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
const UPLOAD = 'POST /creation/images?target=character';

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
const keysOf = (route: string) =>
  calls.filter((c) => c.route === route).map((c) => new Headers(c.init.headers).get('Idempotency-Key'));

const { story_id: _storyId, ...expression } = toExpressionRow('1', defaultExpression());
const imageFile = (id: number) => ({
  image_id: id,
  mime_type: 'image/png',
  byte_size: 10,
  url: `http://api.test/api/v1/creation/image-files/${id}`,
});

type PresetDto = { id: number; name: string | null; image_id: number | null; description: string | null };
const STORED: PresetDto[] = [{ id: 5, name: '기사', image_id: null, description: null }];

/** 서버 상태(가짜): 저장된 캐릭터와 얼굴 이미지. 성공한 저장만 바꾼다. */
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
  images?: {
    characters?: { basic_index?: number; character_id?: number; image_ids: number[] }[];
    story_image_ids?: number[] | null;
  };
  presets?: (Omit<PresetDto, 'id'> & { id: number | null })[];
};
/**
 * 서버처럼 한 트랜잭션에 반영한다: 새 캐릭터에 id를 주고 basic_index·character_id 목록을 연결한다.
 * images.story_image_ids는 없거나 null이면 표지를 유지하고, 배열이면 그 순서로 바꾼다([]는 비움).
 */
const atomicSave: Handler = (init) => {
  const body = JSON.parse(init.body ?? '{}') as SentBody;
  let next = 12;
  const roster = (body.basic?.characters ?? []).map((c) => ({ id: c.id ?? next++, name: c.name ?? '' }));
  for (const entry of body.images?.characters ?? []) {
    const target = entry.basic_index !== undefined ? roster[entry.basic_index].id : Number(entry.character_id);
    server.faces[target] = entry.image_ids;
  }
  const cover = body.images?.story_image_ids;
  if (cover !== undefined && cover !== null) server.story = cover;
  server.characters = roster;
  let presetId = 100;
  return creationDto({
    request_id: new Headers(init.headers).get('Idempotency-Key'),
    presets: body.presets ? body.presets.map((p) => ({ ...p, id: p.id ?? presetId++ })) : STORED,
  });
};

function seed(saveState: EditorStory['saveState'] = '비공개', cover: number[] = []) {
  server.story = cover;
  client.setQueryData<EditorStory>(['stories', 'detail', '1'], {
    id: '1',
    title: '스토리',
    subtitle: '',
    world: '',
    tags: [],
    characters: [{ id: '11', name: '루나', detail: '' }],
    saveState,
    updatedAt: '2026-11-17T00:00:00Z',
    issues: [],
  });
  const images: StoryImagesSnapshot = {
    saveState: saveState === '임시 저장' ? 'draft' : 'private',
    savedAt: '2026-11-17T00:00:00Z',
    workingCopySavedAt: null,
    values: {
      story: cover.map((imageId) => ({
        imageId,
        mimeType: 'image/png',
        byteSize: 10,
        uri: `http://api.test/x/${imageId}`,
      })),
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

let nextUpload: number;
beforeEach(() => {
  client.clear();
  handlers = {};
  calls = [];
  server = { characters: [{ id: 11, name: '루나' }], faces: { 11: [3] }, story: [] };
  nextUpload = 88;
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
  on(UPLOAD, () => imageFile(nextUpload++));
  on(IMAGES_PUT, () => {
    throw new Error('원자 저장 경로에서 사진만 따로 저장하면 안 된다');
  });
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [
      { uri: 'file:///p.png', mimeType: 'image/png', fileName: 'p.png', fileSize: 1000, width: 400, height: 400 },
    ],
  } as ImagePicker.ImagePickerResult);
  jest.mocked(manipulateAsync).mockResolvedValue({ uri: 'file:///c.png', width: 400, height: 400 });
});

const screenEl = <StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} />;
/**
 * 하단 기본 저장 버튼을 누른다. 비공개·공개 스토리의 유저 프로필 탭에는 프로필만 보내는 별도 「임시 저장」
 * (CREATE-US-05-AC06)이 앞에 함께 있으므로 마지막 버튼(「변경 내용 저장」·「다시 저장」)을 누른다.
 */
async function pressSave() {
  const buttons = screen.getAllByRole('button', { name: /^(임시 저장|변경 내용 저장|다시 저장)$/ });
  await act(async () => {
    await fireEvent.press(buttons[buttons.length - 1]);
  });
}
async function addCharacter(name: string) {
  await fireEvent.press(screen.getByText('+ 캐릭터 추가'));
  const inputs = screen.getAllByLabelText(/^캐릭터 \d+ 이름$/);
  await fireEvent.changeText(inputs[inputs.length - 1], name);
}
async function addPhoto(title: string) {
  await act(async () => {
    await fireEvent.press(screen.getByLabelText(`${title} 이미지 추가`));
  });
  await act(async () => {
    await fireEvent.press(screen.getByLabelText('확인'));
  });
}

describe('CREATE-US-07-AC07 새 캐릭터와 얼굴 이미지를 「저장」 한 요청으로', () => {
  it('공통 저장을 한 번만 보내고, 응답의 캐릭터 id로 복원하며 사진을 따로 저장하지 않는다', async () => {
    seed();
    on(SAVE, atomicSave);
    on(BASIC, () => detailDto());
    await render(screenEl);
    await addCharacter('세라');
    // 비공개 스토리는 저장 전에 새 캐릭터의 사진 칸을 보여 준다("먼저 저장" 안내 대신)
    expect(screen.queryByText(/캐릭터를 먼저 저장하면/)).toBeNull();
    await addPhoto('세라');

    await pressSave();

    expect(callsTo(SAVE)).toBe(1);
    expect(callsTo(BASIC)).toBe(0); // 기본 정보만 먼저 반영하지 않는다
    expect(callsTo(IMAGES_PUT)).toBe(0); // 사진도 따로 쓰지 않는다
    const body = bodyOf(SAVE);
    expect(body).toMatchObject({ save_state: 'private', kind: 'save', mode: 'manual' });
    expect((body.basic as NonNullable<SentBody['basic']>).characters).toEqual([
      { id: 11, name: '루나', description: null },
      { id: null, name: '세라', description: null },
    ]);
    expect(body.images).toEqual({ characters: [{ basic_index: 1, image_ids: [88] }] });
    expect(body).not.toHaveProperty('presets'); // 바꾸지 않은 프리셋은 보내지 않는다(서버가 유지)
    // 저장 뒤 재조회한 사진 목록에 새 캐릭터(서버 id 12)의 사진이 연결돼 있다
    expect(callsTo(IMAGES_GET)).toBe(1);
    expect(screen.getByLabelText('세라 이미지 추가')).toBeTruthy();

    // 복원된 id로 다음 저장은 같은 캐릭터를 수정한다(새로 만들지 않는다). 새 캐릭터가 없으니 기존 경로다.
    await fireEvent.changeText(screen.getAllByLabelText(/^캐릭터 \d+ 이름$/)[1], '세라2');
    await pressSave();
    expect(callsTo(SAVE)).toBe(1);
    expect(callsTo(BASIC)).toBe(1);
    expect((bodyOf(BASIC).characters as { id: number | null }[]).map((c) => c.id)).toEqual([11, 12]);
    expect(callsTo(IMAGES_PUT)).toBe(0);
  }, 20000);

  it('바뀐 프리셋·기존 캐릭터 사진도 같은 요청에 담는다(character_id)', async () => {
    seed('공개');
    on(CREATION, () => creationDto({ save_state: 'public' }));
    on(
      SAVE,
      () => {
        throw new ApiError(422, 'VALIDATION_ERROR', '먼저 자동 저장에 실패했어요.');
      },
      atomicSave,
    );
    await render(screenEl);
    await addCharacter('세라');
    await addPhoto('세라');
    await addPhoto('루나');
    await fireEvent.press(screen.getByRole('tab', { name: '유저 프로필' }));
    await fireEvent.changeText(screen.getByLabelText('프로필 1 상세'), '왕국 기사');

    await pressSave();

    expect(callsTo(SAVE)).toBe(2);
    expect(callsTo(IMAGES_PUT)).toBe(0);
    const body = bodyOf(SAVE, 1);
    expect(body.save_state).toBe('public');
    expect(body.images).toEqual({
      characters: [
        { basic_index: 1, image_ids: [88] },
        { character_id: 11, image_ids: [3, 89] },
      ],
    });
    expect(body.presets).toEqual([{ id: 5, name: '기사', image_id: null, description: '왕국 기사' }]);
    expect(server.faces).toEqual({ 11: [3, 89], 12: [88] });
  }, 20000);

  it('새 캐릭터 없이 기본 정보와 기존 캐릭터 사진을 바꿔도 같은 요청 하나로만 보낸다', async () => {
    seed();
    on(SAVE, atomicSave);
    await render(screenEl);
    await fireEvent.changeText(screen.getAllByLabelText(/^캐릭터 \d+ 이름$/)[0], '루나2');
    await addPhoto('루나');

    await pressSave();

    expect(callsTo(SAVE)).toBe(1);
    expect(callsTo(BASIC)).toBe(0); // 기본 정보만 먼저 반영하지 않는다
    expect(callsTo(IMAGES_PUT)).toBe(0); // 공통 저장이 담은 사진을 다시 쓰지 않는다
    const body = bodyOf(SAVE);
    expect((body.basic as NonNullable<SentBody['basic']>).characters).toEqual([
      { id: 11, name: '루나2', description: null },
    ]);
    expect(body.images).toEqual({ characters: [{ character_id: 11, image_ids: [3, 88] }] });
    expect(server.faces).toEqual({ 11: [3, 88] });
    expect(server.characters).toEqual([{ id: 11, name: '루나2' }]);
  }, 20000);
});

describe('CREATE-US-07-AC07·AC08 스토리(표지) 이미지도 같은 「저장」 한 요청으로 (images.story_image_ids)', () => {
  const COVER_UPLOAD = 'POST /creation/images?target=story';

  it('기본 정보·새 캐릭터 얼굴·고른 표지를 /creation 한 번에 보내고, 표지를 따로 저장하지 않는다', async () => {
    seed();
    on(SAVE, atomicSave);
    on(COVER_UPLOAD, () => imageFile(nextUpload++));
    await render(screenEl);
    await fireEvent.changeText(screen.getByLabelText('제목'), '새 제목');
    await addCharacter('세라');
    await addPhoto('세라');
    await addPhoto('스토리');
    expect(callsTo(COVER_UPLOAD)).toBe(1);

    await pressSave();

    expect(callsTo(SAVE)).toBe(1);
    expect(callsTo(BASIC)).toBe(0); // 기본 정보만 먼저 반영하지 않는다
    expect(callsTo(IMAGES_PUT)).toBe(0); // 공통 저장이 반영한 표지를 다시 쓰지 않는다
    const body = bodyOf(SAVE);
    expect(body).toMatchObject({ save_state: 'private', kind: 'save', mode: 'manual' });
    expect(body.basic).toMatchObject({ title: '새 제목' });
    expect((body.basic as NonNullable<SentBody['basic']>).characters.map((c) => c.id)).toEqual([11, null]);
    expect(body.images).toEqual({
      characters: [{ basic_index: 1, image_ids: [88] }],
      story_image_ids: [89],
    });
    expect(server.story).toEqual([89]);
    expect(server.faces).toEqual({ 11: [3], 12: [88] });
    // 저장 뒤 다시 불러온 사진 목록과 같으므로 다음 저장도 사진을 쓰지 않는다
    expect(screen.getByLabelText('스토리 이미지 1번째(대표)')).toBeTruthy();
  }, 20000);

  it('기본 정보와 함께 표지를 모두 지우면 story_image_ids: []로 한 번에 보낸다', async () => {
    seed('비공개', [70]);
    on(SAVE, atomicSave);
    await render(screenEl);
    await fireEvent.changeText(screen.getAllByLabelText(/^캐릭터 \d+ 이름$/)[0], '루나2');
    await fireEvent(screen.getByLabelText('스토리 이미지 1번째(대표)'), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    await fireEvent.press(screen.getByLabelText('스토리 이미지 1번째 삭제'));

    await pressSave();

    expect(callsTo(SAVE)).toBe(1);
    expect(callsTo(BASIC)).toBe(0);
    expect(callsTo(IMAGES_PUT)).toBe(0);
    const body = bodyOf(SAVE);
    expect((body.basic as NonNullable<SentBody['basic']>).characters).toEqual([
      { id: 11, name: '루나2', description: null },
    ]);
    // 바뀐 캐릭터 사진이 없으면 characters는 빈 목록(서버: 바꿀 캐릭터 사진 없음)
    expect(body.images).toEqual({ characters: [], story_image_ids: [] });
    expect(server.story).toEqual([]);
  }, 20000);

  it('표지를 바꾸지 않았으면 story_image_ids를 빼서 서버가 기존 표지를 유지한다', async () => {
    seed('비공개', [70]);
    on(SAVE, atomicSave);
    await render(screenEl);
    await addCharacter('세라');
    await addPhoto('세라');
    await pressSave();
    expect(callsTo(SAVE)).toBe(1);
    expect(bodyOf(SAVE).images).not.toHaveProperty('story_image_ids');
    expect(server.story).toEqual([70]);
  }, 20000);

  it('표지만 바꾸면 지금처럼 사진 단계(임시 저장본)로 저장하고 공통 저장을 보내지 않는다', async () => {
    seed();
    on(BASIC, () => detailDto());
    on(COVER_UPLOAD, () => imageFile(nextUpload++));
    handlers[IMAGES_PUT] = [
      (init) => {
        const body = JSON.parse(init.body ?? '{}') as { story_image_ids: number[] };
        server.story = body.story_image_ids;
        return imagesDto();
      },
    ];
    await render(screenEl);
    await addPhoto('스토리');
    await pressSave();
    expect(callsTo(SAVE)).toBe(0);
    expect(callsTo(IMAGES_PUT)).toBe(1);
    expect(bodyOf(IMAGES_PUT)).toMatchObject({ story_image_ids: [88] });
  }, 20000);

  it('표지와 함께 보낸 저장의 성공 여부를 모르면 같은 키·같은 본문(표지 포함)으로 다시 보낸다', async () => {
    seed();
    on(
      SAVE,
      () => {
        throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결하지 못했습니다.');
      },
      atomicSave,
    );
    on(COVER_UPLOAD, () => imageFile(nextUpload++));
    await render(screenEl);
    await fireEvent.changeText(screen.getAllByLabelText(/^캐릭터 \d+ 이름$/)[0], '루나2');
    await addPhoto('스토리');
    await pressSave();
    expect(screen.getByText(/저장 성공 여부를 확인하지 못했어요/)).toBeTruthy();
    await pressSave();
    expect(callsTo(SAVE)).toBe(2);
    expect(keysOf(SAVE)[0]).toBe(keysOf(SAVE)[1]);
    expect(bodyOf(SAVE, 1)).toEqual(bodyOf(SAVE, 0));
    expect(bodyOf(SAVE, 0).images).toEqual({ characters: [], story_image_ids: [88] });
    expect(callsTo(IMAGES_PUT)).toBe(0);
  }, 20000);
});

describe('CREATE-US-07-AC08 원자적으로 담을 수 없거나 실패하면 아무것도 반영하지 않는다', () => {
  it('새 캐릭터 사진이 없으면 보내지 않고 입력을 그대로 둔다', async () => {
    seed();
    await render(screenEl);
    await addCharacter('세라');
    await pressSave();
    expect(callsTo(SAVE)).toBe(0);
    expect(callsTo(BASIC)).toBe(0);
    expect(screen.getByText(/캐릭터마다 이미지가 1장 이상 필요해요. \(세라\)/)).toBeTruthy();
  });

  it('기존 캐릭터를 지우면서 새 캐릭터를 더하면 보내지 않는다', async () => {
    seed();
    await render(screenEl);
    await addCharacter('세라');
    await addPhoto('세라');
    await fireEvent.press(screen.getAllByRole('button', { name: '삭제' })[0]); // 저장된 캐릭터 루나
    await pressSave();
    expect(callsTo(SAVE)).toBe(0);
    expect(callsTo(BASIC)).toBe(0);
    expect(screen.getByText(/캐릭터 삭제를 새 캐릭터·유저 프로필 변경과 같은 저장에 담을 수 없어요/)).toBeTruthy();
  }, 20000);

  it('서버가 거절하면 고른 사진·새 캐릭터를 그대로 두고, 사진만 따로 저장하지 않는다', async () => {
    seed();
    on(SAVE, () => {
      throw new ApiError(422, 'IMAGE_GIF_NOT_ALLOWED', '캐릭터 이미지에는 GIF를 쓸 수 없습니다.');
    });
    await render(screenEl);
    await addCharacter('세라');
    await addPhoto('세라');
    await pressSave();
    expect(callsTo(SAVE)).toBe(1);
    expect(callsTo(BASIC)).toBe(0);
    expect(callsTo(IMAGES_PUT)).toBe(0);
    expect(server.characters).toEqual([{ id: 11, name: '루나' }]);
    expect(screen.getAllByLabelText(/^캐릭터 \d+ 이름$/).map((el) => el.props.value as string)).toEqual([
      '루나',
      '세라',
    ]);
    // 다시 저장은 새 요청(새 키)이며 고른 사진을 그대로 담는다
    handlers[SAVE] = [atomicSave];
    await pressSave();
    expect(callsTo(SAVE)).toBe(2);
    expect(bodyOf(SAVE, 1).images).toEqual({ characters: [{ basic_index: 1, image_ids: [88] }] });
    expect(keysOf(SAVE)[0]).not.toBe(keysOf(SAVE)[1]);
  }, 20000);

  it('기본 정보 + 기존 캐릭터 사진 저장이 거절되면 둘 다 그대로 두고 따로 저장하지 않는다', async () => {
    seed();
    on(SAVE, () => {
      throw new ApiError(422, 'IMAGE_GIF_NOT_ALLOWED', '캐릭터 이미지에는 GIF를 쓸 수 없습니다.');
    });
    await render(screenEl);
    await fireEvent.changeText(screen.getAllByLabelText(/^캐릭터 \d+ 이름$/)[0], '루나2');
    await addPhoto('루나');
    await pressSave();
    expect(callsTo(SAVE)).toBe(1);
    expect(callsTo(BASIC)).toBe(0);
    expect(callsTo(IMAGES_PUT)).toBe(0);
    expect(server).toEqual({ characters: [{ id: 11, name: '루나' }], faces: { 11: [3] }, story: [] });
    expect(screen.getAllByLabelText(/^캐릭터 \d+ 이름$/).map((el) => el.props.value as string)).toEqual(['루나2']);
    // 다시 저장하면 바꾼 이름과 고른 사진을 그대로 한 요청에 담는다
    handlers[SAVE] = [atomicSave];
    await pressSave();
    expect(callsTo(SAVE)).toBe(2);
    expect(callsTo(BASIC)).toBe(0);
    expect(callsTo(IMAGES_PUT)).toBe(0);
    expect(bodyOf(SAVE, 1).images).toEqual({ characters: [{ character_id: 11, image_ids: [3, 88] }] });
    expect((bodyOf(SAVE, 1).basic as NonNullable<SentBody['basic']>).characters[0].name).toBe('루나2');
  }, 20000);

  it('성공 여부를 모르면 사진 편집을 잠그고, 다시 저장하면 같은 키·같은 본문으로 보낸다', async () => {
    seed();
    on(
      SAVE,
      () => {
        throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결하지 못했습니다.');
      },
      atomicSave,
    );
    await render(screenEl);
    await addCharacter('세라');
    await addPhoto('세라');
    await pressSave();
    expect(screen.getByText(/저장 성공 여부를 확인하지 못했어요/)).toBeTruthy();
    const picks = jest.mocked(ImagePicker.launchImageLibraryAsync).mock.calls.length;
    await fireEvent.press(screen.getByLabelText('세라 이미지 추가'));
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(picks);

    await pressSave();
    expect(callsTo(SAVE)).toBe(2);
    expect(callsTo(CREATION)).toBe(2); // 처음 불러오기 + 첫 저장 직전. 다시 보낼 때는 새로 불러오지 않는다
    expect(bodyOf(SAVE, 1)).toEqual(bodyOf(SAVE, 0));
    expect(keysOf(SAVE)[0]).toBe(keysOf(SAVE)[1]);
    expect(server.characters.map((c) => c.id)).toEqual([11, 12]);
    expect(callsTo(IMAGES_PUT)).toBe(0);
  }, 20000);

  it('첫 저장이 진행 중일 때 캐릭터 목록 변경을 막고, 같은 키로 다시 보낸 응답의 id를 보낸 행에 붙인다', async () => {
    seed();
    let failFirst: (reason: unknown) => void = () => {};
    on(
      SAVE,
      () =>
        new Promise((_, reject) => {
          failFirst = reject;
        }),
      atomicSave,
    );
    await render(screenEl);
    await addCharacter('세라');
    await addPhoto('세라');
    const names = () => screen.getAllByLabelText(/^캐릭터 \d+ 이름$/).map((el) => el.props.value as string);

    await pressSave(); // 첫 공통 저장은 응답 없이 진행 중
    expect(callsTo(SAVE)).toBe(1);
    expect(screen.getByText('저장 중…')).toBeTruthy();
    // 진행 중에 실제 폼으로 캐릭터 목록을 바꾸려 한다: 보낸 새 캐릭터(세라)를 지우고 다른 새 캐릭터를 더한다
    await fireEvent.press(screen.getAllByRole('button', { name: '삭제' })[1]);
    await fireEvent.press(screen.getByText('+ 캐릭터 추가'));
    expect(names()).toEqual(['루나', '세라']);

    // 성공 여부를 모르는 실패 → 같은 키·같은 본문으로 다시 보낸다
    await act(async () => {
      failFirst(new ApiError(0, 'NETWORK_ERROR', '서버에 연결하지 못했습니다.'));
    });
    expect(screen.getByText(/저장 성공 여부를 확인하지 못했어요/)).toBeTruthy();
    await pressSave();
    expect(callsTo(SAVE)).toBe(2);
    expect(keysOf(SAVE)[0]).toBe(keysOf(SAVE)[1]);
    expect(bodyOf(SAVE, 1)).toEqual(bodyOf(SAVE, 0));
    expect(server.characters).toEqual([
      { id: 11, name: '루나' },
      { id: 12, name: '세라' },
    ]);
    expect(names()).toEqual(['루나', '세라']);

    // 행↔id 연결 확인: 다음 저장은 새 캐릭터 없이 기존 경로로, 세라 행을 서버 id 12로 수정한다
    on(BASIC, () => detailDto());
    await fireEvent.changeText(screen.getAllByLabelText(/^캐릭터 \d+ 이름$/)[1], '세라2');
    await pressSave();
    expect(callsTo(SAVE)).toBe(2);
    expect(callsTo(BASIC)).toBe(1);
    expect((bodyOf(BASIC).characters as { id: number | null; name: string }[]).map((c) => [c.id, c.name])).toEqual([
      [11, '루나'],
      [12, '세라2'],
    ]);
    // 저장이 끝나면 캐릭터 목록을 다시 고칠 수 있다
    await fireEvent.press(screen.getByText('+ 캐릭터 추가'));
    expect(names()).toHaveLength(3);
  }, 20000);
});

describe('CREATE-US-07 화면을 연 뒤 다시 불러온 사진 목록이 손대지 않은 사진을 되돌리지 않는다', () => {
  const COVER_UPLOAD = 'POST /creation/images?target=story';
  /** 다른 화면·기기가 표지와 얼굴 사진을 바꾼 뒤, 이 화면의 사진 목록 조회가 새로 고쳐진 상황 */
  async function externalImagesChange(story: number[], faces: Record<number, number[]>) {
    server.story = story;
    server.faces = faces;
    await act(async () => {
      await client.refetchQueries({ queryKey: ['stories', 'images', '1'] });
    });
  }
  const writeImages: Handler = (init) => {
    const body = JSON.parse(init.body ?? '{}') as {
      story_image_ids: number[];
      characters: { character_id: number; image_ids: number[] }[];
    };
    server.story = body.story_image_ids;
    for (const c of body.characters) server.faces[c.character_id] = c.image_ids;
    return imagesDto();
  };

  it('비공개: 제목만 바꿔 저장하면 새로 불러온 표지·얼굴 사진을 예전 값으로 덮어쓰지 않는다', async () => {
    seed('비공개', [70]);
    on(SAVE, atomicSave);
    on(BASIC, () => detailDto());
    handlers[IMAGES_PUT] = [writeImages];
    await render(screenEl);
    await externalImagesChange([71], { 11: [4] });
    await fireEvent.changeText(screen.getByLabelText('제목'), '새 제목');

    await pressSave();

    expect(callsTo(SAVE)).toBe(0); // 바뀐 사진이 없으니 공통 저장에 사진을 담지 않는다
    expect(callsTo(BASIC)).toBe(1);
    expect(callsTo(IMAGES_PUT)).toBe(0);
    expect(server.story).toEqual([71]);
    expect(server.faces).toEqual({ 11: [4] });
  }, 20000);

  it('미등록: 제목만 바꿔 저장해도 사진 단계가 예전 표지·얼굴 사진을 쓰지 않는다', async () => {
    seed('임시 저장', [70]);
    on(CREATION, () => creationDto({ save_state: 'draft' }));
    on(BASIC, () => ({ ...detailDto(), save_state: 'draft' }));
    handlers[IMAGES_PUT] = [writeImages];
    await render(screenEl);
    await externalImagesChange([71], { 11: [4] });
    await fireEvent.changeText(screen.getByLabelText('제목'), '새 제목');

    await pressSave();

    expect(callsTo(BASIC)).toBe(1);
    expect(callsTo(IMAGES_PUT)).toBe(0);
    expect(server.story).toEqual([71]);
    expect(server.faces).toEqual({ 11: [4] });
  }, 20000);

  it('이 화면에서 바꾼 표지는 보내고, 손대지 않은 얼굴 사진은 새로 불러온 값을 유지하며, 저장 뒤 기준을 새로 잡는다', async () => {
    seed('비공개', [70]);
    on(SAVE, atomicSave);
    on(BASIC, () => detailDto());
    on(COVER_UPLOAD, () => imageFile(nextUpload++));
    handlers[IMAGES_PUT] = [writeImages];
    await render(screenEl);
    await addPhoto('스토리'); // 표지 [70, 88]
    await externalImagesChange([70], { 11: [4] });
    await fireEvent.changeText(screen.getByLabelText('제목'), '새 제목');

    await pressSave();

    expect(callsTo(SAVE)).toBe(1);
    expect(bodyOf(SAVE).images).toEqual({ characters: [], story_image_ids: [70, 88] });
    expect(callsTo(IMAGES_PUT)).toBe(0);
    expect(server.story).toEqual([70, 88]);
    expect(server.faces).toEqual({ 11: [4] });

    // 저장 뒤 기준이 최신 저장본으로 바뀌어, 다시 제목만 바꾸면 사진을 담지 않는다
    await fireEvent.changeText(screen.getByLabelText('제목'), '새 제목2');
    await pressSave();
    expect(callsTo(SAVE)).toBe(1);
    expect(callsTo(BASIC)).toBe(1);
    expect(callsTo(IMAGES_PUT)).toBe(0);
    expect(server.faces).toEqual({ 11: [4] });
  }, 20000);
});

describe('미등록 스토리: 기존 흐름 유지', () => {
  it('새 캐릭터 사진 칸 대신 "먼저 저장" 안내를 보이고, 프리셋 없이는 기본 정보 저장을 쓴다', async () => {
    seed('임시 저장');
    on(CREATION, () => creationDto({ save_state: 'draft' }));
    on(BASIC, () => {
      server.characters = [
        { id: 11, name: '루나' },
        { id: 12, name: '세라' },
      ];
      return { ...detailDto(), save_state: 'draft' };
    });
    await render(screenEl);
    await addCharacter('세라');
    expect(screen.getByText(/세라: 캐릭터를 먼저 저장하면 이미지를 추가할 수 있어요/)).toBeTruthy();
    await pressSave();
    expect(callsTo(BASIC)).toBe(1);
    expect(callsTo(SAVE)).toBe(0);
  });

  // CREATE-US-05-AC06(최신 정책): 미등록 스토리의 하단 「임시 저장」은 프리셋을 고쳤으면 kind temporary로 보낸다.
  // 서버는 images를 「저장」(kind save)에서만 받으므로, 새 캐릭터가 있어도 images를 싣지 않는다.
  it('CREATE-US-05-AC06: 프리셋과 새 캐릭터를 함께 임시 저장하면 kind temporary로 보내고 images는 싣지 않는다', async () => {
    seed('임시 저장');
    on(CREATION, () => creationDto({ save_state: 'draft' }));
    handlers['GET /creation/stories/1'] = [() => ({ ...detailDto(), save_state: 'draft' })];
    on(SAVE, (init) => ({ ...(atomicSave(init) as Record<string, unknown>), save_state: 'draft' }));
    await render(screenEl);
    await addCharacter('세라');
    await fireEvent.press(screen.getByRole('tab', { name: '유저 프로필' }));
    expect(screen.getByLabelText('프로필 1 상세').props.editable).toBe(true);
    await act(async () => {
      await fireEvent.changeText(screen.getByLabelText('프로필 1 상세'), '왕국 기사');
    });
    expect(screen.getByLabelText('프로필 1 상세').props.value).toBe('왕국 기사');
    await pressSave();
    expect(callsTo(SAVE)).toBe(2);
    expect(bodyOf(SAVE)).toMatchObject({ save_state: 'draft', kind: 'temporary', mode: 'auto' });
    const body = bodyOf(SAVE, 1);
    expect(body).toMatchObject({ save_state: 'draft', kind: 'temporary', mode: 'manual' });
    expect(body).not.toHaveProperty('images');
    expect((body.basic as { characters: { id: number | null }[] }).characters.map((c) => c.id)).toEqual([11, 12]);
    // 임시 저장 뒤 사진 저장을 이어서 보내지 않는다
    expect(callsTo(IMAGES_PUT)).toBe(0);
  });
});

describe('공통 저장 저장소: images 직렬화', () => {
  const repository = createCommonSaveRepository('http://api.test/api/v1');
  const doc = (images: CommonSaveDocument['images']) =>
    ({
      id: '1',
      title: '스토리',
      saveState: 'private',
      savedAt: '2026-11-17T00:00:00Z',
      speech: defaultExpression(),
      characters: [],
      fewshots: [],
      intros: [],
      relations: [],
      affinities: [],
      workingCopySavedAt: null,
      imagesWorkingCopySavedAt: null,
      images,
    }) as unknown as CommonSaveDocument;

  it('null이면 images를 빼고(통합 전 요청과 같음), 있으면 그대로 싣는다', async () => {
    on(SAVE, atomicSave);
    server.characters = [];
    await repository.save({ ...doc(null), basic: undefined } as CommonSaveDocument, 'private', 'manual', 'k1');
    expect(bodyOf(SAVE)).not.toHaveProperty('images');
  });

  it('story_image_ids는 받은 그대로 싣는다([]는 비우기)', async () => {
    on(SAVE, atomicSave);
    server.characters = [];
    const images = { characters: [], story_image_ids: [] };
    await repository.save({ ...doc(images), basic: undefined } as CommonSaveDocument, 'private', 'manual', 'k4');
    expect(bodyOf(SAVE).images).toEqual({ characters: [], story_image_ids: [] });
  });

  it('직접 임시 저장이나 자동 최종 저장에는 새 얼굴을 싣지 않는다', async () => {
    const images = { characters: [{ basic_index: 0, image_ids: [3] }] };
    await expect(repository.save(doc(images), 'private', 'manual', 'k2', 'temporary')).rejects.toThrow(
      /자동 임시 저장에서만/,
    );
    await expect(repository.save(doc(images), 'private', 'auto', 'k3', 'save')).rejects.toThrow(/자동 임시 저장에서만/);
    expect(callsTo(SAVE)).toBe(0);
  });
});
