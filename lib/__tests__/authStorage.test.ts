// BASE-03 토큰 저장소 어댑터: 네이티브 SecureStore, 웹 sessionStorage
import * as SecureStore from 'expo-secure-store';

import * as nativeStorage from '@/lib/authStorage';
import * as webStorage from '@/lib/authStorage.web';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 5,
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const secure = jest.mocked(SecureStore);
const value = { refreshToken: 'ccr_abc', userId: '7' };

describe('BASE-03 네이티브 토큰 저장소 (SecureStore)', () => {
  const entries = new Map<string, string>();

  beforeEach(() => {
    secure.getItemAsync.mockImplementation(async (key) => entries.get(key) ?? null);
    secure.setItemAsync.mockImplementation(async (key, stored) => void entries.set(key, stored));
    secure.deleteItemAsync.mockImplementation(async (key) => void entries.delete(key));
  });

  afterEach(() => {
    entries.clear();
    jest.resetAllMocks();
  });

  it('BASE-03 리프레시 토큰과 계정 번호만 이 기기 전용 Keychain 항목에 저장·복원·삭제한다', async () => {
    await nativeStorage.saveStoredAuth(value);
    expect(secure.setItemAsync).toHaveBeenCalledWith('charchat.auth.v1', JSON.stringify(value), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    expect(JSON.parse(entries.get('charchat.auth.v1')!)).toEqual(value);
    expect(entries.get('charchat.auth.v1')).not.toContain('cca_');
    await expect(nativeStorage.loadStoredAuth()).resolves.toEqual(value);
    await nativeStorage.clearStoredAuth();
    expect(entries.size).toBe(0);
    await expect(nativeStorage.loadStoredAuth()).resolves.toBeNull();
  });

  it('BASE-03 저장소 오류·잘못된 형식이면 저장값 없음으로 본다', async () => {
    entries.set('charchat.auth.v1', '{"refreshToken":1}');
    await expect(nativeStorage.loadStoredAuth()).resolves.toBeNull();
    secure.getItemAsync.mockRejectedValue(new Error('locked'));
    await expect(nativeStorage.loadStoredAuth()).resolves.toBeNull();
    secure.setItemAsync.mockRejectedValue(new Error('locked'));
    await expect(nativeStorage.saveStoredAuth(value)).resolves.toBeUndefined();
  });
});

describe('BASE-03 웹 토큰 저장소 (sessionStorage)', () => {
  function fakeStorage() {
    const entries = new Map<string, string>();
    return {
      entries,
      storage: {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, stored: string) => void entries.set(key, stored),
        removeItem: (key: string) => void entries.delete(key),
      },
    };
  }

  afterEach(() => jest.restoreAllMocks());

  it('BASE-03 리프레시 토큰을 sessionStorage에 두고 localStorage는 쓰지 않는다', async () => {
    const session = fakeStorage();
    const local = fakeStorage();
    jest.replaceProperty(globalThis, 'window', {
      sessionStorage: session.storage,
      localStorage: local.storage,
    } as unknown as Window & typeof globalThis);
    await webStorage.saveStoredAuth(value);
    expect(JSON.parse(session.entries.get('charchat:auth:v1')!)).toEqual(value);
    expect(local.entries.size).toBe(0);
    await expect(webStorage.loadStoredAuth()).resolves.toEqual(value);
    await webStorage.clearStoredAuth();
    expect(session.entries.size).toBe(0);
  });

  it('BASE-03 서버 렌더링(window 없음)과 저장소 차단에서도 오류 없이 저장값 없음으로 본다', async () => {
    jest.replaceProperty(globalThis, 'window', undefined as unknown as Window & typeof globalThis);
    await expect(webStorage.loadStoredAuth()).resolves.toBeNull();
    await expect(webStorage.saveStoredAuth(value)).resolves.toBeUndefined();
    await expect(webStorage.clearStoredAuth()).resolves.toBeUndefined();

    const blocked = {};
    Object.defineProperty(blocked, 'sessionStorage', {
      get() {
        throw new Error('SecurityError');
      },
    });
    jest.replaceProperty(globalThis, 'window', blocked as Window & typeof globalThis);
    await expect(webStorage.loadStoredAuth()).resolves.toBeNull();
    await expect(webStorage.saveStoredAuth(value)).resolves.toBeUndefined();
  });
});
