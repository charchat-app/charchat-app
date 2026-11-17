/**
 * 디자인 토큰. 색상·간격·글자 크기는 여기서만 정의하고 컴포넌트에 값을 직접 쓰지 않는다.
 * 색상 값은 목업(kickoff/exports/mobile-creation-mockup-v15.html)의 CSS 변수에서 가져왔다.
 * 다크 모드 색상은 목업에 없으므로 아직 라이트 색상을 임시로 쓴다. 확정 시 교체한다.
 */

import { Platform } from 'react-native';

const light = {
  text: '#252d2a', // 목업 --ink
  textSecondary: '#717a74', // 목업 --muted
  background: '#f5f3ef', // 목업 --paper
  backgroundElement: '#e9eee8', // 목업 --soft
  backgroundSelected: '#dedfd8', // 목업 --line
  border: '#dedfd8', // 목업 --line
  accent: '#245a46', // 목업 --green (기본 버튼·선택 상태)
  danger: '#b5473d', // 목업 --red
  surface: '#fcfbf7', // 항목 카드 배경
  inputSurface: '#fffefa', // 입력창 배경
  inputBorder: '#d4d8ce', // 입력창 테두리
  chipBorder: '#ccd3c8', // 칩·보조 버튼 테두리
  badgeBackground: '#e8ece3', // 상태 배지
  badgeText: '#47604b',
  noticeBackground: '#e8e8de', // 안내 배너
  noticeText: '#5c655e',
  alertBackground: '#fae8e1', // 오류 안내
  alertText: '#9a4236',
  placeholderBackground: '#e9ece4', // 사진 빈 슬롯
  placeholderBorder: '#b3beb0',
  avatarBackground: '#dce4d8',
  avatarText: '#49604d',
  userToken: '#8b5cf6', // 제작 원문의 {{user}} 구분색
  onAccent: '#ffffff', // 초록 버튼 위 글자
};

export const Colors = {
  light,
  // TODO: 다크 모드 색상은 아직 정하지 않았다. 확정 전까지 라이트 값을 그대로 쓴다.
  dark: light,
} as const;

export type ThemeColor = keyof typeof Colors.light;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 20,
  five: 24,
  six: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 9,
  lg: 20,
} as const;

/** 최소 터치 영역 (목업 기준 44px) */
export const MinTouchSize = 44;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
