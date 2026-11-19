import { act, renderHook, waitFor } from '@testing-library/react-native';
import { seedStory } from '@/mocks/seed/story';
import type { StoryRepository } from '@/features/story-publish';
import type { StoryDraft } from '@/shared/story-types';
import { useExpressionEditor } from '../hooks/useExpressionEditor';

const copy = () => JSON.parse(JSON.stringify(seedStory)) as StoryDraft;
function repository(): jest.Mocked<StoryRepository> {
  return { mode: 'fixture', load: jest.fn().mockResolvedValue(copy()), save: jest.fn() };
}
it('저장 중 추가 입력을 유지하고 더블 탭은 한 번만 저장한다', async () => {
  const repo = repository();
  let finish!: (value: StoryDraft) => void;
  repo.save.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = await renderHook(() => useExpressionEditor(repo, seedStory.id));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => result.current.setSettings({ ...seedStory.speech, tense: 'present' }));
  let first!: Promise<void>;
  await act(() => {
    first = result.current.save();
    void result.current.save();
  });
  expect(repo.save).toHaveBeenCalledTimes(1);
  await act(() => result.current.setSettings({ ...seedStory.speech, tense: 'present', composition: 'action' }));
  await act(async () => {
    finish({ ...copy(), speech: repo.save.mock.calls[0][0].speech, updatedAt: '2026-11-17T00:00:00Z' });
    await first;
  });
  expect(result.current.settings?.composition).toBe('action');
  expect(result.current.draft?.speech.composition).toBe('balanced');
  expect(result.current.dirty).toBe(true);
  expect(repo.save.mock.calls[0][0]).toMatchObject({ intros: seedStory.intros });
});
it('응답 유실 후에는 같은 본문·요청키로 재시도하고 새 입력은 다음 저장에 남긴다', async () => {
  const repo = repository();
  repo.save.mockRejectedValueOnce(new TypeError('network disconnected'));
  const { result } = await renderHook(() => useExpressionEditor(repo, seedStory.id));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => result.current.setSettings({ ...seedStory.speech, tense: 'present' }));
  await act(() => result.current.save());
  expect(result.current.hasPendingSave).toBe(true);
  const [firstDocument, key] = repo.save.mock.calls[0];
  await act(() => result.current.setSettings({ ...seedStory.speech, tense: 'present', responseLength: 'long' }));
  repo.save.mockResolvedValueOnce({ ...firstDocument, updatedAt: '2026-11-17T00:00:00Z' });
  await act(() => result.current.save());
  expect(repo.save.mock.calls[1]).toEqual([firstDocument, key]);
  expect(result.current.settings?.responseLength).toBe('long');
  expect(result.current.dirty).toBe(true);
  expect(result.current.hasPendingSave).toBe(false);
});
it('불러오기 오류를 표시하고 재시도해 저장값을 복원한다', async () => {
  const repo = repository();
  repo.load.mockRejectedValueOnce(new Error('unavailable'));
  const saved = { ...copy(), speech: { ...seedStory.speech, tense: 'present' as const } };
  repo.load.mockResolvedValueOnce(saved);
  const { result } = await renderHook(() => useExpressionEditor(repo, seedStory.id));
  await waitFor(() => expect(result.current.loadError).not.toBeNull());
  await act(() => result.current.reload());
  expect(result.current.settings).toEqual(saved.speech);
  expect(result.current.dirty).toBe(false);
});

it('다른 스토리로 이동한 뒤 이전 저장 응답이 새 편집 상태를 덮어쓰지 않는다', async () => {
  const repo = repository();
  repo.load.mockImplementation(async (id) => ({ ...copy(), id }));
  let finish!: (value: StoryDraft) => void;
  repo.save.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result, rerender } = await renderHook<ReturnType<typeof useExpressionEditor>, { id: string }>(
    ({ id }) => useExpressionEditor(repo, id),
    {
      initialProps: { id: 'first' },
    },
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => result.current.setSettings({ ...seedStory.speech, tense: 'present' }));
  let saving!: Promise<void>;
  await act(() => {
    saving = result.current.save();
  });
  await rerender({ id: 'second' });
  await waitFor(() => expect(result.current.draft?.id).toBe('second'));
  await act(async () => {
    finish({ ...copy(), id: 'first' });
    await saving;
  });
  expect(result.current.draft?.id).toBe('second');
  expect(result.current.settings?.tense).toBe('past');
});
