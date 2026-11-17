import type { FewshotCharacter, FewshotGroup } from '@/shared/story-types';

/** 본문 속 이름은 건드리지 않고 사라진 발화자와 연결된 메시지만 제거한다. 퓨샷 묶음·인트로 공통. */
export function removeMissingSpeakers<G extends FewshotGroup>(
  groups: G[],
  characters: readonly FewshotCharacter[],
): G[] {
  const ids = new Set(characters.map((person) => person.id));
  return groups.map((group) => {
    const messages = group.messages.filter(
      (message) => message.speakerKind !== 'character' || ids.has(message.characterId ?? ''),
    );
    return messages.length === group.messages.length ? group : { ...group, messages };
  });
}
