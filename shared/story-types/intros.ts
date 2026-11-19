/** CREATE-US-03. 말풍선 형식은 2번 퓨샷과 같고, 목록의 첫 번째 인트로가 기본이다. */
import { newFewshotKey, type FewshotMessage } from './fewshots';
import { emptyScene, type IntroScene } from './initialState';

export const MAX_INTROS = 5;
export const INTRO_TITLE_LIMIT = 30;
export const INTRO_BODY_LIMIT = 2000;

export type IntroItem = {
  id: string | null;
  clientKey: string;
  /** 상황 제목. 임시 저장에서는 빈 값·초과도 원문 그대로 보존한다. */
  title: string;
  messages: FewshotMessage[];
  /** CREATE-US-04 이 인트로의 시작 장면. */
  scene: IntroScene;
};

export const newIntro = (): IntroItem => ({
  id: null,
  clientKey: newFewshotKey('intro'),
  title: '',
  messages: [],
  scene: emptyScene(),
});
