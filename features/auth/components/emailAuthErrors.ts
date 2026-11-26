// BASE-03 이메일 회원가입·로그인 오류 문구. 입력 칸 아래(email/password)와 화면 안내(form)로 나눈다.
import { ApiError } from '@/lib/api-client';

export type EmailAuthErrors = { email?: string; password?: string; form?: string };

export const INVALID_CREDENTIALS_MESSAGE = '이메일 또는 비밀번호가 맞지 않아요.';
export const EMAIL_TAKEN_MESSAGE = '이미 가입한 이메일이에요. 로그인해 주세요.';
export const EMAIL_INVALID_MESSAGE = '이메일 형식을 확인해 주세요.';
export const PASSWORD_MISMATCH_MESSAGE = '비밀번호가 서로 달라요. 다시 확인해 주세요.';
/** 임시 비밀번호 규칙(서버 PASSWORD_INVALID가 정본). 72바이트 제한은 서버가 detail로 알려 준다. */
export const PASSWORD_RULE_HINT = '8~64자, 영문과 숫자를 함께 넣어 주세요.';

const FALLBACK = '처리하지 못했습니다. 다시 시도해 주세요.';

export function emailAuthErrors(error: unknown): EmailAuthErrors {
  if (!(error instanceof ApiError)) return error ? { form: FALLBACK } : {};
  switch (error.code) {
    case 'AUTH_INVALID_CREDENTIALS':
      return { form: INVALID_CREDENTIALS_MESSAGE };
    case 'EMAIL_ALREADY_REGISTERED':
      return { form: EMAIL_TAKEN_MESSAGE };
    case 'EMAIL_INVALID':
      return { email: EMAIL_INVALID_MESSAGE };
    case 'PASSWORD_INVALID':
      // 어떤 규칙이 틀렸는지 서버가 한국어 detail로 알려 준다. 그대로 입력 아래에 보인다.
      return { password: error.detail || PASSWORD_RULE_HINT };
    case 'VALIDATION_ERROR':
      return { form: '입력한 내용을 확인해 주세요.' };
    default:
      // 네트워크 오류(NETWORK_ERROR) 등은 기존 화면처럼 서버·클라이언트 안내 문구를 그대로 쓴다.
      return { form: error.detail || FALLBACK };
  }
}
