import { Tabs, usePathname } from 'expo-router';
import { Platform, StyleSheet, View, type ColorValue, type ViewStyle } from 'react-native';

import { CreationIcon } from '@/components/ui';
import { isCreationEditorPath } from '@/features/story-publish';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 웹에서 제작 탭을 모바일 폭으로 가운데 정렬한다. 네이티브에는 적용하지 않는다. */
const WEB_MOBILE_FRAME: ViewStyle | undefined =
  Platform.OS === 'web' ? { width: '100%', maxWidth: 480, alignSelf: 'center' } : undefined;

/** 하단 탭: 홈 / 제작 / 대화 (목업 하단 내비게이션과 같은 순서). 색은 다크 전용 테마(목업 .nav)를 따른다. */
export default function TabsLayout() {
  const colors = useTheme();
  const pathname = usePathname();
  const hideTabBar = isCreationEditorPath(pathname);
  // Expo Router는 tint를 ColorValue로 넘긴다. SVG stroke에는 문자열만 쓸 수 있어 테마 색으로 대체한다.
  const iconColor = (color: ColorValue): string => (typeof color === 'string' ? color : colors.tabText);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.tabText,
        tabBarStyle: { backgroundColor: colors.footer, borderTopColor: colors.footerBorder },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ color }) => <CreationIcon name="home" size={21} color={iconColor(color)} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: '제작',
          // 목업 v15 nav .center: 둥근 사각형 안의 + 아이콘, action 채움 배경
          tabBarIcon: ({ color }) => (
            <View testID="tab-create-icon" style={[styles.createIcon, { backgroundColor: colors.actionFill }]}>
              <CreationIcon name="create" size={22} color={iconColor(color)} />
            </View>
          ),
          sceneStyle: [{ backgroundColor: colors.background }, WEB_MOBILE_FRAME],
          tabBarStyle: [
            { backgroundColor: colors.footer, borderTopColor: colors.footerBorder },
            WEB_MOBILE_FRAME,
            hideTabBar ? { display: 'none' } : undefined,
          ],
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: '대화',
          tabBarIcon: ({ color }) => <CreationIcon name="chat" size={21} color={iconColor(color)} />,
        }}
      />
    </Tabs>
  );
}

/** 목업 v15 nav .center svg: 30px, radius 8 */
const CREATE_ICON_SIZE = 30;

const styles = StyleSheet.create({
  createIcon: {
    width: CREATE_ICON_SIZE,
    height: CREATE_ICON_SIZE,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
