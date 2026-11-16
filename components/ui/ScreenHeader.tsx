import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { MinTouchSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ScreenHeaderProps = {
  /** 위쪽 작은 라벨 (목업 eyebrow: "CHAR / CHAT") */
  eyebrow?: string;
  title: string;
  /** 있으면 왼쪽에 뒤로가기 버튼을 둔다 */
  onBack?: () => void;
  backLabel?: string;
  /** 오른쪽 끝 액션 (예: 저장) */
  right?: React.ReactNode;
};

/** 목업 .top 헤더: 고정, 아래 구분선, 뒤로가기 + 라벨 + 제목 */
export function ScreenHeader({ eyebrow, title, onBack, backLabel = '뒤로', right }: ScreenHeaderProps) {
  const c = useTheme();

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: c.background, borderBottomColor: c.border }]}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            onPress={onBack}
            hitSlop={8}
            style={styles.back}
          >
            <Text variant="body" color="accent" style={styles.backText}>
              ‹
            </Text>
          </Pressable>
        ) : null}
        <View style={styles.titleWrap}>
          {eyebrow ? <Text variant="eyebrow">{eyebrow}</Text> : null}
          <Text variant="title" numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { borderBottomWidth: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.three - 2,
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  back: {
    minWidth: MinTouchSize,
    minHeight: MinTouchSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { fontSize: 28, lineHeight: 30 },
  titleWrap: { flex: 1, minWidth: 0, gap: 2 },
  right: { flexShrink: 0 },
});
