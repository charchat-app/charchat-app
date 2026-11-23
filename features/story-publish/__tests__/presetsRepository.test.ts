// CREATE-US-05 공통 저장(/creation)의 유저 프로필 프리셋 요청·응답 변환
// 서버 계약: presets = id·name·image_id·description(+읽기 전용 image_url) 배열, presets_pending = 임시 저장본 여부.
// 서버와 실제로 맞춰 본 결과가 아니라 요청·응답 변환만 검증한다.
import { defaultExpression, toExpressionRow } from '@/shared/story-types';

import { createCommonSaveRepository, type CommonSaveDocument } from '../commonRepository';

const BASE = 'http://localhost:8000/api/v1';

const document = (extra: Partial<CommonSaveDocument> = {}): CommonSaveDocument => ({
  id: '1',
  title: '가상',
  saveState: 'draft',
  updatedAt: '2026-11-17T00:00:00Z',
  speech: defaultExpression(),
  characters: [],
  fewshots: [],
  intros: [],
  relations: [],
  affinities: [],
  ...extra,
});

const { story_id: _storyId, ...expression } = toExpressionRow('1', defaultExpression());

const response = (extra: Record<string, unknown> = {}, requestId = 'req') => ({
  story_id: '1',
  title: '가상',
  save_state: 'draft',
  saved_at: '2026-11-17T00:00:00Z',
  expression,
  characters: [],
  fewshots: [],
  intros: [],
  relations: [],
  affinities: [],
  request_id: requestId,
  ...extra,
});

let fetcher: jest.SpyInstance;
const reply = (body: unknown) => fetcher.mockResolvedValueOnce({ ok: true, json: async () => body } as Response);
const sentBody = (call = 0): Record<string, unknown> =>
  JSON.parse(fetcher.mock.calls[call][1]?.body as string) as Record<string, unknown>;

beforeEach(() => {
  fetcher = jest.spyOn(globalThis, 'fetch');
});
afterEach(() => {
  fetcher.mockRestore();
});

describe('presets 요청', () => {
  it('CREATE-US-05: presets가 없거나 null이면 요청에서 빼서 서버가 기존 값을 유지한다', async () => {
    const repository = createCommonSaveRepository(BASE);
    reply(response());
    reply(response());
    await repository.save(document(), 'draft', 'manual', 'req');
    await repository.save(document({ presets: null }), 'draft', 'manual', 'req');
    for (const call of [0, 1]) expect(sentBody(call)).not.toHaveProperty('presets');
  });

  it('CREATE-US-05: 빈 배열은 전부 지우라는 뜻으로 그대로 보내고, 응답의 빈 배열을 복원한다', async () => {
    reply(response({ presets: [] }));
    const saved = await createCommonSaveRepository(BASE).save(document({ presets: [] }), 'draft', 'manual', 'req');
    expect(sentBody().presets).toEqual([]);
    expect(saved.presets).toEqual([]);
  });

  it('CREATE-US-05-AC03: 순서·id·이미지 id·원문({{user}})을 서버 필드로 바꿔 보내고 응답으로 복원한다', async () => {
    const presets = [
      { id: '11', name: '{{user}}', detail: '여행자', imageId: 7, photoUrl: 'https://img/7.png' },
      { name: '새 프로필', detail: '', imageId: null, photoUrl: null },
    ];
    reply(
      response({
        presets: [
          { id: 11, name: '{{user}}', image_id: 7, description: '여행자' },
          { id: 12, name: '새 프로필', image_id: null, description: null },
        ],
      }),
    );
    const saved = await createCommonSaveRepository(BASE).save(document({ presets }), 'draft', 'manual', 'req');
    expect(sentBody().presets).toEqual([
      { id: 11, name: '{{user}}', image_id: 7, description: '여행자' },
      { id: null, name: '새 프로필', image_id: null, description: null },
    ]);
    // 2~4번은 받은 문서 그대로 함께 간다 (preserve_scene 없이)
    expect(sentBody()).toMatchObject({ expression, fewshots: [], intros: [], relations: [], affinities: [] });
    expect(sentBody()).not.toHaveProperty('preserve_scene');
    expect(saved.presets).toEqual([
      { id: '11', name: '{{user}}', detail: '여행자', imageId: 7, photoUrl: 'https://img/7.png' },
      { id: '12', name: '새 프로필', detail: '', imageId: null, photoUrl: null },
    ]);
  });

  it('서버가 발급하지 않은 프로필 id는 요청을 보내지 않고 막는다', async () => {
    const presets = [{ id: 'local:1', name: 'a', detail: '', imageId: null, photoUrl: null }];
    await expect(
      createCommonSaveRepository(BASE).save(document({ presets }), 'draft', 'manual', 'req'),
    ).rejects.toThrow('프로필 id');
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('presets 응답', () => {
  it('응답에 presets가 없거나 null이면 빈 목록으로 지어내지 않는다', async () => {
    const repository = createCommonSaveRepository(BASE);
    reply(response());
    reply(response({ presets: null }));
    expect((await repository.load('1')).presets).toBeUndefined();
    expect(await repository.load('1')).not.toHaveProperty('presets');
  });

  it('CREATE-US-05-AC06: presets_pending이면 임시 저장본으로 표시하고 신규 프리셋은 서버 id 없이 복원한다', async () => {
    reply(
      response({
        save_state: 'private',
        presets_pending: true,
        presets: [
          { id: 3, name: '기존', image_id: null, description: null },
          { id: null, name: null, image_id: null, description: ' 미완성 ' },
        ],
      }),
    );
    const loaded = await createCommonSaveRepository(BASE).load('1');
    expect(loaded.presetsPending).toBe(true);
    expect(loaded.presets?.map(({ id, name, detail }) => [id, name, detail])).toEqual([
      ['3', '기존', ''],
      [undefined, '', ' 미완성 '],
    ]);
  });

  it('presets_pending이 아니면 id가 null인 프리셋을 거절한다', async () => {
    reply(response({ presets: [{ id: null, name: 'a', image_id: null, description: null }] }));
    await expect(createCommonSaveRepository(BASE).load('1')).rejects.toThrow();
  });

  it('presets_pending이 없으면 임시 저장본으로 표시하지 않는다', async () => {
    reply(response({ presets: [] }));
    expect(await createCommonSaveRepository(BASE).load('1')).not.toHaveProperty('presetsPending');
  });

  describe('표시용 주소 image_url (읽기 전용)', () => {
    const CUSTOM = 'https://custom.example:9443/api/v1';
    const row = (extra: Record<string, unknown> = {}) => ({
      id: 5,
      name: '탐정',
      image_id: 3,
      description: null,
      ...extra,
    });
    const submitted = [{ id: '5', name: '탐정', detail: '', imageId: 3, photoUrl: 'file:///picked.png' }];

    it('CREATE-US-05: 서버 루트 기준 경로를 저장소의 baseUrl로 전체 주소로 바꾼다', async () => {
      reply(response({ presets: [row({ image_url: '/api/v1/creation/image-files/3' })] }));
      const loaded = await createCommonSaveRepository(CUSTOM).load('1');
      expect(loaded.presets?.[0].photoUrl).toBe('https://custom.example:9443/api/v1/creation/image-files/3');
    });

    it('CREATE-US-05: image_url이 명시적 null이면 보낸 사진으로 대체하지 않는다', async () => {
      reply(response({ presets: [row({ image_url: null })] }));
      const saved = await createCommonSaveRepository(CUSTOM).save(
        document({ presets: submitted }),
        'draft',
        'manual',
        'req',
      );
      expect(saved.presets?.[0].photoUrl).toBeNull();
    });

    it('CREATE-US-05: image_url 키가 없을 때만 보낸 문서의 같은 이미지 id 주소를 이어 쓰고, 요청엔 싣지 않는다', async () => {
      reply(response({ presets: [row()] }));
      const saved = await createCommonSaveRepository(CUSTOM).save(
        document({ presets: submitted }),
        'draft',
        'manual',
        'req',
      );
      expect(saved.presets?.[0].photoUrl).toBe('file:///picked.png');
      expect(sentBody().presets).toEqual([{ id: 5, name: '탐정', image_id: 3, description: null }]);
    });

    it.each([
      ['다른 출처 절대 주소', 'https://evil.example/api/v1/creation/image-files/3'],
      ['프로토콜 상대 주소', '//evil.example/x.png'],
      ['탭이 끼어 있는 프로토콜 상대 주소', '/\t/custom.example:9443/x.png'],
      ['역슬래시 우회', '/\\evil.example/x.png'],
      ['루트 기준이 아닌 상대 경로', 'creation/image-files/3'],
      ['javascript: 주소', 'javascript:alert(1)'],
      ['문자열이 아님', 3],
    ])('받을 수 없는 image_url은 미리보기 없음으로 둔다: %s', async (_label, imageUrl) => {
      reply(response({ presets: [row({ image_url: imageUrl })] }));
      const loaded = await createCommonSaveRepository(CUSTOM).load('1');
      expect(loaded.presets?.[0].photoUrl).toBeNull();
    });

    it('baseUrl이 전체 주소가 아니면 image_url을 쓰지 않는다', async () => {
      reply(response({ presets: [row({ image_url: '/api/v1/creation/image-files/3' })] }));
      expect((await createCommonSaveRepository('/api/v1').load('1')).presets?.[0].photoUrl).toBeNull();
    });
  });

  it.each([
    ['배열이 아님', { id: 1 }],
    [
      '중복 id',
      [
        { id: 1, name: 'a', image_id: null, description: null },
        { id: 1, name: 'b', image_id: null, description: null },
      ],
    ],
    ['이미지 id가 정수가 아님', [{ id: 1, name: 'a', image_id: '3', description: null }]],
    ['이름이 문자열이 아님', [{ id: 1, name: 3, image_id: null, description: null }]],
  ])('형식이 맞지 않는 presets 응답은 거절한다: %s', async (_label, presets) => {
    reply(response({ presets }));
    await expect(createCommonSaveRepository(BASE).load('1')).rejects.toThrow();
  });
});
