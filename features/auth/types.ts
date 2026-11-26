// BASE-03 로그인·내 계정 API 타입 (서버 계약: POST /auth/tokens, GET·PATCH /me, GET /auth/providers)

export type AuthProviderName = 'kakao' | 'google' | 'apple' | 'dev';
export type ClientPlatform = 'ios' | 'android' | 'web';

/** redirect: 시스템 브라우저 인가, native: 기기 로그인(iOS 애플), direct: 개발용 직접 발급(dev 제공자) */
export type AuthProvider = { provider: AuthProviderName; flows: ('redirect' | 'native' | 'direct')[] };
export type AuthProvidersResponse = { providers: AuthProvider[] };

/** 동의 항목별 동의한 버전. 동의하지 않았으면 null */
export type ConsentState = { terms: string | null; privacy: string | null; age_14_plus: string | null };
/** 서버가 요구하는 필수 동의 버전. age_14_plus는 '만 14세 이상' 자기 체크('self-v1') */
export type RequiredConsents = { terms: string; privacy: string; age_14_plus: string };

export type AccountStatus = 'pending' | 'active' | 'deleted';

export type MeResponse = {
  user_id: number;
  status: AccountStatus;
  providers: AuthProviderName[];
  default_play_name: string | null;
  consents: ConsentState;
  required_consents: RequiredConsents;
  onboarding_required: boolean;
};

export type MePatch = {
  default_play_name?: string;
  consents?: Partial<RequiredConsents>;
};

export type TokenResponse = {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  user: MeResponse;
  is_new_user: boolean;
};

export type DevTokenRequest = { grant_type: 'dev'; dev_user_key: string; client_platform: ClientPlatform };
