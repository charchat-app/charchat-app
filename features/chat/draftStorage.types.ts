export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface NativeDraftStorage {
  readonly kind: 'native';
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  /** BASE-03 로그아웃 정리용: 저장된 모든 키 */
  getAllKeys?(): Promise<readonly string[]>;
  /** BASE-03 로그아웃 정리용: 여러 키를 한 번에 지운다 */
  multiRemove?(keys: readonly string[]): Promise<void>;
}

export type ChatDraftStorage = DraftStorage | NativeDraftStorage;
