// CREATE-US-07-AC01/05 편집 화면 재진입 시 임시 저장(staged) 기본 정보 복원.
// 공통 저장 조회(GET /creation)의 basic(쓰기 DTO 모양, 선택)을 편집 화면 초기값으로 쓴다.
// 서버 프로토타입 계약(working_response의 basic 선택 영역) 기준이다. 실제 서버와 맞춰 본 결과가 아니다.
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as baseRender, screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

import { defaultExpression, toExpressionRow } from '@/shared/story-types';

import { readStagedBasic } from '../commonRepository';
import { StoryEditorScreen } from '../components/StoryEditorScreen';
import { storyCreationKey } from '../hooks/useStoryPresets';
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
import { apiRequest } from '@/lib/api-client';

notifyManager.setScheduler((callback) => callback());
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const render = (element: ReactElement) => baseRender(element, { wrapper });
const apiMock = apiRequest as jest.Mock;

const CREATION = 'GET /creation/stories/1/creation';
const BASIC = 'PUT /creation/stories/1';
const DETAIL_KEY = ['stories', 'detail', '1'];

type Init = { method?: string; body?: string; headers?: HeadersInit };
type Handler = (init: Init) => unknown;
let handlers: Record<string, Handler[]>;
let calls: { route: string; init: Init }[];
function on(route: string, ...responses: Handler[]) {
  handlers[route] = [...(handlers[route] ?? []), ...responses];
}
const callsTo = (route: string) => calls.filter((c) => c.route === route).length;

const { story_id: _storyId, ...expression } = toExpressionRow('1', defaultExpression());

function creationDto(extra: Record<string, unknown> = {}) {
  return {
    story_id: 1,
    title: '공개 제목',
    save_state: 'private',
    saved_at: '2026-11-17T00:00:00Z',
    working_copy_saved_at: '2026-11-18T00:00:00Z',
    expression,
    characters: [{ id: 11, name: '루나', position: 0 }],
    fewshots: [],
    intros: [],
    relations: [],
    affinities: [],
    presets: [],
    ...extra,
  };
}

/** 임시 저장본의 기본 정보(쓰기 DTO 모양). 완성 조건을 채우지 않은 원문(null)도 그대로 온다. */
const STAGED_BASIC = {
  title: '임시 제목',
  subtitle: null,
  world_description: null,
  tags: ['임시태그'],
  characters: [
    { id: 11, name: '루나(임시)', description: null },
    { id: null, name: '새 친구', description: '아직 저장 전' },
  ],
};

function publishedStory(): EditorStory {
  return {
    id: '1',
    title: '공개 제목',
    subtitle: '공개 소개',
    world: '공개 세계관',
    tags: ['공개태그'],
    characters: [{ id: '11', name: '루나', detail: '공개 상세' }],
    saveState: '비공개',
    updatedAt: '2026-11-17T00:00:00Z',
    issues: [],
  };
}
function seed() {
  client.setQueryData<EditorStory>(DETAIL_KEY, publishedStory());
  const images: StoryImagesSnapshot = {
    saveState: 'private',
    savedAt: '2026-11-17T00:00:00Z',
    workingCopySavedAt: null,
    values: { story: [], characters: [{ characterId: '11', name: '루나', images: [] }] },
  };
  client.setQueryData(['stories', 'images', '1'], images);
}

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
});

const screenEl = (onUnsavedChange?: (unsaved: boolean) => void) => (
  <StoryEditorScreen storyId="1" onBack={jest.fn()} onDeleted={jest.fn()} onUnsavedChange={onUnsavedChange} />
);
const value = (label: string) => screen.getByLabelText(label).props.value as string;

describe('readStagedBasic (공통 저장 조회의 basic 해석)', () => {
  it('CREATE-US-07-AC05: 쓰기 DTO 모양의 미완성 원문을 그대로 복원하고, id가 null인 새 캐릭터는 id 없이 둔다', () => {
    expect(readStagedBasic(STAGED_BASIC)).toEqual({
      title: '임시 제목',
      subtitle: '',
      world: '',
      tags: ['임시태그'],
      characters: [
        { id: '11', name: '루나(임시)', detail: '' },
        { id: undefined, name: '새 친구', detail: '아직 저장 전' },
      ],
    });
  });

  it('CREATE-US-07-AC05: basic이 없거나 null이면 복원하지 않는다(이전 서버 호환)', () => {
    expect(readStagedBasic(undefined)).toBeUndefined();
    expect(readStagedBasic(null)).toBeUndefined();
  });

  it('CREATE-US-07-AC05: tags·characters가 null(기존 값 유지)이면 null로 두고, [](모두 지움)와 구분한다', () => {
    expect(readStagedBasic({ ...STAGED_BASIC, tags: null, characters: null })).toEqual({
      title: '임시 제목',
      subtitle: '',
      world: '',
      tags: null,
      characters: null,
    });
    expect(readStagedBasic({ ...STAGED_BASIC, tags: [], characters: [] })).toEqual({
      title: '임시 제목',
      subtitle: '',
      world: '',
      tags: [],
      characters: [],
    });
  });

  it('CREATE-US-07-AC05: 모양이 다른 basic은 받지 않는다', () => {
    expect(() => readStagedBasic({ ...STAGED_BASIC, title: 3 })).toThrow();
    expect(() => readStagedBasic({ ...STAGED_BASIC, tags: [1] })).toThrow();
    // 키가 없으면(undefined) null(유지)과 달리 받지 않는다
    expect(() => readStagedBasic({ ...STAGED_BASIC, tags: undefined })).toThrow();
    expect(() => readStagedBasic({ ...STAGED_BASIC, characters: undefined })).toThrow();
    expect(() => readStagedBasic({ ...STAGED_BASIC, characters: {} })).toThrow();
    expect(() =>
      readStagedBasic({ ...STAGED_BASIC, characters: [{ id: 'x', name: null, description: null }] }),
    ).toThrow();
    expect(() =>
      readStagedBasic({
        ...STAGED_BASIC,
        characters: [
          { id: 11, name: 'a', description: null },
          { id: 11, name: 'b', description: null },
        ],
      }),
    ).toThrow();
  });
});

describe('CREATE-US-07-AC01/05 편집 화면 재진입 복원', () => {
  it('CREATE-US-07-AC04: 기본 정보 탭에서 미완성 제목을 수동 임시 저장한다', async () => {
    seed();
    on(CREATION, () => creationDto({ basic: null }));
    on(CREATION.replace('GET', 'PUT'), () => creationDto({ basic: STAGED_BASIC }));
    await render(screenEl());
    await fireEvent.changeText(screen.getByLabelText('제목'), '  미완성 제목  ');
    await fireEvent.press(screen.getByRole('button', { name: '임시 저장' }));
    const writes = calls.filter(({ route }) => route === CREATION.replace('GET', 'PUT'));
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0].init.body))).toMatchObject({
      kind: 'temporary',
      mode: 'manual',
      preserve_scene: true,
      basic: { title: '  미완성 제목  ' },
    });
    expect(client.getQueryData<EditorStory>(DETAIL_KEY)?.title).toBe('공개 제목');
  });
  it('CREATE-US-07-AC01: 공통 저장 조회의 임시 저장 기본 정보로 편집 화면을 채우고, 공개 정본 캐시는 바꾸지 않는다', async () => {
    seed();
    on(CREATION, () => creationDto({ basic: STAGED_BASIC }));
    await render(screenEl());

    expect(value('제목')).toBe('임시 제목');
    expect(value('한 줄 소개')).toBe('');
    expect(value('세계관 · 서사')).toBe('');
    expect(value('캐릭터 1 이름')).toBe('루나(임시)');
    expect(value('캐릭터 1 상세')).toBe('');
    // 아직 서버 id가 없는 새 캐릭터도 복원한다
    expect(value('캐릭터 2 이름')).toBe('새 친구');
    expect(value('캐릭터 2 상세')).toBe('아직 저장 전');
    // 공개(정본) 상세 캐시는 그대로다
    expect(client.getQueryData(DETAIL_KEY)).toEqual(publishedStory());
  });

  it('CREATE-US-07-AC05: 임시 저장본의 tags·characters가 null(유지)이면 정본 태그·캐릭터를 그대로 두고 제목만 복원한다', async () => {
    seed();
    on(CREATION, () => creationDto({ basic: { ...STAGED_BASIC, tags: null, characters: null } }));
    const onUnsaved = jest.fn();
    await render(screenEl(onUnsaved));

    // 화면 전체 조회가 깨지지 않고 임시 저장본 제목으로 채운다
    expect(value('제목')).toBe('임시 제목');
    expect(value('한 줄 소개')).toBe('');
    // null은 빈 목록이 아니다: 처음 받은 공개 정본의 캐릭터·태그를 이어 쓴다
    expect(value('캐릭터 1 이름')).toBe('루나');
    expect(value('캐릭터 1 상세')).toBe('공개 상세');
    expect(screen.queryByLabelText('캐릭터 2 이름')).toBeNull();
    expect(screen.getByLabelText('공개태그 태그 삭제')).toBeTruthy();
    // 합친 값을 기준으로 삼으므로 복원 직후는 미저장 변경이 아니다
    expect(onUnsaved).not.toHaveBeenCalledWith(true);
    expect(client.getQueryData(DETAIL_KEY)).toEqual(publishedStory());
  });

  it('CREATE-US-07-AC05: 임시 저장본의 tags가 [](모두 지움)이면 정본 태그를 이어 쓰지 않는다', async () => {
    seed();
    on(CREATION, () => creationDto({ basic: { ...STAGED_BASIC, tags: [], characters: null } }));
    await render(screenEl());

    expect(value('제목')).toBe('임시 제목');
    expect(screen.queryByLabelText('공개태그 태그 삭제')).toBeNull();
    expect(value('캐릭터 1 이름')).toBe('루나');
  });

  it('CREATE-US-07-AC05: basic이 없으면(null 포함) 지금처럼 공개 정본으로 채운다', async () => {
    seed();
    on(CREATION, () => creationDto({ basic: null }));
    await render(screenEl());

    expect(value('제목')).toBe('공개 제목');
    expect(value('캐릭터 1 이름')).toBe('루나');
  });

  it('CREATE-US-07-AC05: 공통 저장 조회가 실패하면 지금처럼 공개 정본으로 채운다', async () => {
    seed();
    await render(screenEl());

    expect(callsTo(CREATION)).toBe(1);
    expect(value('제목')).toBe('공개 제목');
  });

  it('CREATE-US-07-AC05: 복원 뒤 아직 고치지 않았으면 미저장 변경으로 알리지 않는다', async () => {
    seed();
    on(CREATION, () => creationDto({ basic: { ...STAGED_BASIC, characters: [STAGED_BASIC.characters[0]] } }));
    const onUnsaved = jest.fn();
    await render(screenEl(onUnsaved));

    expect(value('제목')).toBe('임시 제목');
    expect(onUnsaved).not.toHaveBeenCalledWith(true);
    await fireEvent.changeText(screen.getByLabelText('제목'), '임시 제목 고침');
    expect(onUnsaved).toHaveBeenLastCalledWith(true);
  });

  it('CREATE-US-07-AC05: 공통 저장 조회를 다시 받아도 고치고 있는 입력을 덮어쓰지 않는다', async () => {
    seed();
    on(CREATION, () => creationDto({ basic: STAGED_BASIC }));
    await render(screenEl());
    await fireEvent.changeText(screen.getByLabelText('제목'), '입력 중');

    handlers[CREATION] = [() => creationDto({ basic: { ...STAGED_BASIC, title: '다른 곳의 임시 제목' } })];
    await act(async () => {
      await client.refetchQueries({ queryKey: storyCreationKey('1') });
    });

    expect(callsTo(CREATION)).toBe(2);
    expect(value('제목')).toBe('입력 중');
  });

  it('CREATE-US-07-AC05: 비공개·공개 스토리에서 임시 저장본으로 복원한 기본 정보는 공개 정본에 직접 저장하지 않는다', async () => {
    seed();
    on(CREATION, () => creationDto({ basic: { ...STAGED_BASIC, characters: [STAGED_BASIC.characters[0]] } }));
    on(BASIC, () => {
      throw new Error('보내면 안 됨');
    });
    await render(screenEl());
    await fireEvent.changeText(screen.getByLabelText('제목'), '임시 제목 고침');
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: '변경 내용 저장' }));
    });

    expect(callsTo(BASIC)).toBe(0);
    expect(screen.getByText(/임시 저장한 내용/)).toBeTruthy();
    expect(value('제목')).toBe('임시 제목 고침');
  });
});
