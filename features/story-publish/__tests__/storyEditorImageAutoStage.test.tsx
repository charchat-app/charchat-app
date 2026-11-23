// CREATE-US-07-AC09 편집 화면 사진만 자동 임시 저장(기존 캐릭터 얼굴·표지).
// 기존 PUT /creation/stories/{id}/images 계약(kind temporary)만 쓴다. 새 캐릭터·기본 정보·프리셋과 함께 바꾼 경우는
// 원자 저장 계약이 생길 때까지 자동 저장하지 않는다. 실패하면 입력과 비교 기준을 그대로 두고,
// 성패를 모르는 요청은 새 요청키로 다시 보내지 않는다.
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
const UPLOAD_STORY = 'POST /creation/images?target=story';

type Init = { method?: string; body?: string; headers?: HeadersInit };
type Handler = (init: Init) => unknown;
let handlers: Record<string, Handler[]>;
let calls: { route: string; init: Init }[];

function on(route: string, ...responses: Handler[]) {
  handlers[route] = [...(handlers[route] ?? []), ...responses];
}
const sent = (route: string) => calls.filter((c) => c.route === route);
const bodyOf = (route: string, index = 0) =>
  JSON.parse(sent(route)[index].init.body ?? '{}') as Record<string, unknown>;
const keyOf = (route: string, index = 0) => new Headers(sent(route)[index].init.headers).get('Idempotency-Key');
const writes = () => sent(SAVE).length + sent(BASIC).length + sent(IMAGES_PUT).length;

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

type State = 'draft' | 'private' | 'public';
let state: State;
let server: { faces: Record<number, number[]>; story: number[]; workingCopy: string | null };

function creationDto() {
  return {
    story_id: 1,
    title: '스토리',
    save_state: state,
    saved_at: '2026-11-17T00:00:00Z',
    expression,
    characters: [{ id: 11, name: '루나', position: 0 }],
    fewshots: [],
    intros: [],
    relations: [],
    affinities: [],
    presets: [{ id: 6, name: '기사', image_id: 4, description: null }],
  };
}
function imagesDto() {
  return {
    story_id: 1,
    save_state: state,
    saved_at: '2026-11-17T00:00:00Z',
    story_images: server.story.map(imageFile),
    characters: [{ character_id: 11, name: '루나', images: (server.faces[11] ?? []).map(imageFile) }],
    characters_missing_images: [],
    working_copy_saved_at: server.workingCopy,
  };
}
/** 서버처럼 사진 목록을 임시 저장본에 둔다. */
const stageImages: Handler = (init) => {
  const body = JSON.parse(init.body ?? '{}') as {
    story_image_ids: number[];
    characters: { character_id: number; image_ids: number[] }[];
  };
  server.story = body.story_image_ids;
  for (const c of body.characters) server.faces[c.character_id] = c.image_ids;
  server.workingCopy = state === 'draft' ? null : '2026-11-22T00:00:00Z';
  return imagesDto();
};

function seed() {
  client.setQueryData<EditorStory>(['stories', 'detail', '1'], {
    id: '1',
    title: '스토리',
    subtitle: '',
    world: '',
    tags: [],
    characters: [{ id: '11', name: '루나', detail: '' }],
    saveState: state === 'draft' ? '임시 저장' : state === 'private' ? '비공개' : '공개',
    updatedAt: '2026-11-17T00:00:00Z',
    issues: [],
  });
  const images: StoryImagesSnapshot = {
    saveState: state,
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
  state = 'private';
  server = { faces: { 11: [3] }, story: [], workingCopy: null };
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
  on('GET /creation/stories', () => []);
  on(IMAGES_GET, () => imagesDto());
  on(SAVE, () => {
    throw new Error('사진만 자동 임시 저장할 때 공통 저장을 보내면 안 된다');
  });
  on(BASIC, () => {
    throw new Error('사진만 자동 임시 저장할 때 기본 정보를 보내면 안 된다');
  });
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockReset();
  jest.mocked(manipulateAsync).mockReset();
});

async function press(label: string | RegExp) {
  await act(async () => {
    await fireEvent.press(screen.getByLabelText(label));
  });
}
async function goTab(name: string) {
  await act(async () => {
    await fireEvent.press(screen.getByRole('tab', { name }));
  });
}
/** 표지에 새 이미지(90)를 올린다. 업로드는 바로 끝난다. */
async function addCover(id = 90) {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce(PICKED);
  jest.mocked(manipulateAsync).mockResolvedValueOnce(CROPPED);
  handlers[UPLOAD_STORY] = [() => imageFile(id)];
  await press('스토리 이미지 추가');
  await press('확인');
}
async function open(s: State, onUnsavedChange?: (unsaved: boolean) => void) {
  state = s;
  seed();
  await render(
    <StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} onUnsavedChange={onUnsavedChange} />,
  );
}

describe('CREATE-US-07-AC09 사진만 자동 임시 저장(탭 이동)', () => {
  it('사진 자동 저장이 거절되면 대기한 직접 저장이 충돌을 우회하지 않는다', async () => {
    await open('private');
    let rejectSave: (error: Error) => void = () => undefined;
    on(IMAGES_PUT, () => new Promise((_resolve, reject) => (rejectSave = reject)));
    await addCover();
    await goTab('유저 프로필');
    expect(sent(IMAGES_PUT)).toHaveLength(1);
    await act(async () => fireEvent.press(screen.getByRole('button', { name: '변경 내용 저장' })));
    expect(screen.getByText('자동 임시 저장이 끝나면 이어서 저장해요.')).toBeTruthy();
    await act(async () => rejectSave(new ApiError(409, 'CONFLICT', '사진이 변경됐어요.')));

    expect(writes()).toBe(1);
    expect(screen.getByText(/자동 임시 저장을 완료하지 못해 누른 저장은 보내지 않았어요/)).toBeTruthy();
    await goTab('기본 설정');
    expect(screen.getByTestId('photo-90')).toBeTruthy();
  }, 20000);

  it.each(['draft', 'private', 'public'] as const)(
    '%s 스토리: 바뀐 표지·기존 얼굴을 PUT /images kind temporary 한 번으로 보내고, 같은 내용은 다시 보내지 않는다',
    async (s) => {
      await open(s);
      handlers[IMAGES_PUT] = [stageImages];
      await addCover();
      expect(writes()).toBe(0);

      await goTab('유저 프로필');
      expect(sent(IMAGES_PUT)).toHaveLength(1);
      // 비공개·공개 스토리만 마무리 opt-in 표시(mode auto)를 싣는다. 미등록 스토리 본문은 그대로다.
      expect(bodyOf(IMAGES_PUT)).toEqual({
        story_image_ids: [90],
        characters: [{ character_id: 11, image_ids: [3] }],
        kind: 'temporary',
        ...(s === 'draft' ? {} : { mode: 'auto' }),
      });
      expect(sent(SAVE)).toHaveLength(0);
      expect(sent(BASIC)).toHaveLength(0);

      // 바뀐 것이 없으면 요청을 보내지 않는다(no-op 생략)
      await goTab('기본 설정');
      await goTab('유저 프로필');
      expect(sent(IMAGES_PUT)).toHaveLength(1);
    },
    20000,
  );

  it('미등록 스토리: 이전 자동 저장 응답을 기준으로 다음 이미지 변경을 저장한다', async () => {
    await open('draft');
    handlers[IMAGES_PUT] = [stageImages];
    await addCover(90);
    await goTab('유저 프로필');
    expect(server.story).toEqual([90]);
    await goTab('기본 설정');
    await addCover(91);
    await goTab('유저 프로필');
    expect(server.story).toEqual([90, 91]);
    expect(sent(IMAGES_PUT)).toHaveLength(2);
    expect(server.workingCopy).toBeNull();
  }, 20000);

  it('비공개 스토리: 자동 임시 저장이 성공하면 미저장 변경으로 알리지 않는다(임시 저장본이 기준)', async () => {
    const unsaved = jest.fn();
    await open('private', unsaved);
    handlers[IMAGES_PUT] = [stageImages];
    await addCover();
    expect(unsaved).toHaveBeenLastCalledWith(true);
    await goTab('유저 프로필');
    expect(unsaved).toHaveBeenLastCalledWith(false);
  }, 20000);

  it('기본 정보와 표지를 함께 고쳤으면 공통 자동 임시 저장 한 번으로 보낸다', async () => {
    await open('private');
    on(SAVE, (init) => {
      const body = JSON.parse(init.body ?? '{}');
      server.story = body.images.story_image_ids;
      server.workingCopy = '2026-11-22T00:00:00Z';
      return { ...creationDto(), basic: body.basic, images_working_copy_saved_at: server.workingCopy };
    });
    await addCover();
    await act(async () => {
      await fireEvent.changeText(screen.getByLabelText('캐릭터 1 이름'), '루나2');
    });
    await goTab('유저 프로필');
    expect(sent(IMAGES_PUT)).toHaveLength(0);
    expect(sent(SAVE)).toHaveLength(1);
    expect(JSON.parse(sent(SAVE)[0].init.body ?? '{}')).toMatchObject({
      mode: 'auto',
      kind: 'temporary',
      basic: { characters: [{ id: 11, name: '루나2' }] },
      images: { story_image_ids: [90] },
    });
  }, 20000);

  it('새 캐릭터를 추가했으면 표지와 새 명단을 공통 자동 저장으로 함께 보낸다', async () => {
    await open('private');
    handlers[IMAGES_PUT] = [stageImages];
    await addCover();
    await act(async () => {
      await fireEvent.press(screen.getByText('+ 캐릭터 추가'));
    });
    await goTab('유저 프로필');
    expect(sent(IMAGES_PUT)).toHaveLength(0);
    expect(sent(SAVE)).toHaveLength(1);
    expect(bodyOf(SAVE)).toMatchObject({
      mode: 'auto',
      kind: 'temporary',
      images: { story_image_ids: [90], characters: [{ basic_index: 1, image_ids: [] }] },
    });
  }, 20000);
});

const IMAGES_WORKING_COPY = '2026-11-22T00:00:00Z';
const BLOCKED_WORKING_COPY = /임시 저장한 내용\(말투·서술·인트로·초기 상태·사진\)이 남아 있어/;

/** 비동기 저장 흐름(잠금 해제 → 대기 저장 → 조회·저장 → 사진 단계)이 끝날 때까지 기다린다. */
async function flush() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/**
 * 비공개 스토리에서 표지를 올리고 탭을 옮겨 사진 자동 임시 저장을 보낸 뒤 응답을 붙잡는다.
 * 그 사이 「변경 내용 저장」을 눌러 대기시킨다. release(extra)로 서버처럼 사진 임시본을 두고 응답에 extra를 더한다.
 */
async function queueMainDuringImageAuto(s: State = 'private') {
  await open(s);
  let release: (extra?: (key: string | null) => Record<string, unknown>) => void = () => undefined;
  on(
    IMAGES_PUT,
    (init) =>
      new Promise((resolve) => {
        release = (extra) => {
          const dto = stageImages(init) as Record<string, unknown>;
          const key = new Headers(init.headers).get('Idempotency-Key');
          resolve({ ...dto, ...(extra ? extra(key) : {}) });
        };
      }),
  );
  await addCover();
  await goTab('유저 프로필');
  expect(sent(IMAGES_PUT)).toHaveLength(1);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: '변경 내용 저장' })));
  expect(screen.getByText('자동 임시 저장이 끝나면 이어서 저장해요.')).toBeTruthy();
  return { release: (extra?: (key: string | null) => Record<string, unknown>) => release(extra) };
}

/** 공통 조회가 서버의 사진 임시본 시각(images_working_copy_saved_at)과 scene 임시본 시각을 알려 준다. */
function creationWithWorkingCopies(scene: () => string | null = () => null) {
  handlers[CREATION] = [
    () => ({
      ...creationDto(),
      ...(scene() ? { working_copy_saved_at: scene() } : {}),
      ...(server.workingCopy ? { images_working_copy_saved_at: server.workingCopy } : {}),
    }),
  ];
}

/** 마무리 요청: 사진 임시본을 정본으로 확정한다. */
const finalizeImages: Handler = (init) => {
  server.workingCopy = null;
  return { ...creationDto(), request_id: new Headers(init.headers).get('Idempotency-Key') };
};

describe('CREATE-US-07-AC09 사진만 자동 임시 저장 뒤 대기한 「저장」 마무리', () => {
  // 최종 저장 성공 뒤 상세를 다시 받는다.
  beforeEach(() => {
    on('GET /creation/stories/1', () => ({
      id: 1,
      title: '스토리',
      subtitle: null,
      world_description: null,
      tags: [],
      characters: [{ id: 11, name: '루나', description: null }],
      save_state: state,
      saved_at: '2026-11-22T01:00:00Z',
      issues: [],
    }));
  });

  it('마무리 가능 응답이면 대기한 저장은 사진 자동 저장 키로 보호된 최종 저장 한 번만 보낸다', async () => {
    const { release } = await queueMainDuringImageAuto();
    const imagesKey = keyOf(IMAGES_PUT);
    expect(imagesKey).toBeTruthy();
    expect(bodyOf(IMAGES_PUT)).toMatchObject({ kind: 'temporary', mode: 'auto' });
    creationWithWorkingCopies();
    handlers[SAVE] = [finalizeImages];

    await act(async () =>
      release((key) => ({ finalize_auto_request_id: key, working_copy_saved_at: IMAGES_WORKING_COPY })),
    );
    await flush();

    expect(sent(SAVE)).toHaveLength(1);
    const final = bodyOf(SAVE);
    expect(final).toMatchObject({
      kind: 'save',
      mode: 'manual',
      preserve_scene: true,
      finalize_auto_request_id: imagesKey,
    });
    expect(final).not.toHaveProperty('basic');
    expect(final).not.toHaveProperty('presets');
    expect(final).not.toHaveProperty('images');
    expect(keyOf(SAVE)).not.toBe(imagesKey);
    // 기본 정보 PUT·추가 사진 PUT 없음
    expect(sent(BASIC)).toHaveLength(0);
    expect(sent(IMAGES_PUT)).toHaveLength(1);
    expect(server.workingCopy).toBeNull();
    expect(screen.queryByText('자동 임시 저장이 끝나면 이어서 저장해요.')).toBeNull();
    await goTab('기본 설정');
    expect(screen.getByTestId('photo-90')).toBeTruthy();
  }, 20000);

  it.each<[string, (key: string | null) => Record<string, unknown>]>([
    ['마무리 표시 없음(구서버)', () => ({ working_copy_saved_at: IMAGES_WORKING_COPY })],
    ['다른 키', () => ({ finalize_auto_request_id: 'images-other', working_copy_saved_at: IMAGES_WORKING_COPY })],
    ['임시본 시각 없음', (key) => ({ finalize_auto_request_id: key, working_copy_saved_at: null })],
  ])(
    '%s이면 마무리 키를 보내지 않고, 키 없는 공통 최종 저장도 보내지 않는다',
    async (_label, extra) => {
      const { release } = await queueMainDuringImageAuto();
      creationWithWorkingCopies();
      await act(async () => release(extra));
      await flush();

      expect(sent(SAVE)).toHaveLength(0);
      expect(sent(IMAGES_PUT)).toHaveLength(1);
    },
    20000,
  );

  it('보내기 직전 다른 곳의 2~4번 임시본이 있으면 마무리를 보내지 않고 입력을 둔다', async () => {
    const { release } = await queueMainDuringImageAuto();
    creationWithWorkingCopies(() => '2026-11-22T05:00:00Z');
    await act(async () =>
      release((key) => ({ finalize_auto_request_id: key, working_copy_saved_at: IMAGES_WORKING_COPY })),
    );
    await flush();

    expect(sent(SAVE)).toHaveLength(0);
    expect(sent(BASIC)).toHaveLength(0);
    expect(screen.getByText(BLOCKED_WORKING_COPY)).toBeTruthy();
    expect(server.workingCopy).toBe(IMAGES_WORKING_COPY);
  }, 20000);

  it('보내기 직전 사진 임시본 시각이 자동 저장 응답과 다르면(그 뒤 다른 사진 쓰기) 마무리를 보내지 않는다', async () => {
    const { release } = await queueMainDuringImageAuto();
    handlers[CREATION] = [() => ({ ...creationDto(), images_working_copy_saved_at: '2026-11-22T09:00:00Z' })];
    await act(async () =>
      release((key) => ({ finalize_auto_request_id: key, working_copy_saved_at: IMAGES_WORKING_COPY })),
    );
    await flush();

    expect(sent(SAVE)).toHaveLength(0);
    expect(screen.getByText(BLOCKED_WORKING_COPY)).toBeTruthy();
  }, 20000);

  it('마무리 결과를 모르면 「다시 저장」은 같은 키·같은 본문으로만 다시 보낸다', async () => {
    const { release } = await queueMainDuringImageAuto();
    const imagesKey = keyOf(IMAGES_PUT);
    creationWithWorkingCopies();
    handlers[SAVE] = [uncertainOnce, finalizeImages];
    await act(async () =>
      release((key) => ({ finalize_auto_request_id: key, working_copy_saved_at: IMAGES_WORKING_COPY })),
    );
    await flush();
    expect(sent(SAVE)).toHaveLength(1);

    await press('다시 저장');
    await flush();
    expect(sent(SAVE)).toHaveLength(2);
    expect(keyOf(SAVE, 1)).toBe(keyOf(SAVE, 0));
    expect(bodyOf(SAVE, 1)).toEqual(bodyOf(SAVE, 0));
    expect(bodyOf(SAVE, 1)).toMatchObject({ finalize_auto_request_id: imagesKey });
    expect(sent(BASIC)).toHaveLength(0);
    expect(sent(IMAGES_PUT)).toHaveLength(1);
    expect(server.workingCopy).toBeNull();
  }, 20000);

  it('미등록 스토리는 opt-in 표시를 싣지 않고 마무리도 쓰지 않는다', async () => {
    await open('draft');
    handlers[IMAGES_PUT] = [
      (init) => ({ ...(stageImages(init) as object), finalize_auto_request_id: keyOf(IMAGES_PUT) }),
    ];
    await addCover();
    await goTab('유저 프로필');
    expect(bodyOf(IMAGES_PUT)).not.toHaveProperty('mode');
    expect(sent(SAVE)).toHaveLength(0);
  }, 20000);
});

describe('CREATE-US-07-AC09 사진 자동 임시 저장 실패', () => {
  it('거절(422)되면 입력·비교 기준을 그대로 두고, 같은 내용을 다시 자동으로 보내지 않는다', async () => {
    const unsaved = jest.fn();
    await open('private', unsaved);
    handlers[IMAGES_PUT] = [
      () => {
        throw new ApiError(422, 'VALIDATION_ERROR', '표지를 확인해 주세요.');
      },
    ];
    await addCover();
    await goTab('유저 프로필');
    expect(sent(IMAGES_PUT)).toHaveLength(1);
    expect(screen.getByText(/사진을 자동 임시 저장하지 못했어요.*표지를 확인해 주세요/)).toBeTruthy();
    expect(unsaved).toHaveBeenLastCalledWith(true);

    await goTab('기본 설정');
    expect(sent(IMAGES_PUT)).toHaveLength(1);
    // 입력은 그대로다: 표지 이미지가 남아 있다
    expect(screen.getByTestId('photo-90')).toBeTruthy();
  }, 20000);

  it.each([
    ['500', () => new ApiError(500, 'INTERNAL', '서버 오류')],
    ['네트워크', () => new TypeError('Network request failed')],
  ])(
    '성패를 모르는 응답(%s)이면 입력을 두고, 다음 자동 저장에서 새 요청키로 다시 보내지 않는다',
    async (_label, failure) => {
      const unsaved = jest.fn();
      await open('private', unsaved);
      handlers[IMAGES_PUT] = [
        () => {
          throw failure();
        },
      ];
      await addCover();
      await goTab('유저 프로필');
      expect(sent(IMAGES_PUT)).toHaveLength(1);
      expect(keyOf(IMAGES_PUT)).toBeTruthy();
      expect(screen.getByText(/사진 자동 임시 저장 결과를 확인하지 못했어요/)).toBeTruthy();
      expect(unsaved).toHaveBeenLastCalledWith(true);
      await goTab('기본 설정');
      expect(screen.getByTestId('photo-90')).toBeTruthy();

      handlers[IMAGES_PUT] = [stageImages];
      await goTab('유저 프로필');
      // 앞선 요청이 반영됐는지 모르므로 자동으로는 다시 보내지 않고, 확인 전에는 사진을 더 고치지 못한다
      await goTab('기본 설정');
      await expectPhotoEditingFrozen();
      await goTab('유저 프로필');
      expect(sent(IMAGES_PUT)).toHaveLength(1);
      expect(screen.getByLabelText('사진 임시 저장 다시 시도')).toBeTruthy();
    },
    20000,
  );
});

const RETRY = '사진 임시 저장 다시 시도';
const uncertainOnce: Handler = () => {
  throw new ApiError(503, 'UNAVAILABLE', '잠시 후 다시 시도해 주세요.');
};
/** 사진 추가 칸을 눌러도 사진 고르기가 열리지 않는다(편집 고정). */
async function expectPhotoEditingFrozen() {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockClear();
  await press('스토리 이미지 추가');
  expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
}
/** 표지(90)를 올리고 탭을 옮겨 자동 임시 저장이 성패를 모른 채 끝나게 한다. */
async function leaveUncertain(s: State = 'private', onUnsavedChange?: (unsaved: boolean) => void) {
  await open(s, onUnsavedChange);
  handlers[IMAGES_PUT] = [uncertainOnce];
  await addCover();
  await goTab('유저 프로필');
  await goTab('기본 설정');
  expect(sent(IMAGES_PUT)).toHaveLength(1);
}

describe('CREATE-US-07-AC02/03/09 사진 자동 임시 저장의 성패를 모를 때 직접 다시 시도', () => {
  it.each(['draft', 'private'] as const)(
    '%s 스토리: 「사진 임시 저장 다시 시도」는 처음 본문·kind·요청키 그대로 다시 보내고, 성공하면 기준을 바꾼다',
    async (s) => {
      const unsaved = jest.fn();
      await leaveUncertain(s, unsaved);
      const firstBody = bodyOf(IMAGES_PUT);
      const firstKey = keyOf(IMAGES_PUT);

      handlers[IMAGES_PUT] = [stageImages];
      await press(RETRY);
      expect(sent(IMAGES_PUT)).toHaveLength(2);
      expect(bodyOf(IMAGES_PUT, 1)).toEqual(firstBody);
      expect(bodyOf(IMAGES_PUT, 1)).toMatchObject({ kind: 'temporary' });
      expect(keyOf(IMAGES_PUT, 1)).toBe(firstKey);
      expect(screen.queryByLabelText(RETRY)).toBeNull();
      expect(screen.getByTestId('photo-90')).toBeTruthy();
      if (s === 'private') expect(unsaved).toHaveBeenLastCalledWith(false);

      // 확인한 뒤에는 같은 내용을 다시 보내지 않는다
      await goTab('유저 프로필');
      expect(sent(IMAGES_PUT)).toHaveLength(2);
      expect(writes()).toBe(2);
    },
    20000,
  );

  it('다시 시도도 성패를 모르면 다음 시도 역시 같은 요청키·본문이다(새 요청키로 보내지 않는다)', async () => {
    await leaveUncertain();
    handlers[IMAGES_PUT] = [uncertainOnce, stageImages];
    await press(RETRY);
    expect(screen.getByLabelText(RETRY)).toBeTruthy();
    await press(RETRY);
    expect(sent(IMAGES_PUT)).toHaveLength(3);
    const keys = sent(IMAGES_PUT).map((_, i) => keyOf(IMAGES_PUT, i));
    expect(new Set(keys).size).toBe(1);
    expect(bodyOf(IMAGES_PUT, 2)).toEqual(bodyOf(IMAGES_PUT, 0));
    expect(screen.queryByLabelText(RETRY)).toBeNull();
  }, 20000);

  it('확인 전에는 사진 편집과 겹치는 저장(변경 내용 저장)을 막고, 입력은 그대로 둔다', async () => {
    await leaveUncertain();
    await expectPhotoEditingFrozen();
    await press('변경 내용 저장');
    expect(writes()).toBe(1);
    expect(screen.getByText(/사진 자동 임시 저장 결과를 아직 확인하지 못해 저장하지 않았어요/)).toBeTruthy();
    expect(screen.getByTestId('photo-90')).toBeTruthy();
    expect(screen.getByLabelText(RETRY)).toBeTruthy();
  }, 20000);

  it('미등록 스토리에서 사진 확인 전에는 기본 정보도 담는 임시 저장을 보내지 않는다', async () => {
    await leaveUncertain('draft');
    await goTab('유저 프로필');
    await act(async () => {
      await fireEvent.changeText(screen.getByLabelText('프로필 1 상세'), '새 프로필 상세');
    });
    await press('임시 저장');
    expect(writes()).toBe(1);
    expect(screen.getByLabelText(RETRY)).toBeTruthy();
    expect(screen.getByLabelText('프로필 1 상세').props.value).toBe('새 프로필 상세');
  }, 20000);

  it('CREATE-US-05: 확인 전에도 유저 프로필만 임시 저장(사진 미포함)은 그대로 보낸다', async () => {
    await leaveUncertain();
    handlers[SAVE] = [
      (init) => ({
        ...creationDto(),
        presets: [{ id: 6, name: '기사', image_id: 4, description: '왕국 기사' }],
        request_id: new Headers(init.headers).get('Idempotency-Key'),
      }),
    ];
    await goTab('유저 프로필');
    await act(async () => {
      await fireEvent.changeText(screen.getByLabelText('프로필 1 상세'), '왕국 기사');
    });
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: '임시 저장' }));
    });
    expect(sent(SAVE)).toHaveLength(1);
    expect(bodyOf(SAVE)).toMatchObject({ kind: 'temporary' });
    expect(bodyOf(SAVE)).not.toHaveProperty('images');
    expect(sent(IMAGES_PUT)).toHaveLength(1);
  }, 20000);

  it('다시 보낸 요청이 예전 응답을 돌려주면 최신 사진 목록을 다시 불러와 기준으로 쓴다', async () => {
    await leaveUncertain();
    // 처음 요청은 반영됐고, 그 뒤 다른 곳에서 얼굴 사진이 하나 더 붙었다. 다시 보낸 요청은 처음 응답(예전 값)을 돌려준다.
    const stale = { ...imagesDto(), story_images: [imageFile(90)], working_copy_saved_at: '2026-11-22T00:00:00Z' };
    server = { faces: { 11: [3, 77] }, story: [90], workingCopy: '2026-11-22T01:00:00Z' };
    handlers[IMAGES_PUT] = [() => stale];
    await press(RETRY);
    expect(sent(IMAGES_PUT)).toHaveLength(2);
    expect(screen.getByTestId('photo-77')).toBeTruthy();
    expect(screen.getByTestId('photo-90')).toBeTruthy();
    // 최신 목록이 기준이므로 예전 응답 기준으로 다시 보내지 않는다
    await goTab('유저 프로필');
    expect(sent(IMAGES_PUT)).toHaveLength(2);
  }, 20000);

  it('재전송 성공 후 조회만 실패하면 다음 시도는 조회만 하고 최신 사진을 보여 준다', async () => {
    await leaveUncertain();
    const stale = { ...imagesDto(), story_images: [imageFile(90)] };
    server = { faces: { 11: [3, 77] }, story: [90], workingCopy: '2026-11-22T01:00:00Z' };
    handlers[IMAGES_PUT] = [() => stale];
    handlers[IMAGES_GET] = [uncertainOnce, imagesDto];
    await press(RETRY);
    expect(sent(IMAGES_PUT)).toHaveLength(2);
    expect(screen.getByLabelText(RETRY)).toBeTruthy();
    await press(RETRY);
    expect(sent(IMAGES_PUT)).toHaveLength(2);
    expect(screen.queryByLabelText(RETRY)).toBeNull();
    expect(screen.getByTestId('photo-77')).toBeTruthy();
  }, 20000);

  it('다시 시도가 거절(422)되면 대기를 풀고 입력을 두며, 같은 내용을 자동으로 다시 보내지 않는다', async () => {
    await leaveUncertain();
    handlers[IMAGES_PUT] = [
      () => {
        throw new ApiError(422, 'VALIDATION_ERROR', '표지를 확인해 주세요.');
      },
    ];
    await press(RETRY);
    expect(screen.queryByLabelText(RETRY)).toBeNull();
    expect(screen.getByText(/사진을 자동 임시 저장하지 못했어요.*표지를 확인해 주세요/)).toBeTruthy();
    expect(screen.getByTestId('photo-90')).toBeTruthy();
    await goTab('유저 프로필');
    expect(sent(IMAGES_PUT)).toHaveLength(2);
    // 대기가 풀려 사진을 다시 고칠 수 있다
    await goTab('기본 설정');
    await addCover(91);
    expect(screen.getByTestId('photo-91')).toBeTruthy();
  }, 20000);
});
