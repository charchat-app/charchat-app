import { View, type ViewProps } from 'react-native';

import { type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SurfaceProps = ViewProps & {
  /** 배경 톤. 기본은 화면 배경(paper) */
  tone?: 'background' | 'element' | 'selected';
};

const TONE_COLOR: Record<NonNullable<SurfaceProps['tone']>, ThemeColor> = {
  background: 'background',
  element: 'backgroundElement',
  selected: 'backgroundSelected',
};

export function Surface({ style, tone = 'background', ...rest }: SurfaceProps) {
  const theme = useTheme();

  return <View style={[{ backgroundColor: theme[TONE_COLOR[tone]] }, style]} {...rest} />;
}
