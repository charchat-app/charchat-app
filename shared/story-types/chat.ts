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
  tags?: string[];
};

// CHAT-US-03 내 대화 목록 조회 투영
export type ConversationSessionListItem = Pick<ConversationSession, 'id' | 'story_title' | 'read_only'> & {
  story_id: number;
};

export type ConversationSessionPage = {
  sessions: ConversationSessionListItem[];
  next_before_id: number | null;
};
