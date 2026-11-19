import { initialStateIssues } from '../hooks/useCommonSave';
import {
  affinitiesPayload,
  readAffinities,
  readRelations,
  readScene,
  relationsPayload,
  scenePayload,
} from '../initialStateRepository';
import {
  affinityIssue,
  affinityValue,
  dateIssue,
  sameAffinities,
  setAffinity,
  emptyScene,
  formatSceneDate,
  formatSceneTime,
  switchDateMode,
  switchTimeFormat,
  timeIssue,
  type InitialAffinity,
  type InitialRelation,
  type IntroItem,
  type IntroScene,
} from '@/shared/story-types';

const scene = (patch: Partial<IntroScene>): IntroScene => ({ ...emptyScene(), ...patch });
const intro = (s: IntroScene): IntroItem => ({ id: null, clientKey: 'i', title: 't', messages: [], scene: s });
const rel = (patch: Partial<InitialRelation>): InitialRelation => ({
  clientKey: 'r',
  sourceKind: 'character',
  sourceCharacterId: '5',
  targetKind: 'user',
  targetCharacterId: null,
  label: '',
  ...patch,
});
const aff = (value: string, patch: Partial<InitialAffinity> = {}): InitialAffinity => ({
  sourceCharacterId: '5',
  targetKind: 'user',
  targetCharacterId: null,
  value,
  ...patch,
});
const issues = (s: IntroScene, relations: InitialRelation[] = [], affinities: InitialAffinity[] = []) =>
  initialStateIssues({ intros: [intro(s)], relations, affinities });

it('날짜: 전부 비우면 미지정, 부분 입력·범위 밖·2월 29일·4월 31일은 완성 저장을 막는다', () => {
  expect(dateIssue(scene({ dateMode: 'calendar' }))).toBeNull();
  expect(dateIssue(scene({ dateMode: 'calendar', year: '2026', month: '2' }))).toMatch('모두');
  expect(dateIssue(scene({ dateMode: 'calendar', year: '2024', month: '2', day: '29' }))).toMatch('28일');
  expect(dateIssue(scene({ dateMode: 'calendar', year: '2026', month: '4', day: '31' }))).toMatch('30일');
  expect(dateIssue(scene({ dateMode: 'calendar', year: '9999', month: '02', day: '28' }))).toBeNull();
  expect(dateIssue(scene({ dateMode: 'calendar', year: '0', month: '1', day: '1' }))).toMatch('1~9999');
  expect(dateIssue(scene({ dateMode: 'world', year: '302', month: '6', day: '1' }))).toMatch('연호');
  expect(dateIssue(scene({ dateMode: 'elapsed', referenceEvent: '감금', elapsedDay: '1.5' }))).toMatch('정수');
  expect(dateIssue(scene({ dateMode: 'elapsed', referenceEvent: '감금', elapsedDay: '9999' }))).toBeNull();
  expect(formatSceneDate(scene({ dateMode: 'elapsed', referenceEvent: '감금', elapsedDay: '3' }))).toBe('감금 3일째');
  expect(formatSceneDate(scene({ dateMode: 'world', era: '제국력', year: '302', month: '6', day: '1' }))).toBe(
    '제국력 302년 6월 1일',
  );
});

it('시간: 24시간제 0~23, 12시간제 1~12와 오전·오후 필수, 분 0~59', () => {
  expect(timeIssue(scene({}))).toBeNull();
  expect(timeIssue(scene({ hour: '9' }))).toMatch('모두');
  expect(timeIssue(scene({ hour: '24', minute: '0' }))).toMatch('0~23');
  expect(timeIssue(scene({ hour: '23', minute: '59' }))).toBeNull();
  expect(timeIssue(scene({ timeFormat: '12h', hour: '9', minute: '30' }))).toMatch('오전');
  expect(timeIssue(scene({ timeFormat: '12h', hour: '0', minute: '30', meridiem: 'am' }))).toMatch('1~12');
  expect(timeIssue(scene({ hour: '7', minute: '60' }))).toMatch('0~59');
  expect(formatSceneTime(scene({ timeFormat: '12h', hour: '7', minute: '5', meridiem: 'pm' }))).toBe('오후 7:05');
});

it('CREATE-US-04-AC03·AC18: 미완성 시각은 빈 칸을 채우지 않고 입력한 원문만 미완성으로 표시한다', () => {
  expect(formatSceneTime(scene({}))).toBeNull();
  expect(formatSceneTime(scene({ hour: '7' }))).toBe('7시 (미완성)');
  expect(formatSceneTime(scene({ minute: '05' }))).toBe('05분 (미완성)');
  expect(formatSceneTime(scene({ timeFormat: '12h', hour: '7', minute: '30' }))).toBe('7시 30분 (미완성)');
  expect(formatSceneTime(scene({ timeFormat: '12h', meridiem: 'am' }))).toBe('오전 (미완성)');
  expect(formatSceneTime(scene({ timeFormat: '12h', hour: '7', meridiem: 'pm' }))).toBe('오후 7시 (미완성)');
  // 모두 입력하면 시계 형식으로 보여 준다.
  expect(formatSceneTime(scene({ hour: '7', minute: '0' }))).toBe('7:00');
  expect(formatSceneTime(scene({ hour: '7' }))).not.toBe('7:00');
});

it('호감도 변경 여부는 행 순서와 무관하고, 기본값 0인 행은 미입력과 같게 본다', () => {
  const a = { sourceCharacterId: '5', targetKind: 'user' as const, targetCharacterId: null, value: '10' };
  const b = { sourceCharacterId: '6', targetKind: 'character' as const, targetCharacterId: '5', value: '20' };
  const saved = [a, b];
  // 바꿨다가 원래 값으로 되돌리면 setAffinity가 행을 끝으로 옮기지만 변경으로 보지 않는다.
  const reverted = setAffinity(setAffinity(saved, { ...a, value: '30' }), { ...a, value: '10' });
  expect(reverted).toEqual([b, a]);
  expect(sameAffinities(reverted, saved)).toBe(true);
  expect(sameAffinities([...saved, { ...a, sourceCharacterId: '7', value: '0' }], saved)).toBe(true);
  expect(sameAffinities(setAffinity(saved, { ...a, value: '11' }), saved)).toBe(false);
  expect(sameAffinities(setAffinity(saved, { ...b, value: '0' }), saved)).toBe(false);
});

it('방식·시간제 전환은 해당 입력만 지우고 다른 설정은 유지한다', () => {
  const before = scene({
    dateMode: 'world',
    era: '제국력',
    year: '302',
    timeFormat: '12h',
    hour: '7',
    meridiem: 'pm',
    place: '골목',
  });
  const date = switchDateMode(before, 'elapsed');
  expect([date.era, date.year, date.dateMode]).toEqual(['', '', 'elapsed']);
  expect([date.hour, date.meridiem, date.place]).toEqual(['7', 'pm', '골목']);
  const time = switchTimeFormat(before, '24h');
  expect([time.hour, time.meridiem, time.era, time.place]).toEqual(['', null, '제국력', '골목']);
});

it('글자 수 초과·호감도 빈값/범위 밖은 완성 저장 사유로 안내한다', () => {
  expect(issues(scene({ place: '가'.repeat(30) }))).toEqual([]);
  expect(issues(scene({ place: '가'.repeat(31) }))).toEqual([
    '장소·착장·속마음·관계명·연호·기준 사건의 글자 수 한도를 확인해 주세요.',
  ]);
  expect(
    issues(scene({ characters: [{ characterId: '5', clothing: '😀'.repeat(301), innerThought: '' }] })),
  ).toHaveLength(1);
  expect(issues(scene({}), [rel({ label: '가'.repeat(11) })])).toHaveLength(1);
  for (const value of ['', '101', '3.5', '-'])
    expect(issues(scene({}), [], [aff(value)])).toEqual(['초기 호감도는 -100~100 사이 정수로 입력해 주세요.']);
  for (const value of ['-100', '0', '100']) expect(issues(scene({}), [], [aff(value)])).toEqual([]);
  // 관계 카드는 호감도와 무관하다. 유저 출발 관계도 검사 대상이 아니다.
  expect(issues(scene({}), [rel({ sourceKind: 'user', sourceCharacterId: null })])).toEqual([]);
});

it('장면·관계 응답을 원문 그대로 복원하고 요청으로 되돌린다', () => {
  const characters = [{ id: '5', name: '하린', position: 0 }];
  const raw = {
    date_mode: 'world',
    era: '제국력',
    year_input: '302',
    month_input: null,
    day_input: null,
    reference_event: null,
    elapsed_day_input: null,
    time_format: '12h',
    hour_input: '7',
    minute_input: null,
    meridiem: 'pm',
    place: ' 골목\n',
    characters: [{ character_id: '5', clothing: '코트', inner_thought: null }],
  };
  const parsed = readScene(raw, characters);
  expect(parsed).toMatchObject({ era: '제국력', month: '', place: ' 골목\n', meridiem: 'pm' });
  expect(parsed.characters).toEqual([{ characterId: '5', clothing: '코트', innerThought: '' }]);
  expect(scenePayload(parsed)).toMatchObject({ era: '제국력', month_input: '', characters: [{ character_id: '5' }] });
  expect(() => readScene({ ...raw, characters: [{ character_id: '9' }] }, characters)).toThrow();

  const relations = readRelations(
    [
      {
        client_key: 'relation-1',
        source_kind: 'character',
        source_character_id: '5',
        target_kind: 'user',
        target_character_id: null,
        label: null,
      },
      {
        client_key: 'relation-2',
        source_kind: 'user',
        source_character_id: null,
        target_kind: 'character',
        target_character_id: '5',
        label: '짝사랑',
      },
    ],
    characters,
  );
  expect(relations.map((r) => r.label)).toEqual(['', '짝사랑']);
  expect(relationsPayload(relations).relations[1]).toMatchObject({ source_kind: 'user', label: '짝사랑' });
});

it('AC09: 호감도는 관계와 독립이고, 입력하지 않은 조합은 0으로 보인다', () => {
  const characters = [
    { id: '5', name: '하린', position: 0 },
    { id: '6', name: '도윤', position: 1 },
  ];
  const raw = [
    { source_character_id: '5', target_kind: 'user', target_character_id: null, value: '' },
    { source_character_id: '6', target_kind: 'character', target_character_id: '5', value: '150' },
  ];
  const parsed = readAffinities(raw, characters);
  expect(affinitiesPayload(parsed).affinities).toEqual(raw);
  expect(affinityValue(parsed, { sourceCharacterId: '5', targetKind: 'user', targetCharacterId: null })).toBe('');
  expect(affinityValue(parsed, { sourceCharacterId: '5', targetKind: 'character', targetCharacterId: '6' })).toBe('0');
  // A→B를 바꿔도 B→A는 그대로. 0으로 되돌리면 행을 지운다.
  const toB = setAffinity(parsed, {
    sourceCharacterId: '5',
    targetKind: 'character',
    targetCharacterId: '6',
    value: '40',
  });
  expect(affinityValue(toB, { sourceCharacterId: '6', targetKind: 'character', targetCharacterId: '5' })).toBe('150');
  expect(setAffinity(toB, { ...toB[2], value: '0' })).toEqual(parsed);
  for (const bad of [
    [{ ...raw[0], source_character_id: '9' }],
    [{ ...raw[1], target_character_id: '6' }],
    [raw[0], raw[0]],
    [{ ...raw[0], value: null }],
  ])
    expect(() => readAffinities(bad, characters)).toThrow();
});

it('자릿수가 상한보다 긴 숫자는 앱에서도 완성 저장 오류로 본다(서버와 같은 기준)', () => {
  const base = { ...emptyScene(), dateMode: 'calendar' as const, year: '2026', month: '3', day: '1' };
  expect(dateIssue(base)).toBeNull();
  expect(dateIssue({ ...base, month: '001' })).not.toBeNull();
  expect(dateIssue({ ...base, year: '02026' })).not.toBeNull();
  expect(timeIssue({ ...emptyScene(), timeFormat: '24h', hour: '007', minute: '05' })).not.toBeNull();
  expect(timeIssue({ ...emptyScene(), timeFormat: '24h', hour: '07', minute: '05' })).toBeNull();
  expect(affinityIssue('0001')).not.toBeNull();
  expect(affinityIssue('-100')).toBeNull();
});
