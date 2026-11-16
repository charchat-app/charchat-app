import { StyleSheet, View, type ViewProps } from 'react-native';

import { Text } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SectionProps = ViewProps & {
  title: string;
  /** 제목 아래 보조 설명 */
  description?: string;
  /** 첫 번째 섹션이면 위쪽 여백을 없앤다 (목업 .section:first-child) */
  first?: boolean;
};

/** 목업 .section: 세로 여백과 아래 구분선. 제목은 heading 글자 체계를 따른다. */
export function Section({ title, description, first = false, children, style, ...rest }: SectionProps) {
  const c = useTheme();

  return (
    <View style={[styles.section, { borderBottomColor: c.border }, first && styles.first, style]} {...rest}>
      <Text variant="heading" accessibilityRole="header">
        {title}
      </Text>
      {description ? (
        <Text variant="caption" style={styles.description}>
          {description}
        </Text>
      ) : null}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingVertical: 23,
    borderBottomWidth: 1,
  },
  first: { paddingTop: 0 },
  description: { marginTop: Spacing.half, marginBottom: Spacing.two },
  content: { gap: Spacing.two },
});
