import type { FewshotCharacter, PersonKind } from '@/shared/story-types';

export type Person = { key: string; kind: PersonKind; characterId: string | null; label: string };
export const personKey = (kind: PersonKind, id: string | null) => (kind === 'user' ? 'user' : `c:${id}`);

/** 유저 + 등록된 등장 캐릭터. 이름이 겹치거나 비어도 구분할 수 있게 번호를 붙인다. */
export function people(characters: FewshotCharacter[]): Person[] {
  const names = characters.map((c, i) => c.name?.trim() || `캐릭터 ${i + 1}`);
  return [
    { key: 'user', kind: 'user', characterId: null, label: '유저' },
    ...characters.map((c, i) => ({
      key: personKey('character', c.id),
      kind: 'character' as const,
      characterId: c.id,
      label:
        names.filter((n) => n === names[i]).length > 1 || names[i] === '유저' ? `${names[i]} (${i + 1})` : names[i],
    })),
  ];
}
