// chat: 이 도메인 전용 타입. 여러 도메인이 쓰면 shared/story-types로 옮긴다.
// CHAT-US-09 여러 세션: 새로하기·이어하기·대화 삭제에서만 쓰는 서버 계약 추가분.
import type { ConversationSession, ConversationSessionSummary } from '@/shared/story-types';

/**
 * 대화방 상세에 서버가 더해 주는 칸. 옛 서버에는 없으므로 선택 값으로 둔다.
 * story_id가 없으면 대화방에서 새로하기·이어하기를 열 수 없다(☰ 버튼을 그리지 않는다).
 */
export type ConversationRoom = Omit<ConversationSession, 'characters'> & {
  story_id?: number;
  characters: RoomCharacter[];
  /**
   * charchat-app#36: 세션에 적용된 유저 프로필 사진 주소(서버 기준 경로). 말풍선 오른쪽 유저 사진에 쓴다.
   * 옛 서버는 주지 않는다. 없으면 이름 첫 글자를 보인다.
   */
  user_image_url?: string | null;
};

/** 대화방 등장 캐릭터. image_url은 대표 사진(가장 앞 사진) 주소이고, 옛 서버나 사진이 없으면 비어 있다. */
export type RoomCharacter = ConversationSession['characters'][number] & { image_url?: string | null };

/** 이어하기 목록 한 줄. 기존 내 대화 목록 항목에 기본 제목용 인트로 제목이 붙는다. */
export type StorySessionSummary = ConversationSessionSummary & { intro_title?: string | null };

export type StorySessionPage = {
  sessions: StorySessionSummary[];
  /** 다음 페이지 커서(이 ID보다 작은 세션). 없으면 null */
  next_before_id: number | null;
};

/** 새로하기: 지금 방(원본)의 프로필·플레이 이름·모델을 복사해 고른 인트로로 새 방을 만든다. */
export type RestartConversationInput = { intro_id: number; request_id: string };
