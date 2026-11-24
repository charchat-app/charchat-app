// CHAT-US-01 대화 진입 API 조회 투영
export type ConversationMessage = {
  speaker_kind: 'character' | 'user' | 'narrator';
  speaker_name: string | null;
  body: string;
};

type ConversationCharacter = { id: number; name: string };

export type ConversationIntro = { id: number; title: string; messages: ConversationMessage[] };

export type ConversationProfile = {
  id: number;
  kind: 'preset' | 'personal';
  name: string;
  description: string;
  initial_name: string | null;
};

export type StartConversationInput = {
  intro_id: number;
  profile_kind: ConversationProfile['kind'];
  profile_id: number;
  play_name: string;
};

export type ConversationSessionCreated = { id: number };

export type ConversationSession = ConversationSessionCreated & {
  story_title: string;
  model: string | null;
  read_only: boolean;
  messages: ConversationMessage[];
  characters: ConversationCharacter[];
  /** CHAT-US-02: 세션에 적용된 플레이 이름. 서버가 항상 준다. */
  play_name: string;
};

export type ConversationStory = {
  id: number;
  title: string;
  subtitle: string;
  world_description: string;
  effective_rating: string | null;
  characters: (ConversationCharacter & { description: string })[];
  intros: ConversationIntro[];
  profiles: ConversationProfile[];
  existing_session_id: number | null;
  tags: string[];
};

// CHAT-US-02 메시지 전송·응답 (KAN-17). 아래 타입은 서버 계약 초안에 맞춘 추가분이다.

/** 메시지 한 부분의 발화자 종류. user = 세션에 적용된 플레이 프로필 */
export type ChatSpeakerKind = ConversationMessage['speaker_kind'];

/** 전송할 메시지 부분. character_id는 세션 캐릭터 id(`ConversationSession.characters[].id`)다. */
export type ChatMessagePartInput = {
  speaker_kind: ChatSpeakerKind;
  character_id: number | null;
  body: string;
};

/** 저장된 메시지 부분. speaker_name: user → 적용 플레이 이름, character → 현재 이름, narrator → null */
export type ChatMessagePart = ChatMessagePartInput & { speaker_name: string | null };

export type ChatMessage = {
  id: number;
  role: 'user' | 'assistant';
  parts: ChatMessagePart[];
  created_at: string;
};

/** pending·streaming = 진행 중. 나머지는 끝난 상태다. */
export type ChatGenerationStatus = 'pending' | 'streaming' | 'completed' | 'failed' | 'failed_partial' | 'save_failed';

export type ChatGeneration = {
  id: number;
  session_id: number;
  status: ChatGenerationStatus;
  user_message_id: number;
  assistant_message: ChatMessage | null;
  /** 요청한 offset부터 현재까지 모인 원문 */
  text: string;
  /** 지금까지 모인 원문 전체 길이(코드 포인트). 다음 조회의 offset */
  next_offset: number;
  error_code: string | null;
  retryable: boolean;
};

export type ChatTurns = {
  /** 저장된 이력만(유저 메시지 + 완료된 AI 응답). 인트로는 포함하지 않는다. */
  messages: ChatMessage[];
  active_generation: ChatGeneration | null;
  last_failed_generation: ChatGeneration | null;
  /** 이 세션의 응답 모델. 서버가 항상 문자열로 준다. */
  model: string;
};

export type SendChatMessageInput = { request_id: string; parts: ChatMessagePartInput[] };

// CHAT-US-03 내 대화 목록·재접속 이어하기 (KAN-24). 아래 타입은 추가분이다.

/** 내 대화 목록 한 줄. 미리보기는 저장된(완료) 메시지에서만 만든다. */
export type ConversationSessionSummary = {
  id: number;
  story_id: number;
  story_title: string;
  read_only: boolean;
  /** 세션에 고정된 모델 표시 이름 */
  model: string;
  /** 세션에 적용된 플레이 이름 */
  play_name: string;
  /** 응답을 만드는 중인 생성이 있다 */
  generating: boolean;
  last_message_preview: string | null;
  last_activity_at: string | null;
};

export type ConversationSessionPage = {
  sessions: ConversationSessionSummary[];
  /** 다음 페이지 커서(이 ID보다 작은 세션). 없으면 null */
  next_before_id: number | null;
};

/** 기존 request_id로 찾은 생성. 같은 세션의 request_id는 하나뿐이라 0개 또는 1개다. */
export type ChatGenerationLookup = { generations: ChatGeneration[] };
