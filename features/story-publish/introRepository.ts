/** CREATE-US-03 인트로를 7번 공통 저장 응답·요청으로 변환한다. 별도 인트로 API는 두지 않는다. */
import type { FewshotCharacter, IntroItem } from '@/shared/story-types';
import { readKey, readMessage, readObject, readProvisionalId } from './fewshotRepository';
import { readScene, scenePayload } from './initialStateRepository';

/**
 * 공통 저장 응답의 인트로. 임시 저장본의 새 인트로·말풍선은 서버 id가 null이고 client_key로만 구분한다
 * (서버 Intro.id: DbId | None). id는 있을 때만, client_key는 언제나 중복을 거절한다.
 */
export function readIntros(value: unknown, characters: FewshotCharacter[]): IntroItem[] {
  if (!Array.isArray(value)) throw new Error('인트로 응답을 확인할 수 없습니다.');
  const keys = new Set<string>(),
    introIds = new Set<string>(),
    messageIds = new Set<string>();
  return value.map((entry) => {
    const intro = readObject(entry);
    if (!Array.isArray(intro.messages) || (intro.title !== null && typeof intro.title !== 'string'))
      throw new Error('인트로 응답을 확인할 수 없습니다.');
    const introId = readProvisionalId(intro.id),
      clientKey = readKey(intro.client_key);
    if ((introId !== null && introIds.has(introId)) || keys.has(clientKey))
      throw new Error('중복된 인트로 응답입니다.');
    if (introId !== null) introIds.add(introId);
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
