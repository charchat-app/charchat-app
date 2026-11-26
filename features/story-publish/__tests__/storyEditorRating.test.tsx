// CREATE-US-08 슬라이스 1(AC01·AC13, 제작자 화면 AC12 일부): 실제 편집 화면(StoryEditorScreen)의 공개 범위 탭에서
// 등급을 고르고, 기존 공통 저장(/creation) 경로(직접 저장·임시 저장·자동 임시 저장·같은 키 재시도)로 requested_rating을
// 보내는지 검증한다. 검토·적용(launch) 요청은 아직 없다. 서버 계약 기준이며 실제 서버와 맞춰 본 결과가 아니다.
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

notifyManager.setScheduler((callback) => callback());
let client: QueryClient;
const render = (element: ReactElement) =>
  baseRender(element, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
const apiMock = apiRequest as jest.Mock;

const AUTO = 60000;
const CREATION = 'GET /creation/stories/1/creation';
const SAVE = 'PUT /creation/stories/1/creation';
const BASIC = 'PUT /creation/stories/1';
/** 이 슬라이스에서 허용하는 요청. 그 밖(등급 검토·적용 등)은 보내면 안 된다. */
const ALLOWED = new Set([
  CREATION,
  SAVE,
  'GET /creation/stories/1',
  'GET /creation/stories/1/images',
  'GET /creation/stories',
]);

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
const unexpectedCalls = () => calls.map((c) => c.route).filter((route) => !ALLOWED.has(route));

const { story_id: _storyId, ...expression } = toExpressionRow('1', defaultExpression());
type SaveState = 'draft' | 'private' | 'public';
type Rating = { requested_rating?: unknown; effective_rating?: unknown; rating_review_status?: unknown };

const PRESETS = [{ id: 5, name: '{{user}}', image_id: null, description: '여행자' }];

function creationDto(state: SaveState, rating: Rating, extra: Record<string, unknown> = {}) {
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
    presets: PRESETS,
    ...rating,
    ...extra,
  };
}
/**
 * 서버처럼 응답한다: 보낸 requested_rating이 있으면 requested만 바꾸고(편집에서 저장한 선택), 적용 등급(effective)은
 * 저장·임시 저장 어느 쪽도 바꾸지 않는다(이번 슬라이스에는 적용 단계가 없다). 빠지면 기존 requested를 유지한다.
 */
function echoSave(state: SaveState, before: Rating): Handler {
  return (init) => {
    const body = JSON.parse(init.body ?? '{}') as {
      requested_rating?: string;
      kind?: string;
      presets?: { id: number | null; name: string | null; image_id: number | null; description: string | null }[];
    };
    return creationDto(
      state,
      { ...before, ...(body.requested_rating ? { requested_rating: body.requested_rating } : {}) },
      {
        request_id: new Headers(init.headers).get('Idempotency-Key'),
        presets: body.presets?.map((p) => ({ ...p, id: p.id ?? 100 })) ?? PRESETS,
        ...(state !== 'draft' && body.kind === 'temporary' ? { working_copy_saved_at: '2026-11-22T01:00:00Z' } : {}),
      },
    );
  };
}

const LABEL: Record<SaveState, EditorStory['saveState']> = { draft: '임시 저장', private: '비공개', public: '공개' };
function seed(state: SaveState, rating: Rating = {}) {
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
  on(CREATION, () => creationDto(state, rating));
  on('GET /creation/stories/1', () => ({
    id: 1,
    title: '스토리',
    subtitle: null,
    world_description: null,
    tags: [],
    characters: [{ id: 11, name: '루나', description: null }],
    save_state: state,
    saved_at: '2026-11-18T00:00:00Z',
    issues: [],
  }));
  on('GET /creation/stories/1/images', () => ({
    story_id: 1,
    save_state: state,
    saved_at: '2026-11-17T00:00:00Z',
    story_images: [],
    characters: [{ character_id: 11, name: '루나', images: [] }],
    characters_missing_images: [],
  }));
}

beforeEach(() => {
  jest.useFakeTimers();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
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
async function press(name: string | RegExp) {
  const buttons = screen.getAllByRole('button', { name });
  await act(async () => {
    await fireEvent.press(buttons[buttons.length - 1]);
  });
  await flush();
}
const radio = (rating: 'SAFE' | 'UNSAFE') => screen.getByRole('radio', { name: rating });
const checked = (rating: 'SAFE' | 'UNSAFE') =>
  (radio(rating).props.accessibilityState as { checked?: boolean }).checked === true;
const radioDisabled = (rating: 'SAFE' | 'UNSAFE') =>
  (radio(rating).props.accessibilityState as { disabled?: boolean }).disabled === true;
async function choose(rating: 'SAFE' | 'UNSAFE') {
  await act(async () => {
    await fireEvent.press(radio(rating));
  });
}
const screenEl = (onUnsavedChange?: (unsaved: boolean) => void) => (
  <StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} onUnsavedChange={onUnsavedChange} />
);
async function open(state: SaveState, rating: Rating = {}, onUnsavedChange?: (unsaved: boolean) => void) {
  seed(state, rating);
  await render(screenEl(onUnsavedChange));
  await flush();
  await openTab('공개 범위');
}

const NOT_REVIEWED: Rating = {
  requested_rating: 'SAFE',
  effective_rating: 'SAFE',
  rating_review_status: 'not_reviewed',
};

describe('CREATE-US-08-AC01 공개 범위 탭의 등급 선택', () => {
  it('CREATE-US-08-AC01: 공개 상태 표시 아래에 등급 선택이 있고, 저장한 선택이 없으면 SAFE가 기본이다', async () => {
    await open('private', { requested_rating: null, effective_rating: null, rating_review_status: null });
    expect(screen.getByText('공개 상태: 비공개')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: '콘텐츠 등급' })).toBeOnTheScreen();
    expect(checked('SAFE')).toBe(true);
    expect(checked('UNSAFE')).toBe(false);
    // 공개 상태를 바꾸는 동작은 새로 만들지 않는다
    expect(screen.queryByRole('button', { name: /공개로 저장|비공개로 저장/ })).toBeNull();
    // 기본값만 보여 주고 바뀐 것으로 보지 않는다(자동 저장하지 않는다)
    await tick();
    expect(callsTo(SAVE)).toBe(0);
  });

  it('CREATE-US-08-AC01: 네이티브에서는 묶음 대신 제목을 두어 각 라디오에 따로 초점이 간다', async () => {
    await open('private', NOT_REVIEWED);
    expect(screen.getByRole('header', { name: '콘텐츠 등급' })).toBeOnTheScreen();
    // accessible 묶음(radiogroup)이 없어야 SAFE·UNSAFE가 각각 접근성 요소로 남는다
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(radio('SAFE')).toBeOnTheScreen();
    expect(radio('UNSAFE')).toBeOnTheScreen();
  });

  it('CREATE-US-08-AC01: 새로 조회한 requested_rating(UNSAFE)으로 선택을 복원한다', async () => {
    await open('public', {
      requested_rating: 'UNSAFE',
      effective_rating: 'SAFE',
      rating_review_status: 'not_reviewed',
    });
    expect(checked('UNSAFE')).toBe(true);
    expect(checked('SAFE')).toBe(false);
  });

  it('CREATE-US-08-AC12: 고른 등급과 별도로 적용 등급·검토 상태를 보여 준다', async () => {
    await open('private', { requested_rating: 'UNSAFE', effective_rating: 'SAFE', rating_review_status: 'reviewing' });
    expect(screen.getByText('적용 등급: SAFE')).toBeOnTheScreen();
    expect(screen.getByText('등급 검토: 검토 중')).toBeOnTheScreen();
    expect(checked('UNSAFE')).toBe(true);
  });

  it('CREATE-US-08-AC12: 적용 등급이 없으면 「아직 없음」으로 보여 준다', async () => {
    await open('draft', { requested_rating: null, effective_rating: null, rating_review_status: 'not_reviewed' });
    expect(screen.getByText('적용 등급: 아직 없음')).toBeOnTheScreen();
    expect(screen.getByText('등급 검토: 검토 전')).toBeOnTheScreen();
  });

  it('CREATE-US-08-AC01: 비공개·공개 스토리에서 등급만 바꾸면 미저장 변경으로 알린다', async () => {
    const unsaved = jest.fn();
    await open('private', NOT_REVIEWED, unsaved);
    expect(unsaved).not.toHaveBeenLastCalledWith(true);
    await choose('UNSAFE');
    await flush();
    expect(unsaved).toHaveBeenLastCalledWith(true);
  });
});

describe('CREATE-US-08-AC13 기존 공통 저장으로 등급 저장', () => {
  it.each(['private', 'public'] as const)(
    'CREATE-US-08-AC13: %s 스토리의 「변경 내용 저장」은 requested_rating만 실어 kind save로 보내고 적용 등급은 그대로다',
    async (state) => {
      await open(state, NOT_REVIEWED);
      on(SAVE, echoSave(state, NOT_REVIEWED));
      await choose('UNSAFE');
      await press('변경 내용 저장');

      expect(callsTo(SAVE)).toBe(1);
      const body = bodyOf(SAVE);
      expect(body).toMatchObject({
        requested_rating: 'UNSAFE',
        kind: 'save',
        mode: 'manual',
        save_state: state,
        preserve_scene: true,
      });
      // 바뀌지 않은 프리셋·사진은 빼서 서버가 유지한다. 기본 정보는 기존 「저장」처럼 지금 값(변경 없음)을 싣는다.
      expect(body.basic).toMatchObject({ title: '스토리', characters: [{ id: 11, name: '루나' }] });
      expect(body).not.toHaveProperty('presets');
      expect(body).not.toHaveProperty('images');
      expect(callsTo(BASIC)).toBe(0);
      // 검토·적용 요청 없음
      expect(unexpectedCalls()).toEqual([]);
      // 저장한 선택은 그대로, 적용 등급은 바뀌지 않는다
      expect(checked('UNSAFE')).toBe(true);
      expect(screen.getByText('적용 등급: SAFE')).toBeOnTheScreen();
      expect(screen.getByText('공개 상태: ' + LABEL[state])).toBeOnTheScreen();

      // 저장한 뒤에는 더 보낼 것이 없다
      await tick();
      expect(callsTo(SAVE)).toBe(1);
    },
  );

  it('CREATE-US-08-AC13: 비공개 스토리의 「임시 저장」은 선택만 임시 저장본에 남기고(kind temporary) 적용 등급을 바꾸지 않는다', async () => {
    await open('private', NOT_REVIEWED);
    on(SAVE, echoSave('private', NOT_REVIEWED));
    await choose('UNSAFE');
    await press('임시 저장');

    expect(callsTo(SAVE)).toBe(1);
    const body = bodyOf(SAVE);
    expect(body).toMatchObject({
      requested_rating: 'UNSAFE',
      kind: 'temporary',
      mode: 'manual',
      save_state: 'private',
    });
    expect(body).not.toHaveProperty('basic');
    expect(body).not.toHaveProperty('presets');
    expect(body).not.toHaveProperty('images');
    expect(unexpectedCalls()).toEqual([]);
    expect(checked('UNSAFE')).toBe(true);
    expect(screen.getByText('적용 등급: SAFE')).toBeOnTheScreen();
    expect(screen.getByText('공개 상태: 비공개')).toBeOnTheScreen();
  });

  it('CREATE-US-08-AC13: 미등록 스토리의 하단 「임시 저장」은 선택을 kind temporary로 저장한다', async () => {
    await open('draft', NOT_REVIEWED);
    on(SAVE, echoSave('draft', NOT_REVIEWED));
    await choose('UNSAFE');
    await press('임시 저장');

    expect(callsTo(SAVE)).toBe(1);
    expect(bodyOf(SAVE)).toMatchObject({ requested_rating: 'UNSAFE', kind: 'temporary', save_state: 'draft' });
    expect(callsTo(BASIC)).toBe(0);
    expect(unexpectedCalls()).toEqual([]);
    expect(checked('UNSAFE')).toBe(true);
    await tick();
    expect(callsTo(SAVE)).toBe(1);
  });

  it.each(['draft', 'private', 'public'] as const)(
    'CREATE-US-08-AC13: %s 스토리에서 등급만 바꾸면 60초 자동 임시 저장(mode auto·kind temporary)에 싣는다',
    async (state) => {
      await open(state, NOT_REVIEWED);
      on(SAVE, echoSave(state, NOT_REVIEWED));
      await choose('UNSAFE');
      await tick();

      expect(callsTo(SAVE)).toBe(1);
      const body = bodyOf(SAVE);
      expect(body).toMatchObject({ requested_rating: 'UNSAFE', kind: 'temporary', mode: 'auto', save_state: state });
      expect(body).not.toHaveProperty('basic');
      expect(body).not.toHaveProperty('presets');
      expect(body).not.toHaveProperty('images');
      expect(unexpectedCalls()).toEqual([]);
      // 같은 내용은 다음 주기에 다시 보내지 않는다
      await tick();
      expect(callsTo(SAVE)).toBe(1);
    },
  );

  it('CREATE-US-08-AC13: 탭을 옮길 때의 자동 임시 저장에도 등급을 싣는다', async () => {
    await open('private', NOT_REVIEWED);
    on(SAVE, echoSave('private', NOT_REVIEWED));
    await choose('UNSAFE');
    await openTab('기본 설정');
    expect(callsTo(SAVE)).toBe(1);
    expect(bodyOf(SAVE)).toMatchObject({ requested_rating: 'UNSAFE', mode: 'auto', kind: 'temporary' });
  });

  it('CREATE-US-08-AC13: 등급과 프리셋을 함께 바꾸면 한 요청에 둘 다 싣는다', async () => {
    await open('private', NOT_REVIEWED);
    // 탭 이동 자동 임시 저장(등급만)은 거절돼 등급 변경이 남는다
    on(
      SAVE,
      () => {
        throw new ApiError(422, 'INVALID_INPUT', '잠시 저장하지 못했어요.');
      },
      echoSave('private', NOT_REVIEWED),
    );
    await choose('UNSAFE');
    await openTab('유저 프로필');
    expect(callsTo(SAVE)).toBe(1);
    expect(bodyOf(SAVE)).toMatchObject({ requested_rating: 'UNSAFE', mode: 'auto' });
    await fireEvent.changeText(screen.getByLabelText('프로필 1 상세'), '왕국 기사');
    await press(/^(변경 내용 저장|다시 저장)$/);
    expect(callsTo(SAVE)).toBe(2);
    const body = bodyOf(SAVE, 1);
    expect(body).toMatchObject({ requested_rating: 'UNSAFE', kind: 'save', mode: 'manual', preserve_scene: true });
    expect(body.presets).toEqual([{ id: 5, name: '{{user}}', image_id: null, description: '왕국 기사' }]);
    expect(body).not.toHaveProperty('images');
    expect(unexpectedCalls()).toEqual([]);
  });

  it('CREATE-US-08-AC13: 등급을 바꾸지 않은 저장에는 requested_rating을 싣지 않는다(서버가 유지)', async () => {
    await open('private', { requested_rating: 'UNSAFE', effective_rating: 'SAFE', rating_review_status: 'completed' });
    on(SAVE, echoSave('private', NOT_REVIEWED));
    await openTab('유저 프로필');
    await fireEvent.changeText(screen.getByLabelText('프로필 1 상세'), '왕국 기사');
    await tick();
    expect(callsTo(SAVE)).toBe(1);
    expect(bodyOf(SAVE)).not.toHaveProperty('requested_rating');
  });

  it('CREATE-US-08-AC13: 성패를 모르는 저장은 선택을 잠그고 같은 키·같은 본문으로 다시 보낸다', async () => {
    await open('private', NOT_REVIEWED);
    on(
      SAVE,
      () => {
        throw new ApiError(503, 'UNAVAILABLE', '잠시 후 다시 시도해 주세요.');
      },
      echoSave('private', NOT_REVIEWED),
    );
    await choose('UNSAFE');
    await press('변경 내용 저장');
    expect(callsTo(SAVE)).toBe(1);
    expect(radioDisabled('SAFE')).toBe(true);
    // 잠긴 동안 눌러도 선택은 바뀌지 않는다
    await choose('SAFE');
    expect(checked('UNSAFE')).toBe(true);
    // 자동 저장은 성패 불명확 요청을 다시 보내지 않는다
    await tick();
    expect(callsTo(SAVE)).toBe(1);

    await press('다시 저장');
    expect(callsTo(SAVE)).toBe(2);
    const [first, second] = keysOf(SAVE);
    expect(second).toBe(first);
    expect(bodyOf(SAVE, 1)).toEqual(bodyOf(SAVE, 0));
    expect(radioDisabled('SAFE')).toBe(false);
    expect(checked('UNSAFE')).toBe(true);
    expect(unexpectedCalls()).toEqual([]);
  });

  it('CREATE-US-08-AC13: 거절되면 선택은 그대로 두고 같은 내용을 자동으로 다시 보내지 않는다', async () => {
    await open('private', NOT_REVIEWED);
    on(SAVE, () => {
      throw new ApiError(422, 'INVALID_INPUT', '등급을 확인해 주세요.');
    });
    await choose('UNSAFE');
    await tick();
    expect(callsTo(SAVE)).toBe(1);
    expect(checked('UNSAFE')).toBe(true);
    await tick();
    expect(callsTo(SAVE)).toBe(1);
  });

  it('CREATE-US-08-AC13: 보내기 전 최신 requested_rating이 기준과 다르면(고른 값과 같아도) 보내지 않는다', async () => {
    await open('private', NOT_REVIEWED);
    // 다른 곳에서 UNSAFE로 저장했다. 이 화면이 고를 값과 같지만 기준(SAFE)과 달라 충돌로 본다(근사 사전 확인).
    handlers[CREATION] = [() => creationDto('private', { ...NOT_REVIEWED, requested_rating: 'UNSAFE' })];
    on(SAVE, echoSave('private', NOT_REVIEWED));
    await choose('UNSAFE');
    await press('변경 내용 저장');

    expect(callsTo(CREATION)).toBeGreaterThanOrEqual(2);
    expect(callsTo(SAVE)).toBe(0);
    expect(screen.getByText(/다른 곳에서 콘텐츠 등급이 바뀌어 저장하지 않았어요/)).toBeOnTheScreen();
    expect(checked('UNSAFE')).toBe(true);
    // 같은 선택을 자동 임시 저장으로 다시 보내지 않는다
    await tick();
    expect(callsTo(SAVE)).toBe(0);
    expect(unexpectedCalls()).toEqual([]);
  });
});

describe('CREATE-US-08-AC13 등급 자동 임시 저장 뒤 「변경 내용 저장」(마무리)', () => {
  const WORKING_COPY = '2026-11-22T01:00:00Z';
  /** 자동 임시 저장 응답: 임시 저장본 시각과 보낸 키를 finalize_auto_request_id로 돌려준다(마무리 가능 응답). */
  const autoEcho =
    (ratingOnly: boolean): Handler =>
    (init) => {
      const body = JSON.parse(init.body ?? '{}') as { requested_rating?: string; mode?: string };
      const key = new Headers(init.headers).get('Idempotency-Key');
      return creationDto(
        'private',
        { ...NOT_REVIEWED, ...(body.requested_rating ? { requested_rating: body.requested_rating } : {}) },
        {
          request_id: key,
          working_copy_saved_at: WORKING_COPY,
          rating_only_working_copy: ratingOnly,
          ...(body.mode === 'auto' ? { finalize_auto_request_id: key } : {}),
        },
      );
    };
  /** 자동 임시 저장 뒤의 조회: 그 자동 저장이 남긴 임시 저장본(같은 시각)이 있다. */
  const stagedCreation = (ratingOnly = false) =>
    creationDto(
      'private',
      { ...NOT_REVIEWED, requested_rating: 'UNSAFE' },
      {
        working_copy_saved_at: WORKING_COPY,
        rating_only_working_copy: ratingOnly,
      },
    );

  async function autoSaveRating(ratingOnly = false) {
    await open('private', NOT_REVIEWED);
    on(SAVE, autoEcho(ratingOnly));
    await choose('UNSAFE');
    await tick();
    expect(callsTo(SAVE)).toBe(1);
    expect(bodyOf(SAVE)).toMatchObject({ requested_rating: 'UNSAFE', mode: 'auto', kind: 'temporary' });
    handlers[CREATION] = [() => stagedCreation(ratingOnly)];
  }

  it('CREATE-US-08-AC13: 자동 임시 저장 응답 뒤 입력이 그대로면 실제 저장 버튼이 그 키로만 마무리한다', async () => {
    await autoSaveRating();
    const [autoKey] = keysOf(SAVE);
    handlers[SAVE] = [echoSave('private', { ...NOT_REVIEWED, requested_rating: 'UNSAFE' })];
    await press('변경 내용 저장');

    expect(callsTo(SAVE)).toBe(2);
    const body = bodyOf(SAVE, 1);
    expect(body).toMatchObject({
      finalize_auto_request_id: autoKey,
      kind: 'save',
      mode: 'manual',
      save_state: 'private',
      preserve_scene: true,
    });
    // 마무리 요청은 등급·기본 정보·프리셋·사진을 다시 싣지 않는다(자동 저장이 임시 저장본에 이미 담았다)
    expect(body).not.toHaveProperty('requested_rating');
    expect(body).not.toHaveProperty('basic');
    expect(body).not.toHaveProperty('presets');
    expect(body).not.toHaveProperty('images');
    expect(keysOf(SAVE)[1]).not.toBe(autoKey);
    expect(callsTo(BASIC)).toBe(0);
    expect(unexpectedCalls()).toEqual([]);
    expect(checked('UNSAFE')).toBe(true);
  });

  it('CREATE-US-08-AC13: 마무리의 성패를 모르면 같은 키·같은 본문으로 다시 보낸다', async () => {
    await autoSaveRating();
    const [autoKey] = keysOf(SAVE);
    handlers[SAVE] = [
      () => {
        throw new ApiError(503, 'UNAVAILABLE', '잠시 후 다시 시도해 주세요.');
      },
      echoSave('private', { ...NOT_REVIEWED, requested_rating: 'UNSAFE' }),
    ];
    await press('변경 내용 저장');
    expect(callsTo(SAVE)).toBe(2);
    expect(bodyOf(SAVE, 1)).toMatchObject({ finalize_auto_request_id: autoKey, kind: 'save' });

    await press('다시 저장');
    expect(callsTo(SAVE)).toBe(3);
    expect(keysOf(SAVE)[2]).toBe(keysOf(SAVE)[1]);
    expect(bodyOf(SAVE, 2)).toEqual(bodyOf(SAVE, 1));
    expect(unexpectedCalls()).toEqual([]);
  });

  it('CREATE-US-08-AC13: 자동 임시 저장 뒤 다시 고른 등급을 등급 전용 반영으로 저장한다', async () => {
    await autoSaveRating(true);
    handlers[SAVE] = [echoSave('private', NOT_REVIEWED)];
    await choose('SAFE');
    await press('변경 내용 저장');
    expect(callsTo(SAVE)).toBe(2);
    expect(bodyOf(SAVE, 1)).toMatchObject({
      requested_rating: 'SAFE',
      finalize_rating_working_copy_at: WORKING_COPY,
      kind: 'save',
    });
    expect(bodyOf(SAVE, 1)).not.toHaveProperty('finalize_auto_request_id');
    expect(checked('SAFE')).toBe(true);
  });

  it('CREATE-US-08-AC13: 최종 저장의 사전 조회가 잠시 실패해도 자동 임시본을 다시 마무리할 수 있다', async () => {
    await autoSaveRating();
    handlers[CREATION] = [
      () => {
        throw new ApiError(503, 'UNAVAILABLE', '잠시 후 다시 시도해 주세요.');
      },
      () => stagedCreation(),
    ];
    handlers[SAVE] = [echoSave('private', { ...NOT_REVIEWED, requested_rating: 'UNSAFE' })];
    await press('변경 내용 저장');
    expect(callsTo(SAVE)).toBe(1);
    await press('다시 저장');
    expect(callsTo(SAVE)).toBe(2);
    expect(bodyOf(SAVE, 1)).toMatchObject({ finalize_auto_request_id: keysOf(SAVE)[0] });
  });
});
