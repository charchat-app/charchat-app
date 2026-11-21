// CREATE-US-05 프리셋 편집 규칙 (순수 함수)
import {
  MAX_PRESET_TEXT_LENGTH,
  USER_NAME_PLACEHOLDER,
  type UserProfilePresetRecord,
} from '@/shared/story-types/presets';

import { tagKey } from '../tags';
import {
  addPreset,
  isUserNamePreset,
  movePreset,
  presetNameKey,
  presetsFromDraft,
  presetsToDraftPatch,
  presetTextLength,
  presetTotalLength,
  removePreset,
  setPresetImage,
  setUserNamePreset,
  toggleUserNamePreset,
  updatePreset,
  validatePresets,
  type PresetIssueCode,
  type PresetValues,
} from '../userProfilePresetRules';

/** 이름·이미지가 갖춰진 완성 상태 프리셋 */
const preset = (key: string, name: string, detail = '', extra: Partial<PresetValues> = {}): PresetValues => ({
  key,
  name,
  detail,
  imageId: 1,
  photoUrl: null,
  ...extra,
});

const codes = (presets: PresetValues[], characters: string[] = []): string[] =>
  validatePresets(presets, characters).issues.map((i) => `${i.key}.${i.code}`);

describe('CREATE-US-05 글자 수 (AC05)', () => {
  it('한도는 이름+상세 합쳐 1000 코드 포인트다', () => {
    expect(MAX_PRESET_TEXT_LENGTH).toBe(1000);
  });

  it('원문 그대로(앞뒤 공백·줄바꿈·{{user}} 포함) 코드 포인트로 센다', () => {
    expect(presetTextLength('  가나 ')).toBe(5);
    expect(presetTextLength('가\n나')).toBe(3);
    expect(presetTextLength('{{user}}')).toBe(8);
    expect(presetTextLength('😀😀')).toBe(2);
  });

  it('프리셋의 글자 수는 이름과 상세의 합이다', () => {
    expect(presetTotalLength(preset('a', '이름', '상세'))).toBe(4);
    expect(presetTotalLength(preset('a', USER_NAME_PLACEHOLDER, '{{user}}가 말한다'))).toBe(8 + 13);
  });

  it('경계: 합이 정확히 1000이면 통과, 1001이면 문제다', () => {
    expect(codes([preset('a', '가', '나'.repeat(999))])).toEqual([]);
    expect(codes([preset('a', '가', '나'.repeat(1000))])).toEqual(['a.text-too-long']);
  });

  it('이름이 길어도 합이 1000 이하면 별도 한도 없이 통과한다', () => {
    expect(codes([preset('a', '가'.repeat(500), '나'.repeat(500))])).toEqual([]);
    expect(codes([preset('a', '가'.repeat(1000))])).toEqual([]);
  });

  it('공백·줄바꿈·{{user}}·이모지도 합계에 들어간다', () => {
    expect(codes([preset('a', '가', ' \n'.repeat(500))])).toEqual(['a.text-too-long']);
    expect(codes([preset('a', USER_NAME_PLACEHOLDER, '😀'.repeat(992))])).toEqual([]);
    expect(codes([preset('a', USER_NAME_PLACEHOLDER, '😀'.repeat(993))])).toEqual(['a.text-too-long']);
  });

  it('프리셋마다 따로 센다', () => {
    const list = [preset('a', '가', '나'.repeat(999)), preset('b', '다', '나'.repeat(1000))];
    expect(codes(list)).toEqual(['b.text-too-long']);
  });
});

describe('CREATE-US-05 이름 비교 키 (AC04)', () => {
  it('기존 태그 비교 기준(tagKey)과 같다: 공백 제거 + 소문자, 유니코드 정규화는 하지 않는다', () => {
    for (const s of [' Hello  World ', 'helloworld', '판타지 로맨스', 'Ａ', 'a', '\tA\n']) {
      expect(presetNameKey(s)).toBe(tagKey(s));
    }
    expect(presetNameKey('Ａ')).not.toBe(presetNameKey('a'));
    expect(presetNameKey(' Hello  World ')).toBe('helloworld');
  });
});

describe('CREATE-US-05 완료 조건 (AC03)', () => {
  it('이름과 이미지 1장이 있으면 완료다. 상세는 비어도 된다', () => {
    const result = validatePresets([preset('a', '민수', '')], []);
    expect(result).toEqual({ issues: [], isComplete: true });
  });

  it('프리셋 0개도 완료다 (AC02)', () => {
    expect(validatePresets([], [])).toEqual({ issues: [], isComplete: true });
  });

  it('이름이 비어 있으면 완료가 아니다', () => {
    const result = validatePresets([preset('a', '')], []);
    expect(result.isComplete).toBe(false);
    expect(result.issues).toEqual([expect.objectContaining({ key: 'a', field: 'name', code: 'name-empty' })]);
  });

  it('이미지가 없으면 완료가 아니다 (imageId 기준)', () => {
    const result = validatePresets([preset('a', '민수', '', { imageId: null })], []);
    expect(result.isComplete).toBe(false);
    expect(result.issues).toEqual([expect.objectContaining({ key: 'a', field: 'image', code: 'image-missing' })]);
  });

  it('표시용 photoUrl만 있고 imageId가 없으면 이미지가 있는 것으로 보지 않는다', () => {
    expect(codes([preset('a', '민수', '', { imageId: null, photoUrl: 'https://img/1.png' })])).toEqual([
      'a.image-missing',
    ]);
  });

  it('imageId만 있고 photoUrl이 없어도 이미지가 있다', () => {
    expect(codes([preset('a', '민수', '', { imageId: 7, photoUrl: null })])).toEqual([]);
  });

  it('이름이 {{user}} 그대로이면 이름이 있는 것이다 (미완성 아님)', () => {
    expect(codes([preset('a', '{{user}}')])).toEqual([]);
  });

  it('플레이하는 유저 이름 사용하기 선택은 이름에 {{user}}를 그대로 쓰고, 해제하면 비운다', () => {
    const list = [preset('a', '민수'), preset('b', '')];
    const on = setUserNamePreset(list, 'a', true);
    expect(on[0].name).toBe('{{user}}');
    expect(on[0].name).toBe(USER_NAME_PLACEHOLDER);
    expect(on[1]).toBe(list[1]);
    expect(isUserNamePreset(on[0].name)).toBe(true);
    expect(setUserNamePreset(on, 'a', false)[0].name).toBe('');
  });

  it('토글은 넘겨받은 최신 목록의 이름을 기준으로 켜고 끈다', () => {
    const off = [preset('a', '민수'), preset('b', '')];
    const on = toggleUserNamePreset(off, 'a');
    expect(on[0].name).toBe(USER_NAME_PLACEHOLDER);
    expect(on[1]).toBe(off[1]);
    expect(toggleUserNamePreset(on, 'a')[0].name).toBe('');
    expect(toggleUserNamePreset(off, 'zzz')).toBe(off);
  });

  it('{{user}} 그대로일 때만 유저 이름 사용으로 본다', () => {
    expect(isUserNamePreset('{{user}}')).toBe(true);
    expect(isUserNamePreset(' {{user}}')).toBe(false);
    expect(isUserNamePreset('{{user}} ')).toBe(false);
    expect(isUserNamePreset('{{User}}')).toBe(false);
    expect(isUserNamePreset('민수{{user}}')).toBe(false);
  });
});

describe('CREATE-US-05 직접 지은 이름 규칙 (AC04)', () => {
  it('등장 캐릭터와 같은 이름이면 문제다 (공백·영문 대소문자 무시)', () => {
    expect(codes([preset('a', '하린')], ['하린'])).toEqual(['a.name-duplicate-character']);
    expect(codes([preset('a', 'Min Su')], ['minsu'])).toEqual(['a.name-duplicate-character']);
    expect(codes([preset('a', '하 린')], ['하린'])).toEqual(['a.name-duplicate-character']);
    expect(codes([preset('a', '민수')], ['하린'])).toEqual([]);
  });

  it('직접 지은 다른 프리셋 이름과 같으면 뒤쪽이 문제다 (공백·영문 대소문자 무시)', () => {
    const list = [preset('a', 'Min Su'), preset('b', 'minsu'), preset('c', '다른')];
    expect(codes(list)).toEqual(['b.name-duplicate-preset']);
  });

  it('앞뒤 공백이 있으면 다듬지 않고 문제로 알린다', () => {
    const list = [preset('a', ' 민수'), preset('b', '철수 '), preset('c', '\t영희\n')];
    expect(codes(list)).toEqual(['a.name-surrounding-space', 'b.name-surrounding-space', 'c.name-surrounding-space']);
    expect(list[0].name).toBe(' 민수');
  });

  it('공백만 있는 이름도 문제다', () => {
    expect(codes([preset('a', '   ')])).toEqual(['a.name-surrounding-space']);
  });

  it('{{user}}는 여러 프리셋에서 반복해도 유효하다', () => {
    expect(codes([preset('a', '{{user}}'), preset('b', '{{user}}'), preset('c', '{{user}}')])).toEqual([]);
  });

  it('{{user}} 프리셋은 캐릭터 이름 비교 대상이 아니다', () => {
    expect(codes([preset('a', '{{user}}')], ['{{user}}'])).toEqual([]);
  });

  it('앞뒤 공백이 붙은 {{user}}는 유저 이름이 아니라 직접 지은 이름이라 문제다', () => {
    expect(codes([preset('a', '{{user}}'), preset('b', ' {{user}}')])).toEqual(['b.name-surrounding-space']);
  });

  it('여러 문제가 한 프리셋에 겹치면 모두 알려 준다', () => {
    expect(codes([preset('a', ' 하린', '', { imageId: null })], ['하린'])).toEqual([
      'a.name-surrounding-space',
      'a.name-duplicate-character',
      'a.image-missing',
    ]);
  });
});

describe('CREATE-US-05 개수·목록 편집 (AC02·AC07·AC08)', () => {
  it('최대 5개까지만 추가된다', () => {
    let list: PresetValues[] = [];
    for (let i = 0; i < 7; i += 1) list = addPreset(list);
    expect(list).toHaveLength(5);
    expect(new Set(list.map((p) => p.key)).size).toBe(5);
    expect(list[0]).toMatchObject({ name: '', detail: '', imageId: null, photoUrl: null });
  });

  it('5개를 넘는 목록(서버 값)은 목록 문제로 알려 주고 항목은 지우지 않는다', () => {
    const list = Array.from({ length: 6 }, (_, i) => preset(`k${i}`, `이름${i}`));
    const result = validatePresets(list, []);
    expect(result.isComplete).toBe(false);
    expect(result.issues).toEqual([expect.objectContaining({ field: 'list', code: 'too-many' })]);
    expect(presetsToDraftPatch(list).userProfilePresets).toHaveLength(6);
  });

  it('수정은 해당 항목만 바꾸고 입력한 원문({{user}}·공백)을 그대로 둔다', () => {
    const list = [preset('a', '가'), preset('b', '나')];
    const next = updatePreset(list, 'b', { name: '  민수 ', detail: '{{user}}의 친구' });
    expect(next[0]).toBe(list[0]);
    expect(next[1]).toMatchObject({ key: 'b', name: '  민수 ', detail: '{{user}}의 친구' });
  });

  it('삭제하면 나머지 항목의 값과 순서는 그대로다', () => {
    const list = [preset('a', '가'), preset('b', '나'), preset('c', '다')];
    const next = removePreset(list, 'b');
    expect(next.map((p) => p.key)).toEqual(['a', 'c']);
    expect(next[0]).toBe(list[0]);
    expect(next[1]).toBe(list[2]);
  });

  it('순서 변경은 항목 값과 id·imageId를 유지하고 범위를 벗어나면 그대로다', () => {
    const list = [preset('a', '가', '', { id: '1', imageId: 11 }), preset('b', '나'), preset('c', '다')];
    const down = movePreset(list, 'a', 1);
    expect(down.map((p) => p.key)).toEqual(['b', 'a', 'c']);
    expect(down[1]).toMatchObject({ id: '1', imageId: 11 });
    expect(movePreset(list, 'a', -1)).toBe(list);
    expect(movePreset(list, 'c', 1)).toBe(list);
    expect(movePreset(list, 'zzz', 1)).toBe(list);
  });
});

describe('CREATE-US-05 이미지 (AC01·AC03)', () => {
  it('이미지를 지정하면 imageId(서버 정수)와 표시용 photoUrl을 함께 둔다', () => {
    const list = [preset('a', '가', '', { imageId: null })];
    const next = setPresetImage(list, 'a', { imageId: 42, photoUrl: 'https://img/42.png' });
    expect(next[0]).toMatchObject({ imageId: 42, photoUrl: 'https://img/42.png' });
    expect(next[0].imageId).toBe(42);
  });

  it('해제하면 imageId와 photoUrl이 모두 비워진다', () => {
    const list = [preset('a', '가', '', { imageId: 42, photoUrl: 'https://img/42.png' })];
    expect(setPresetImage(list, 'a', null)[0]).toMatchObject({ imageId: null, photoUrl: null });
  });

  it('다른 프리셋은 건드리지 않는다', () => {
    const list = [preset('a', '가'), preset('b', '나')];
    const next = setPresetImage(list, 'a', { imageId: 5, photoUrl: null });
    expect(next[1]).toBe(list[1]);
  });
});

describe('CREATE-US-05 저장 조각 변환 (AC01·AC06)', () => {
  it('문제가 있어도 임시 저장 조각은 원문·순서·id·imageId·photoUrl 그대로 만든다', () => {
    const list = [
      preset('a', '  ', '{{user}}', { id: '9', imageId: 3, photoUrl: 'https://img/3.png' }),
      preset('new-1', ' Min Su ', ' 상세 ', { imageId: null }),
      preset('b', '{{user}}', '\n끝', { id: '10', imageId: 4, photoUrl: null }),
    ];
    expect(validatePresets(list, []).isComplete).toBe(false);
    expect(presetsToDraftPatch(list)).toEqual({
      userProfilePresets: [
        { id: '9', name: '  ', detail: '{{user}}', imageId: 3, photoUrl: 'https://img/3.png' },
        { name: ' Min Su ', detail: ' 상세 ', imageId: null, photoUrl: null },
        { id: '10', name: '{{user}}', detail: '\n끝', imageId: 4, photoUrl: null },
      ],
    });
  });

  it('글자 수·중복을 넘겨도 임시 저장 조각에서 내용이 잘리거나 지워지지 않는다', () => {
    const long = '가'.repeat(1500);
    const list = [preset('a', '하린', long), preset('b', '하린')];
    expect(validatePresets(list, ['하린']).isComplete).toBe(false);
    expect(presetsToDraftPatch(list).userProfilePresets.map((p) => p.detail)).toEqual([long, '']);
    expect(presetsToDraftPatch(list).userProfilePresets.map((p) => p.name)).toEqual(['하린', '하린']);
  });

  it('key는 저장 조각에 들어가지 않고 id가 없으면 id 키도 만들지 않는다', () => {
    const [saved] = presetsToDraftPatch([preset('x', '가')]).userProfilePresets;
    expect(Object.keys(saved).sort()).toEqual(['detail', 'imageId', 'name', 'photoUrl']);
  });

  it('저장된 값을 불러오면 순서·원문·imageId·photoUrl이 그대로 복원된다', () => {
    const saved: UserProfilePresetRecord[] = [
      { id: '7', name: '{{user}}', detail: '{{user}}의 하루', imageId: 12, photoUrl: 'https://img/12.png' },
      { name: 'B', detail: ' 줄\n바꿈 ', imageId: null, photoUrl: null },
      { id: '8', name: 'C', detail: '', imageId: 13, photoUrl: null },
    ];
    const values = presetsFromDraft(saved);
    expect(values.map((v) => v.name)).toEqual(['{{user}}', 'B', 'C']);
    expect(values[0]).toMatchObject({ key: 'saved:7', id: '7', imageId: 12, photoUrl: 'https://img/12.png' });
    expect(new Set(values.map((v) => v.key)).size).toBe(3);
    expect(presetsToDraftPatch(values).userProfilePresets).toEqual(saved);
  });

  it('저장된 key와 로컬 key는 접두사로 나뉘어, 서버 id가 로컬 key 모양이어도 겹치지 않는다', () => {
    const local = addPreset([])[0].key;
    expect(local.startsWith('local:')).toBe(true);
    const restored = presetsFromDraft([
      { id: local, name: 'A', detail: '', imageId: 1, photoUrl: null },
      { id: 'local:999', name: 'B', detail: '', imageId: 2, photoUrl: null },
      { name: 'C', detail: '', imageId: 3, photoUrl: null },
    ]);
    expect(restored[0].key).toBe(`saved:${local}`);
    expect(restored[1].key).toBe('saved:local:999');
    expect(restored[2].key.startsWith('local:')).toBe(true);
    const merged = addPreset(restored);
    expect(new Set([local, ...merged.map((p) => p.key)]).size).toBe(merged.length + 1);
    // key는 저장 조각에 섞이지 않고 원래 id만 남는다
    expect(presetsToDraftPatch(restored).userProfilePresets.map((p) => p.id)).toEqual([local, 'local:999', undefined]);
  });

  it('imageId가 없는 기존 저장값은 이미지 없음(null)으로 복원하고 photoUrl은 보존한다', () => {
    const [value] = presetsFromDraft([{ name: 'A', detail: '', photoUrl: 'https://img/old.png' }]);
    expect(value.imageId).toBeNull();
    expect(value.photoUrl).toBe('https://img/old.png');
    expect(presetsToDraftPatch([value]).userProfilePresets[0]).toEqual({
      name: 'A',
      detail: '',
      imageId: null,
      photoUrl: 'https://img/old.png',
    });
  });
});

// 코드 목록이 타입과 어긋나지 않는지 컴파일 단계에서 확인한다.
const _issueCodes: PresetIssueCode[] = [
  'name-empty',
  'name-surrounding-space',
  'name-duplicate-character',
  'name-duplicate-preset',
  'text-too-long',
  'image-missing',
  'too-many',
];
void _issueCodes;
