import type { ExpressionSettings } from './expression';
export * from './expression';

/**
 * 스토리 저장 데이터 타입. 두 담당자(강태훈·이휘)가 함께 확정하는 계약이다.
 *
 * 상태: 초안. 목업(mobile-creation-mockup-v15.html)의 draft 객체와 문서(kickoff/creation)에서 가져왔다.
 * 확정 전에 바꾸면 story-setup, story-scene, story-publish가 모두 영향을 받으므로 두 사람이 리뷰한다.
 */

/** 저장 상태. 공개 후 임시 저장으로 되돌릴 수 없다 (CREATE-US-07). */
export type SaveState = '임시 저장' | '비공개' | '공개';

/** 말풍선 발화자. 나레이터·유저·등장 캐릭터 이름 중 하나 */
export type Speaker = string;

export type Bubble = {
  speaker: Speaker;
  /** 원문 그대로 저장한다. {{user}}는 치환하지 않는다 (CREATE-US-02). */
  body: string;
};

export type Character = {
  /**
   * 서버가 발급한 캐릭터 id. 아직 저장하지 않은 새 캐릭터는 없다.
   * 이름을 바꿔도 같은 인물로 이어지게(이미지·말풍선 발화자 연결 등) 이름 대신 이 값으로 구분한다.
   */
  id?: string;
  name: string;
  /** 자유 서술. 성격·외형·배경을 나누지 않는다 (CREATE-US-01). */
  detail: string;
  /** 대표 이미지가 맨 앞. 최대 5장 (CREATE-US-06). */
  photoUrls: string[];
};

export type Intro = {
  /** 상황 제목. 최대 30자 (CREATE-US-03). */
  title: string;
  messages: Bubble[];
  /** 장면 상태 (CREATE-US-04). 미지정이면 빈 값. */
  scene: {
    location: string;
    date: string | null;
    time: string | null;
    clothing: Record<string, string>;
    innerThought: Record<string, string>;
  };
};

export type Relation = {
  from: string;
  to: string;
  label: string;
  /** 호감도 -100 ~ 100 (CREATE-US-04) */
  affinity: number;
};

export type UserProfilePreset = {
  name: string;
  detail: string;
  photoUrl: string | null;
};

export type StoryDraft = {
  id: string;
  /** 스토리 공통 정보 */
  title: string;
  subtitle: string;
  world: string;
  tags: string[];
  coverPhotoUrls: string[];

  /** 등장 캐릭터 (1~10명) */
  characters: Character[];

  /** 말투·서술 (CREATE-US-02) */
  speech: ExpressionSettings;

  /** 상황 예시 (퓨샷) */
  fewshotGroups: { id: string; messages: Bubble[] }[];

  /** 인트로 (1~5개, 첫 번째가 기본) (CREATE-US-03) */
  intros: Intro[];

  /** 관계·호감도 (스토리 공통) (CREATE-US-04) */
  relations: Relation[];

  /** 제작자 추천 유저 프로필 (0~5개) (CREATE-US-05) */
  userProfilePresets: UserProfilePreset[];

  /** 저장 (CREATE-US-07) */
  saveState: SaveState;
  updatedAt: string | null;
};

/** 표현 API 전용 조회 투영. 미조회 생성 영역을 가짜 빈 배열로 채우지 않는다. */
export type StoryExpressionDocument = Pick<StoryDraft, 'id' | 'title' | 'speech' | 'saveState' | 'updatedAt'>;

export * from './fewshots';
export * from './intros';
export * from './creationSave';
