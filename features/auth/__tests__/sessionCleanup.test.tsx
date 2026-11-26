// BASE-03 로그아웃 시 계정별 기기 보관분 정리 · 로그인 세션별 QueryClient
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';

import { useSessionQueryClient } from '@/features/auth';
import { clearChatDeviceData } from '@/features/chat';
import { isOwnerChatDeviceKey } from '@/features/chat/deviceDataCleanup';
import { draftKey } from '@/features/chat/hooks/chatCache';

jest.mock('@/lib/api-client', () => jest.requireActual('@/lib/api-client'));
jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 5 }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
}));

const OWNER_A = [
  'charchat:chat-draft:v1:1:47',
  'charchat:chat-send:v1:1:47',
  'charchat:chat-draft-clear:v1:charchat:chat-draft:v1:1:47',
  `charchat:chat-draft-data:v1:${JSON.stringify(['charchat:chat-draft:v1:1:47', 'abc'])}`,
];
const OTHERS = [
  'charchat:chat-draft:v1:2:47',
  'charchat:chat-send:v1:2:9',
  // 계정 번호가 1로 시작하는 다른 계정(12번)
  'charchat:chat-draft:v1:12:5',
  'charchat:chat-send:v1:12:5',
  'charchat:chat-draft-clear:v1:charchat:chat-draft:v1:12:5',
  `charchat:chat-draft-data:v1:${JSON.stringify(['charchat:chat-draft:v1:12:5', 'def'])}`,
  'unrelated:key',
];

describe('BASE-03 로그아웃 기기 보관분 정리', () => {
  it('BASE-03 로그아웃한 계정의 초안·전송 기록·웹 세대 키만 고르고 다른 계정(12번 포함)은 남긴다', () => {
    OWNER_A.forEach((key) => expect(isOwnerChatDeviceKey(key, '1')).toBe(true));
    OTHERS.forEach((key) => expect(isOwnerChatDeviceKey(key, '1')).toBe(false));
    expect(isOwnerChatDeviceKey('charchat:chat-draft:v1:1:47', 'not-a-number')).toBe(false);
  });

  it('BASE-03 네이티브(AsyncStorage): 직접 로그아웃하면 A의 키만 지우고 B의 키는 남긴다', async () => {
    const entries = new Map([...OWNER_A, ...OTHERS].map((key) => [key, 'v']));
    const storage = jest.mocked(AsyncStorage);
    storage.getAllKeys.mockImplementation(async () => [...entries.keys()]);
    storage.multiRemove.mockImplementation(async (keys) => void keys.forEach((key) => entries.delete(key)));
    await expect(clearChatDeviceData('1')).resolves.toBe(OWNER_A.length);
    expect([...entries.keys()].sort()).toEqual([...OTHERS].sort());
  });

  it('BASE-03 웹(localStorage): 직접 로그아웃하면 A의 키만 지우고 B의 키는 남긴다', async () => {
    const entries = new Map([...OWNER_A, ...OTHERS].map((key) => [key, 'v']));
    const local = {
      get length() {
        return entries.size;
      },
      key: (index: number) => [...entries.keys()][index] ?? null,
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, value),
      removeItem: (key: string) => void entries.delete(key),
    };
    let result = 0;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('@/features/chat/draftStorage', () => ({ getDraftStorage: () => local }));
      const cleanup =
        require('@/features/chat/deviceDataCleanup') as typeof import('@/features/chat/deviceDataCleanup');
      result = await cleanup.clearChatDeviceData('1');
    });
    expect(result).toBe(OWNER_A.length);
    expect([...entries.keys()].sort()).toEqual([...OTHERS].sort());
  });

  it('BASE-03 계정 번호가 없거나 저장소 오류여도 로그아웃을 막지 않는다', async () => {
    await expect(clearChatDeviceData(null)).resolves.toBe(0);
    jest.mocked(AsyncStorage).getAllKeys.mockRejectedValueOnce(new Error('io'));
    await expect(clearChatDeviceData('1')).resolves.toBe(0);
  });
});

describe('BASE-03 로그인 세션별 QueryClient', () => {
  it('BASE-03 계정이 바뀌면 새 QueryClient를 쓰고 이전 계정의 작성 중 입력 캐시를 버린다', async () => {
    const created: QueryClient[] = [];
    const create = () => {
      const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
      created.push(client);
      return client;
    };
    const view = await renderHook(
      ({ sessionKey }: { sessionKey: number }) => useSessionQueryClient(sessionKey, create),
      {
        initialProps: { sessionKey: 1 },
      },
    );
    const accountA = view.result.current;
    accountA.setQueryData(draftKey('47'), { text: 'A의 초안' });

    await view.rerender({ sessionKey: 1 });
    expect(view.result.current).toBe(accountA);

    await view.rerender({ sessionKey: 2 });
    const accountB = view.result.current;
    expect(accountB).not.toBe(accountA);
    expect(accountB.getQueryData(draftKey('47'))).toBeUndefined();
    // 버린 클라이언트도 비워 늦게 도착한 응답이 남지 않는다.
    expect(accountA.getQueryCache().getAll()).toHaveLength(0);
    await view.unmount();
    created.forEach((client) => client.clear());
  });
});
