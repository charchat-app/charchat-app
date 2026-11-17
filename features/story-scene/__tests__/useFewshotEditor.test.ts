import { act, renderHook, waitFor } from '@testing-library/react-native';
import { newFewshotGroup, type FewshotsDocument } from '@/shared/story-types';
import type { FewshotRepository } from '@/features/story-publish';
import { publishStoryCharacters } from '@/features/story-setup';
import { useFewshotEditor } from '../hooks/useFewshotEditor';

const initial = (): FewshotsDocument => ({
  id: '1',
  title: '가상 스토리',
  saveState: 'draft',
  updatedAt: '2026-11-17T00:00:00Z',
  characters: [],
  fewshots: [],
});
it('저장 중 편집한 미발급 메시지에 ID를 합쳐 후속 저장의 중복 생성을 막는다', async () => {
  const repo: jest.Mocked<FewshotRepository> = { load: jest.fn().mockResolvedValue(initial()), save: jest.fn() };
  let finish!: (value: FewshotsDocument) => void;
  repo.save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = await renderHook(() => useFewshotEditor(repo, '1'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  const draft = {
    ...newFewshotGroup(),
    messages: [{ id: null, clientKey: 'm', body: '저장 본문', speakerKind: 'user' as const, characterId: null }],
  };
  await act(() => result.current.setGroups([draft]));
  let operation!: Promise<void>;
  await act(() => {
    operation = result.current.save();
    void result.current.save();
  });
  await act(() => result.current.setGroups([{ ...draft, messages: [{ ...draft.messages[0], body: '나중 수정' }] }]));
  await act(async () => {
    finish({ ...initial(), fewshots: [{ ...draft, id: '10', messages: [{ ...draft.messages[0], id: '20' }] }] });
    await operation;
  });
  expect(repo.save).toHaveBeenCalledTimes(1);
  expect(result.current.groups[0].messages[0]).toMatchObject({ id: '20', body: '나중 수정' });
  expect(result.current.dirty).toBe(true);
  repo.save.mockImplementationOnce(async (document) => document);
  await act(() => result.current.save());
  expect(repo.save.mock.calls[1][0].fewshots[0].id).toBe('10');
  expect(result.current.dirty).toBe(false);
});
it('성패 불명확 재시도는 같은 키·본문으로 실행하고 새 입력을 덮어쓰지 않는다', async () => {
  const repo: jest.Mocked<FewshotRepository> = {
    load: jest.fn().mockResolvedValue(initial()),
    save: jest.fn().mockRejectedValueOnce(new Error('disconnected')),
  };
  const { result } = await renderHook(() => useFewshotEditor(repo, '1'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  const draft = newFewshotGroup();
  await act(() => result.current.setGroups([draft]));
  await act(() => result.current.save());
  const [document, key] = repo.save.mock.calls[0];
  expect(result.current.pendingSave).toBe(true);
  await act(() => result.current.setGroups((groups) => [...groups, newFewshotGroup()]));
  repo.save.mockResolvedValueOnce({ ...document, fewshots: [{ ...draft, id: '10' }] });
  await act(() => result.current.save());
  expect(repo.save.mock.calls[1][1]).toBe(key);
  expect(repo.save.mock.calls[1][0]).toEqual(document);
  expect(result.current.groups).toHaveLength(2);
  expect(result.current.groups[0].id).toBe('10');
  expect(result.current.groups[1].id).toBeNull();
});

const characterDocument = (): FewshotsDocument => ({
  ...initial(),
  characters: [
    { id: '5', name: '하린', position: 0 },
    { id: '6', name: '도현', position: 1 },
  ],
  fewshots: [
    {
      id: '10',
      clientKey: 'g',
      messages: [
        { id: '20', clientKey: 'mc', speakerKind: 'character', characterId: '5', body: '하린 원문' },
        { id: '21', clientKey: 'mu', speakerKind: 'user', characterId: null, body: '하린 언급 {{user}}' },
        { id: '22', clientKey: 'mn', speakerKind: 'narrator', characterId: null, body: '하린 서술' },
      ],
    },
  ],
});

it('같은 스토리의 이름·삭제를 즉시 반영하면서 미저장 본문과 남은 순서를 보존한다', async () => {
  const document = characterDocument();
  const repo: FewshotRepository = { load: jest.fn().mockResolvedValue(document), save: jest.fn() };
  const { result, unmount } = await renderHook(() => useFewshotEditor(repo, '1'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() =>
    result.current.setGroups((groups) => [
      {
        ...groups[0],
        messages: [
          { ...groups[0].messages[2], body: '수정한 하린 서술' },
          groups[0].messages[0],
          groups[0].messages[1],
          { id: null, clientKey: 'unsaved', speakerKind: 'character', characterId: '5', body: '아직 저장하지 않음' },
          { id: null, clientKey: 'other', speakerKind: 'character', characterId: '6', body: '다른 발화자' },
        ],
      },
    ]),
  );
  await act(() => publishStoryCharacters('other-story', []));
  expect(result.current.groups[0].messages).toHaveLength(5);
  await act(() =>
    publishStoryCharacters('1', [{ ...document.characters[0], name: '새 이름' }, document.characters[1]]),
  );
  expect(result.current.snapshot?.characters[0].name).toBe('새 이름');
  expect(result.current.groups[0].messages[1].body).toBe('하린 원문');
  await act(() => publishStoryCharacters('1', [document.characters[1]]));
  expect(result.current.groups[0].messages.map((message) => message.clientKey)).toEqual(['mn', 'mu', 'other']);
  expect(result.current.groups[0].messages.map((message) => message.body)).toEqual([
    '수정한 하린 서술',
    '하린 언급 {{user}}',
    '다른 발화자',
  ]);
  expect(result.current.dirty).toBe(true);
  expect(result.current.length).toBe(
    result.current.groups[0].messages.reduce((n, message) => n + (message.body?.length ?? 0), 0),
  );
  await unmount();
});

it('캐릭터 삭제 뒤 도착한 저장 응답이 발화자·삭제 메시지를 되살리지 않고 다른 새 입력 ID는 합친다', async () => {
  const document = characterDocument();
  let finish!: (document: FewshotsDocument) => void;
  const repo: FewshotRepository = {
    load: jest.fn().mockResolvedValue(document),
    save: jest.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
  };
  const { result } = await renderHook(() => useFewshotEditor(repo, '1'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  let operation!: Promise<void>;
  await act(() => {
    operation = result.current.save();
  });
  await act(() => publishStoryCharacters('1', [document.characters[1]]));
  await act(() =>
    result.current.setGroups((groups) => [
      {
        ...groups[0],
        messages: [
          ...groups[0].messages,
          { id: null, clientKey: 'late', speakerKind: 'user', characterId: null, body: '저장 중 입력' },
        ],
      },
    ]),
  );
  await act(async () => {
    finish(document);
    await operation;
  });
  expect(result.current.snapshot?.characters.map((person) => person.id)).toEqual(['6']);
  expect(result.current.groups[0].messages.map((message) => message.clientKey)).toEqual(['mu', 'mn', 'late']);
  expect(result.current.groups[0].messages[2].body).toBe('저장 중 입력');
});

it('자동 조회 실패 시 입력을 보존하고 늦은 캐릭터 응답으로 즉시 변경을 덮어쓰지 않는다', async () => {
  jest.useFakeTimers();
  try {
    const document = characterDocument();
    let finish!: (people: FewshotsDocument['characters']) => void;
    const loadCharacters = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue([]);
    const repo: FewshotRepository = { load: jest.fn().mockResolvedValue(document), save: jest.fn(), loadCharacters };
    const { result, unmount } = await renderHook(() => useFewshotEditor(repo, '1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() =>
      publishStoryCharacters('1', [{ ...document.characters[0], name: '즉시 이름' }, document.characters[1]]),
    );
    await act(async () => finish(document.characters));
    expect(result.current.snapshot?.characters[0].name).toBe('즉시 이름');
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current.characterSyncError).toMatch(/기존 입력을 유지/);
    expect(result.current.groups[0].messages).toHaveLength(3);
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current.snapshot?.characters).toEqual([]);
    expect(result.current.groups[0].messages.map((message) => message.clientKey)).toEqual(['mu', 'mn']);
    expect(result.current.characterSyncError).toBeNull();
    const calls = loadCharacters.mock.calls.length;
    await unmount();
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(loadCharacters).toHaveBeenCalledTimes(calls);
  } finally {
    jest.useRealTimers();
  }
});

it('캐릭터 변경이 있어도 성패 불명확한 저장의 재시도 키·본문을 바꾸지 않는다', async () => {
  const document = characterDocument();
  const repo: jest.Mocked<FewshotRepository> = {
    load: jest.fn().mockResolvedValue(document),
    save: jest.fn().mockRejectedValueOnce(new Error('disconnected')).mockResolvedValueOnce(document),
  };
  const { result } = await renderHook(() => useFewshotEditor(repo, '1'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => result.current.save());
  const [sent, key] = repo.save.mock.calls[0];
  await act(() => publishStoryCharacters('1', []));
  expect(result.current.groups[0].messages.map((message) => message.clientKey)).toEqual(['mu', 'mn']);
  await act(() => result.current.save());
  expect(repo.save.mock.calls[1]).toEqual([sent, key]);
  expect(result.current.snapshot?.characters).toEqual([]);
  expect(result.current.groups[0].messages.map((message) => message.clientKey)).toEqual(['mu', 'mn']);
});

it('최초 조회 중 받은 삭제 알림을 늦은 전체 조회 결과가 덮어쓰지 않는다', async () => {
  let finish!: (document: FewshotsDocument) => void;
  const repo: FewshotRepository = {
    load: jest.fn(
      () =>
        new Promise<FewshotsDocument>((resolve) => {
          finish = resolve;
        }),
    ),
    save: jest.fn(),
  };
  const { result } = await renderHook(() => useFewshotEditor(repo, '1'));
  await act(() => publishStoryCharacters('1', []));
  await act(async () => finish(characterDocument()));
  expect(result.current.loading).toBe(false);
  expect(result.current.snapshot?.characters).toEqual([]);
  expect(result.current.groups[0].messages.map((message) => message.clientKey)).toEqual(['mu', 'mn']);
});
