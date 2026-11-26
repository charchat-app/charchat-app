// 목업 v15 svg 선 아이콘을 그대로 옮긴 장식용 아이콘. 새 의존성 없이 expo-image로 인라인 SVG를 그린다.
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { View, type StyleProp, type ImageStyle } from 'react-native';

/** 목업 v15 svg 모양 (viewBox 0 0 24 24) */
const SHAPES = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/>',
  create: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>',
  back: '<path d="m14 6-6 6 6 6"/>',
  home: '<path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-7h6v7"/>',
  chat: '<path d="M4 4h16v12H9l-5 4z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  // 목업 .send-example의 ↑ 글자를 같은 선 아이콘으로 옮겼다.
  send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
} as const;

export type CreationIconName = keyof typeof SHAPES;

export type CreationIconProps = {
  name: CreationIconName;
  size: number;
  /** 선 색. 호출하는 쪽이 테마 토큰 값을 넘긴다 */
  color: string;
  testID?: string;
  style?: StyleProp<ImageStyle>;
};

function svgUri(name: CreationIconName, color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" ` +
    `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${SHAPES[name]}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * 장식용 아이콘. 의미는 감싸는 버튼의 접근성 이름이 전달하므로 스크린 리더에서 숨긴다.
 * testID는 호스트 View에 둔다 (expo-image 구현·목에 따라 Image의 testID가 전달되지 않을 수 있음).
 */
export function CreationIcon({ name, size, color, testID, style }: CreationIconProps) {
  const source = useMemo(() => ({ uri: svgUri(name, color) }), [name, color]);
  return (
    <View
      testID={testID}
      style={{ width: size, height: size }}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image source={source} contentFit="contain" style={[{ width: size, height: size }, style]} />
    </View>
  );
}
