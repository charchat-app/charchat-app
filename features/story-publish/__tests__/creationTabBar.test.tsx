// CREATE-US-12 제작 편집 화면에서는 하단 전역 내비게이션(홈/제작/대화)을 숨긴다. 목록·홈·대화는 그대로 보인다.
// expo-router Tabs는 가짜로 바꿔 각 화면 옵션만 읽는다. 실제 숨김·제스처는 Expo 실행 화면에서 확인한다.
import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';

import TabsLayout from '@/app/(tabs)/_layout';
import { isCreationEditorPath } from '@/features/story-publish';

type ScreenOptions = {
  tabBarStyle?: unknown;
  sceneStyle?: unknown;
  tabBarIcon?: (props: { color: string; focused: boolean; size: number }) => ReactNode;
};

let mockPathname = '/create';
let mockScreenOptions: ScreenOptions = {};
const mockScreens: Record<string, ScreenOptions | undefined> = {};

jest.mock('expo-router', () => {
  const Tabs = ({ children, screenOptions }: { children: ReactNode; screenOptions: ScreenOptions }) => {
    mockScreenOptions = screenOptions;
    return children;
  };
  Tabs.Screen = ({ name, options }: { name: string; options?: ScreenOptions }) => {
    mockScreens[name] = options;
    return null;
  };
  return { Tabs, usePathname: () => mockPathname };
});

function display(options: ScreenOptions | undefined): ViewStyle['display'] {
  return (StyleSheet.flatten(options?.tabBarStyle as ViewStyle) ?? {}).display;
}

function flat(style: unknown): ViewStyle {
  return StyleSheet.flatten(style as ViewStyle) ?? {};
}

const WEB_FRAME = { width: '100%', maxWidth: 480, alignSelf: 'center' };

type TabsElement = {
  props: { screenOptions: ScreenOptions; children: { props: { name: string; options?: ScreenOptions } }[] };
};

/** 웹 폭은 레이아웃 모듈을 읽을 때 Platform.OS로 정해지므로, OS를 바꾼 뒤 모듈을 새로 읽어 옵션만 꺼낸다. */
function layoutOptions(os: 'ios' | 'web', pathname: string) {
  mockPathname = pathname;
  let element!: TabsElement;
  jest.isolateModules(() => {
    Object.defineProperty(require('react-native').Platform, 'OS', { value: os, configurable: true });
    const Layout = require('@/app/(tabs)/_layout').default as () => TabsElement;
    element = Layout();
  });
  const screens: Record<string, ScreenOptions | undefined> = {};
  for (const child of element.props.children) screens[child.props.name] = child.props.options;
  return { screenOptions: element.props.screenOptions, screens };
}

async function renderAt(pathname: string) {
  mockPathname = pathname;
  await render(<TabsLayout />);
}

describe('CREATE-US-12: 제작 편집 화면 하단 내비게이션', () => {
  it.each(['/create/7', '/create/7/', '/create/scene/7', '/create/scene/new-1'])(
    'CREATE-US-12: 편집 화면 %s에서는 하단 탭을 숨긴다',
    async (pathname) => {
      await renderAt(pathname);
      expect(display(mockScreens.create)).toBe('none');
    },
  );

  it.each(['/create', '/create/'])('CREATE-US-12: 목록 %s에서는 하단 탭을 보인다', async (pathname) => {
    await renderAt(pathname);
    expect(display(mockScreens.create)).not.toBe('none');
  });

  it.each(['/', '/chat', '/chat/room-1', '/creator/7'])(
    'CREATE-US-12: 홈·대화 등 %s의 하단 탭 옵션은 바뀌지 않는다',
    async (pathname) => {
      await renderAt(pathname);
      expect(display(mockScreenOptions)).not.toBe('none');
      expect(mockScreens.index?.tabBarStyle).toBeUndefined();
      expect(mockScreens.chat?.tabBarStyle).toBeUndefined();
      expect(display(mockScreens.create)).not.toBe('none');
    },
  );

  it('CREATE-US-12: 하단 탭은 목업 v15 아이콘(홈·제작 둥근 사각 +·대화)을 그린다', async () => {
    await renderAt('/create');
    const icon = (name: string) => {
      const render = mockScreens[name]?.tabBarIcon;
      expect(render).toBeDefined();
      return render!({ color: '#fff', focused: name === 'create', size: 24 });
    };
    const create = await render(<>{icon('create')}</>);
    expect(create.getByTestId('tab-create-icon')).toBeTruthy();
    await create.unmount();
    expect(icon('index')).toBeTruthy();
    expect(icon('chat')).toBeTruthy();
  });

  it.each(['/create', '/create/7'])(
    'CREATE-US-12: 네이티브(%s)에서는 공통·제작 탭 옵션에 웹 모바일 폭을 적용하지 않는다',
    (pathname) => {
      const { screenOptions, screens } = layoutOptions('ios', pathname);
      for (const options of [screenOptions, screens.create]) {
        expect(flat(options?.sceneStyle).maxWidth).toBeUndefined();
        expect(flat(options?.tabBarStyle).maxWidth).toBeUndefined();
      }
      expect(display(screens.create)).toBe(pathname === '/create/7' ? 'none' : undefined);
    },
  );

  it.each(['/', '/chat', '/create'])(
    'CREATE-US-12: 웹(%s)에서는 홈·대화도 제작 탭과 같은 480px 가운데 폭으로 화면과 하단 탭을 그린다',
    (pathname) => {
      const { screenOptions, screens } = layoutOptions('web', pathname);
      expect(flat(screenOptions.sceneStyle)).toMatchObject(WEB_FRAME);
      expect(flat(screenOptions.tabBarStyle)).toMatchObject(WEB_FRAME);
      expect(display(screenOptions)).not.toBe('none');
      // 홈·대화는 공통 옵션을 그대로 쓴다(개별 덮어쓰기 없음).
      for (const name of ['index', 'chat']) {
        expect(screens[name]?.sceneStyle).toBeUndefined();
        expect(screens[name]?.tabBarStyle).toBeUndefined();
      }
      expect(flat(screens.create?.sceneStyle)).toMatchObject(WEB_FRAME);
      expect(flat(screens.create?.tabBarStyle)).toMatchObject(WEB_FRAME);
      expect(display(screens.create)).not.toBe('none');
    },
  );

  it('CREATE-US-12: 웹 편집 화면에서도 제작 탭은 480px 폭을 유지하며 하단 탭을 숨긴다', () => {
    const { screens } = layoutOptions('web', '/create/scene/7');
    expect(flat(screens.create?.sceneStyle)).toMatchObject(WEB_FRAME);
    expect(display(screens.create)).toBe('none');
  });

  it('CREATE-US-12: 경로 판별은 제작 탭 아래 중첩 화면만 편집 화면으로 본다', () => {
    expect(isCreationEditorPath('/create/7')).toBe(true);
    expect(isCreationEditorPath('/create/scene/7')).toBe(true);
    expect(isCreationEditorPath('/create')).toBe(false);
    expect(isCreationEditorPath('/')).toBe(false);
    expect(isCreationEditorPath('/chat/create')).toBe(false);
    expect(isCreationEditorPath('/creator/7')).toBe(false);
  });
});
