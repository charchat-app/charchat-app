import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';

import { Spacing } from '@/constants/theme';

/**
 * 웹 전용 끌기 손잡이 스타일. 브라우저가 터치 끌기를 스크롤로 가로채거나
 * 길게 누를 때 글자 선택이 생기지 않게 한다. 손잡이 View에만 붙이고 카드·사진 본문에는 붙이지 않는다.
 * (ReorderList의 webHandle과 같은 타입)
 */
export const webDragHandle: ViewStyle & { touchAction?: 'none'; userSelect?: 'none' } =
  Platform.OS === 'web' ? { touchAction: 'none', userSelect: 'none' } : {};

/** 점 한 개 지름 */
const DOT_SIZE = 4;
/** 2열 × 3행 */
const ROWS = [0, 1, 2];
const COLS = [0, 1];

/**
 * 끌기 손잡이 모양(점 6개, 2열 × 3행). 새 의존성 없이 View로 그린다.
 * 장식용이라 화면 읽기 기능에서는 숨긴다. 뜻(순서 손잡이)은 감싸는 손잡이 View의 접근성 이름이 전한다.
 */
export function DragGripDots({ color, testID }: { color: string; testID?: string }) {
  return (
    <View
      testID={testID}
      style={styles.grid}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {ROWS.map((row) => (
        <View key={row} style={styles.row}>
          {COLS.map((col) => (
            <View key={col} style={[styles.dot, { backgroundColor: color }]} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: Spacing.half },
  row: { flexDirection: 'row', gap: Spacing.half },
  dot: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2 },
});
