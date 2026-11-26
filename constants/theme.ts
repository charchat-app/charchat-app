/**
 * 디자인 토큰. 색상·간격·글자 크기는 여기서만 정의하고 컴포넌트에 값을 직접 쓰지 않는다.
 * CREATE-US-12: 앱 공통 다크 전용 테마. 색상 값은 목업(kickoff/exports/mobile-creation-mockup-v15.html)의
 * 최종 덮어쓰기(style#variation-colors "Palette 06: 브라이트 블루", style#readable-text)와 v8 기본값에서 가져왔다.
 * 기기의 밝은/어두운 설정과 관계없이 같은 값을 쓴다(웹 서버 렌더링과 하이드레이션도 같은 값).
 */

import { Platform } from 'react-native';

const dark = {
  text: '#e8eef7', // --ink
  textSecondary: '#c1cbdc', // readable-text --muted
  placeholderText: '#b2bfd1', // input::placeholder
  background: '#11161d', // --paper, .top
  backgroundElement: '#1e2733', // .section (구역 카드)
  backgroundSelected: '#214a80', // 선택된 컨트롤 채움 (= actionFill)
  border: '#3b4556', // .section 테두리
  divider: '#2a3140', // .tabs 아래 구분선
  accent: '#3685ff', // --green(파랑) · .primary 채움
  accentText: '#8bbaff', // 선택된 글자(.nav active·.speaker-option.selected)
  onAccent: '#060b13', // .primary 위 글자
  danger: '#eda3aa', // .danger
  surface: '#28313d', // .item, .state-card
  surfaceBorder: '#49515f',
  inputSurface: '#151d29', // input·textarea·select
  inputBorder: '#465263',
  chipSurface: '#242d3e', // .chips button
  chipBorder: '#485977',
  chipText: '#bdcde6',
  actionFill: '#214a80', // --action-fill: 선택된 탭·칩, 하단 저장 버튼
  actionBorder: '#4c85cb', // --action-border
  actionText: '#edf3fb', // --action-text
  selectedText: '#e0edff', // .tabs button.active 글자
  tabText: '#bfcbdd', // .tabs button:not(.active)
  secondarySurface: '#151d29', // .secondary
  secondaryBorder: '#4c85cb',
  secondaryText: '#c7ddf8',
  dangerSurface: '#33252e', // .secondary.danger
  dangerBorder: '#6d424c',
  dangerText: '#efadb4',
  footer: '#1e2733', // .bottom (하단 고정 줄)
  footerBorder: '#414b5b',
  eyebrow: '#8b9cb8', // .head .eyebrow
  headerIcon: '#bac5d6', // .head .icon
  badgeBackground: '#214a80', // .badge
  badgeBorder: '#4c85cb',
  badgeText: '#cfdef5',
  noticeBackground: '#151d29', // 안내 배너 (목업 다크에는 .notice가 없어 입력면 색을 쓴다)
  noticeBorder: '#3b4556',
  noticeText: '#c1cbdc',
  alertBackground: '#33252d', // .alert
  alertBorder: '#63404a',
  alertText: '#efb5bd',
  placeholderBackground: '#214a80', // .upload (사진 빈 슬롯)
  placeholderBorder: '#4c85cb',
  avatarBackground: '#214a80', // .avatar.placeholder
  avatarText: '#cfdef5',
  userToken: '#c5a5ef', // .user-token ({{user}} 구분색)
  userTokenBackground: '#352c49',
};

/** 다크 전용. 밝은 팔레트는 두지 않는다. */
export const Colors = { dark } as const;

export type ThemeColor = keyof typeof Colors.dark;

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
  control: 10, // 다크 목업 입력창·버튼
  item: 12, // .item
  state: 14, // .state-card
  section: 15, // .section
  footerAction: 11, // .bottom:not(.nav) .primary
  lg: 20,
} as const;

/**
 * CREATE-US-12 제작 편집 셸 치수 (목업 v15 최종 CSS, 393x852 기준).
 * - head: .unified-theme .head (padding 12px 16px 4px, min-height 60px), 뒤로 가기 .icon 44x44 원형
 * - sub: .unified-theme .sub (11px, 아래 13px) → 탭 알약 위쪽이 y90
 * - tab: .unified-theme .tabs button (min-height 36px, radius 8px, 아래 12px 뒤 구분선)
 * - footer: .bottom:not(.nav) (padding 10px 16px, gap 14px), .saved 왼쪽 상태, .primary 높이 46(45 + 테두리)
 * - footerRatio: 393 폭에서 상태 ≈87 : 저장 버튼 ≈260 (목업 실측 ≈255). 좁은 폭에서도 같은 비율로 줄어든다.
 */
export const CreationShell = {
  headPaddingTop: 12,
  headPaddingBottom: 4,
  headMinHeight: 60,
  iconSize: 44,
  headGap: 7,
  subFontSize: 11,
  subLineHeight: 17,
  subGap: 13,
  tabHeight: 36,
  tabGap: 5,
  tabRowBottom: 12,
  footerPaddingVertical: 10,
  footerGap: 14,
  footerActionGap: 8,
  footerActionHeight: 46,
  footerStatusFlex: 1,
  footerActionsFlex: 3,
} as const;

/**
 * CREATE-US-12 제작 화면 본문 여백 (목업 .unified-theme .content: 20px 16px 28px).
 * 카드는 화면 가장자리에서 16px 안쪽에 둔다.
 */
export const ContentInset = { top: 20, horizontal: 16, bottom: 28 } as const;

/** 최소 터치 영역 (목업 기준 44px) */
export const MinTouchSize = 44;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
