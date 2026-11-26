// CREATE-US-12 QA: 비공개 스토리에서 기본 정보 + 새 캐릭터 사진이 자동 임시 저장된 뒤 「변경 내용 저장」이 막히면,
// 그 임시 저장본을 반영할 곳(공개 범위 탭)으로 넘어갈 수 있어야 한다. 이 화면의 입력이 서버 임시 저장본과 같을 때만
// 다시 불러오지 않고 넘기고, 그 뒤 새로 고친 입력·성패를 모르는 저장·삭제 중이면 넘기지 않는다.
// 서버 계약(wt-server-us07-final save_visibility): basic을 빼고 보낸 「저장」은 임시 저장한 basic과 새 캐릭터 사진을
// 함께 검사·반영한다. apiRequest를 대신한 가짜 응답으로 검증한 결과이며, 실제 서버와 맞춰 본 결과가 아니다.
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
import { useStoryWriteLock } from '../hooks/useStoryWriteLock';

notifyManager.setScheduler((callback) => callback());
let client: QueryClient;
type StoryWriteLock = ReturnType<typeof useStoryWriteLock>;
/** 같은 트리에 함께 그리는 잠금 도우미가 잡은 쓰기 잠금. 삭제 진행 중 상황을 만들 때 쓴다. */
let lockHelper: StoryWriteLock | null;
function LockHelper() {
  lockHelper = useStoryWriteLock('1');
  return null;
}
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>
    {children}
    <LockHelper />
  </QueryClientProvider>
);
const render = (element: ReactElement) => baseRender(element, { wrapper });
const apiMock = apiRequest as jest.Mock;

const CREATION = 'GET /creation/stories/1/creation';
const SAVE = 'PUT /creation/stories/1/creation';
const BASIC = 'PUT /creation/stories/1';
const DETAIL = 'GET /creation/stories/1';
const IMAGES_GET = 'GET /creation/stories/1/images';
const IMAGES_PUT = 'PUT /creation/stories/1/images';
const UPLOAD = 'POST /creation/images?target=character';
const WORKING_COPY = '2026-11-26T01:00:00Z';

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

const { story_id: _storyId, ...expression } = toExpressionRow('1', defaultExpression());
const imageFile = (id: number) => ({
  image_id: id,
  mime_type: 'image/png',
  byte_size: 10,
  url: `http://api.test/api/v1/creation/image-files/${id}`,
});

/** 서버 임시 저장본(가짜). 자동 임시 저장이 basic·새 캐릭터 사진을 여기에 둔다. */
let staged: { basic: Record<string, unknown>; faces: { basic_index: number; image_ids: number[] }[] } | null;

function creationDto(extra: Record<string, unknown> = {}) {
  return {
    story_id: 1,
    title: '스토리',
    save_state: 'private',
    saved_at: '2026-11-17T00:00:00Z',
    expression,
    characters: [{ id: 11, name: '루나', position: 0 }],
    fewshots: [],
    intros: [],
    relations: [],
    affinities: [],
    presets: [{ id: 5, name: '기사', image_id: null, description: null }],
    ...(staged
      ? {
          basic: staged.basic,
          working_copy_saved_at: WORKING_COPY,
          staged_character_images: staged.faces.map((f) => ({
            basic_index: f.basic_index,
            images: f.image_ids.map(imageFile),
          })),
        }
      : {}),
    ...extra,
  };
}
/** 서버처럼 비공개 스토리의 자동 임시 저장을 임시 저장본에만 둔다(마무리 가능 키도 알린다). */
const stageAuto: Handler = (init) => {
  const body = JSON.parse(init.body ?? '{}') as {
    basic: Record<string, unknown>;
    images?: { characters: { basic_index?: number; image_ids: number[] }[] };
  };
  const key = new Headers(init.headers).get('Idempotency-Key');
  staged = {
    basic: body.basic,
    faces: (body.images?.characters ?? [])
      .filter((c): c is { basic_index: number; image_ids: number[] } => c.basic_index !== undefined)
      .map((c) => ({ basic_index: c.basic_index, image_ids: c.image_ids })),
  };
  return creationDto({ request_id: key, finalize_auto_request_id: key });
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
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  lockHelper = null;
  handlers = {};
  calls = [];
  staged = null;
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
  on(IMAGES_GET, () => ({
    story_id: 1,
    save_state: 'private',
    saved_at: '2026-11-17T00:00:00Z',
    story_images: [],
    characters: [{ character_id: 11, name: '루나', images: [imageFile(3)] }],
    characters_missing_images: [],
  }));
  on(UPLOAD, () => imageFile(88));
  on(BASIC, () => {
    throw new Error('임시 저장본이 있는데 공개 정본에 기본 정보를 바로 쓰면 안 된다');
  });
  on(IMAGES_PUT, () => {
    throw new Error('새 캐릭터 사진을 따로 저장하면 안 된다');
  });
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [
      { uri: 'file:///p.png', mimeType: 'image/png', fileName: 'p.png', fileSize: 1000, width: 400, height: 400 },
    ],
  } as ImagePicker.ImagePickerResult);
  jest.mocked(manipulateAsync).mockResolvedValue({ uri: 'file:///c.png', width: 400, height: 400 });
});

async function flush() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}
async function goTab(name: string) {
  await act(async () => {
    await fireEvent.press(screen.getByRole('tab', { name }));
  });
  await flush();
}
async function pressMainSave() {
  await act(async () => {
    await fireEvent.press(screen.getByRole('button', { name: '변경 내용 저장' }));
  });
  await flush();
}

/** 새 캐릭터(세라)와 사진을 고르고 탭 이동으로 자동 임시 저장한 뒤 기본 설정으로 돌아온다. */
async function stageNewCharacter(onOpenScene = jest.fn(), onUnsavedChange?: (unsaved: boolean) => void) {
  seed();
  on(SAVE, stageAuto);
  await render(
    <StoryEditorScreen
      storyId="1"
      onBack={jest.fn()}
      onDeleted={jest.fn()}
      onOpenScene={onOpenScene}
      onUnsavedChange={onUnsavedChange}
    />,
  );
  await flush();
  await act(async () => {
    await fireEvent.press(screen.getByText('+ 캐릭터 추가'));
  });
  const names = screen.getAllByLabelText(/^캐릭터 \d+ 이름$/);
  await act(async () => {
    await fireEvent.changeText(names[names.length - 1], '세라');
  });
  await act(async () => {
    await fireEvent.press(screen.getByLabelText('세라 이미지 추가'));
  });
  await act(async () => {
    await fireEvent.press(screen.getByLabelText('확인'));
  });
  await goTab('유저 프로필');
  expect(sent(SAVE)).toHaveLength(1);
  expect(bodyOf(SAVE)).toMatchObject({
    kind: 'temporary',
    mode: 'auto',
    preserve_scene: true,
    images: { characters: [{ basic_index: 1, image_ids: [88] }] },
  });
  await goTab('기본 설정');
  return onOpenScene;
}

describe('CREATE-US-12 QA: 자동 임시 저장된 기본 정보·새 캐릭터 사진을 공개 범위 탭으로 넘기기', () => {
  it('「변경 내용 저장」이 막히면 공개 범위 탭에서 반영하라고 안내하고, 공개 범위 탭은 다시 불러오지 않고 넘긴다', async () => {
    const unsaved = jest.fn();
    const onOpenScene = await stageNewCharacter(jest.fn(), unsaved);
    // 자동 임시 저장본이 이 화면 입력과 같으므로 미저장 변경이 아니다.
    expect(unsaved).toHaveBeenLastCalledWith(false);

    await pressMainSave();
    // 공개 정본에 따로 쓰지 않는다(공통 저장도 보내지 않음). 안내는 지금 화면 구성(공개 범위 탭)을 가리킨다.
    expect(sent(SAVE)).toHaveLength(1);
    expect(sent(BASIC)).toHaveLength(0);
    expect(screen.queryByText(/저장·공개/)).toBeNull();
    expect(screen.getByText(/공개 범위 탭에서 저장하면/)).toBeTruthy();

    const detailReads = sent(DETAIL).length;
    const creationReads = sent(CREATION).length;
    await goTab('공개 범위');
    expect(onOpenScene).toHaveBeenCalledWith('visibility');
    // 넘길 때 다시 불러오거나 입력을 버리지 않는다.
    expect(sent(DETAIL)).toHaveLength(detailReads);
    expect(sent(CREATION)).toHaveLength(creationReads);
    expect(screen.getByDisplayValue('세라')).toBeTruthy();
    expect(screen.getByTestId('photo-88')).toBeTruthy();
    expect(screen.queryByText(/먼저 저장해 주세요/)).toBeNull();
  }, 30000);

  it('자동 임시 저장 뒤 새로 고친 입력이 있으면 넘기지 않는다(입력은 그대로)', async () => {
    const onOpenScene = await stageNewCharacter();
    const names = screen.getAllByLabelText(/^캐릭터 \d+ 이름$/);
    await act(async () => {
      await fireEvent.changeText(names[1], '세라2');
    });
    await act(async () => {
      await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
    });
    expect(onOpenScene).not.toHaveBeenCalled();
    expect(screen.getByText(/먼저 저장해 주세요/)).toBeTruthy();
    expect(screen.getByText(/아래 「임시 저장」/)).toBeTruthy();
    expect(screen.getByDisplayValue('세라2')).toBeTruthy();
  }, 30000);

  it('성패를 모르는 자동 임시 저장이 남아 있으면 넘기지 않는다', async () => {
    seed();
    on(SAVE, () => {
      throw new ApiError(503, 'UNAVAILABLE', '잠시 후 다시 시도해 주세요.');
    });
    const onOpenScene = jest.fn();
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} onOpenScene={onOpenScene} />);
    await flush();
    await act(async () => {
      await fireEvent.press(screen.getByText('+ 캐릭터 추가'));
    });
    const names = screen.getAllByLabelText(/^캐릭터 \d+ 이름$/);
    await act(async () => {
      await fireEvent.changeText(names[names.length - 1], '세라');
    });
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('세라 이미지 추가'));
    });
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('확인'));
    });
    await goTab('유저 프로필');
    expect(sent(SAVE)).toHaveLength(1);
    await goTab('기본 설정');
    await act(async () => {
      await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
    });
    expect(onOpenScene).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('세라')).toBeTruthy();
  }, 30000);

  it('삭제가 진행 중이면 넘기지 않는다', async () => {
    const onOpenScene = await stageNewCharacter();
    // 같은 트리의 잠금 도우미로 같은 스토리의 쓰기 잠금을 삭제로 쥔다(삭제 확인 화면이 하는 일과 같다).
    expect(lockHelper).not.toBeNull();
    const held: { release: ReturnType<StoryWriteLock['acquire']> } = { release: null };
    await act(async () => {
      held.release = lockHelper!.acquire('delete');
    });
    // 실제로 잠금을 쥐었는지 확인한다(이미 다른 쓰기가 쥐고 있으면 null).
    expect(held.release).not.toBeNull();
    expect(lockHelper!.peek()).toBe('delete');
    try {
      await act(async () => {
        await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
      });
      expect(onOpenScene).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        held.release?.();
      });
    }
  }, 30000);
});
