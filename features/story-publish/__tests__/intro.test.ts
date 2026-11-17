import { completionIssues, introLength } from '../hooks/useCommonSave';
import { introsPayload, readIntros } from '../introRepository';
import { defaultExpression, type CreationSaveDocument, type IntroItem } from '@/shared/story-types';

const intro = (title: string, ...bodies: (string | null)[]): IntroItem => ({
  id: null,
  clientKey: `intro-${title.length}-${bodies.length}-${Math.random().toString(36).slice(2)}`,
  title,
  messages: bodies.map((body, i) => ({
    id: null,
    clientKey: `m-${i}-${Math.random().toString(36).slice(2)}`,
    speakerKind: 'narrator',
    characterId: null,
    body,
  })),
});
const doc = (intros: IntroItem[]): CreationSaveDocument => ({
  id: '1',
  title: '가상',
  saveState: 'draft',
  updatedAt: '2026-11-17T00:00:00Z',
  speech: defaultExpression(),
  characters: [],
  fewshots: [],
  intros,
});

it('인트로 완성 조건: 0개·빈 제목·제목 30자 초과·빈 본문·인트로별 2000자 초과를 각각 안내한다', () => {
  expect(completionIssues(doc([]))).toEqual(['인트로를 1개 이상 작성해 주세요.']);
  expect(completionIssues(doc([intro('  ', '본문')]))).toEqual(['모든 인트로의 상황 제목을 작성해 주세요.']);
  expect(completionIssues(doc([intro('😀'.repeat(31), '본문')]))).toEqual([
    '인트로 상황 제목은 30자 이내로 작성해 주세요.',
  ]);
  expect(completionIssues(doc([intro('제목'), intro('제목', ' \n', null)]))).toEqual([
    '모든 인트로에 대사나 서술을 작성해 주세요.',
  ]);
  expect(completionIssues(doc([intro('제목', '가'.repeat(1500), '😀'.repeat(501))]))).toEqual([
    '인트로 본문은 인트로마다 2000자 이내로 작성해 주세요.',
  ]);
});

it('경계값은 허용하고 여러 인트로 글자 수는 합산하지 않는다', () => {
  const first = intro('😀'.repeat(30), '가'.repeat(1000), '*'.repeat(1000));
  const second = intro('둘째', '😀'.repeat(2000));
  expect(introLength(first)).toBe(2000);
  expect(introLength(second)).toBe(2000);
  expect(completionIssues(doc([first, second]))).toEqual([]);
});

it('공통 응답의 인트로 순서·원문·발화자를 복원하고 요청에는 그대로 보낸다', () => {
  const characters = [{ id: '5', name: '하린', position: 0 }];
  const raw = [
    {
      id: '30',
      client_key: 'intro-30',
      title: null,
      messages: [
        { id: '31', client_key: 'intro-message-31', speaker_kind: 'character', character_id: '5', body: ' {{user}} ' },
        { id: '32', client_key: 'intro-message-32', speaker_kind: 'user', character_id: null, body: '**강조**\n' },
      ],
    },
    { id: '33', client_key: 'intro-33', title: '둘째', messages: [] },
  ];
  const intros = readIntros(raw, characters);
  expect(intros.map((item) => item.title)).toEqual(['', '둘째']);
  expect(intros[0].messages.map((m) => [m.speakerKind, m.characterId, m.body])).toEqual([
    ['character', '5', ' {{user}} '],
    ['user', null, '**강조**\n'],
  ]);
  expect(introsPayload(intros).intros[0]).toEqual({ ...raw[0], title: '' });
  expect(() => readIntros([raw[0], raw[0]], characters)).toThrow();
  expect(() => readIntros(raw, [])).toThrow('발화자 연결을 확인할 수 없습니다.');
  expect(() => readIntros(undefined, characters)).toThrow();
});
