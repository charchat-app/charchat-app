// CREATE-US-08-AC09·AC10·AC12 실제 편집 화면(StoryEditorScreen) 공개 범위 탭의 등급 검토 결과 안내와 명시적 새로고침.
// - 새로고침은 GET /creation/stories/{id}/creation 한 번만 보낸다(PUT·새 요청 없음, 자동 재시도 없음).
// - 반영하는 것은 적용 등급·검토 상태·검토 사유뿐이다. 고른 등급·입력·저장 시각은 바꾸지 않는다.
// - 새로고침 중 저장이 시작됐거나 화면을 떠났으면 늦게 온 응답을 버린다.
// 서버 계약(요청 기준)이며 실제 서버와 맞춰 본 결과가 아니다. 서버는 대상 캐릭터·관계 id를 보내지 않는다.
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as baseRender, screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

import { defaultExpression, toExpressionRow } from '@/shared/story-types';

import { StoryEditorScreen } from '../components/StoryEditorScreen';
import type { CommonSaveDocument } from '../commonRepository';
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
const ALLOWED = new Set([
  CREATION,
  SAVE,
  'GET /creation/stories/1',
  'GET /creation/stories/1/images',
  'GET /creation/stories',
]);
const REFRESH = '검토 상태 새로고침';
const CREATION_KEY = ['stories', 'creation', '1'];

type Init = { method?: string; body?: string; headers?: HeadersInit };
type Handler = (init: Init) => unknown;
let handlers: Record<string, Handler[]>;
let calls: { route: string; init: Init }[];

function on(route: string, ...responses: Handler[]) {
  handlers[route] = [...(handlers[route] ?? []), ...responses];
}
/** 열린 화면의 다음 공통 문서 조회 응답을 바꾼다(처음 조회용 응답 뒤에 덧붙이지 않는다) */
function nextCreation(...responses: Handler[]) {
  handlers[CREATION] = responses;
}
const callsTo = (route: string) => calls.filter((c) => c.route === route).length;
const unexpectedCalls = () => calls.map((c) => c.route).filter((route) => !ALLOWED.has(route));
/** 응답을 직접 풀 때까지 기다리는 처리기 */
function deferred() {
  let resolve: (value: unknown) => void = () => undefined;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { handler: (() => promise) as Handler, resolve };
}

const { story_id: _storyId, ...expression } = toExpressionRow('1', defaultExpression());
type SaveState = 'draft' | 'private' | 'public';
type Rating = {
  requested_rating?: unknown;
  effective_rating?: unknown;
  rating_review_status?: unknown;
  rating_review_reason?: unknown;
};

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

const LABEL: Record<SaveState, EditorStory['saveState']> = { draft: '임시 저장', private: '비공개', public: '공개' };
function seed(state: SaveState, rating: Rating, extra: Record<string, unknown> = {}) {
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
  on(CREATION, () => creationDto(state, rating, extra));
  on('GET /creation/stories/1', () => ({
    id: 1,
    title: '스토리',
    subtitle: null,
    world_description: null,
    tags: [],
    characters: [{ id: 11, name: '루나', description: null }],
    save_state: state,
    saved_at: '2026-11-17T00:00:00Z',
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

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
beforeEach(() => {
  jest.useFakeTimers();
  client = newClient();
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
async function choose(rating: 'SAFE' | 'UNSAFE') {
  await act(async () => {
    await fireEvent.press(radio(rating));
  });
  await flush();
}
const screenEl = (onUnsavedChange?: (unsaved: boolean) => void) => (
  <StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} onUnsavedChange={onUnsavedChange} />
);
async function open(
  state: SaveState,
  rating: Rating,
  extra: Record<string, unknown> = {},
  onUnsavedChange?: (unsaved: boolean) => void,
) {
  seed(state, rating, extra);
  const view = await render(screenEl(onUnsavedChange));
  await flush();
  await openTab('공개 범위');
  return view;
}
const footer = () => screen.getByText(/^마지막 저장 /).props.children as string;

const LIMITATION = '어느 캐릭터·관계인지는 아직 알려 드리지 못해요. 캐릭터 설명과 관계를 직접 확인해 주세요.';
const RAW_CODES =
  /underage_stated|minor_depicted|restricted_kinship|age_undetermined|kinship_undetermined|invalid_signals|evaluator_failure|ineligible|undetermined|unavailable/;

const INELIGIBLE: Rating = {
  requested_rating: 'UNSAFE',
  effective_rating: 'SAFE',
  rating_review_status: 'completed',
  rating_review_reason: { outcome: 'ineligible', reasons: ['underage_stated', 'restricted_kinship'] },
};
const UNDETERMINED: Rating = {
  requested_rating: 'UNSAFE',
  effective_rating: 'SAFE',
  rating_review_status: 'completed',
  rating_review_reason: { outcome: 'undetermined', reasons: ['age_undetermined'] },
};
const OUTAGE: Rating = {
  requested_rating: 'UNSAFE',
  effective_rating: 'SAFE',
  rating_review_status: 'failed',
  rating_review_reason: { outcome: 'unavailable', reasons: ['evaluator_failure'] },
};
const REVIEWING: Rating = {
  requested_rating: 'UNSAFE',
  effective_rating: null,
  rating_review_status: 'reviewing',
  rating_review_reason: null,
};
const APPROVED: Rating = {
  requested_rating: 'UNSAFE',
  effective_rating: 'UNSAFE',
  rating_review_status: 'completed',
  rating_review_reason: null,
};

/** 화면에 보이는 모든 글자(원문 코드가 새지 않는지 본다) */
const allText = () => JSON.stringify(screen.toJSON());

describe('CREATE-US-08-AC09·AC10·AC12 검토 결과 안내', () => {
  it('CREATE-US-08-AC09: 미성년·제한 혈연 부적격을 고정 문구로 알리고, 대상을 지어내지 않고 한계를 밝힌다', async () => {
    await open('private', INELIGIBLE);
    expect(
      screen.getByText('미성년자 또는 제한된 혈연 관계가 확인되어 UNSAFE 등급을 적용할 수 없어요.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('성인 나이에 미치지 않는다고 적힌 인물이 있어요.')).toBeOnTheScreen();
    expect(screen.getByText('친부모·자녀 또는 친형제자매 관계가 있어요.')).toBeOnTheScreen();
    expect(screen.getByText(LIMITATION)).toBeOnTheScreen();
    expect(screen.getByText('적용 등급: SAFE')).toBeOnTheScreen();
    // 고른 등급은 그대로
    expect(checked('UNSAFE')).toBe(true);
    expect(allText()).not.toMatch(RAW_CODES);
    // 캐릭터 이름을 대상으로 지어내지 않는다(이름은 기본 정보 탭에만 있다)
    expect(screen.queryByText(/루나/)).toBeNull();
    // 완료된 결과는 새로고침하지 않는다
    expect(screen.queryByRole('button', { name: REFRESH })).toBeNull();
  });

  it('CREATE-US-08-AC10: 판단할 수 없음은 확인된 부적격과 다른 문구로 알린다', async () => {
    await open('private', UNDETERMINED);
    expect(screen.getByText('나이나 혈연 관계를 확인할 수 없어 UNSAFE 등급을 적용하지 않았어요.')).toBeOnTheScreen();
    expect(screen.getByText('미성년자나 제한된 관계로 확인된 것은 아니에요.')).toBeOnTheScreen();
    expect(screen.getByText(LIMITATION)).toBeOnTheScreen();
    expect(screen.queryByText(/확인되어 UNSAFE/)).toBeNull();
    expect(allText()).not.toMatch(RAW_CODES);
  });

  it('CREATE-US-08-AC12: 일시 장애는 부적격이 아니고 이전 적용 등급이 유지됨을 알리며, 새로고침할 수 있다', async () => {
    await open('public', OUTAGE);
    expect(screen.getByText('등급 검토를 일시적으로 하지 못했어요.')).toBeOnTheScreen();
    expect(screen.getByText('부적격 판정이 아니에요.')).toBeOnTheScreen();
    expect(screen.getByText('적용 등급은 이전 그대로예요.')).toBeOnTheScreen();
    expect(screen.queryByText(/미성년|혈연/)).toBeNull();
    expect(screen.getByRole('button', { name: REFRESH })).toBeOnTheScreen();
  });

  it('CREATE-US-08-AC12: 검토 중에는 적용 등급을 고른 등급으로 짐작하지 않고, 새로고침(GET만)으로 통과 결과를 반영한다', async () => {
    await open('private', REVIEWING);
    expect(screen.getByText('등급 검토 중이에요.')).toBeOnTheScreen();
    expect(screen.getByText('적용 등급: 아직 없음')).toBeOnTheScreen();
    const before = callsTo(CREATION);

    nextCreation(() => creationDto('private', APPROVED));
    await press(REFRESH);

    expect(callsTo(CREATION)).toBe(before + 1);
    expect(callsTo(SAVE)).toBe(0);
    expect(unexpectedCalls()).toEqual([]);
    expect(screen.getByText('검토를 통과해 UNSAFE 등급이 적용됐어요.')).toBeOnTheScreen();
    expect(screen.getByText('적용 등급: UNSAFE')).toBeOnTheScreen();
    expect(screen.getByText('등급 검토: 검토 완료')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: REFRESH })).toBeNull();
  });

  it('CREATE-US-08-AC12: 아직 검토 중이면 그대로 두고, 자동으로 다시 조회하지 않는다', async () => {
    await open('private', REVIEWING);
    nextCreation(() => creationDto('private', REVIEWING));
    await press(REFRESH);
    const after = callsTo(CREATION);
    expect(screen.getByText('등급 검토 중이에요.')).toBeOnTheScreen();
    await tick(AUTO * 3);
    expect(callsTo(CREATION)).toBe(after);
    expect(callsTo(SAVE)).toBe(0);
  });
});

describe('CREATE-US-08-AC12 새로고침은 입력·저장 시각을 건드리지 않는다', () => {
  it('미저장 변경이 있는 채로 새로고침해도 고른 등급·미저장 표시·저장 시각은 그대로이고 적용 결과만 바뀐다', async () => {
    const unsaved = jest.fn();
    await open('private', REVIEWING, { working_copy_saved_at: '2026-11-22T01:00:00Z' }, unsaved);
    await choose('SAFE');
    expect(unsaved).toHaveBeenLastCalledWith(true);
    const receipt = footer();
    expect(receipt).toContain('임시 저장');
    const cachedBefore = client.getQueryData<CommonSaveDocument>(CREATION_KEY);

    // 서버는 다른 선택·임시 저장 시각·저장 시각을 돌려줘도 화면은 적용 등급·검토 상태·사유만 반영한다
    nextCreation(() =>
      creationDto(
        'private',
        { ...UNDETERMINED, requested_rating: 'UNSAFE' },
        { saved_at: '2026-11-24T09:00:00Z', working_copy_saved_at: null, title: '다른 제목' },
      ),
    );
    await press(REFRESH);

    expect(screen.getByText('나이나 혈연 관계를 확인할 수 없어 UNSAFE 등급을 적용하지 않았어요.')).toBeOnTheScreen();
    expect(checked('SAFE')).toBe(true);
    expect(unsaved).toHaveBeenLastCalledWith(true);
    expect(footer()).toBe(receipt);
    const cachedAfter = client.getQueryData<CommonSaveDocument>(CREATION_KEY);
    expect(cachedAfter?.workingCopySavedAt).toBe(cachedBefore?.workingCopySavedAt);
    expect(cachedAfter?.updatedAt).toBe(cachedBefore?.updatedAt);
    expect(cachedAfter?.title).toBe(cachedBefore?.title);
    expect(cachedAfter?.rating?.requested).toBe('UNSAFE');
    expect(callsTo(SAVE)).toBe(0);
  });

  it('새로고침이 실패하면 안내만 하고 화면 상태는 그대로이며 자동으로 다시 시도하지 않는다', async () => {
    await open('private', OUTAGE);
    nextCreation(() => {
      throw new ApiError(503, 'SERVER_ERROR', '잠시 후 다시 시도해 주세요.');
    });
    await press(REFRESH);
    const after = callsTo(CREATION);
    expect(screen.getByText('검토 상태를 확인하지 못했어요. 입력과 적용 등급은 그대로예요.')).toBeOnTheScreen();
    expect(screen.getByText('등급 검토를 일시적으로 하지 못했어요.')).toBeOnTheScreen();
    expect(checked('UNSAFE')).toBe(true);
    await tick(AUTO * 3);
    expect(callsTo(CREATION)).toBe(after);
    expect(callsTo(SAVE)).toBe(0);
  });
});

describe('CREATE-US-08-AC12 늦게 온 새로고침 응답', () => {
  it('새로고침 중 저장이 끝났으면 늦게 온 조회 응답으로 저장 결과를 덮지 않는다', async () => {
    await open('private', OUTAGE);
    const late = deferred();
    nextCreation(late.handler, () => creationDto('private', OUTAGE));
    await press(REFRESH);
    expect(screen.getByRole('button', { name: /검토 상태 확인 중/ })).toBeOnTheScreen();

    // 저장 응답: 고른 SAFE가 반영되고 검토 전
    on(SAVE, (init) =>
      creationDto(
        'private',
        { requested_rating: 'SAFE', effective_rating: 'SAFE', rating_review_status: 'not_reviewed' },
        { request_id: new Headers(init.headers).get('Idempotency-Key') },
      ),
    );
    await choose('SAFE');
    await press('변경 내용 저장');
    expect(callsTo(SAVE)).toBe(1);
    expect(screen.getByText('아직 등급 검토를 받지 않았어요.')).toBeOnTheScreen();

    // 저장 전 시점의 늦은 응답(완료·부적격)은 버린다
    await act(async () => {
      late.resolve(creationDto('private', INELIGIBLE));
    });
    await flush();
    expect(screen.getByText('아직 등급 검토를 받지 않았어요.')).toBeOnTheScreen();
    expect(screen.queryByText(/확인되어 UNSAFE/)).toBeNull();
    expect(client.getQueryData<CommonSaveDocument>(CREATION_KEY)?.rating?.reviewStatus).toBe('not_reviewed');
    expect(checked('SAFE')).toBe(true);
    expect(callsTo(SAVE)).toBe(1);
  });

  it('새로고침 전에 시작된 공통 문서 조회(refetch)가 늦게 끝나도 새로고침 결과를 덮지 않는다', async () => {
    await open('private', REVIEWING);
    const old = deferred();
    nextCreation(old.handler, () => creationDto('private', APPROVED));
    // 새로고침 전에 이미 진행 중인 조회(예: 다른 곳의 refetch). 검토 중 시점의 응답을 늦게 돌려준다
    let oldRefetch: Promise<unknown> = Promise.resolve();
    await act(async () => {
      oldRefetch = client.refetchQueries({ queryKey: CREATION_KEY, exact: true });
    });
    await flush();
    const before = callsTo(CREATION);

    await press(REFRESH);
    expect(callsTo(CREATION)).toBe(before + 1);
    expect(screen.getByText('검토를 통과해 UNSAFE 등급이 적용됐어요.')).toBeOnTheScreen();

    await act(async () => {
      old.resolve(creationDto('private', REVIEWING));
      await oldRefetch;
    });
    await flush();
    expect(screen.getByText('검토를 통과해 UNSAFE 등급이 적용됐어요.')).toBeOnTheScreen();
    expect(client.getQueryData<CommonSaveDocument>(CREATION_KEY)?.rating?.reviewStatus).toBe('completed');
    expect(callsTo(SAVE)).toBe(0);
  });

  it('화면을 떠난 뒤 온 새로고침 응답은 반영하지 않는다', async () => {
    const view = await open('private', REVIEWING);
    const late = deferred();
    nextCreation(late.handler);
    await press(REFRESH);
    await view.unmount();
    await act(async () => {
      late.resolve(creationDto('private', INELIGIBLE));
    });
    await flush();
    expect(client.getQueryData<CommonSaveDocument>(CREATION_KEY)?.rating?.reviewStatus).toBe('reviewing');
    expect(callsTo(SAVE)).toBe(0);
  });
});

describe('CREATE-US-08-AC12 다시 열었을 때', () => {
  it('저장 뒤 화면을 다시 열면 마지막 저장 시각과 조회한 검토 결과를 보여 준다', async () => {
    const view = await open('private', {
      requested_rating: 'SAFE',
      effective_rating: 'SAFE',
      rating_review_status: 'not_reviewed',
    });
    on(SAVE, (init) =>
      creationDto('private', REVIEWING, { request_id: new Headers(init.headers).get('Idempotency-Key') }),
    );
    await choose('UNSAFE');
    await press('변경 내용 저장');
    expect(callsTo(SAVE)).toBe(1);
    expect(screen.getByText('등급 검토 중이에요.')).toBeOnTheScreen();
    await view.unmount();

    // 다시 연 화면(새 세션): 조회 응답의 검토 결과와 저장 시각을 보여 준다
    client = newClient();
    handlers = {};
    on('GET /creation/stories', () => []);
    await open('private', INELIGIBLE);
    expect(
      screen.getByText('미성년자 또는 제한된 혈연 관계가 확인되어 UNSAFE 등급을 적용할 수 없어요.'),
    ).toBeOnTheScreen();
    expect(footer()).toMatch(/^마지막 저장 \d+월 \d+일 \d{2}:\d{2}$/);
    expect(checked('UNSAFE')).toBe(true);
  });
});
