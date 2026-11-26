// CREATE-US-12 제작 화면 셸(작업 화면 쪽): 편집 화면과 같은 6개 탭·머리글, 요청한 구역으로 열기,
// 기본 설정·유저 프로필 넘기기(미저장이면 막음), 말투·서술 안의 대화 예시, 공개 범위의 공개 저장·삭제, 하단 고정 저장 줄.
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as baseRender, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { Alert } from 'react-native';
import { usePreventRemove } from 'expo-router';
import { apiRequest } from '@/lib/api-client';
import { defaultExpression, emptyScene, type CreationSaveDocument } from '@/shared/story-types';
import { StoryListScreen, type CommonSaveRepository, type EditorStory } from '@/features/story-publish';
type StorySummary = { id: string; title: string; saveState: string; updatedAt: string };
import { CommonCreationWorkspace } from '../../components/CommonCreationWorkspace';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ usePreventRemove: jest.fn() }));
// 삭제는 실제 쓰기 잠금·훅·api.ts를 거치고, 서버 요청(apiRequest)만 가짜로 바꾼다.
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiRequest: jest.fn() };
});
const request = apiRequest as jest.MockedFunction<typeof apiRequest>;
notifyManager.setScheduler((callback) => callback());
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const render = (element: ReactElement) => baseRender(element, { wrapper });

const MOCKUP_TABS = ['기본 설정', '말투·서술', '인트로', '초기 상태', '유저 프로필', '공개 범위'];

function fixture() {
  const data: CreationSaveDocument = {
    id: '1',
    title: '가상',
    saveState: 'draft',
    updatedAt: '2026-11-17T00:00:00Z',
    speech: { ...defaultExpression(), style: { mode: 'custom', text: '원문' } },
    characters: [],
    fewshots: [],
    intros: [
      {
        id: '30',
        clientKey: 'intro-30',
        title: '첫 만남',
        messages: [{ id: '31', clientKey: 'm-31', speakerKind: 'narrator', characterId: null, body: '*비*' }],
        scene: emptyScene(),
      },
    ],
    relations: [],
    affinities: [],
  };
  const save = jest.fn(async (...[document, state]: Parameters<CommonSaveRepository['save']>) =>
    structuredClone({ ...document, saveState: state }),
  );
  const repository: CommonSaveRepository = { load: jest.fn(async () => structuredClone(data)), save };
  return { repository, save };
}

beforeEach(() => {
  request.mockReset();
  // 삭제된 스토리의 잠금은 QueryClient 수명 동안 유지되므로 사례마다 새 클라이언트를 쓴다.
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData<EditorStory>(['stories', 'detail', '1'], {
    id: '1',
    title: '가상',
    subtitle: '',
    world: '',
    tags: [],
    characters: [],
    saveState: '임시 저장',
    updatedAt: '2026-11-17T00:00:00Z',
    issues: [],
  });
});

// 탭 줄 ScrollView는 접근성 요소가 아니라 role로 찾을 수 없어 testID로 찾는다(탭은 각각 접근성 요소로 남긴다).
const tabList = () => screen.getByTestId('editor-tabs');
const tabNames = () =>
  within(tabList())
    .getAllByRole('tab')
    .map((tab) => within(tab).getByText(/.+/).props.children);

describe('CREATE-US-12: 작업 화면 셸', () => {
  it('CREATE-US-12: 편집 화면과 같은 6개 탭·머리글을 보이고 요청한 구역(intro)으로 연다', async () => {
    const { repository } = fixture();
    await render(<CommonCreationWorkspace repository={repository} storyId="1" initialSection="intro" />);
    await waitFor(() => expect(screen.getByRole('tab', { name: '인트로', selected: true })).toBeTruthy());

    expect(tabNames()).toEqual(MOCKUP_TABS);
    expect(tabList().props.horizontal).toBe(true);
    expect(screen.getByRole('header', { name: '가상' })).toBeTruthy();
    // 하단 고정 줄의 「임시 저장」 버튼과 겹치지 않도록 머리글 안의 상태 배지만 본다.
    expect(within(screen.getByTestId('editor-header')).getByText('임시 저장', { exact: true })).toBeTruthy();
  });

  it('CREATE-US-12: 말투·서술 탭 안에 표현 설정과 대화 예시 목록이 함께 있다', async () => {
    const { repository } = fixture();
    await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
    await waitFor(() => expect(screen.getByLabelText('커스텀 문체')).toBeTruthy());

    expect(screen.getByRole('tab', { name: '말투·서술', selected: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: '예시 추가' })).toBeTruthy();
  });

  it.each([
    ['기본 설정', 'basic'],
    ['유저 프로필', 'profile'],
  ])('CREATE-US-12: 저장된 그대로면 「%s」 탭은 onOpenEditor(%s)로 넘긴다', async (tab, section) => {
    const { repository, save } = fixture();
    const onOpenEditor = jest.fn();
    await render(<CommonCreationWorkspace repository={repository} storyId="1" onOpenEditor={onOpenEditor} />);
    await waitFor(() => expect(screen.getByLabelText('커스텀 문체')).toBeTruthy());

    await fireEvent.press(screen.getByRole('tab', { name: tab }));

    expect(onOpenEditor).toHaveBeenCalledTimes(1);
    expect(onOpenEditor).toHaveBeenCalledWith(section);
    // 넘기기는 저장(공개 포함)을 대신 보내지 않는다.
    expect(save).not.toHaveBeenCalled();
  });

  it('CREATE-US-12: 저장하지 않은 변경이 있으면 기본 설정으로 넘기지 않고 안내하며 입력을 남긴다', async () => {
    const { repository, save } = fixture();
    const onOpenEditor = jest.fn();
    await render(<CommonCreationWorkspace repository={repository} storyId="1" onOpenEditor={onOpenEditor} />);
    await waitFor(() => expect(screen.getByLabelText('커스텀 문체')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('커스텀 문체'), '바뀐 문체');

    await fireEvent.press(screen.getByRole('tab', { name: '기본 설정' }));

    expect(onOpenEditor).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        '저장하지 않은 변경이 있어 기본 설정으로 이동하지 않았어요. 입력은 그대로예요. 먼저 임시 저장해 주세요.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('tab', { name: '말투·서술', selected: true })).toBeTruthy();
    expect(screen.getByDisplayValue('바뀐 문체')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it('CREATE-US-12: 공개 범위 탭에 공개 상태 선택·저장과 스토리 삭제가 있다', async () => {
    const { repository } = fixture();
    await render(<CommonCreationWorkspace repository={repository} storyId="1" initialSection="visibility" />);
    await waitFor(() => expect(screen.getByRole('radio', { name: '비공개' })).toBeTruthy());

    expect(screen.getByRole('tab', { name: '공개 범위', selected: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: '저장' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '스토리 삭제' })).toBeTruthy();
  });

  it('CREATE-US-12: 공개 범위 탭은 목업처럼 「어떻게 보관할까요?」·저장 상태 카드·고른 상태 설명을 보이고 저장은 하단 줄에 둔다', async () => {
    const { repository, save } = fixture();
    await render(<CommonCreationWorkspace repository={repository} storyId="1" initialSection="visibility" />);
    await waitFor(() => expect(screen.getByRole('radio', { name: '미등록' })).toBeChecked());

    expect(screen.getByRole('header', { name: '어떻게 보관할까요?' })).toBeTruthy();
    expect(screen.getByText('작성 중인 내용과 완성된 스토리를 구분해요.')).toBeTruthy();
    expect(within(screen.getByLabelText('미등록 설명')).getByText(/미완성 내용을 보관해요/)).toBeTruthy();

    await fireEvent.press(screen.getByRole('radio', { name: '공개' }));
    expect(screen.getByRole('radio', { name: '공개' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '미등록' })).not.toBeChecked();
    expect(
      within(screen.getByLabelText('공개 설명')).getByText('다른 이용자에게 공개하는 완성 상태예요.'),
    ).toBeTruthy();

    // 저장 버튼은 하단 고정 줄에 있고, 완성 검증(캐릭터 사진 등)은 그대로 막는다.
    const footer = within(screen.getByTestId('sticky-footer-actions'));
    expect(footer.getByRole('button', { name: '임시 저장' })).toBeTruthy();
    expect(footer.getByRole('button', { name: '공개로 저장' })).toBeTruthy();
    // 스토리 삭제 구역은 본문에 남는다.
    expect(
      within(screen.getByTestId('sticky-footer-actions')).queryByRole('button', { name: '스토리 삭제' }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: '스토리 삭제' })).toBeTruthy();

    // 바뀐 것이 없으면 임시 저장은 보내지 않는다(useCommonSave 동작 그대로).
    await fireEvent.press(footer.getByRole('button', { name: '임시 저장' }));
    expect(save).not.toHaveBeenCalled();
    // 다른 탭(말투·서술)에서 확정한 변경이 있으면 공개 범위 탭의 하단 「임시 저장」이 보낸다.
    await fireEvent.changeText(screen.getByLabelText('커스텀 문체', { includeHiddenElements: true }), '바뀐 문체');
    await fireEvent.press(footer.getByRole('button', { name: '임시 저장' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });

  it('CREATE-US-12: 말투·서술 탭의 대화 예시는 「대화 예시」 제목·「선택」 표시 머리글과 카드 목록이고, 카드를 누르면 기존 편집기로 펼친다', async () => {
    const { repository } = fixture();
    await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
    await waitFor(() => expect(screen.getByLabelText('커스텀 문체')).toBeTruthy());

    // 제목과 「선택」 표시는 문체 스타일처럼 따로 그린다(한 글자열 「대화 예시 선택」이 아니다).
    const heading = within(screen.getByTestId('fewshot-heading'));
    expect(heading.getByRole('header', { name: '대화 예시' })).toBeTruthy();
    expect(heading.getByText('선택')).toBeTruthy();
    expect(heading.getByText('말투 참고 예시')).toBeTruthy();
    expect(screen.queryByText('대화 예시 선택')).toBeNull();
    expect(screen.queryByRole('header', { name: '대화 예시 선택' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '예시 추가' }));
    expect(screen.getByText('아직 말풍선이 없어요')).toBeTruthy();
    expect(screen.getByRole('button', { name: '예시 1 편집' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '예시 1 삭제' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: '상황 예시 1 펼쳐 편집' }));
    expect(screen.queryByRole('button', { name: '예시 추가' })).toBeNull();
  });

  it('CREATE-US-12: 말투·서술 탭의 하단 고정 줄 「임시 저장」은 공개 상태를 바꾸지 않는 임시 저장을 보낸다', async () => {
    const { repository, save } = fixture();
    await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
    await waitFor(() => expect(screen.getByLabelText('커스텀 문체')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('커스텀 문체'), '바뀐 문체');

    await fireEvent.press(screen.getByRole('button', { name: '임시 저장' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][1]).toBe('draft');
  });

  describe('CREATE-US-12: 공개 범위 탭에서 삭제하는 중', () => {
    function deferredDelete() {
      let resolve!: () => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      request.mockImplementation((_path, init) =>
        init?.method === 'DELETE' ? (promise as Promise<never>) : Promise.reject(new Error('처리하지 않은 요청')),
      );
      return { resolve, reject };
    }

    async function startDelete() {
      const { repository } = fixture();
      const handlers = { onOpenEditor: jest.fn(), onDeleted: jest.fn(), onBack: jest.fn() };
      await render(
        <CommonCreationWorkspace repository={repository} storyId="1" initialSection="visibility" {...handlers} />,
      );
      await waitFor(() => expect(screen.getByRole('radio', { name: '비공개' })).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', { name: '스토리 삭제' }));
      await fireEvent.press(screen.getByRole('button', { name: '삭제' }));
      expect(screen.getByRole('button', { name: '삭제 중…' })).toBeTruthy();
      return handlers;
    }

    it('편집 화면 탭·뒤로 가기로 넘어가지 않고, 작업 화면 탭은 옮기며, 성공하면 목록으로 한 번 돌아간다', async () => {
      const pending = deferredDelete();
      const { onOpenEditor, onDeleted, onBack } = await startDelete();

      await fireEvent.press(screen.getByRole('tab', { name: '기본 설정' }));
      expect(onOpenEditor).not.toHaveBeenCalled();
      expect(screen.getByText(DELETING_MESSAGE)).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('목록으로 돌아가기'));
      expect(onBack).not.toHaveBeenCalled();

      // 작업 화면이 맡는 탭은 그대로 옮길 수 있다.
      await fireEvent.press(screen.getByRole('tab', { name: '인트로' }));
      expect(screen.getByRole('tab', { name: '인트로', selected: true })).toBeTruthy();

      await act(async () => pending.resolve());

      expect(onDeleted).toHaveBeenCalledTimes(1);
      expect(onOpenEditor).not.toHaveBeenCalled();
      expect(onBack).not.toHaveBeenCalled();
    });

    it('CREATE-US-12 회귀: 응답 전에 라우트가 포커스를 잃으면 자동 이동하지 않고, 돌아온 뒤 머리글 뒤로 가기로 한 번 나간다', async () => {
      client.setQueryData<StorySummary[]>(
        ['stories', 'list'],
        [
          { id: '1', title: '가상', saveState: '임시 저장', updatedAt: '2026-11-17T00:00:00Z' },
          { id: '8', title: '다른 스토리', saveState: '임시 저장', updatedAt: '2026-11-17T00:00:00Z' },
        ],
      );
      const pending = deferredDelete();
      let focused = true;
      const { repository } = fixture();
      const onDeleted = jest.fn();
      const onBack = jest.fn();
      await render(
        <CommonCreationWorkspace
          repository={repository}
          storyId="1"
          initialSection="visibility"
          onDeleted={onDeleted}
          onBack={onBack}
          isRouteFocused={() => focused}
        />,
      );
      await waitFor(() => expect(screen.getByRole('radio', { name: '비공개' })).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', { name: '스토리 삭제' }));
      await fireEvent.press(screen.getByRole('button', { name: '삭제' }));

      focused = false;
      await act(async () => pending.resolve());

      expect(onDeleted).not.toHaveBeenCalled();
      expect(onBack).not.toHaveBeenCalled();
      expect(client.getQueryData<StorySummary[]>(['stories', 'list'])?.map((s) => s.id)).toEqual(['8']);

      // 다시 포커스된 뒤 머리글 뒤로 가기는 삭제 잠금과 관계없이 나갈 수 있고, 이동은 한 번만 한다.
      focused = true;
      await fireEvent.press(screen.getByLabelText('목록으로 돌아가기'));
      await fireEvent.press(screen.getByLabelText('목록으로 돌아가기'));
      expect(onDeleted).toHaveBeenCalledTimes(1);
      expect(onBack).not.toHaveBeenCalled();
      // 나중에 목록을 열면 삭제 안내를 한 번 받는다.
      await render(<StoryListScreen onOpen={jest.fn()} />);
      expect(screen.getByText('스토리를 삭제했어요.')).toBeTruthy();
    });

    it('CREATE-US-12 회귀: 포커스된 채로 성공하면 목록으로 한 번 이동한다', async () => {
      const pending = deferredDelete();
      const { repository } = fixture();
      const onDeleted = jest.fn();
      await render(
        <CommonCreationWorkspace
          repository={repository}
          storyId="1"
          initialSection="visibility"
          onDeleted={onDeleted}
          isRouteFocused={() => true}
        />,
      );
      await waitFor(() => expect(screen.getByRole('radio', { name: '비공개' })).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', { name: '스토리 삭제' }));
      await fireEvent.press(screen.getByRole('button', { name: '삭제' }));
      await act(async () => pending.resolve());

      expect(onDeleted).toHaveBeenCalledTimes(1);
    });

    it('삭제가 실패하면 다시 편집 화면 탭으로 넘길 수 있다', async () => {
      const pending = deferredDelete();
      const { onOpenEditor, onDeleted } = await startDelete();

      await act(async () => pending.reject(new Error('삭제 실패')));
      expect(onDeleted).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByRole('tab', { name: '기본 설정' }));
      expect(onOpenEditor).toHaveBeenCalledTimes(1);
      expect(onOpenEditor).toHaveBeenCalledWith('basic');
    });
  });
});

const DELETING_MESSAGE = '스토리를 삭제하는 중에는 다른 화면으로 이동할 수 없어요. 삭제가 끝난 뒤 다시 눌러 주세요.';

// CREATE-US-12 공개 범위 선택만 바꾼 상태: 최종 저장 전까지 저장되지 않은 선택이다.
// 내용 변경(dirty)으로 세지 않지만, 뒤로 가기·다시 불러오기·편집 화면 탭으로 넘기기는 기존 이탈 확인을 거친다.
describe('CREATE-US-12: 공개 범위 선택만 바꾼 상태의 이탈 보호', () => {
  const preventRemove = usePreventRemove as jest.MockedFunction<typeof usePreventRemove>;
  const guardOn = () => preventRemove.mock.calls.at(-1)?.[0];
  type AlertButtons = Parameters<typeof Alert.alert>[2];
  let alert: jest.SpyInstance;
  const lastButtons = (): NonNullable<AlertButtons> => alert.mock.calls.at(-1)?.[2] ?? [];
  const press = async (text: string) => {
    const button = lastButtons().find((b) => b.text === text);
    await act(async () => button?.onPress?.());
  };
  const UNCOMMITTED =
    '고른 저장 상태는 아직 반영되지 않았어요. 「공개로 저장」을 눌러야 바뀌고, 임시 저장은 저장 상태를 바꾸지 않아요.';

  beforeEach(() => {
    preventRemove.mockClear();
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });
  afterEach(() => alert.mockRestore());

  async function choosePublic(props: Partial<Parameters<typeof CommonCreationWorkspace>[0]> = {}) {
    const { repository, save } = fixture();
    const handlers = { onBack: jest.fn(), onOpenEditor: jest.fn() };
    await render(
      <CommonCreationWorkspace
        repository={repository}
        storyId="1"
        initialSection="visibility"
        {...handlers}
        {...props}
      />,
    );
    await waitFor(() => expect(screen.getByRole('radio', { name: '미등록' })).toBeChecked());
    expect(guardOn()).toBe(false);
    await fireEvent.press(screen.getByRole('radio', { name: '공개' }));
    return { repository, save, ...handlers };
  }

  it('선택만 바꾸면 내용 변경으로 세지 않고, 아직 반영되지 않았다는 안내와 이탈 보호를 켠다', async () => {
    await choosePublic();

    expect(screen.getByRole('radio', { name: '공개' })).toBeChecked();
    expect(screen.queryByText('저장하지 않은 변경이 있습니다.')).toBeNull();
    expect(screen.getByText('저장한 설정과 같습니다.')).toBeTruthy();
    expect(screen.getByText(UNCOMMITTED)).toBeTruthy();
    // 라우트 제거(스와이프·하드웨어 뒤로 가기·웹 새로고침)는 기존 가드가 확인한다.
    expect(guardOn()).toBe(true);
  });

  it('원래 상태로 되돌리면 안내와 이탈 보호가 꺼진다', async () => {
    await choosePublic();
    await fireEvent.press(screen.getByRole('radio', { name: '미등록' }));

    expect(screen.queryByText(UNCOMMITTED)).toBeNull();
    expect(guardOn()).toBe(false);
  });

  it('머리글 뒤로 가기: 취소하면 선택을 남기고, 나가기를 확정하면 가드를 먼저 끄고 한 번만 나간다', async () => {
    const { onBack } = await choosePublic();

    await fireEvent.press(screen.getByLabelText('목록으로 돌아가기'));
    expect(alert).toHaveBeenCalledTimes(1);
    await press('취소');
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: '공개' })).toBeChecked();
    expect(guardOn()).toBe(true);

    await fireEvent.press(screen.getByLabelText('목록으로 돌아가기'));
    expect(alert).toHaveBeenCalledTimes(2);
    preventRemove.mockClear();
    await press('나가기');
    expect(onBack).toHaveBeenCalledTimes(1);
    // 라우트 제거 가드가 다시 묻지 않도록 onBack 전에 꺼진다.
    expect(preventRemove.mock.calls.length).toBeGreaterThan(0);
    expect(preventRemove.mock.calls.every(([on]) => on === false)).toBe(true);
  });

  it.each([
    ['기본 설정', 'basic'],
    ['유저 프로필', 'profile'],
  ])(
    '「%s」 탭으로 넘기기: 기존 확인을 거치고 취소하면 선택을 남기며, 확정하면 가드를 끈 뒤 한 번 넘긴다',
    async (tab, section) => {
      const { onOpenEditor, save } = await choosePublic();

      await fireEvent.press(screen.getByRole('tab', { name: tab }));
      expect(alert).toHaveBeenCalledTimes(1);
      expect(alert.mock.calls[0][1]).toBe('저장하지 않은 변경 내용이 사라집니다. 나가시겠습니까?');
      await press('취소');
      expect(onOpenEditor).not.toHaveBeenCalled();
      expect(screen.getByRole('radio', { name: '공개' })).toBeChecked();
      expect(screen.getByRole('tab', { name: '공개 범위', selected: true })).toBeTruthy();
      expect(guardOn()).toBe(true);

      await fireEvent.press(screen.getByRole('tab', { name: tab }));
      let guardWhenOpened: boolean | undefined;
      onOpenEditor.mockImplementation(() => {
        guardWhenOpened = guardOn();
      });
      await press('나가기');
      expect(onOpenEditor).toHaveBeenCalledTimes(1);
      expect(onOpenEditor).toHaveBeenCalledWith(section);
      expect(guardWhenOpened).toBe(false);
      // 넘기기는 저장(공개 포함)을 대신 보내지 않는다.
      expect(save).not.toHaveBeenCalled();
    },
  );

  it('최신 편집 내용 다시 불러오기: 확인을 먼저 보이고, 변경 유지를 누르면 선택을 남긴다', async () => {
    const { repository } = await choosePublic();

    await fireEvent.press(screen.getByRole('button', { name: '최신 편집 내용 다시 불러오기' }));
    expect(screen.getByText('저장하지 않은 변경 내용이 사라집니다.')).toBeTruthy();
    expect(repository.load).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: '변경 유지' }));

    expect(repository.load).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('radio', { name: '공개' })).toBeChecked();
  });

  it('임시 저장은 고른 상태가 아니라 저장된 상태(미등록)로 보내고, 고른 선택과 안내는 남는다', async () => {
    const { save } = await choosePublic();
    await fireEvent.changeText(screen.getByLabelText('커스텀 문체', { includeHiddenElements: true }), '바뀐 문체');

    await fireEvent.press(
      within(screen.getByTestId('sticky-footer-actions')).getByRole('button', { name: '임시 저장' }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][1]).toBe('draft');
    expect(save.mock.calls[0][4]).toBe('temporary');
    await waitFor(() => expect(screen.getByText('저장한 설정과 같습니다.')).toBeTruthy());
    expect(screen.getByRole('radio', { name: '공개' })).toBeChecked();
    expect(screen.getByText(UNCOMMITTED)).toBeTruthy();
    expect(guardOn()).toBe(true);
  });

  it('탭을 바꿀 때의 자동 임시 저장도 고른 상태로 공개하지 않는다', async () => {
    const { save } = await choosePublic();
    await fireEvent.changeText(screen.getByLabelText('커스텀 문체', { includeHiddenElements: true }), '바뀐 문체');

    await fireEvent.press(screen.getByRole('tab', { name: '인트로' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][1]).toBe('draft');
    expect(save.mock.calls[0][2]).toBe('auto');
  });

  it('저장 버튼으로 최종 저장하면 선택이 반영되어 안내와 이탈 보호가 꺼진다', async () => {
    const { repository, save } = fixture();
    await render(<CommonCreationWorkspace repository={repository} storyId="1" initialSection="visibility" />);
    await waitFor(() => expect(screen.getByRole('radio', { name: '미등록' })).toBeChecked());
    await fireEvent.press(screen.getByRole('radio', { name: '비공개' }));
    expect(guardOn()).toBe(true);

    await fireEvent.press(screen.getByRole('button', { name: '비공개로 저장' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][1]).toBe('private');
    await waitFor(() => expect(guardOn()).toBe(false));
    expect(screen.getByRole('radio', { name: '비공개' })).toBeChecked();
    expect(screen.queryByText(/고른 저장 상태는 아직 반영되지 않았어요/)).toBeNull();
  });
});
