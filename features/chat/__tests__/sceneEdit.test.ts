// CHAT-US-08 (KAN-22·KAN-40) 상태 카드 표시 형식과 장면 정보 수정 요청(바뀐 칸만)·서버 거절 해석
import { planSceneUpdate, sceneEditErrors, sceneToForm, type SceneForm } from '@/features/chat/scene/sceneEdit';
import { formatChatSceneDate, formatChatSceneTime, sceneCardLines } from '@/features/chat/scene/sceneFormat';
import { ApiError } from '@/lib/api-client';
import type { CurrentScene, SceneDate } from '@/shared/story-types';

const date = (overrides: Partial<SceneDate>): SceneDate => ({
  mode: 'calendar',
  era: null,
  year: null,
  month: null,
  day: null,
  reference_event: null,
  elapsed_day: null,
  ...overrides,
});
const scene: CurrentScene = {
  date: date({ year: 2026, month: 11, day: 23 }),
  time: { hour: 12, minute: 40 },
  place: '공원 매점',
  characters: [
    { name: '도경', clothing: '검은 코트', inner_thought: '피곤하다' },
    { name: 'Bea', clothing: null, inner_thought: null },
  ],
};
const edit = (change: (form: SceneForm) => SceneForm, base = scene) => planSceneUpdate(base, change(sceneToForm(base)));

describe('CHAT-US-08 상태 카드 형식', () => {
  it.each([
    ['calendar', date({ year: 2026, month: 11, day: 23 }), '2026년 11월 23일'],
    ['world', date({ mode: 'world', era: '광무', year: 2, month: 3, day: 3 }), '광무 2년 3월 3일'],
    ['elapsed', date({ mode: 'elapsed', reference_event: '전학', elapsed_day: 3 }), '전학 3일째'],
    ['elapsed(기준 사건 없음)', date({ mode: 'elapsed', elapsed_day: 12 }), '12일째'],
    ['calendar(연만)', date({ year: 2026 }), '2026년'],
  ])('CHAT-US-08: 날짜 방식 %s 표시', (_mode, value, expected) => {
    expect(formatChatSceneDate(value)).toBe(expected);
  });

  it('CHAT-US-08: 빈 날짜·시간은 null이고, 시간은 분이 있으면 07:05, 없으면 19시', () => {
    expect(formatChatSceneDate(null)).toBeNull();
    expect(formatChatSceneDate(date({ mode: 'elapsed' }))).toBeNull();
    expect(formatChatSceneTime(null)).toBeNull();
    expect(formatChatSceneTime({ hour: 7, minute: 5 })).toBe('07:05');
    expect(formatChatSceneTime({ hour: 19, minute: null })).toBe('19시');
  });

  it('CHAT-US-08: 값이 없는 줄과 착장·속마음이 모두 없는 캐릭터는 카드 줄에서 뺀다', () => {
    expect(sceneCardLines({ ...scene, place: '', time: null })).toEqual({
      date: '2026년 11월 23일',
      time: null,
      place: null,
      characters: [{ name: '도경', clothing: '검은 코트', innerThought: '피곤하다' }],
    });
  });
});

describe('CHAT-US-08 장면 정보 수정 요청', () => {
  it('CHAT-US-08: 아무것도 바꾸지 않으면 빈 요청이다', () => {
    expect(edit((form) => form)).toEqual({ ok: true, input: {}, characterNames: [] });
  });

  it('CHAT-US-08: 바뀐 칸만 보내고 앞뒤 공백은 잘라 보낸다(캐릭터는 바뀐 항목만)', () => {
    const plan = edit((form) => ({
      ...form,
      place: '  공원 벤치 ',
      characters: form.characters.map((c) => (c.name === 'Bea' ? { ...c, innerThought: '배고프다' } : c)),
    }));
    expect(plan).toEqual({
      ok: true,
      input: { place: '공원 벤치', characters: [{ name: 'Bea', inner_thought: '배고프다' }] },
      characterNames: ['Bea'],
    });
  });

  it('CHAT-US-08: 날짜는 방식에 맞는 날짜 전체, 시간은 시·분을 함께 보내고 분을 비우면 null(19시)', () => {
    expect(edit((form) => ({ ...form, day: '24', minute: '' }))).toEqual({
      ok: true,
      input: { date: { mode: 'calendar', year: 2026, month: 11, day: 24 }, time: { hour: 12, minute: null } },
      characterNames: [],
    });
    const world: CurrentScene = { ...scene, date: date({ mode: 'world', era: '광무', year: 2, month: 3, day: 3 }) };
    expect(edit((form) => ({ ...form, era: '융희' }), world)).toMatchObject({
      input: { date: { mode: 'world', era: '융희', year: 2, month: 3, day: 3 } },
    });
    const elapsed: CurrentScene = { ...scene, date: date({ mode: 'elapsed', elapsed_day: 3 }) };
    expect(edit((form) => ({ ...form, elapsedDay: '4' }), elapsed)).toMatchObject({
      input: { date: { mode: 'elapsed', elapsed_day: 4 } },
    });
  });

  it.each<[string, (form: SceneForm) => SceneForm, string, RegExp]>([
    ['장소 30자 초과', (f) => ({ ...f, place: '가'.repeat(31) }), 'place', /장소는 30자까지/],
    [
      '착장 300자 초과',
      (f) => ({ ...f, characters: [{ ...f.characters[0], clothing: '옷'.repeat(301) }, f.characters[1]] }),
      'clothing:도경',
      /착장은 300자까지/,
    ],
    [
      '속마음 100자 초과',
      (f) => ({ ...f, characters: [f.characters[0], { ...f.characters[1], innerThought: '마'.repeat(101) }] }),
      'innerThought:Bea',
      /속마음은 100자까지/,
    ],
    ['값 지우기', (f) => ({ ...f, place: '  ' }), 'place', /지울 수 없어요/],
    ['2월 29일', (f) => ({ ...f, month: '2', day: '29' }), 'date', /2월은 1~28일/],
    ['24시', (f) => ({ ...f, hour: '24' }), 'time', /0~23/],
  ])('CHAT-US-08: 앱에서 먼저 막는다 — %s', (_name, change, key, message) => {
    const plan = edit(change);
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.errors[key as keyof typeof plan.errors]).toMatch(message);
  });

  it('CHAT-US-08: 기준 사건 10자 초과는 막고, 10자는 받는다', () => {
    const elapsed: CurrentScene = { ...scene, date: date({ mode: 'elapsed', elapsed_day: 3 }) };
    const over = edit((form) => ({ ...form, referenceEvent: '사'.repeat(11) }), elapsed);
    expect(!over.ok && over.errors.date).toMatch(/기준 사건은 10자까지/);
    expect(edit((form) => ({ ...form, referenceEvent: '사'.repeat(10) }), elapsed).ok).toBe(true);
  });
});

describe('CHAT-US-08 수정 거절 안내', () => {
  const problem = (status: number, code: string, body: Record<string, unknown> = {}, detail = '서버 안내') =>
    new ApiError(status, code, detail, [], { code, detail, ...body });

  it.each([
    ['GENERATION_IN_PROGRESS', '응답을 만드는 중에는 고칠 수 없어요'],
    ['SCENE_INFO_NOT_LATEST_REPLY', '새 응답이 있어 다시 열어 주세요'],
    ['SCENE_INFO_REPLY_NOT_COMPLETED', '끝나지 않은 응답'],
    ['CONVERSATION_READ_ONLY', '읽기 전용 대화'],
  ])('CHAT-US-08: 409 %s', (code, message) => {
    expect(sceneEditErrors(problem(409, code), []).form).toContain(message);
  });

  it('CHAT-US-08: 422 field는 그 칸에(캐릭터는 보낸 순서의 이름으로) 서버 안내를 붙인다', () => {
    const invalid = (field: string) => problem(422, 'SCENE_INFO_INVALID_VALUE', { field }, '값이 올바르지 않습니다.');
    expect(sceneEditErrors(invalid('place'), [])).toEqual({ place: '값이 올바르지 않습니다.' });
    expect(sceneEditErrors(invalid('date.era'), [])).toEqual({ date: '값이 올바르지 않습니다.' });
    expect(sceneEditErrors(invalid('characters[1].inner_thought'), ['도경', 'Bea'])).toEqual({
      'innerThought:Bea': '값이 올바르지 않습니다.',
    });
    expect(sceneEditErrors(invalid('characters[0].clothing'), ['Bea'])).toEqual({
      'clothing:Bea': '값이 올바르지 않습니다.',
    });
  });

  it('CHAT-US-08: 그 밖의 실패는 다시 시도 안내다', () => {
    expect(sceneEditErrors(new ApiError(0, 'NETWORK_ERROR', 'x'), []).form).toMatch(/다시 시도/);
    expect(sceneEditErrors(problem(422, 'VALIDATION_ERROR'), []).form).toBe('입력한 값을 확인해 주세요.');
  });
});
