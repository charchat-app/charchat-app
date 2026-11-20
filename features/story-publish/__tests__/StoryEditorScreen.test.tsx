// CREATE-US-05-AC08 스토리 편집 화면의 유저 프로필 탭 연결 (프리셋 편집기 조립)
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as rtlRender, screen, within } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import {
  PanResponder,
  type GestureResponderEvent,
  type PanResponderCallbacks,
  type PanResponderGestureState,
} from 'react-native';

import { StoryEditorScreen } from '../components/StoryEditorScreen';
import type { EditorStory } from '../types';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockMutate = jest.fn();
const mockStories: Record<string, EditorStory> = {};

jest.mock('../hooks/useStories', () => ({
  useStory: (id: string) => ({
    isPending: false,
    isError: false,
    data: mockStories[id],
    error: null,
    refetch: jest.fn(),
  }),
  useSaveStoryBasic: () => ({ mutate: mockMutate, isPending: false, isError: false, error: null }),
}));

const story = (id: string, characterNames: string[]): EditorStory => ({
  id,
  title: `스토리 ${id}`,
  subtitle: '',
  world: '',
  tags: [],
  characters: characterNames.map((name, i) => ({ id: `${id}-c${i}`, name, detail: '' })),
  saveState: '임시 저장',
  updatedAt: '2026-11-20T00:00:00Z',
  issues: [],
});

/** 기본 설정의 태그 자동검색이 쿼리 클라이언트를 쓴다. 서버 호출은 하지 않는다(입력이 비어 있으면 꺼짐). */
function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return rtlRender(ui, { wrapper });
}

const NOT_PERSISTED = /유저 프로필은 아직 저장되지 않아요/;

beforeEach(() => {
  mockMutate.mockReset();
  mockStories.a = story('a', ['루나']);
  mockStories.b = story('b', ['카일']);
});

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
  it('유저 프로필 탭을 열면 프리셋 편집기와 저장되지 않는다는 안내를 보여 준다', async () => {
    await render(<StoryEditorScreen storyId="a" onBack={jest.fn()} />);
    expect(screen.queryByRole('button', { name: '+ 프로필 추가' })).toBeNull();

    await openTab('유저 프로필');

    expect(screen.getByRole('button', { name: '+ 프로필 추가' })).toBeTruthy();
    expect(screen.getByText('아직 추천 프로필이 없어요.')).toBeTruthy();
    expect(screen.getAllByText(NOT_PERSISTED).length).toBeGreaterThan(0);
    expect(screen.queryByText('유저 프로필 탭은 아직 연결되지 않았어요.')).toBeNull();
  });

  it('편집기로 추가·수정·순서 변경한 내용이 탭을 오가도 남아 있다', async () => {
    await render(<StoryEditorScreen storyId="a" onBack={jest.fn()} />);
    await openTab('유저 프로필');

    await addPreset('여행자', '길을 잃은 여행자');
    await addPreset('기사');
    expect(presetNames()).toEqual(['여행자', '기사']);
    expect(screen.queryByText('이미지를 선택해 주세요.')).toBeNull();

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
    await render(<StoryEditorScreen storyId="a" onBack={jest.fn()} />);
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
    await render(<StoryEditorScreen storyId="a" onBack={jest.fn()} />);
    expect(screen.getByRole('button', { name: '임시 저장' })).toBeTruthy();

    await openTab('유저 프로필');
    await addPreset('여행자');

    expect(screen.queryByRole('button', { name: '임시 저장' })).toBeNull();
    expect(screen.queryByRole('button', { name: '변경 내용 저장' })).toBeNull();
    expect(screen.queryByRole('button', { name: '다시 저장' })).toBeNull();
    expect(screen.queryByText(/마지막 저장/)).toBeNull();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('다른 탭의 기본 저장은 그대로 동작하고 프리셋을 함께 보내지 않는다', async () => {
    await render(<StoryEditorScreen storyId="a" onBack={jest.fn()} />);
    await openTab('유저 프로필');
    await addPreset('여행자');
    await openTab('기본 설정');

    await fireEvent.press(screen.getByRole('button', { name: '임시 저장' }));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    const sent = mockMutate.mock.calls[0][0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty('userProfilePresets');
    expect(sent).toMatchObject({ title: '스토리 a', characters: [{ id: 'a-c0', name: '루나', detail: '' }] });
  });

  it('스토리가 바뀌면(라우트 key) 다른 스토리의 프리셋을 보여 주지 않는다', async () => {
    const view = await render(<StoryEditorScreen key="a" storyId="a" onBack={jest.fn()} />);
    await openTab('유저 프로필');
    await addPreset('여행자');

    await view.rerender(<StoryEditorScreen key="b" storyId="b" onBack={jest.fn()} />);
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
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('손잡이로 끄는 동안 편집 화면 스크롤을 멈추고, 놓으면 다시 켠다', async () => {
    await render(<StoryEditorScreen storyId="a" onBack={jest.fn()} />);
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
