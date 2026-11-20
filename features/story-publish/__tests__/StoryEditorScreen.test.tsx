// CREATE-US-01-AC02 기본 설정 탭: 서버 판정 안내를 지금 입력값과 맞춰 표시한다.
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as baseRender, screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

import { ApiError, type FieldIssue } from '@/lib/api-client';

import { saveStoryBasic } from '../api';
import { StoryEditorScreen } from '../components/StoryEditorScreen';
import type { EditorStory } from '../types';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../api', () => ({ ...jest.requireActual('../api'), saveStoryBasic: jest.fn() }));

notifyManager.setScheduler((callback) => callback());
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const render = (element: ReactElement) => baseRender(element, { wrapper });

const NOTICE = '공개·비공개로 저장하려면 표시된 항목을 채워 주세요.';
const MSG = {
  title: '제목을 입력하세요.',
  subtitle: '한 줄 소개를 입력하세요.',
  world: '세계관을 입력하세요.',
  count: '캐릭터는 1~10명 등록해 주세요.',
  name: '캐릭터 이름을 입력하세요.',
  detail: '캐릭터 상세를 입력하세요.',
  duplicate: '같은 이름의 캐릭터가 있어요.',
  tags: '해시태그를 확인해 주세요.',
};

function seed(story: Partial<EditorStory>) {
  client.setQueryData<EditorStory>(['stories', 'detail', '1'], {
    id: '1',
    title: '',
    subtitle: '',
    world: '',
    tags: [],
    characters: [],
    saveState: '임시 저장',
    updatedAt: '2026-11-17T00:00:00Z',
    issues: [],
    ...story,
  });
}

beforeEach(() => {
  client.clear();
  jest.mocked(saveStoryBasic).mockReset();
});

describe('CREATE-US-01-AC02: 서버 누락 안내를 지금 입력값과 맞춘다', () => {
  const missing: FieldIssue[] = [
    { field: 'title', code: 'REQUIRED', message: MSG.title },
    { field: 'subtitle', code: 'REQUIRED', message: MSG.subtitle },
    { field: 'world', code: 'REQUIRED', message: MSG.world },
    { field: 'characters', code: 'CHARACTER_COUNT_OUT_OF_RANGE', message: MSG.count },
  ];

  it('채운 항목의 누락 안내는 다시 저장하지 않아도 사라지고, 다시 지우면 돌아온다', async () => {
    seed({ issues: missing });
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} />);
    for (const message of Object.values(MSG).slice(0, 4)) expect(screen.getByText(message)).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('제목'), '비 오는 서점');
    await fireEvent.changeText(screen.getByLabelText('한 줄 소개'), '단골 손님');
    await fireEvent.changeText(screen.getByLabelText('세계관 · 서사'), '골목 끝 서점');
    expect(screen.queryByText(MSG.title)).toBeNull();
    expect(screen.queryByText(MSG.subtitle)).toBeNull();
    expect(screen.queryByText(MSG.world)).toBeNull();
    // 인원 안내는 아직 캐릭터가 없으므로 남는다
    expect(screen.getByText(MSG.count)).toBeOnTheScreen();
    expect(screen.getByText(NOTICE)).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('제목'), '');
    expect(screen.getByText(MSG.title)).toBeOnTheScreen();
  });

  it('공백만 입력하면 여전히 누락으로 본다', async () => {
    seed({ issues: missing });
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} />);
    await fireEvent.changeText(screen.getByLabelText('제목'), '  \n ');
    expect(screen.getByText(MSG.title)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('제목'), '\u0085');
    expect(screen.getByText(MSG.title)).toBeOnTheScreen();
  });

  it('캐릭터 인원 안내는 인원이 1~10명이 되면 사라지고, 다시 0명이 되면 돌아온다', async () => {
    seed({ title: '가', subtitle: '나', world: '다', issues: [missing[3]] });
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} />);
    expect(screen.getByText(MSG.count)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('+ 캐릭터 추가'));
    expect(screen.queryByText(MSG.count)).toBeNull();
    expect(screen.queryByText(NOTICE)).toBeNull();
    // 새 캐릭터의 빈 이름·상세는 서버 판정 전이므로 앱이 따로 안내를 만들지 않는다
    expect(screen.queryByText(MSG.name)).toBeNull();

    await fireEvent.press(screen.getByText('삭제'));
    expect(screen.getByText(MSG.count)).toBeOnTheScreen();
  });

  it('캐릭터 이름·상세 누락 안내는 그 칸을 채우면 사라지고, 관련 없는 안내는 남는다', async () => {
    seed({
      title: '가',
      subtitle: '나',
      world: '다',
      tags: ['태그'],
      characters: [
        { id: '11', name: '', detail: '' },
        { id: '12', name: '민', detail: '상세' },
      ],
      issues: [
        { field: 'characters[0].name', code: 'REQUIRED', message: MSG.name },
        { field: 'characters[0].description', code: 'REQUIRED', message: MSG.detail },
        { field: 'characters[1].name', code: 'NAME_DUPLICATE', message: MSG.duplicate },
        { field: 'tags', code: 'INVALID_TAGS', message: MSG.tags },
      ],
    });
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} />);

    await fireEvent.changeText(screen.getByLabelText('캐릭터 1 이름'), '서연');
    expect(screen.queryByText(MSG.name)).toBeNull();
    expect(screen.getByText(MSG.detail)).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('캐릭터 2 이름'), '민수');
    // 중복·태그처럼 앱이 다시 판정하지 않는 안내는 다음 저장 결과까지 유지한다
    expect(screen.getByText(MSG.duplicate)).toBeOnTheScreen();
    expect(screen.getByText(MSG.tags)).toBeOnTheScreen();
    expect(screen.getByText(NOTICE)).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('캐릭터 1 이름'), ' ');
    expect(screen.getByText(MSG.name)).toBeOnTheScreen();
  });

  it('저장 실패 안내는 유지하고, 실패 응답의 누락 안내만 입력에 맞춰 사라진다', async () => {
    seed({ issues: [{ field: 'world', code: 'REQUIRED', message: '이전 저장본 세계관 안내' }] });
    jest
      .mocked(saveStoryBasic)
      .mockRejectedValue(
        new ApiError(422, 'STORY_INCOMPLETE', '조건 미충족', [
          { field: 'title', code: 'REQUIRED', message: MSG.title },
        ]),
      );
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} />);

    await fireEvent.press(screen.getByRole('button', { name: '임시 저장' }));
    const failure = '저장 조건을 충족하지 않아 저장하지 않았어요. 입력한 내용은 그대로예요.';
    expect(await screen.findByText(failure)).toBeOnTheScreen();
    expect(screen.getByText(MSG.title)).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('제목'), '비 오는 서점');
    expect(screen.queryByText(MSG.title)).toBeNull();
    // 실패 응답의 안내가 모두 해소돼도 이전 저장본 안내로 되돌아가지 않는다
    expect(screen.queryByText('이전 저장본 세계관 안내')).toBeNull();
    expect(screen.getByText(failure)).toBeOnTheScreen();
  });

  it('합산 3000자 초과 안내는 그대로 표시한다 (AC09)', async () => {
    seed({ world: '가'.repeat(3001), characters: [{ id: '11', name: '', detail: '' }] });
    await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} />);
    expect(screen.getByText(/1자 넘었어요/)).toBeOnTheScreen();
  });

  describe('서버 합산 글자 수 초과 안내 뒤 줄이기 (AC09)', () => {
    const LONG = '서버 판정: 기본 설정 합산 3000자 초과';
    const tooLong: FieldIssue = { field: 'basic_text', code: 'BASIC_TEXT_TOO_LONG', message: LONG };
    // 캐릭터 이름·상세 3자 + 세계관 2998자 = 3001자
    const base = { title: '', subtitle: '', characters: [{ id: '11', name: '민', detail: '상세' }] };

    it('넘는 동안은 지금 글자 수만 보이고, 한도 안으로 줄이면 서버 안내와 상단 안내가 사라진다', async () => {
      seed({ ...base, world: '가'.repeat(2998), issues: [tooLong] });
      await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} />);
      expect(screen.getByText(/1자 넘었어요/)).toBeOnTheScreen();
      // 같은 내용의 서버 문구는 겹쳐 보이지 않는다
      expect(screen.queryByText(LONG)).toBeNull();
      expect(screen.getByText(NOTICE)).toBeOnTheScreen();

      await fireEvent.changeText(screen.getByLabelText('세계관 · 서사'), '가'.repeat(2997));
      expect(screen.queryByText(/넘었어요/)).toBeNull();
      expect(screen.queryByText(LONG)).toBeNull();
      expect(screen.queryByText(NOTICE)).toBeNull();

      // 다시 넘기면 상단 안내도 돌아온다
      await fireEvent.changeText(screen.getByLabelText('세계관 · 서사'), '가'.repeat(2999));
      expect(screen.getByText(/2자 넘었어요/)).toBeOnTheScreen();
      expect(screen.getByText(NOTICE)).toBeOnTheScreen();
    });

    it('줄여도 이름 중복·태그 안내는 다음 저장 결과까지 남는다', async () => {
      seed({
        ...base,
        world: '가'.repeat(2998),
        tags: ['태그'],
        issues: [
          tooLong,
          { field: 'characters[0].name', code: 'NAME_DUPLICATE', message: MSG.duplicate },
          { field: 'tags', code: 'INVALID_TAGS', message: MSG.tags },
        ],
      });
      await render(<StoryEditorScreen storyId="1" onBack={jest.fn()} />);

      await fireEvent.changeText(screen.getByLabelText('세계관 · 서사'), '가'.repeat(2997));
      expect(screen.queryByText(LONG)).toBeNull();
      expect(screen.getByText(MSG.duplicate)).toBeOnTheScreen();
      expect(screen.getByText(MSG.tags)).toBeOnTheScreen();
      expect(screen.getByText(NOTICE)).toBeOnTheScreen();
    });
  });
});
