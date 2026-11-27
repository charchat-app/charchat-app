// CHAT-US-08 상태 카드 보기 ON/OFF를 이 기기에 보관한다(KAN-40: OFF는 화면에서만 숨기고 서버는 계속 쓴다).
// 작성 중 입력과 같은 기기 저장소(웹 localStorage, 네이티브 AsyncStorage)를 쓴다. 계정과 무관한 화면 설정이라 로그아웃 정리 대상이 아니다.
import { getDraftStorage } from '@/features/chat/draftStorage';

export const SCENE_CARD_PREFERENCE_KEY = 'charchat:chat-scene-card:v1';
const OFF = 'off';
const ON = 'on';

/** 기본값은 ON. 저장소가 없거나 읽지 못하면 ON이다. */
const parse = (stored: string | null) => stored !== OFF;

/** 웹(동기 저장소)은 바로 값을, 네이티브는 Promise를 돌려준다. 실패해도 던지지 않는다. */
export function readSceneCardVisible(): boolean | Promise<boolean> {
  try {
    const storage = getDraftStorage();
    if (!storage) return true;
    if ('kind' in storage) return storage.getItem(SCENE_CARD_PREFERENCE_KEY).then(parse, () => true);
    return parse(storage.getItem(SCENE_CARD_PREFERENCE_KEY));
  } catch {
    return true;
  }
}

/** 보관에 실패해도 이번 실행 동안은 고른 값대로 보인다. */
export async function writeSceneCardVisible(visible: boolean): Promise<boolean> {
  try {
    const storage = getDraftStorage();
    if (!storage) return false;
    await storage.setItem(SCENE_CARD_PREFERENCE_KEY, visible ? ON : OFF);
    return true;
  } catch {
    return false;
  }
}
