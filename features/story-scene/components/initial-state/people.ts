import type { FewshotCharacter, PersonKind } from '@/shared/story-types';

export type Person = { key: string; kind: PersonKind; characterId: string | null; label: string };
export const personKey = (kind: PersonKind, id: string | null) => (kind === 'user' ? 'user' : `c:${id}`);

/** 유저 + 등록된 등장 캐릭터. 이름이 겹치거나 비어도 구분할 수 있게 번호를 붙인다. */
export function people(characters: FewshotCharacter[]): Person[] {
  const names = characters.map((c, i) => c.name?.trim() || `캐릭터 ${i + 1}`);
  // 화면 선택은 이름표로 하므로 이름표가 겹치지 않아야 한다(예: '유저'와 '유저 (1)'이라는 이름의 캐릭터).
  const used = new Set(['유저']);
  const labels = names.map((name, i) => {
    let label = names.filter((n) => n === name).length > 1 || used.has(name) ? `${name} (${i + 1})` : name;
    while (used.has(label)) label = `${label}′`;
    used.add(label);
    return label;
  });
  return [
    { key: 'user', kind: 'user', characterId: null, label: '유저' },
    ...characters.map((c, i) => ({
      key: personKey('character', c.id),
      kind: 'character' as const,
      characterId: c.id,
      label: labels[i],
    })),
  ];
}
