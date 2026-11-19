import { act, renderHook } from '@testing-library/react-native';
import { defaultExpression, type CreationSaveDocument } from '@/shared/story-types';

import { completionIssues, useCommonSave } from '../hooks/useCommonSave';
import type { CommonSaveRepository } from '../commonRepository';
import { createCommonSaveRepository } from '../commonRepository';
import { toExpressionRow } from '@/shared/story-types';

const document = (): CreationSaveDocument => ({
  id: '1',
  title: '가상',
  saveState: 'draft',
  updatedAt: '2026-11-17T00:00:00Z',
  speech: defaultExpression(),
  characters: [],
  fewshots: [],
  intros: [
    {
      id: '30',
      clientKey: 'intro-30',
      title: '첫 만남',
      messages: [{ id: '31', clientKey: 'intro-message-31', speakerKind: 'narrator', characterId: null, body: '*비*' }],
    },
  ],
});
const repo = (save: CommonSaveRepository['save']): CommonSaveRepository => ({
  load: jest.fn(),
  save,
});
it('원문 Unicode 분량을 계산하고 미선택 문체·빈 퓨샷은 허용한다', () => {
  expect(completionIssues(document())).toEqual([]);
  const value = {
    ...document(),
    speech: { ...defaultExpression(), style: { mode: 'custom' as const, text: '😀'.repeat(1000) } },
  };
  expect(completionIssues(value)).toEqual([]);
  value.speech.style.text += ' ';
  value.fewshots = [
    {
      id: null,
      clientKey: 'g',
      messages: [{ id: null, clientKey: 'm', speakerKind: 'narrator', characterId: null, body: '*'.repeat(2001) }],
    },
  ];
  expect(completionIssues(value)).toHaveLength(2);
});
it('표현·퓨샷을 같은 요청에 보내고 조회도 같은 공통 응답에서 복원한다', async () => {
  const doc = document();
  const { story_id: _id, ...expression } = toExpressionRow(doc.id, doc.speech);
  const fetcher = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({
      story_id: '1',
      title: '가상',
      save_state: 'private',
      saved_at: doc.updatedAt,
      expression,
      characters: [],
      fewshots: [],
      intros: [
        {
          id: '30',
          client_key: 'intro-30',
          title: '첫 만남',
          messages: [
            { id: '31', client_key: 'intro-message-31', speaker_kind: 'narrator', character_id: null, body: '*비*' },
          ],
        },
      ],
      request_id: 'one',
    }),
  } as Response);
  try {
    const repository = createCommonSaveRepository('http://localhost:8000/api/v1');
    const saved = await repository.save(doc, 'private', 'manual', 'one');
    expect(saved.saveState).toBe('private');
    expect(saved.speech).toEqual(doc.speech);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/v1/creation/stories/1/creation');
    expect(JSON.parse(init?.body as string)).toEqual({
      expression,
      fewshots: [],
      intros: [
        {
          id: '30',
          client_key: 'intro-30',
          title: '첫 만남',
          messages: [
            { id: '31', client_key: 'intro-message-31', speaker_kind: 'narrator', character_id: null, body: '*비*' },
          ],
        },
      ],
      save_state: 'private',
      mode: 'manual',
    });
    const loaded = await repository.load('1');
    expect(loaded.speech).toEqual(doc.speech);
    expect(loaded.intros).toEqual(doc.intros);
  } finally {
    fetcher.mockRestore();
  }
});
it('초안 변경만1분 주기로 저장하고 완성 상태·미변경에는 자동 저장을 하지 않는다', async () => {
  jest.useFakeTimers();
  try {
    const save = jest.fn(async (doc: CreationSaveDocument) => doc),
      commit = jest.fn();
    const repository = repo(save);
    const doc = document();
    const { rerender, unmount } = await renderHook<
      ReturnType<typeof useCommonSave>,
      { value: CreationSaveDocument; dirty: boolean }
    >(
      ({ value, dirty }) =>
        useCommonSave(repository, {
          document: value,
          dirty,
          loading: false,
          pendingInput: false,
          captureCommit: () => commit,
        }),
      { initialProps: { value: doc, dirty: true } },
    );
    await act(async () => {
      jest.advanceTimersByTime(59999);
    });
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0].slice(1, 3)).toEqual(['draft', 'auto']);
    await rerender({ value: doc, dirty: false });
    await act(async () => {
      jest.advanceTimersByTime(60000);
    });
    expect(save).toHaveBeenCalledTimes(1);
    await rerender({ value: { ...doc, saveState: 'private' }, dirty: true });
    await act(async () => {
      jest.advanceTimersByTime(60000);
    });
    expect(save).toHaveBeenCalledTimes(1);
    await unmount();
  } finally {
    jest.useRealTimers();
  }
});
it('성패 불명확 재시도는 처음 표현·퓨샷·상태·키를 고정하고 새 입력을 덮어쓰지 않는다', async () => {
  const doc = document();
  const save = jest.fn().mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce(doc);
  const commit = jest.fn();
  const repository = repo(save);
  const options = { document: doc, dirty: true, loading: false, pendingInput: false, captureCommit: () => commit };
  const { result, rerender } = await renderHook<ReturnType<typeof useCommonSave>, Parameters<typeof useCommonSave>[1]>(
    (options) => useCommonSave(repository, options),
    {
      initialProps: options,
    },
  );
  await act(() => result.current.save('private'));
  const first = save.mock.calls[0];
  expect(result.current.pendingSave).toBe(true);
  await rerender({ ...options, document: { ...doc, speech: { ...doc.speech, tense: 'present' } } });
  await act(() => result.current.save('public'));
  expect(save.mock.calls[1]).toEqual(first);
  expect(commit).toHaveBeenCalledWith(doc, doc);
});
