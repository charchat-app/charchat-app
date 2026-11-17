/** CREATE-US-04 장면·관계·호감도를 7번 공통 저장 응답·요청으로 변환한다. 원문 문자열을 바꾸지 않는다. */
import {
  DATE_MODES,
  type DateMode,
  type FewshotCharacter,
  type InitialAffinity,
  type InitialRelation,
  type IntroScene,
  type PersonKind,
} from '@/shared/story-types';
import { readId, readKey, readObject } from './fewshotRepository';

const fail = (): never => {
  throw new Error('초기 상태 응답을 확인할 수 없습니다.');
};
/** null(미지정)은 편집 화면에서 빈 입력으로 보여준다. */
const text = (value: unknown): string =>
  value === null || value === undefined ? '' : typeof value === 'string' ? value : fail();
const known = (characters: FewshotCharacter[], id: string) =>
  characters.some((person) => person.id === id) ? id : fail();

export function readScene(value: unknown, characters: FewshotCharacter[]): IntroScene {
  const s = readObject(value);
  if (s.date_mode !== null && !DATE_MODES.includes(s.date_mode as DateMode)) fail();
  if (!['24h', '12h'].includes(String(s.time_format))) fail();
  if (s.meridiem !== null && !['am', 'pm'].includes(String(s.meridiem))) fail();
  if (!Array.isArray(s.characters)) fail();
  return {
    dateMode: s.date_mode as DateMode | null,
    era: text(s.era),
    year: text(s.year_input),
    month: text(s.month_input),
    day: text(s.day_input),
    referenceEvent: text(s.reference_event),
    elapsedDay: text(s.elapsed_day_input),
    timeFormat: s.time_format as IntroScene['timeFormat'],
    hour: text(s.hour_input),
    minute: text(s.minute_input),
    meridiem: s.meridiem as IntroScene['meridiem'],
    place: text(s.place),
    characters: (s.characters as unknown[]).map((entry) => {
      const c = readObject(entry);
      return {
        characterId: known(characters, readId(c.character_id)),
        clothing: text(c.clothing),
        innerThought: text(c.inner_thought),
      };
    }),
  };
}

export function scenePayload(scene: IntroScene) {
  return {
    date_mode: scene.dateMode,
    era: scene.era,
    year_input: scene.year,
    month_input: scene.month,
    day_input: scene.day,
    reference_event: scene.referenceEvent,
    elapsed_day_input: scene.elapsedDay,
    time_format: scene.timeFormat,
    hour_input: scene.hour,
    minute_input: scene.minute,
    meridiem: scene.meridiem,
    place: scene.place,
    characters: scene.characters.map((c) => ({
      character_id: c.characterId,
      clothing: c.clothing,
      inner_thought: c.innerThought,
    })),
  };
}

export function readRelations(value: unknown, characters: FewshotCharacter[]): InitialRelation[] {
  if (!Array.isArray(value)) fail();
  const keys = new Set<string>();
  return (value as unknown[]).map((entry) => {
    const r = readObject(entry);
    const person = (kind: unknown, id: unknown): [PersonKind, string | null] =>
      kind === 'user' && id === null
        ? ['user', null]
        : kind === 'character'
          ? ['character', known(characters, readId(id))]
          : fail();
    const [sourceKind, sourceCharacterId] = person(r.source_kind, r.source_character_id);
    const [targetKind, targetCharacterId] = person(r.target_kind, r.target_character_id);
    const clientKey = readKey(r.client_key);
    if (keys.has(clientKey)) fail();
    keys.add(clientKey);
    return {
      clientKey,
      sourceKind,
      sourceCharacterId,
      targetKind,
      targetCharacterId,
      label: text(r.label),
    };
  });
}

export function relationsPayload(relations: InitialRelation[]) {
  return {
    relations: relations.map((r) => ({
      client_key: r.clientKey,
      source_kind: r.sourceKind,
      source_character_id: r.sourceCharacterId,
      target_kind: r.targetKind,
      target_character_id: r.targetCharacterId,
      label: r.label,
    })),
  };
}

export function readAffinities(value: unknown, characters: FewshotCharacter[]): InitialAffinity[] {
  if (!Array.isArray(value)) fail();
  const seen = new Set<string>();
  return (value as unknown[]).map((entry) => {
    const a = readObject(entry);
    const sourceCharacterId = known(characters, readId(a.source_character_id));
    const [targetKind, targetCharacterId]: [PersonKind, string | null] =
      a.target_kind === 'user' && a.target_character_id === null
        ? ['user', null]
        : a.target_kind === 'character'
          ? ['character', known(characters, readId(a.target_character_id))]
          : fail();
    const direction = `${sourceCharacterId}>${targetKind}:${targetCharacterId ?? ''}`;
    if (typeof a.value !== 'string' || seen.has(direction) || targetCharacterId === sourceCharacterId) fail();
    seen.add(direction);
    return { sourceCharacterId, targetKind, targetCharacterId, value: a.value as string };
  });
}

export function affinitiesPayload(affinities: InitialAffinity[]) {
  return {
    affinities: affinities.map((a) => ({
      source_character_id: a.sourceCharacterId,
      target_kind: a.targetKind,
      target_character_id: a.targetCharacterId,
      value: a.value,
    })),
  };
}
