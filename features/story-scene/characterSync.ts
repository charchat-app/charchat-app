import type { FewshotCharacter, FewshotGroup, InitialAffinity, InitialRelation, IntroItem } from '@/shared/story-types';

/**
 * CREATE-US-04 캐릭터 삭제 연동: 인트로의 말풍선·착장·속마음과 그 인물이 출발/도착인 관계·호감도만 제거한다.
 * 날짜·시간·장소, 다른 인물의 상태와 무관한 관계는 그대로 둔다. 바뀐 것이 없으면 같은 객체를 돌려준다.
 */
export function removeMissingFromIntros(intros: IntroItem[], characters: readonly FewshotCharacter[]): IntroItem[] {
  const ids = new Set(characters.map((person) => person.id));
  return removeMissingSpeakers(intros, characters).map((intro) => {
    const states = intro.scene.characters.filter((state) => ids.has(state.characterId));
    return states.length === intro.scene.characters.length
      ? intro
      : { ...intro, scene: { ...intro.scene, characters: states } };
  });
}
export function removeMissingFromRelations(
  relations: InitialRelation[],
  characters: readonly FewshotCharacter[],
): InitialRelation[] {
  const ids = new Set(characters.map((person) => person.id));
  const alive = (kind: string, id: string | null) => kind === 'user' || ids.has(id ?? '');
  const next = relations.filter(
    (r) => alive(r.sourceKind, r.sourceCharacterId) && alive(r.targetKind, r.targetCharacterId),
  );
  return next.length === relations.length ? relations : next;
}
/** 삭제된 인물이 출발이거나 대상인 호감도만 제거한다. */
export function removeMissingFromAffinities(
  affinities: InitialAffinity[],
  characters: readonly FewshotCharacter[],
): InitialAffinity[] {
  const ids = new Set(characters.map((person) => person.id));
  const next = affinities.filter(
    (a) => ids.has(a.sourceCharacterId) && (a.targetKind === 'user' || ids.has(a.targetCharacterId ?? '')),
  );
  return next.length === affinities.length ? affinities : next;
}

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
