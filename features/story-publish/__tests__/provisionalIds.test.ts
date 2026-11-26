// CREATE-US-12 QA: 비공개·공개 스토리의 임시 저장본(/creation GET·PUT)에는 아직 반영하지 않은 새 인트로·말풍선·
// 퓨샷 묶음이 서버 id 없이(null) client_key만으로 담긴다(서버 Intro·FewshotGroup·FewshotMessage의 id: DbId | None).
// 이 값만 null을 받고, 관계·호감도·장면·발화자의 캐릭터 연결은 그대로 서버 id를 요구한다.
import { applyAllocatedIds, defaultExpression, toExpressionRow } from '@/shared/story-types';
import { createCommonSaveRepository } from '../commonRepository';
import { readFewshotsSnapshot } from '../fewshotRepository';
import { readAffinities, readRelations } from '../initialStateRepository';
import { readIntros } from '../introRepository';

const scene = {
  date_mode: null,
  era: null,
  year_input: null,
  month_input: null,
  day_input: null,
  reference_event: null,
  elapsed_day_input: null,
  time_format: '24h',
  hour_input: null,
  minute_input: null,
  meridiem: null,
  place: null,
  characters: [],
};
const characters = [{ id: '5', name: '하린', position: 0 }];
const { story_id: _storyId, ...expression } = toExpressionRow('1', defaultExpression());

/** 임시 저장본 응답: 저장된 인트로(30) 뒤에 새 인트로(id null)·새 말풍선(id null)·새 퓨샷 묶음(id null)이 있다. */
function workingCopy(overrides: Record<string, unknown> = {}) {
  return {
    story_id: 1,
    title: '가상',
    save_state: 'private',
    saved_at: '2026-11-26T00:00:00Z',
    expression,
    characters: [{ id: 5, name: '하린', position: 0 }],
    fewshots: [
      {
        id: null,
        client_key: 'group-new',
        messages: [{ id: null, client_key: 'fm-new', speaker_kind: 'character', character_id: 5, body: '새 예시' }],
      },
    ],
    intros: [
      {
        id: 30,
        client_key: 'intro-30',
        title: '저장된 인트로',
        messages: [
          { id: 31, client_key: 'im-31', speaker_kind: 'narrator', character_id: null, body: '기존' },
          { id: null, client_key: 'im-new', speaker_kind: 'user', character_id: null, body: '새 말풍선' },
        ],
        scene,
      },
      {
        id: null,
        client_key: 'intro-new',
        title: '새 인트로',
        messages: [{ id: null, client_key: 'im-new-2', speaker_kind: 'narrator', character_id: null, body: '처음' }],
        scene,
      },
    ],
    relations: [
      {
        client_key: 'rel-1',
        source_kind: 'user',
        source_character_id: null,
        target_kind: 'character',
        target_character_id: 5,
        label: '친구',
      },
    ],
    affinities: [{ source_character_id: 5, target_kind: 'user', target_character_id: null, value: '10' }],
    working_copy_saved_at: '2026-11-26T00:00:01Z',
    ...overrides,
  };
}

function mockFetch(...bodies: unknown[]) {
  const spy = jest.spyOn(globalThis, 'fetch');
  for (const body of bodies) spy.mockResolvedValueOnce({ ok: true, json: async () => body } as Response);
  return spy;
}
afterEach(() => jest.restoreAllMocks());

describe('CREATE-US-12 QA: 임시 저장본의 서버 id 없는 새 항목', () => {
  it('GET /creation: 새 인트로·말풍선·퓨샷 묶음(id null)을 client_key로 복원한다', async () => {
    mockFetch(workingCopy());
    const loaded = await createCommonSaveRepository('http://api.test/api/v1').load('1');
    expect(loaded.workingCopySavedAt).toBe('2026-11-26T00:00:01Z');
    expect(loaded.intros.map((intro) => [intro.id, intro.clientKey])).toEqual([
      ['30', 'intro-30'],
      [null, 'intro-new'],
    ]);
    expect(loaded.intros[0].messages.map((m) => [m.id, m.clientKey, m.body])).toEqual([
      ['31', 'im-31', '기존'],
      [null, 'im-new', '새 말풍선'],
    ]);
    expect(loaded.intros[1].messages[0]).toMatchObject({ id: null, clientKey: 'im-new-2', body: '처음' });
    expect(loaded.fewshots).toEqual([
      {
        id: null,
        clientKey: 'group-new',
        messages: [{ id: null, clientKey: 'fm-new', speakerKind: 'character', characterId: '5', body: '새 예시' }],
      },
    ]);
    expect(loaded.relations[0].targetCharacterId).toBe('5');
    expect(loaded.affinities[0].sourceCharacterId).toBe('5');
  });

  it('PUT /creation: 복원한 새 항목을 id null·client_key 그대로 다시 보내고(임시 저장), 응답의 null도 받는다', async () => {
    const fetcher = mockFetch(workingCopy(), { ...workingCopy(), request_id: 'auto-1' });
    const repository = createCommonSaveRepository('http://api.test/api/v1');
    const loaded = await repository.load('1');
    const saved = await repository.save(loaded, 'private', 'auto', 'auto-1', 'temporary');
    const body = JSON.parse(fetcher.mock.calls[1][1]?.body as string);
    expect(body.kind).toBe('temporary');
    expect(body.intros.map((intro: { id: unknown; client_key: string }) => [intro.id, intro.client_key])).toEqual([
      ['30', 'intro-30'],
      [null, 'intro-new'],
    ]);
    expect(body.intros[0].messages[1]).toMatchObject({ id: null, client_key: 'im-new' });
    expect(body.fewshots[0]).toMatchObject({ id: null, client_key: 'group-new' });
    expect(body.fewshots[0].messages[0]).toMatchObject({ id: null, client_key: 'fm-new', character_id: '5' });
    expect(saved.intros[1].id).toBeNull();
  });

  it('「저장」(반영) 요청도 새 항목을 id null로 보내고, 발급된 id는 client_key로 합쳐 저장 중 편집을 잃지 않는다', async () => {
    const committed = workingCopy({
      request_id: 'save-1',
      working_copy_saved_at: null,
      fewshots: [
        {
          id: 40,
          client_key: 'group-new',
          messages: [{ id: 41, client_key: 'fm-new', speaker_kind: 'character', character_id: 5, body: '새 예시' }],
        },
      ],
      intros: [
        {
          id: 30,
          client_key: 'intro-30',
          title: '저장된 인트로',
          messages: [
            { id: 31, client_key: 'im-31', speaker_kind: 'narrator', character_id: null, body: '기존' },
            { id: 32, client_key: 'im-new', speaker_kind: 'user', character_id: null, body: '새 말풍선' },
          ],
          scene,
        },
        {
          id: 33,
          client_key: 'intro-new',
          title: '새 인트로',
          messages: [{ id: 34, client_key: 'im-new-2', speaker_kind: 'narrator', character_id: null, body: '처음' }],
          scene,
        },
      ],
    });
    const fetcher = mockFetch(workingCopy(), committed);
    const repository = createCommonSaveRepository('http://api.test/api/v1');
    const loaded = await repository.load('1');
    const saved = await repository.save(loaded, 'private', 'manual', 'save-1', 'save');
    const body = JSON.parse(fetcher.mock.calls[1][1]?.body as string);
    expect(body).toMatchObject({ kind: 'save', mode: 'manual', save_state: 'private' });
    expect(body.intros[1]).toMatchObject({ id: null, client_key: 'intro-new' });
    expect(saved.workingCopySavedAt).toBeNull();
    // 저장 중 제목을 고쳤어도(로컬 값) 발급 id만 합친다.
    const local = loaded.intros.map((intro) =>
      intro.clientKey === 'intro-new' ? { ...intro, title: '고친 제목' } : intro,
    );
    const merged = applyAllocatedIds(local, saved.intros);
    expect(merged.map((intro) => [intro.id, intro.title])).toEqual([
      ['30', '저장된 인트로'],
      ['33', '고친 제목'],
    ]);
    expect(merged[0].messages.map((m) => m.id)).toEqual(['31', '32']);
    expect(applyAllocatedIds(loaded.fewshots, saved.fewshots)[0].messages[0].id).toBe('41');
  });

  it('중복 client_key·중복 id는 그대로 거절한다(null id끼리는 겹쳐도 된다)', () => {
    const intro = (id: unknown, key: string, messages: unknown[] = []) => ({
      id,
      client_key: key,
      title: '',
      messages,
      scene,
    });
    const message = (id: unknown, key: string) => ({
      id,
      client_key: key,
      speaker_kind: 'narrator',
      character_id: null,
      body: '',
    });
    expect(readIntros([intro(null, 'a'), intro(null, 'b')], characters).map((i) => i.id)).toEqual([null, null]);
    expect(() => readIntros([intro(null, 'a'), intro(null, 'a')], characters)).toThrow();
    expect(() => readIntros([intro(7, 'a'), intro(7, 'b')], characters)).toThrow();
    expect(() => readIntros([intro(null, 'a', [message(null, 'a')])], characters)).toThrow();
    expect(() => readIntros([intro(null, 'a', [message(9, 'm1'), message(9, 'm2')])], characters)).toThrow();
    expect(
      readIntros([intro(null, 'a', [message(null, 'm1'), message(null, 'm2')])], characters)[0].messages,
    ).toHaveLength(2);
  });

  it.each([
    ['0', 0],
    ['음수', -1],
    ['소수', 1.5],
    ['불리언', true],
    ['빈 문자열', ''],
    ['숫자 아닌 문자열', 'abc'],
    ['객체', {}],
    ['누락(undefined)', undefined],
  ])('잘못된 id(%s)는 null로 바꾸지 않고 거절한다', (_label, bad) => {
    // 기본 매개변수를 쓰지 않는다(undefined가 null로 바뀌면 누락 검사가 되지 않는다).
    const intro = (id: unknown, messageId: unknown) => ({
      id,
      client_key: 'k',
      title: '',
      messages: [{ id: messageId, client_key: 'm', speaker_kind: 'narrator', character_id: null, body: '' }],
      scene,
    });
    expect(() => readIntros([intro(null, null)], characters)).not.toThrow();
    expect(() => readIntros([intro(bad, null)], characters)).toThrow();
    expect(() => readIntros([intro(null, bad)], characters)).toThrow();
    const snapshot = (groupId: unknown, messageId: unknown) =>
      workingCopy({
        fewshots: [
          {
            id: groupId,
            client_key: 'g',
            messages: [{ id: messageId, client_key: 'gm', speaker_kind: 'narrator', character_id: null, body: '' }],
          },
        ],
      });
    expect(() => readFewshotsSnapshot(snapshot(null, null), '1')).not.toThrow();
    expect(() => readFewshotsSnapshot(snapshot(bad, null), '1')).toThrow();
    expect(() => readFewshotsSnapshot(snapshot(null, bad), '1')).toThrow();
  });

  it('id가 없는 영역(관계·호감도)과 캐릭터 연결은 null 캐릭터 id를 받지 않는다', () => {
    expect(() =>
      readRelations(
        [
          {
            client_key: 'r',
            source_kind: 'character',
            source_character_id: null,
            target_kind: 'user',
            target_character_id: null,
            label: '',
          },
        ],
        characters,
      ),
    ).toThrow();
    expect(() =>
      readAffinities(
        [{ source_character_id: null, target_kind: 'user', target_character_id: null, value: '1' }],
        characters,
      ),
    ).toThrow();
    expect(() =>
      readIntros(
        [
          {
            id: null,
            client_key: 'a',
            title: '',
            messages: [],
            scene: { ...scene, characters: [{ character_id: null, clothing: '', inner_thought: '' }] },
          },
        ],
        characters,
      ),
    ).toThrow();
    expect(() =>
      readFewshotsSnapshot(workingCopy({ characters: [{ id: null, name: '새', position: 0 }], fewshots: [] }), '1'),
    ).toThrow();
  });
});
