import { StyleSheet, View, type ViewProps } from 'react-native';

import { Text } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SectionProps = ViewProps & {
  title: string;
  /** 제목 아래 보조 설명 */
  description?: string;
  /** 첫 번째 섹션이면 위쪽 여백을 없앤다 (목업 .section:first-child) */
  first?: boolean;
  /**
   * CREATE-US-12: 다크 목업의 구역 카드(.unified-theme .section: 채움·테두리·둥근 15px)로 그린다.
   * 넘기지 않으면 지금처럼 아래 구분선만 있는 구역이다(대화 화면 등 기존 배치 유지).
   */
  card?: boolean;
};

/** 목업 .section: 세로 여백과 아래 구분선. 제목은 heading 글자 체계를 따른다. */
export function Section({ title, description, first = false, card = false, children, style, ...rest }: SectionProps) {
  const c = useTheme();

  return (
    <View
      style={[
        card
          ? [styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]
          : [styles.section, { borderBottomColor: c.border }, first && styles.first],
        style,
      ]}
      {...rest}
    >
      <Text variant="heading" accessibilityRole="header" style={card && styles.cardTitle}>
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
  card: {
    borderWidth: 1,
    borderRadius: Radius.section,
    paddingVertical: 18,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.three,
  },
  // .unified-theme h2: 21px / 1.4, letter-spacing -0.6
  cardTitle: { fontSize: 21, lineHeight: 29, letterSpacing: -0.6 },
  description: { marginTop: Spacing.half, marginBottom: Spacing.two },
  content: { gap: Spacing.two },
});
