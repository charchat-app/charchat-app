// CREATE-US-08-AC09 공개 범위 탭(CommonCreationWorkspace)의 등급 선택·검토 결과 표시·저장·검토 상태 새로고침
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as baseRender, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { usePreventRemove } from 'expo-router';
import { defaultExpression, emptyScene } from '@/shared/story-types';
import type { CommonSaveDocument, CommonSaveRepository } from '@/features/story-publish';
import { CommonCreationWorkspace } from '../../components/CommonCreationWorkspace';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ usePreventRemove: jest.fn() }));
notifyManager.setScheduler((callback) => callback());
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const render = (element: ReactElement) => baseRender(element, { wrapper });
beforeEach(() => client.clear());

type Rating = NonNullable<CommonSaveDocument['rating']>;
function fixture(rating: Rating) {
  let data: CommonSaveDocument = {
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
    rating,
  };
  const save = jest.fn(async (...[document, state]: Parameters<CommonSaveRepository['save']>) => {
    // 서버처럼 requested_rating은 실렸을 때만 바꾸고, 응답 전용 rating은 요청에서 읽지 않는다.
    const { requestedRating, rating: _ignored, ...rest } = document;
    data = {
      ...rest,
      saveState: state,
      rating: { ...data.rating!, requested: requestedRating ?? data.rating!.requested },
    };
    return structuredClone(data);
  });
  const load = jest.fn(async (_id: string, _signal?: AbortSignal) => structuredClone(data));
  const repository: CommonSaveRepository = { load, save };
  return { repository, load, save, setStored: (next: Partial<CommonSaveDocument>) => (data = { ...data, ...next }) };
}
const checked = (name: string) => screen.getByRole('radio', { name }).props.accessibilityState?.checked;
async function openVisibility(repository: CommonSaveRepository) {
  const view = await render(<CommonCreationWorkspace repository={repository} storyId="1" guardDraftLeave />);
  await waitFor(() => expect(screen.getByLabelText('커스텀 문체')).toBeTruthy());
  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  return view;
}

it('API의 검토 상태·사유·대상을 보여 주고 고른 등급을 복원한다', async () => {
  const { repository } = fixture({
    requested: 'UNSAFE',
    effective: 'SAFE',
    reviewStatus: 'completed',
    reason: {
      outcome: 'ineligible',
      reasons: ['minor_depicted'],
      targets: [{ reason: 'minor_depicted', kind: 'character', label: '민수' }],
    },
  });
  await openVisibility(repository);
  expect(checked('UNSAFE')).toBe(true);
  expect(screen.getByText('적용 등급: SAFE')).toBeTruthy();
  expect(screen.getByText('등급 검토: 검토 완료')).toBeTruthy();
  expect(screen.getByText('미성년자 또는 제한된 혈연 관계가 확인되어 UNSAFE 등급을 적용할 수 없어요.')).toBeTruthy();
  expect(screen.getByText('캐릭터 「민수」: 미성년자로 묘사됐어요.')).toBeTruthy();
});

it('바뀐 등급만 requestedRating으로 저장하고, 미저장 가드에 반영하며, 재진입 시 복원한다', async () => {
  const { repository, save } = fixture({ requested: null, effective: null, reviewStatus: 'not_reviewed' });
  const view = await openVisibility(repository);
  expect(checked('SAFE')).toBe(true);
  // 등급을 바꾸기 전 탭 이동 자동 저장(바뀐 것 없음)은 보내지 않는다.
  expect(save).not.toHaveBeenCalled();
  expect(jest.mocked(usePreventRemove).mock.calls.at(-1)?.[0]).toBe(false);
  await fireEvent.press(screen.getByRole('radio', { name: 'UNSAFE' }));
  expect(jest.mocked(usePreventRemove).mock.calls.at(-1)?.[0]).toBe(true);
  expect(screen.getByText('저장하지 않은 변경이 있습니다.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][0].requestedRating).toBe('UNSAFE');
  await waitFor(() => expect(jest.mocked(usePreventRemove).mock.calls.at(-1)?.[0]).toBe(false));
  // 저장 뒤 다른 변경만 저장하면 등급은 다시 싣지 않는다(서버가 유지).
  await fireEvent.press(screen.getByRole('tab', { name: '말투·서술' }));
  await fireEvent.changeText(screen.getByLabelText('커스텀 문체'), '바뀐 문체');
  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[1][0].requestedRating ?? null).toBeNull();
  await view.unmount();
  await openVisibility(repository);
  expect(checked('UNSAFE')).toBe(true);
});

it('검토 상태 새로고침은 검토 결과만 바꾸고 입력·고른 등급을 지우지 않는다', async () => {
  const { repository, load, save, setStored } = fixture({
    requested: 'SAFE',
    effective: 'SAFE',
    reviewStatus: 'reviewing',
  });
  await render(<CommonCreationWorkspace repository={repository} storyId="1" />);
  await waitFor(() => expect(screen.getByLabelText('커스텀 문체')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('커스텀 문체'), '작성 중 문체');
  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  await fireEvent.press(screen.getByRole('radio', { name: 'UNSAFE' }));
  // 서버 쪽 다른 값이 바뀌어도 새로고침은 검토 결과만 가져온다.
  setStored({
    speech: { ...defaultExpression(), style: { mode: 'custom', text: '서버 문체' } },
    rating: { requested: 'SAFE', effective: 'UNSAFE', reviewStatus: 'completed' },
  });
  const loads = load.mock.calls.length;
  await fireEvent.press(screen.getByRole('button', { name: '검토 상태 새로고침' }));
  await waitFor(() => expect(screen.getByText('검토를 통과해 UNSAFE 등급이 적용됐어요.')).toBeTruthy());
  expect(load.mock.calls.length).toBe(loads + 1);
  expect(checked('UNSAFE')).toBe(true);
  expect(screen.getByText('저장하지 않은 변경이 있습니다.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('tab', { name: '말투·서술' }));
  expect(screen.getByLabelText('커스텀 문체').props.value).toBe('작성 중 문체');
});

it('새로고침 중에는 저장을 보내지 않고, 끝난 뒤 저장한다(같은 스토리 잠금으로 직렬화)', async () => {
  const { repository, load, save } = fixture({ requested: 'SAFE', effective: 'SAFE', reviewStatus: 'reviewing' });
  await openVisibility(repository);
  await fireEvent.press(screen.getByRole('radio', { name: 'UNSAFE' }));
  let finish!: () => void;
  load.mockImplementationOnce(
    (id) =>
      new Promise((resolve) => {
        finish = () => resolve(repository.load(id) as never);
      }),
  );
  await fireEvent.press(screen.getByRole('button', { name: '검토 상태 새로고침' }));
  expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  // 탭 이동 자동 임시 저장도 잠금에 막혀 보내지 않는다.
  await fireEvent.press(screen.getByRole('tab', { name: '인트로' }));
  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  expect(save).not.toHaveBeenCalled();
  finish();
  await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).not.toBeDisabled());
  await fireEvent.press(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][0].requestedRating).toBe('UNSAFE');
});

const STAGED_AT = '2026-11-26T00:00:00Z';

it('CREATE-US-08-AC13 등급만 바꾼 자동 저장은 장면을 보존한 임시 저장이고, 완성 스토리의 「저장」은 그 임시본을 반영 토큰으로 마무리한다', async () => {
  const { repository, save, setStored } = fixture({ requested: 'SAFE', effective: 'SAFE', reviewStatus: 'completed' });
  // 이미 등급만 담긴 임시 저장본이 있는 비공개 스토리(응답도 서버처럼 그 표시를 유지한다).
  setStored({ saveState: 'private', workingCopySavedAt: STAGED_AT, ratingOnlyWorkingCopy: true });
  await openVisibility(repository);
  await fireEvent.press(screen.getByRole('radio', { name: 'UNSAFE' }));
  // 탭 이동 자동 임시 저장: 등급만 바뀌었으므로 preserveScene을 싣고 토큰은 싣지 않는다.
  await fireEvent.press(screen.getByRole('tab', { name: '인트로' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  const [auto, autoState, autoMode, , autoKind] = save.mock.calls[0];
  expect([autoState, autoMode, autoKind]).toEqual(['private', 'auto', 'temporary']);
  expect(auto.preserveScene).toBe(true);
  expect(auto.requestedRating).toBe('UNSAFE');
  expect(auto).not.toHaveProperty('finalizeRatingWorkingCopyAt');

  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  expect(checked('UNSAFE')).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: '비공개로 저장' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  const [manual, state, mode, , kind] = save.mock.calls[1];
  expect([state, mode, kind]).toEqual(['private', 'manual', 'save']);
  expect(manual.preserveScene).toBe(true);
  expect(manual.finalizeRatingWorkingCopyAt).toBe(STAGED_AT);
  // 임시본에 이미 담긴 등급은 다시 싣지 않는다(응답의 requested를 기준으로 삼았다).
  expect(manual.requestedRating ?? null).toBeNull();
});

/** 등급 임시본 반영 저장의 응답: 서버가 정본의 더 새 장면(인트로 제목·장면)을 돌려준다. */
function newerSceneOnFinalize(fx: ReturnType<typeof fixture>) {
  const impl = fx.save.getMockImplementation()!;
  let finish: (() => void) | null = null;
  fx.save.mockImplementationOnce(async (...args) => {
    const result = await impl(...args);
    const newer = {
      ...result,
      intros: result.intros.map((intro) => ({
        ...intro,
        title: '서버의 새 제목',
        scene: { ...intro.scene, place: '서버의 새 장소' },
      })),
    };
    fx.setStored({ intros: newer.intros });
    return new Promise<CommonSaveDocument>((resolve) => {
      finish = () => resolve(newer);
    });
  });
  return () => finish?.();
}

it('CREATE-US-08-AC13 손대지 않은 장면은 반영 저장 응답의 더 새 장면을 따르고 가짜 변경을 만들지 않는다', async () => {
  const fx = fixture({ requested: 'SAFE', effective: 'SAFE', reviewStatus: 'completed' });
  fx.setStored({ saveState: 'private', workingCopySavedAt: STAGED_AT, ratingOnlyWorkingCopy: true });
  await openVisibility(fx.repository);
  const finish = newerSceneOnFinalize(fx);
  await fireEvent.press(screen.getByRole('button', { name: '비공개로 저장' }));
  await waitFor(() => expect(fx.save).toHaveBeenCalledTimes(1));
  expect(fx.save.mock.calls[0][0].finalizeRatingWorkingCopyAt).toBe(STAGED_AT);
  finish();
  await waitFor(() => expect(screen.queryByText('공통 저장 중입니다.')).toBeNull());
  expect(screen.queryByText('저장하지 않은 변경이 있습니다.')).toBeNull();
  expect(jest.mocked(usePreventRemove).mock.calls.at(-1)?.[0]).toBe(false);
  await fireEvent.press(screen.getByRole('tab', { name: '인트로' }));
  expect(screen.getByLabelText('인트로 1 상황 제목').props.value).toBe('서버의 새 제목');
});

it('CREATE-US-08-AC13 반영 저장 응답을 기다리는 동안 바꾼 인트로 입력은 응답 뒤에도 남는다', async () => {
  const fx = fixture({ requested: 'SAFE', effective: 'SAFE', reviewStatus: 'completed' });
  fx.setStored({ saveState: 'private', workingCopySavedAt: STAGED_AT, ratingOnlyWorkingCopy: true });
  await openVisibility(fx.repository);
  const finish = newerSceneOnFinalize(fx);
  await fireEvent.press(screen.getByRole('button', { name: '비공개로 저장' }));
  await waitFor(() => expect(fx.save).toHaveBeenCalledTimes(1));
  await fireEvent.press(screen.getByRole('tab', { name: '인트로' }));
  await fireEvent.changeText(screen.getByLabelText('인트로 1 상황 제목'), '저장 중 바꾼 제목');
  finish();
  await waitFor(() => expect(screen.getByText('저장하지 않은 변경이 있습니다.')).toBeTruthy());
  expect(screen.getByLabelText('인트로 1 상황 제목').props.value).toBe('저장 중 바꾼 제목');
});

/** 반영 저장 응답에 정본의 더 새 대화 예시가 담겨 온다. */
function newerFewshotsOnFinalize(fx: ReturnType<typeof fixture>) {
  const impl = fx.save.getMockImplementation()!;
  let finish: (() => void) | null = null;
  fx.save.mockImplementationOnce(async (...args) => {
    const result = await impl(...args);
    const newer: CommonSaveDocument = {
      ...result,
      fewshots: [
        {
          id: '40',
          clientKey: 'g-40',
          messages: [{ id: '41', clientKey: 'fm-41', speakerKind: 'user', characterId: null, body: '서버의 새 예시' }],
        },
      ],
    };
    fx.setStored({ fewshots: newer.fewshots });
    return new Promise<CommonSaveDocument>((resolve) => {
      finish = () => resolve(newer);
    });
  });
  return () => finish?.();
}

it('CREATE-US-08-AC13 손대지 않은 대화 예시는 반영 저장 응답의 더 새 예시를 따르고 가짜 변경을 만들지 않는다', async () => {
  const fx = fixture({ requested: 'SAFE', effective: 'SAFE', reviewStatus: 'completed' });
  fx.setStored({ saveState: 'private', workingCopySavedAt: STAGED_AT, ratingOnlyWorkingCopy: true });
  await openVisibility(fx.repository);
  const finish = newerFewshotsOnFinalize(fx);
  await fireEvent.press(screen.getByRole('button', { name: '비공개로 저장' }));
  await waitFor(() => expect(fx.save).toHaveBeenCalledTimes(1));
  expect(fx.save.mock.calls[0][0].finalizeRatingWorkingCopyAt).toBe(STAGED_AT);
  finish();
  await waitFor(() => expect(screen.queryByText('공통 저장 중입니다.')).toBeNull());
  expect(screen.queryByText('저장하지 않은 변경이 있습니다.')).toBeNull();
  expect(jest.mocked(usePreventRemove).mock.calls.at(-1)?.[0]).toBe(false);
  await fireEvent.press(screen.getByRole('tab', { name: '말투·서술' }));
  expect(screen.getByRole('button', { name: '예시 1 편집' })).toBeTruthy();
});

it('CREATE-US-08-AC13 반영 저장 응답을 기다리는 동안 추가한 대화 예시는 응답 뒤에도 남는다', async () => {
  const fx = fixture({ requested: 'SAFE', effective: 'SAFE', reviewStatus: 'completed' });
  fx.setStored({ saveState: 'private', workingCopySavedAt: STAGED_AT, ratingOnlyWorkingCopy: true });
  await openVisibility(fx.repository);
  const finish = newerFewshotsOnFinalize(fx);
  await fireEvent.press(screen.getByRole('button', { name: '비공개로 저장' }));
  await waitFor(() => expect(fx.save).toHaveBeenCalledTimes(1));
  await fireEvent.press(screen.getByRole('tab', { name: '말투·서술' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 추가' }));
  finish();
  await waitFor(() => expect(screen.queryByText('공통 저장 중입니다.')).toBeNull());
  expect(screen.getByText('저장하지 않은 변경이 있습니다.')).toBeTruthy();
  expect(screen.getByRole('button', { name: '예시 1 편집' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '예시 2 편집' })).toBeNull();
});

/** 저장 응답을 붙잡아 두고, 정본에서 기존 예시·인트로를 모두 뺀 응답을 돌려준다. */
function removedOnSave(fx: ReturnType<typeof fixture>) {
  const impl = fx.save.getMockImplementation()!;
  let finish: (() => void) | null = null;
  fx.save.mockImplementationOnce(async (...args) => {
    const result = await impl(...args);
    const removed: CommonSaveDocument = { ...result, fewshots: [], intros: [] };
    fx.setStored({ fewshots: [], intros: [] });
    return new Promise<CommonSaveDocument>((resolve) => {
      finish = () => resolve(removed);
    });
  });
  return async () => {
    const complete = finish;
    if (!complete) throw new Error('저장 응답이 아직 대기 상태에 들어가지 않았습니다.');
    await act(async () => complete());
  };
}
const OLD_GROUP = {
  id: '40',
  clientKey: 'g-40',
  messages: [{ id: '41', clientKey: 'fm-41', speakerKind: 'user' as const, characterId: null, body: '옛 예시' }],
};

it.each([false, true])('CREATE-US-08 저장 중 연 예시의 말풍선을 보존한다 (말풍선 추가: %s)', async (added) => {
  const fx = fixture({ requested: 'SAFE', effective: 'SAFE', reviewStatus: 'completed' });
  fx.setStored({ fewshots: [OLD_GROUP] });
  await openVisibility(fx.repository);
  const finish = removedOnSave(fx);
  await fireEvent.press(screen.getByRole('radio', { name: 'UNSAFE' }));
  await fireEvent.press(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(fx.save).toHaveBeenCalledTimes(1));
  await fireEvent.press(screen.getByRole('tab', { name: '말투·서술' }));
  await fireEvent.press(screen.getByRole('button', { name: '예시 1 편집' }));
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), '작성 중 대사');
  if (added) {
    const add = screen.getByRole('button', { name: '말풍선 추가' });
    expect(add).toBeEnabled();
    await fireEvent.press(add);
    expect(screen.getByLabelText('새 말풍선 본문').props.value).toBe('');
  }
  await finish();
  if (added) expect(screen.getByText('작성 중 대사')).toBeTruthy();
  else expect(screen.getByLabelText('새 말풍선 본문').props.value).toBe('작성 중 대사');
  expect(screen.getByText('옛 예시')).toBeTruthy();
});

it('CREATE-US-08 저장 중 연 인트로에 입력 중인 말풍선이 있으면 서버가 그 인트로를 지운 응답이 와도 입력을 잃지 않는다', async () => {
  const fx = fixture({ requested: 'SAFE', effective: 'SAFE', reviewStatus: 'completed' });
  await openVisibility(fx.repository);
  const finish = removedOnSave(fx);
  await fireEvent.press(screen.getByRole('radio', { name: 'UNSAFE' }));
  await fireEvent.press(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(fx.save).toHaveBeenCalledTimes(1));
  await fireEvent.press(screen.getByRole('tab', { name: '인트로' }));
  await fireEvent.press(screen.getByRole('button', { name: '인트로 1 본문 편집' }));
  await fireEvent.changeText(screen.getByLabelText('새 말풍선 본문'), '작성 중 인트로 대사');
  await finish();
  expect(screen.getByLabelText('새 말풍선 본문').props.value).toBe('작성 중 인트로 대사');
  expect(screen.getByText('비')).toBeTruthy();
});

it('CREATE-US-08-AC13 등급 임시본이 있는 비공개 스토리를 장면 그대로 공개로 저장하면 반영 토큰을 싣는다', async () => {
  const { repository, save, setStored } = fixture({ requested: 'SAFE', effective: 'SAFE', reviewStatus: 'completed' });
  setStored({ saveState: 'private', workingCopySavedAt: STAGED_AT, ratingOnlyWorkingCopy: true });
  await openVisibility(repository);
  await fireEvent.press(screen.getByRole('radio', { name: '공개' }));
  await fireEvent.press(screen.getByRole('button', { name: '공개로 저장' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  const [manual, state, mode, , kind] = save.mock.calls[0];
  expect([state, mode, kind]).toEqual(['public', 'manual', 'save']);
  expect(manual.preserveScene).toBe(true);
  expect(manual.finalizeRatingWorkingCopyAt).toBe(STAGED_AT);
});

it('CREATE-US-08-AC13 장면을 바꿨거나 미등록 스토리면 등급 임시본 반영 토큰을 싣지 않는다', async () => {
  const { repository, save, setStored } = fixture({ requested: 'SAFE', effective: 'SAFE', reviewStatus: 'completed' });
  setStored({ saveState: 'private', workingCopySavedAt: STAGED_AT, ratingOnlyWorkingCopy: true });
  const view = await openVisibility(repository);
  // 장면(문체)을 바꾼 채 「저장」: 장면을 보내야 하므로 preserveScene도 토큰도 싣지 않는다.
  await fireEvent.press(screen.getByRole('radio', { name: 'UNSAFE' }));
  await fireEvent.changeText(screen.getByLabelText('커스텀 문체', { includeHiddenElements: true }), '바뀐 문체');
  await fireEvent.press(screen.getByRole('button', { name: '비공개로 저장' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  const [sceneSave, , sceneMode, , sceneKind] = save.mock.calls[0];
  expect([sceneMode, sceneKind]).toEqual(['manual', 'save']);
  expect(sceneSave.preserveScene).not.toBe(true);
  expect(sceneSave).not.toHaveProperty('finalizeRatingWorkingCopyAt');
  await view.unmount();

  save.mockClear();
  setStored({
    saveState: 'draft',
    workingCopySavedAt: STAGED_AT,
    ratingOnlyWorkingCopy: true,
    rating: { requested: 'SAFE', effective: 'SAFE', reviewStatus: 'not_reviewed' },
  });
  await openVisibility(repository);
  await fireEvent.press(screen.getByRole('radio', { name: 'UNSAFE' }));
  await fireEvent.press(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(save).toHaveBeenCalled());
  const [draftSave, , , , draftKind] = save.mock.calls.at(-1)!;
  expect(draftKind).toBe('save');
  expect(draftSave.preserveScene).toBe(true);
  expect(draftSave).not.toHaveProperty('finalizeRatingWorkingCopyAt');
});

it('CREATE-US-08 등급을 빼고 보낸 저장도 응답의 requested를 기준으로 삼고, 저장 중 새로 고른 등급은 남긴다', async () => {
  const { repository, save, setStored } = fixture({ requested: 'SAFE', effective: 'SAFE', reviewStatus: 'completed' });
  await render(<CommonCreationWorkspace repository={repository} storyId="1" guardDraftLeave />);
  await waitFor(() => expect(screen.getByLabelText('커스텀 문체')).toBeTruthy());
  // 다른 화면이 등급을 UNSAFE로 저장했다. 이 화면은 등급을 바꾸지 않았으므로 빼고 보낸다.
  setStored({ rating: { requested: 'UNSAFE', effective: 'SAFE', reviewStatus: 'reviewing' } });
  await fireEvent.changeText(screen.getByLabelText('커스텀 문체'), '바뀐 문체');
  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][0].requestedRating ?? null).toBeNull();
  await waitFor(() => expect(checked('UNSAFE')).toBe(true));
  expect(jest.mocked(usePreventRemove).mock.calls.at(-1)?.[0]).toBe(false);

  // 자동 저장 중에 다시 고른 등급은 응답이 와도 덮어쓰지 않고 변경으로 남긴다.
  const impl = save.getMockImplementation()!;
  let finish!: () => void;
  save.mockImplementationOnce(
    (...args) =>
      new Promise((resolve) => {
        finish = () => resolve(impl(...args));
      }),
  );
  await fireEvent.press(screen.getByRole('tab', { name: '말투·서술' }));
  await fireEvent.changeText(screen.getByLabelText('커스텀 문체'), '또 바뀐 문체');
  await fireEvent.press(screen.getByRole('tab', { name: '공개 범위' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  await fireEvent.press(screen.getByRole('radio', { name: 'SAFE' }));
  expect(screen.getByText('공통 저장 중입니다.')).toBeTruthy();
  finish();
  // 저장 중 문구가 사라지면 응답이 반영된 것이다.
  await waitFor(() => expect(screen.getByText('저장하지 않은 변경이 있습니다.')).toBeTruthy());
  expect(checked('SAFE')).toBe(true);
  expect(jest.mocked(usePreventRemove).mock.calls.at(-1)?.[0]).toBe(true);
});
