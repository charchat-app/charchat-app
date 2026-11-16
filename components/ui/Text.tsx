import { StyleSheet, Text as NativeText, type TextProps } from 'react-native';

import { Fonts, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 목업의 글자 체계. 화면마다 fontSize를 직접 쓰지 않고 variant만 쓴다.
 * - title: 화면 제목 (목업 h1, 21px)
 * - heading: 섹션 큰 제목 (목업 h2, 24px)
 * - subheading: 카드·항목 제목 (목업 h3, 17px)
 * - body: 본문 (15px)
 * - caption: 보조 설명 (13px, 흐린 색)
 * - eyebrow: 상단 작은 라벨 (11px, 강조 색)
 * - error: 오류 문구 (13px, 위험 색)
 */
export type TextVariant = 'title' | 'heading' | 'subheading' | 'body' | 'caption' | 'eyebrow' | 'error';

export type TextProps_ = TextProps & {
  variant?: TextVariant;
  color?: ThemeColor;
};

const DEFAULT_COLOR: Record<TextVariant, ThemeColor> = {
  title: 'text',
  heading: 'text',
  subheading: 'text',
  body: 'text',
  caption: 'textSecondary',
  eyebrow: 'accent',
  error: 'danger',
};

export function Text({ style, variant = 'body', color, ...rest }: TextProps_) {
  const theme = useTheme();
  const resolved = color ?? DEFAULT_COLOR[variant];

  return <NativeText style={[styles[variant], { color: theme[resolved] }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  title: {
    fontFamily: Fonts.sans,
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  heading: {
    fontFamily: Fonts.sans,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  subheading: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  body: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  caption: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  eyebrow: {
    fontFamily: Fonts.serif,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 2,
  },
  error: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
});
