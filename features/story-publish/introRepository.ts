/** CREATE-US-03 인트로를 7번 공통 저장 응답·요청으로 변환한다. 별도 인트로 API는 두지 않는다. */
import type { FewshotCharacter, IntroItem } from '@/shared/story-types';
import { readId, readKey, readMessage, readObject } from './fewshotRepository';
import { readScene, scenePayload } from './initialStateRepository';

export function readIntros(value: unknown, characters: FewshotCharacter[]): IntroItem[] {
  if (!Array.isArray(value)) throw new Error('인트로 응답을 확인할 수 없습니다.');
  const keys = new Set<string>(),
    introIds = new Set<string>(),
    messageIds = new Set<string>();
  return value.map((entry) => {
    const intro = readObject(entry);
    if (!Array.isArray(intro.messages) || (intro.title !== null && typeof intro.title !== 'string'))
      throw new Error('인트로 응답을 확인할 수 없습니다.');
    const introId = readId(intro.id),
      clientKey = readKey(intro.client_key);
    if (introIds.has(introId) || keys.has(clientKey)) throw new Error('중복된 인트로 응답입니다.');
    introIds.add(introId);
    keys.add(clientKey);
    return {
      id: introId,
      clientKey,
      title: (intro.title as string | null) ?? '',
      messages: intro.messages.map((message) => readMessage(message, characters, keys, messageIds)),
      scene: readScene(intro.scene, characters),
    };
  });
}

export function introsPayload(intros: IntroItem[]) {
  return {
    intros: intros.map((intro) => ({
      id: intro.id,
      client_key: intro.clientKey,
      title: intro.title,
      messages: intro.messages.map((message) => ({
        id: message.id,
        client_key: message.clientKey,
        speaker_kind: message.speakerKind,
        character_id: message.characterId,
        body: message.body,
      })),
      scene: scenePayload(intro.scene),
    })),
  };
}
