import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type PhotoSlotProps = {
  /** 사진 주소. 없으면 빈 슬롯(추가 버튼)으로 보인다. */
  uri?: string | null;
  /** 1:1 (캐릭터·프로필) 또는 3:4 (스토리 표지). 목업 기준. */
  ratio?: '1:1' | '3:4';
  /** 기본 너비 (목업 78px) */
  width?: number;
  /** 빈 슬롯 누르면 업로드, 사진 누르면 교체·삭제 같은 동작을 연결한다 */
  onPress?: () => void;
  accessibilityLabel?: string;
};

/**
 * 사진 한 장을 보여주는 칸. 업로드·정렬 로직은 shared/media에 두고 여기서는 모양만 담당한다.
 * 목업: 빈 슬롯은 점선 테두리, 둥근 모서리 10px, 사진은 잘라서 채운다(cover).
 */
export function PhotoSlot({ uri, ratio = '1:1', width = 78, onPress, accessibilityLabel }: PhotoSlotProps) {
  const c = useTheme();
  const height = ratio === '3:4' ? (width * 4) / 3 : width;
  const label = accessibilityLabel ?? (uri ? '사진' : '사진 추가');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.slot,
        { width, height, backgroundColor: c.placeholderBackground, borderColor: c.placeholderBorder },
        uri && styles.filled,
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.image} accessibilityIgnoresInvertColors />
      ) : (
        <View style={styles.empty}>
          <Text variant="caption" color="textSecondary">
            +
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    overflow: 'hidden',
    flexShrink: 0,
  },
  filled: { borderStyle: 'solid', borderWidth: 0 },
  image: { width: '100%', height: '100%', borderRadius: Radius.sm + 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
