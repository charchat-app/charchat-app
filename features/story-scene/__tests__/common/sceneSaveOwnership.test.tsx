// CREATE-US-07-AC07/08 2~4번 작업 화면은 맡지 않는 영역(1번 basic·5번 presets·6번 images)을 다시 보내지 않는다.
// 불러온 시점의 값이 남아 있다가 기본 설정 화면에서 그 뒤에 저장한 값을 덮어쓰지 않는지 확인한다.
// 서버와 실제로 맞춰 본 결과가 아니라, 실제 저장소 직렬화(fetch 본문)와 저장 문서 경계만 검증한다.
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as baseRender, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { defaultExpression, toExpressionRow, type ExpressionSettings } from '@/shared/story-types';
import {
  createCommonSaveRepository,
  type CommonSaveDocument,
  type CommonSaveRepository,
  type EditorStory,
} from '@/features/story-publish';
import { CommonCreationWorkspace } from '../../components/CommonCreationWorkspace';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ usePreventRemove: jest.fn() }));
notifyManager.setScheduler((callback) => callback());
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const render = (element: ReactElement) => baseRender(element, { wrapper });
beforeEach(() => {
  client.clear();
  // CREATE-US-12 머리글 제목·배지가 스토리 조회 캐시(storyKeys.detail)를 함께 본다. 이 검증은 공통 저장 요청만 세므로
  // 머리글용 상세 조회가 fetch를 더 부르지 않게 캐시를 미리 채운다(다른 작업 화면 테스트와 같은 방식).
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

const speech = (text: string): ExpressionSettings => ({ ...defaultExpression(), style: { mode: 'custom', text } });
const FOREIGN = ['basic', 'presets', 'images'] as const;

/** 공개 범위 탭에서 말투(숨은 탭의 입력)를 바꾼 뒤 버튼을 누른다. */
async function editThenPress(text: string, button: '임시 저장' | '저장') {
  await fireEvent.changeText(screen.getByLabelText('커스텀 문체', { includeHiddenElements: true }), text);
  await fireEvent.press(screen.getByRole('button', { name: button }));
}

describe('실제 저장소 직렬화', () => {
  const BASE = 'http://localhost:8000/api/v1';
  let fetcher: jest.SpyInstance;
  afterEach(() => fetcher.mockRestore());

  it('CREATE-US-07-AC07/08: 불러온 presets를 임시 저장·저장 요청 본문에 다시 싣지 않고 2~4번 영역은 보낸다', async () => {
    const response = (body: Record<string, unknown> | null, requestId?: string) => {
      const { story_id: _storyId, ...expression } = toExpressionRow('1', speech('원문'));
      return {
        story_id: '1',
        title: '가상',
        save_state: body?.save_state ?? 'draft',
        saved_at: '2026-11-17T00:00:00Z',
        expression: body?.expression ?? expression,
        characters: [],
        fewshots: [],
        intros: [],
        relations: [],
        affinities: [],
        // 조회 시점의 프리셋. 이후 기본 설정 화면이 바꿨더라도 이 화면은 이 값을 갖고 있다.
        presets: [{ id: 5, name: '예전 프로필', image_id: null, description: null }],
        ...(requestId ? { request_id: requestId } : {}),
      };
    };
    fetcher = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null;
      const key = new Headers(init?.headers).get('Idempotency-Key') ?? undefined;
      return { ok: true, json: async () => response(body, key) } as Response;
    });
    await render(<CommonCreationWorkspace repository={createCommonSaveRepository(BASE)} storyId="1" />);
    await waitFor(() => expect(screen.getByRole('tab', { name: '공개 범위' })).toBeTruthy());
    await waitFor(() => expect(screen.getByLabelText('커스텀 문체', { includeHiddenElements: true })).toBeTruthy());
    await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));

    await editThenPress('임시 원문', '임시 저장');
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await editThenPress('저장 원문', '저장');
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));

    const sent = fetcher.mock.calls
      .slice(1)
      .map(([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>);
    expect(sent.map((body) => body.kind)).toEqual(['temporary', 'save']);
    expect(sent.map((body) => (body.expression as { custom_style?: unknown }).custom_style)).toEqual([
      '임시 원문',
      '저장 원문',
    ]);
    for (const body of sent) {
      for (const key of FOREIGN) expect(body).not.toHaveProperty(key);
      // CREATE-US-07-AC03/07: 2~4번 작업 화면의 저장은 2~4번을 반영해야 하므로 preserve_scene을 싣지 않는다
      expect(body).not.toHaveProperty('preserve_scene');
      for (const key of ['fewshots', 'intros', 'relations', 'affinities', 'save_state', 'mode'])
        expect(body).toHaveProperty(key);
    }
  });
});

describe('저장 문서 경계', () => {
  it('CREATE-US-07-AC07/08: 조회 문서에 basic·presets·images가 있어도 임시 저장·저장 문서에서 뺀다', async () => {
    const loaded: CommonSaveDocument = {
      id: '1',
      title: '가상',
      saveState: 'draft',
      updatedAt: '2026-11-17T00:00:00Z',
      speech: speech('원문'),
      characters: [],
      fewshots: [],
      intros: [],
      relations: [],
      affinities: [],
      basic: { title: '예전 제목', subtitle: '', world: '', tags: [], characters: [] },
      presets: [{ id: '5', name: '예전 프로필', detail: '', imageId: null, photoUrl: null }],
      images: { characters: [], story_image_ids: [9] },
    };
    const save = jest.fn<ReturnType<CommonSaveRepository['save']>, Parameters<CommonSaveRepository['save']>>(
      async (document, state) => ({ ...structuredClone(document), saveState: state }),
    );
    const repository: CommonSaveRepository = { load: jest.fn(async () => structuredClone(loaded)), save };
    await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
    await waitFor(() => expect(screen.getByLabelText('커스텀 문체', { includeHiddenElements: true })).toBeTruthy());
    await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));

    await editThenPress('임시 원문', '임시 저장');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await editThenPress('저장 원문', '저장');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));

    expect(save.mock.calls.map((call) => call[4])).toEqual(['temporary', 'save']);
    for (const [document] of save.mock.calls) {
      for (const key of FOREIGN) expect(document).not.toHaveProperty(key);
      expect(document.preserveScene).not.toBe(true);
      expect(document.title).toBe('가상');
    }
    expect(save.mock.calls[1][0].speech.style).toEqual({ mode: 'custom', text: '저장 원문' });
  });
});
