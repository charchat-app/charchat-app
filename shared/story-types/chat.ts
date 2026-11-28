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
  /**
   * CHAT-US-08 (KAN-22): AI 응답 하나에 적힌 장면 상태(```info 블록, 누적 아님).
   * 이용자 메시지·info 없는 응답은 null이다. 옛 서버는 주지 않는다.
   */
  info?: SceneInfo | null;
};

// CHAT-US-08 장면 상태(info·current_scene)와 이용자 수정 (KAN-22, KAN-40). 서버 messaging/schemas.py와 같은 모양이다.

/** 세션 날짜 방식. calendar: 연월일 / world: 연호+연월일 / elapsed: 기준 사건+일차 */
export type SceneDateMode = 'calendar' | 'world' | 'elapsed';

/** 날짜. mode에 해당하는 칸만 채워진다(나머지는 null). */
export type SceneDate = {
  mode: SceneDateMode;
  era: string | null;
  year: number | null;
  month: number | null;
  day: number | null;
  reference_event: string | null;
  elapsed_day: number | null;
};

/** 시각. 분을 모르면(`19시`) minute이 null이다. */
export type SceneTime = { hour: number; minute: number | null };

/** 캐릭터별 상태. name은 세션 캐릭터 이름이다. 모르는 항목은 null이다. */
export type SceneCharacter = { name: string; clothing: string | null; inner_thought: string | null };

/** 다음 요청의 [현재 장면]이 쓰는 누적 장면. characters는 세션 캐릭터 전원(세션 순서)이다. */
export type CurrentScene = {
  date: SceneDate | null;
  time: SceneTime | null;
  place: string | null;
  characters: SceneCharacter[];
};

/** AI 응답 하나의 info. text는 블록 원문, characters는 그 블록에서 읽은 캐릭터만이다. */
export type SceneInfo = CurrentScene & { text: string };

/**
 * 최신 AI 응답의 info 수정 요청. 빼거나 null인 칸은 지금 값을 그대로 둔다(값을 지우는 방법은 없다).
 * date는 그 방식의 날짜 전체를 보낸다. elapsed의 reference_event만 빼면 지금 기준 사건을 둔다.
 */
export type SceneInfoUpdateInput = {
  date?: Partial<SceneDate>;
  time?: SceneTime;
  place?: string;
  characters?: { name: string; clothing?: string; inner_thought?: string }[];
};

export type SceneInfoUpdateResult = { message_id: number; info: SceneInfo; current_scene: CurrentScene };

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
  /** CHAT-US-13: 이 생성이 요청한 모델 이름. 세션 모델을 나중에 바꿔도 그대로다. */
  model: string;
};

export type ChatTurns = {
  /** 저장된 이력만(유저 메시지 + 완료된 AI 응답). 인트로는 포함하지 않는다. */
  messages: ChatMessage[];
  active_generation: ChatGeneration | null;
  last_failed_generation: ChatGeneration | null;
  /** 이 세션의 응답 모델. 서버가 항상 문자열로 준다. */
  model: string;
  /** CHAT-US-13: 세션에 지금 선택된 모델 id. 다음 전송·재시도가 이 모델로 요청한다. */
  model_id: number;
  /**
   * CHAT-US-08 (KAN-22): 다음 요청에 쓰일 누적 현재 장면(세션 시작 값 + 완료 응답 info를 덮어쓴 결과).
   * 옛 서버는 주지 않는다. 그때 상태 카드는 보이지 않는다.
   */
  current_scene?: CurrentScene | null;
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

// CHAT-US-13 대화 중 모델 변경 (KAN-23). 아래 타입은 추가분이다.

/** 고를 수 있는 응답 모델. 공급자·공급자 모델 ID는 앱에 주지 않는다. */
export type ChatModel = { id: number; name: string };

export type ChatModelList = {
  /** id 오름차순 */
  models: ChatModel[];
  /** 서버 기본 모델 id. 정할 수 없으면 null */
  default_model_id: number | null;
};

/** 세션 모델 변경 결과. 진행 중이던 생성은 기존 모델로 끝까지 만든다(CHAT-US-13-AC02). */
export type SessionModelChange = {
  model_id: number;
  model: string;
  active_generation: { id: number; model: string } | null;
};
