import { Image, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useTheme } from '@/hooks/use-theme';

export type AvatarProps = {
  /** 사진 주소. 없으면 이름의 첫 글자를 보여준다. */
  uri?: string | null;
  name: string;
  size?: number;
};

/** 목업 .avatar: 원형 사진, 없으면 이니셜 */
export function Avatar({ uri, name, size = 34 }: AvatarProps) {
  const c = useTheme();
  const shape = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return <Image source={{ uri }} accessibilityLabel={name} style={[styles.image, shape]} />;
  }

  return (
    <View accessibilityLabel={name} style={[styles.placeholder, shape, { backgroundColor: c.avatarBackground }]}>
      <Text variant="caption" style={{ color: c.avatarText, fontWeight: '600' }}>
        {name.slice(0, 1) || '?'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { flexShrink: 0 },
  placeholder: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
