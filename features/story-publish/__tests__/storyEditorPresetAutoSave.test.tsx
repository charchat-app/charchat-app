// CREATE-US-07-AC09 편집 화면 유저 프로필 자동 임시 저장(60초 주기·탭 이동).
// 실제 StoryEditorScreen을 그려, 바뀐 프리셋만 mode auto·kind temporary·preserve_scene true로 보내는지와
// 업로드 대기·직접 저장 대기열·성패 불명확 재시도를 검증한다. 서버 프로토타입 계약 기준이며 실제 서버와 맞춰 본 결과가 아니다.
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

const AUTO = 60000;
const CREATION = 'GET /creation/stories/1/creation';
const SAVE = 'PUT /creation/stories/1/creation';
const BASIC = 'PUT /creation/stories/1';
const UPLOAD = 'POST /creation/images?target=profile';

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
const keysOf = (route: string) =>
  calls.filter((c) => c.route === route).map((c) => new Headers(c.init.headers).get('Idempotency-Key'));
const imageWrites = () => calls.filter((c) => c.route.includes('/images') && !c.route.startsWith('GET '));

const { story_id: _storyId, ...expression } = toExpressionRow('1', defaultExpression());

type PresetDto = { id: number; name: string | null; image_id: number | null; description: string | null };
type SaveState = 'draft' | 'private' | 'public';

function creationDto(presets: PresetDto[], state: SaveState, extra: Record<string, unknown> = {}) {
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
    presets,
    ...extra,
  };
}
/** 저장 요청에 응답한다: 보낸 Idempotency-Key를 request_id로 돌려주고, 보낸 프리셋에 서버 id를 붙인다. */
function echoSave(state: SaveState, extra: Record<string, unknown> = {}): Handler {
  return (init) => {
    const body = JSON.parse(init.body ?? '{}') as { presets?: (Omit<PresetDto, 'id'> & { id: number | null })[] };
    let next = 100;
    return creationDto(body.presets?.map((p) => ({ ...p, id: p.id ?? next++ })) ?? [], state, {
      request_id: new Headers(init.headers).get('Idempotency-Key'),
      ...extra,
    });
  };
}
/** 응답을 붙잡아 두는 저장 처리. 반환된 함수로 응답(성공) 또는 실패를 정한다. */
function heldSave(state: SaveState) {
  const control: { succeed: () => void; fail: (error: Error) => void } = {
    succeed: () => undefined,
    fail: () => undefined,
  };
  const handler: Handler = (init) =>
    new Promise((resolve, reject) => {
      control.succeed = () => resolve(echoSave(state)(init));
      control.fail = reject;
    });
  return { handler, control };
}
const basicDto = (state: SaveState, title = '스토리') => ({
  id: 1,
  title,
  subtitle: null,
  world_description: null,
  tags: [],
  characters: [{ id: 11, name: '루나', description: null }],
  save_state: state,
  saved_at: '2026-11-18T00:00:00Z',
  issues: [],
});

const LABEL: Record<SaveState, EditorStory['saveState']> = { draft: '임시 저장', private: '비공개', public: '공개' };
function seed(state: SaveState) {
  client.setQueryData<EditorStory>(['stories', 'detail', '1'], {
    id: '1',
    title: '스토리',
    subtitle: '',
    world: '',
    tags: [],
    characters: [{ id: '11', name: '루나', detail: '' }],
    saveState: LABEL[state],
    updatedAt: '2026-11-17T00:00:00Z',
    issues: [],
  });
  const images: StoryImagesSnapshot = {
    saveState: state,
    savedAt: '2026-11-17T00:00:00Z',
    workingCopySavedAt: null,
    values: { story: [], characters: [{ characterId: '11', name: '루나', images: [] }] },
  };
  client.setQueryData(['stories', 'images', '1'], images);
  on(CREATION, () => creationDto(STORED, state));
  on('GET /creation/stories/1', () => basicDto(state));
  on('GET /creation/stories/1/images', () => ({
    story_id: 1,
    save_state: state,
    saved_at: '2026-11-17T00:00:00Z',
    story_images: [],
    characters: [{ character_id: 11, name: '루나', images: [] }],
    characters_missing_images: [],
  }));
}

const STORED: PresetDto[] = [
  { id: 5, name: '{{user}}', image_id: 3, description: '여행자' },
  { id: 6, name: '기사', image_id: 4, description: null },
];

beforeEach(() => {
  jest.useFakeTimers();
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
  on('GET /creation/stories', () => []);
});
afterEach(() => {
  jest.useRealTimers();
});

/** 붙잡지 않은 모의 응답(즉시 끝나는 Promise)의 이어지는 처리를 모두 반영한다. */
async function flush() {
  for (let i = 0; i < 15; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}
async function tick(ms = AUTO) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
}
async function openTab(name: string) {
  await act(async () => {
    await fireEvent.press(screen.getByRole('tab', { name }));
  });
  await flush();
}
async function editPreset(text = '왕국 기사') {
  await fireEvent.changeText(screen.getByLabelText('프로필 2 상세'), text);
}
/** 하단 기본 저장 버튼(마지막 버튼)을 누른다. */
async function pressMain() {
  const buttons = screen.getAllByRole('button', { name: /^(임시 저장|변경 내용 저장|다시 저장|임시 저장 다시 시도)$/ });
  await act(async () => {
    await fireEvent.press(buttons[buttons.length - 1]);
  });
  await flush();
}
const screenEl = <StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} />;
const addDisabled = () =>
  (screen.getByRole('button', { name: '+ 프로필 추가' }).props.accessibilityState as { disabled?: boolean }).disabled;

describe('CREATE-US-07-AC09 60초 자동 임시 저장: 바뀐 프리셋만', () => {
  it.each(['draft', 'private', 'public'] as const)(
    '%s 스토리: 프리셋만 mode auto·kind temporary·preserve_scene true로 보내고 기본 정보·이미지는 싣지 않는다',
    async (state) => {
      seed(state);
      on(SAVE, echoSave(state));
      await render(screenEl);
      await openTab('유저 프로필');
      await editPreset();

      await tick(AUTO - 1);
      expect(callsTo(SAVE)).toBe(0);
      await tick(1);

      expect(callsTo(SAVE)).toBe(1);
      const body = bodyOf(SAVE);
      expect(body).toMatchObject({ mode: 'auto', kind: 'temporary', save_state: state, preserve_scene: true });
      expect(body.presets).toEqual([
        { id: 5, name: '{{user}}', image_id: 3, description: '여행자' },
        { id: 6, name: '기사', image_id: 4, description: '왕국 기사' },
      ]);
      // 1번 기본 정보·6번 이미지 영역은 자동 저장 범위가 아니다
      expect(body).not.toHaveProperty('basic');
      expect(body).not.toHaveProperty('images');
      expect(callsTo(BASIC)).toBe(0);
      expect(imageWrites()).toEqual([]);
      // 공개 상태와 입력은 그대로다
      // (미등록은 하단 버튼 이름도 「임시 저장」이라 여러 개일 수 있다)
      expect(screen.getAllByText(LABEL[state]).length).toBeGreaterThan(0);
      expect(screen.getByLabelText('프로필 2 상세').props.value).toBe('왕국 기사');

      // 정본으로 바뀌어 더 보낼 것이 없으면 다음 주기에는 불러오기·저장 요청을 하지 않는다
      await tick();
      expect(callsTo(SAVE)).toBe(1);
      expect(callsTo(CREATION)).toBe(2); // 처음 불러오기 + 자동 저장 직전 최신 확인
    },
  );

  it.each(['draft', 'private', 'public'] as const)('%s: 기본 정보 변경만 자동 임시 저장한다', async (state) => {
    seed(state);
    on(SAVE, echoSave(state));
    await render(screenEl);
    await fireEvent.changeText(screen.getByLabelText('제목'), '  새 제목  ');
    await openTab('유저 프로필');
    expect(callsTo(SAVE)).toBe(1);
    expect(bodyOf(SAVE)).toMatchObject({
      mode: 'auto',
      kind: 'temporary',
      save_state: state,
      preserve_scene: true,
      basic: { title: '  새 제목  ' },
    });
    expect(bodyOf(SAVE)).not.toHaveProperty('presets');
    expect(bodyOf(SAVE)).not.toHaveProperty('images');
    await tick();
    expect(callsTo(SAVE)).toBe(1);
    expect(callsTo(BASIC)).toBe(0);
  });

  it('정본만 새로 조회됐을 때 화면 원래 값을 자동 저장하지 않는다', async () => {
    seed('public');
    await render(screenEl);
    const key = ['stories', 'detail', '1'];
    const original = client.getQueryData<EditorStory>(key);
    if (!original) throw new Error('기본 정보 응답이 없어요.');
    await act(async () => client.setQueryData(key, { ...original, title: '다른 편집기의 제목' }));
    await tick();
    expect(callsTo(SAVE)).toBe(0);
    await fireEvent.changeText(screen.getByLabelText('제목'), '로컬에서 수정한 제목');
    await tick();
    expect(callsTo(SAVE)).toBe(0);
    expect(screen.getByText(/다른 곳에서 기본 설정이 바뀌었어요/)).toBeTruthy();
    expect(screen.getByLabelText('제목').props.value).toBe('로컬에서 수정한 제목');
  });

  it('바뀐 내용이 없으면 탭 이동과 타이머에서 요청하지 않는다', async () => {
    seed('private');
    await render(screenEl);
    await openTab('유저 프로필');

    await tick(AUTO * 2);

    expect(callsTo(SAVE)).toBe(0);
    expect(callsTo(BASIC)).toBe(0);
    expect(callsTo(CREATION)).toBe(1);
  });

  it('탭을 옮기면 주기를 기다리지 않고 바뀐 프리셋을 자동 임시 저장한다', async () => {
    seed('private');
    on(SAVE, echoSave('private'));
    await render(screenEl);
    await openTab('유저 프로필');
    await editPreset();

    await openTab('기본 설정');

    expect(callsTo(SAVE)).toBe(1);
    expect(bodyOf(SAVE)).toMatchObject({ mode: 'auto', kind: 'temporary', preserve_scene: true });
    expect(bodyOf(SAVE)).not.toHaveProperty('basic');
  });

  it('이미지 업로드 중에는 보내지 않고, 업로드가 끝난 뒤 그 이미지로 자동 임시 저장한다', async () => {
    seed('private');
    on(SAVE, echoSave('private'));
    let finishUpload: () => void = () => undefined;
    on(
      UPLOAD,
      () =>
        new Promise((resolve) => {
          finishUpload = () =>
            resolve({
              image_id: 77,
              mime_type: 'image/png',
              byte_size: 10,
              url: 'http://api.test/api/v1/creation/image-files/77',
            });
        }),
    );
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///p.png', mimeType: 'image/png', fileName: 'p.png', fileSize: 1000, width: 400, height: 400 },
      ],
    } as ImagePicker.ImagePickerResult);
    jest.mocked(manipulateAsync).mockResolvedValue({ uri: 'file:///c.png', width: 400, height: 400 });
    await render(screenEl);
    await openTab('유저 프로필');
    await editPreset();
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('프로필 2 이미지 선택'));
    });
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('확인'));
    });
    await flush();
    expect(callsTo(UPLOAD)).toBe(1);

    // 업로드 중: 주기가 와도, 탭을 옮기려 해도 이전 이미지로 보내지 않는다
    await tick();
    await openTab('기본 설정');
    expect(callsTo(SAVE)).toBe(0);

    await act(async () => finishUpload());
    await flush();
    await tick();

    expect(callsTo(SAVE)).toBe(1);
    expect(bodyOf(SAVE).presets).toEqual([
      { id: 5, name: '{{user}}', image_id: 3, description: '여행자' },
      { id: 6, name: '기사', image_id: 77, description: '왕국 기사' },
    ]);
  }, 20000);
});

describe('CREATE-US-07-AC09 자동 임시 저장 중 누른 직접 저장', () => {
  it('버리지 않고 하나만 기억했다가, 자동 저장이 끝난 뒤 최신 입력·의도로 보낸다', async () => {
    seed('private');
    const auto = heldSave('private');
    on(SAVE, auto.handler);
    on(BASIC, (init) => basicDto('private', (JSON.parse(init.body ?? '{}') as { title: string }).title));
    await render(screenEl);
    await openTab('유저 프로필');
    await editPreset();

    await tick();
    expect(callsTo(SAVE)).toBe(1);
    expect(screen.getByText('자동 임시 저장 중…')).toBeTruthy();
    // 응답의 정본으로 바꾸는 동안 프로필 입력을 막는다
    expect(addDisabled()).toBe(true);

    // 저장 버튼은 눌러 대기열에 넣을 수 있다(두 번 눌러도 하나)
    await pressMain();
    await pressMain();
    expect(screen.getByText('자동 임시 저장이 끝나면 이어서 저장해요.')).toBeTruthy();
    expect(callsTo(SAVE)).toBe(1);
    expect(callsTo(BASIC)).toBe(0);

    await act(async () => auto.control.succeed());
    await flush();

    // 자동 요청이 끝나면 대기한 수동 요청을 한 번만 보낸다.
    expect(callsTo(SAVE)).toBe(1);
    expect(callsTo(BASIC)).toBe(1);
    expect(bodyOf(BASIC)).toMatchObject({ title: '스토리' });
    expect(screen.queryByText('자동 임시 저장이 끝나면 이어서 저장해요.')).toBeNull();
    expect(screen.queryByText(/다른 화면에서 이 스토리를 저장하는 중/)).toBeNull();
  });

  it.each([null, '2026-11-22T00:00:00.000001Z'])(
    '자동 저장이 마무리 가능하면(사진 임시본=%s) 대기한 최종 저장을 한 번만 보낸다',
    async (imagesSavedAt) => {
      seed('private');
      // 상태를 기억하는 서버: 자동 임시 저장이 반영되면 프리셋과 임시 저장본 시각을 바꾸고, 최종 저장이 오면 임시 저장본을 비운다.
      const WORKING_COPY = '2026-11-22T00:00:00Z';
      const server: { presets: PresetDto[]; workingCopy: string | null } = { presets: STORED, workingCopy: null };
      handlers[CREATION] = [
        () =>
          creationDto(
            server.presets,
            'private',
            server.workingCopy
              ? {
                  working_copy_saved_at: server.workingCopy,
                  images_working_copy_saved_at: imagesSavedAt,
                }
              : {},
          ),
      ];
      let releaseAuto: () => void = () => undefined;
      on(
        SAVE,
        // 1) 자동 임시 저장: 응답을 붙잡아 두었다가, 보낸 키를 finalize_auto_request_id로 돌려준다.
        (init) =>
          new Promise((resolve) => {
            releaseAuto = () => {
              const key = new Headers(init.headers).get('Idempotency-Key');
              const response = echoSave('private', {
                finalize_auto_request_id: key,
                working_copy_saved_at: WORKING_COPY,
                images_working_copy_saved_at: imagesSavedAt,
              })(init) as { presets: PresetDto[] };
              server.presets = response.presets;
              server.workingCopy = WORKING_COPY;
              resolve(response);
            };
          }),
        // 2) 최종 저장: 임시 저장본을 정본으로 확정한다.
        (init) => {
          server.workingCopy = null;
          return creationDto(server.presets, 'private', {
            request_id: new Headers(init.headers).get('Idempotency-Key'),
          });
        },
      );
      on(BASIC, (init) => basicDto('private', (JSON.parse(init.body ?? '{}') as { title: string }).title));
      await render(screenEl);
      await openTab('유저 프로필');
      await editPreset();

      await tick();
      expect(callsTo(SAVE)).toBe(1);
      expect(bodyOf(SAVE)).toMatchObject({ mode: 'auto', kind: 'temporary', preserve_scene: true });
      const [autoKey] = keysOf(SAVE);
      expect(autoKey).toBeTruthy();

      // 자동 저장 중 저장 버튼을 두 번 눌러도 대기열에는 하나만 남는다
      await pressMain();
      await pressMain();
      expect(screen.getByText('자동 임시 저장이 끝나면 이어서 저장해요.')).toBeTruthy();
      expect(callsTo(SAVE)).toBe(1);

      await act(async () => releaseAuto());
      await flush();

      // 대기한 저장은 자동 저장 키를 마무리하는 최종 저장 한 번으로만 나간다
      expect(callsTo(SAVE)).toBe(2);
      const final = bodyOf(SAVE, 1);
      expect(final).toMatchObject({
        mode: 'manual',
        kind: 'save',
        preserve_scene: true,
        finalize_auto_request_id: autoKey,
      });
      expect(final).not.toHaveProperty('basic');
      expect(final).not.toHaveProperty('presets');
      expect(final).not.toHaveProperty('images');
      expect(callsTo(BASIC)).toBe(0);
      expect(imageWrites()).toEqual([]);
      expect(server.presets[1].description).toBe('왕국 기사');
      expect(server.workingCopy).toBeNull();
      expect(screen.queryByText('자동 임시 저장이 끝나면 이어서 저장해요.')).toBeNull();
    },
  );

  it('자동 저장이 충돌로 거절되면 대기한 저장을 보내지 않고 입력을 유지한다', async () => {
    seed('private');
    const auto = heldSave('private');
    on(SAVE, auto.handler, echoSave('private'));
    await render(screenEl);
    await openTab('유저 프로필');
    await editPreset();
    await tick();
    await pressMain();
    await act(async () => auto.control.fail(new ApiError(409, 'CONFLICT', '서버 내용이 바뀌었어요.')));
    await flush();

    expect(callsTo(SAVE)).toBe(1);
    expect(callsTo(BASIC)).toBe(0);
    expect(screen.getByText(/자동 임시 저장을 완료하지 못해 누른 저장은 보내지 않았어요/)).toBeTruthy();
    expect(screen.getByLabelText('프로필 2 상세').props.value).toBe('왕국 기사');
  });

  it('자동 저장이 성패를 모른 채 끝나면 누른 저장은 보내지 않고 알리며, 재시도는 같은 키·같은 본문이다', async () => {
    seed('private');
    const auto = heldSave('private');
    on(SAVE, auto.handler, echoSave('private'));
    await render(screenEl);
    await openTab('유저 프로필');
    await editPreset();

    await tick();
    await pressMain();
    await act(async () => auto.control.fail(new ApiError(0, 'NETWORK_ERROR', '서버에 연결하지 못했습니다.')));
    await flush();

    expect(screen.getByText(/자동 임시 저장 결과를 확인하지 못해 누른 저장은 보내지 않았어요/)).toBeTruthy();
    expect(callsTo(SAVE)).toBe(1);
    expect(callsTo(BASIC)).toBe(0);
    // 같은 요청으로 확인할 때까지 입력을 막고, 자동으로 다시 보내지 않는다
    expect(addDisabled()).toBe(true);
    await tick();
    expect(callsTo(SAVE)).toBe(1);

    expect(screen.getByRole('button', { name: '임시 저장 다시 시도' })).toBeTruthy();
    await pressMain();

    expect(callsTo(SAVE)).toBe(2);
    expect(callsTo(CREATION)).toBe(2); // 다시 보낼 때는 새로 불러오지 않는다
    expect(bodyOf(SAVE, 1)).toEqual(bodyOf(SAVE, 0));
    expect(bodyOf(SAVE, 1)).toMatchObject({ mode: 'auto', kind: 'temporary', preserve_scene: true });
    const keys = keysOf(SAVE);
    expect(keys[1]).toBe(keys[0]);
    expect(addDisabled()).toBe(false);
  });
});

describe('CREATE-US-07-AC09 자동 임시 저장 실패', () => {
  it('거절되면 안내하고 같은 내용은 다시 보내지 않으며, 입력을 고치면 다시 자동 저장한다', async () => {
    seed('public');
    on(
      SAVE,
      () => {
        throw new ApiError(422, 'INVALID_INPUT', '프로필을 임시 저장하지 못했어요.');
      },
      echoSave('public'),
    );
    await render(screenEl);
    await openTab('유저 프로필');
    await editPreset();

    await tick();
    expect(callsTo(SAVE)).toBe(1);
    expect(screen.getByText('프로필을 임시 저장하지 못했어요.')).toBeTruthy();
    expect(screen.getByLabelText('프로필 2 상세').props.value).toBe('왕국 기사');

    await tick();
    expect(callsTo(SAVE)).toBe(1);
    expect(callsTo(CREATION)).toBe(2);

    await editPreset('왕국 기사단');
    await tick();
    expect(callsTo(SAVE)).toBe(2);
    expect(bodyOf(SAVE, 1)).toMatchObject({ mode: 'auto', kind: 'temporary' });
  });

  it('직접 「저장」이 원자적 반영 조건으로 막혀도(프리셋 거절 아님) 프리셋은 자동 임시 저장한다', async () => {
    seed('private');
    // 처음 불러오기 → 직접 저장 직전(임시 저장본이 남아 차단) → 자동 저장 직전
    handlers[CREATION] = [
      () => creationDto(STORED, 'private'),
      () => creationDto(STORED, 'private', { working_copy_saved_at: '2026-11-18T00:00:00Z' }),
      () => creationDto(STORED, 'private'),
    ];
    on(SAVE, echoSave('private'));
    await render(screenEl);
    await openTab('유저 프로필');
    await editPreset();
    await pressMain();
    expect(callsTo(SAVE)).toBe(0);
    expect(screen.getByText(/임시 저장한 내용\(말투·서술·인트로·초기 상태·사진\)이 남아 있어/)).toBeTruthy();

    await tick();
    expect(callsTo(SAVE)).toBe(1);
    expect(bodyOf(SAVE)).toMatchObject({ mode: 'auto', kind: 'temporary', save_state: 'private' });
  });
});

describe('직접 저장은 지금 그대로 mode manual이다', () => {
  it('유저 프로필 탭의 「임시 저장」은 mode manual로 보낸다', async () => {
    seed('private');
    on(SAVE, echoSave('private'));
    await render(screenEl);
    await openTab('유저 프로필');
    await editPreset();
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: '임시 저장' }));
    });
    await flush();

    expect(callsTo(SAVE)).toBe(1);
    expect(bodyOf(SAVE)).toMatchObject({ mode: 'manual', kind: 'temporary', preserve_scene: true });
  });
});
