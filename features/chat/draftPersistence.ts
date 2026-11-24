// CHAT-US-03 대화방 임시 저장 범위와 디바운스
import { positiveConversationId } from '@/features/chat/conversationIdentity';
import type { ChatDraftStorage, DraftStorage, NativeDraftStorage } from '@/features/chat/draftStorage.types';

const SAVE_DELAY_MS = 500;

type PendingDraft = {
  timer: ReturnType<typeof setTimeout>;
  generation: string | null;
  text: string;
  canPersist: () => boolean;
};
const pendingByStorage = new WeakMap<ChatDraftStorage, Map<string, PendingDraft>>();
const writesByStorage = new WeakMap<NativeDraftStorage, Map<string, Promise<void>>>();

function draftsFor(storage: ChatDraftStorage) {
  let drafts = pendingByStorage.get(storage);
  if (!drafts) {
    drafts = new Map();
    pendingByStorage.set(storage, drafts);
  }
  return drafts;
}

function enqueueNativeWrite(storage: NativeDraftStorage, key: string, run: () => Promise<void>) {
  let writes = writesByStorage.get(storage);
  if (!writes) {
    writes = new Map();
    writesByStorage.set(storage, writes);
  }
  const queue = writes;
  // 실행 중인 쓰기는 취소할 수 없으므로 같은 키의 삭제는 그 뒤에 실행한다.
  const queued = (queue.get(key) ?? Promise.resolve()).then(run);
  const settled = queued.catch(() => {});
  queue.set(key, settled);
  void settled.then(() => {
    if (queue.get(key) === settled) queue.delete(key);
  });
  return queued;
}

async function readNativeDraft(storage: NativeDraftStorage, key: string, canRestore: () => boolean) {
  // 재진입이 이미 요청된 삭제와 경합하면 삭제 결과가 반영된 뒤 읽는다.
  const write = writesByStorage.get(storage)?.get(key);
  if (write) await write;
  if (!canRestore()) return '';
  const pending = pendingByStorage.get(storage)?.get(key);
  return pending?.canPersist() ? pending.text : ((await storage.getItem(key)) ?? '');
}

function persistNativeDraft(
  storage: NativeDraftStorage,
  key: string,
  text: string,
  canPersist: () => boolean,
  onAvailability: (available: boolean) => void,
) {
  if (text === '') {
    // 승인된 범위에서 이미 요청한 삭제는 화면을 떠나도 끝까지 실행한다.
    void enqueueNativeWrite(storage, key, () => storage.removeItem(key)).then(
      () => onAvailability(true),
      () => onAvailability(false),
    );
    return;
  }

  const drafts = draftsFor(storage);
  const timer = setTimeout(() => {
    void enqueueNativeWrite(storage, key, async () => {
      // 디바운스가 끝나도 앞선 쓰기를 기다리는 동안에는 취소할 수 있다.
      if (drafts.get(key) !== pending) return;
      drafts.delete(key);
      if (!canPersist()) return;
      await storage.setItem(key, text);
      onAvailability(true);
    }).catch(() => onAvailability(false));
  }, SAVE_DELAY_MS);
  const pending = { timer, generation: null, text, canPersist };
  drafts.set(key, pending);
}

export function chatDraftKey(ownerId: string | null, sessionId: string) {
  return positiveConversationId(ownerId) && positiveConversationId(sessionId)
    ? `charchat:chat-draft:v1:${ownerId}:${sessionId}`
    : null;
}

const generationKey = (key: string) => `charchat:chat-draft-clear:v1:${key}`;
// 최초 삭제 전에는 기존 키의 원문을 그대로 읽고 쓴다. 삭제 뒤에는 세대마다 다른 키를 사용한다.
const payloadKey = (key: string, generation: string | null) =>
  generation === null ? key : `charchat:chat-draft-data:v1:${JSON.stringify([key, generation])}`;

function newGeneration() {
  // 동시 삭제가 같은 카운터 값을 재사용하지 않도록 탭 간 독립적인 값을 만든다.
  return Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), (part) =>
    part.toString(16).padStart(8, '0'),
  ).join('');
}

export function readDraft(storage: DraftStorage, key: string): string;
export function readDraft(storage: ChatDraftStorage, key: string, canRestore: () => boolean): string | Promise<string>;
export function readDraft(storage: ChatDraftStorage, key: string, canRestore = () => true) {
  if ('kind' in storage) return readNativeDraft(storage, key, canRestore);
  const marker = generationKey(key);
  const generation = storage.getItem(marker);
  const pending = pendingByStorage.get(storage)?.get(key);
  const text =
    pending?.generation === generation && pending.canPersist()
      ? pending.text
      : storage.getItem(payloadKey(key, generation));
  return storage.getItem(marker) === generation ? (text ?? '') : '';
}

export function cancelPendingDraft(storage: ChatDraftStorage, key: string) {
  const pending = pendingByStorage.get(storage);
  const draft = pending?.get(key);
  if (draft) {
    clearTimeout(draft.timer);
    pending?.delete(key);
  }
}

/**
 * 화면 밖에서 원문을 되돌릴 때처럼 기다리지 않고 바로 보관한다(예약된 보관은 취소).
 * 실제로 기록했으면 true. 계정이 바뀌었거나 저장소를 쓸 수 없으면 false.
 */
export async function writeDraftNow(
  storage: ChatDraftStorage,
  key: string,
  text: string,
  canPersist: () => boolean,
): Promise<boolean> {
  if (!canPersist()) return false;
  cancelPendingDraft(storage, key);
  if ('kind' in storage) {
    try {
      await enqueueNativeWrite(storage, key, async () => {
        if (!canPersist()) throw new Error('owner changed');
        await storage.setItem(key, text);
      });
      return true;
    } catch {
      return false;
    }
  }
  try {
    const generation = storage.getItem(generationKey(key));
    const target = payloadKey(key, generation);
    storage.setItem(target, text);
    if (storage.getItem(generationKey(key)) === generation) return true;
    storage.removeItem(target);
    return false;
  } catch {
    return false;
  }
}

export function persistDraft(
  storage: ChatDraftStorage,
  key: string,
  text: string,
  canPersist: () => boolean,
  onUnavailable: () => void,
  onAvailable = () => {},
) {
  if (!canPersist()) return;
  cancelPendingDraft(storage, key);
  if ('kind' in storage) {
    persistNativeDraft(storage, key, text, canPersist, (available) => (available ? onAvailable() : onUnavailable()));
    return;
  }
  const marker = generationKey(key);
  let generation: string | null;
  try {
    generation = storage.getItem(marker);
    if (text === '') {
      // 원문 유무와 무관하게 먼저 새 세대를 게시하여 다른 탭의 예약을 무효화한다.
      storage.setItem(marker, newGeneration());
      storage.removeItem(payloadKey(key, generation));
      return;
    }
  } catch {
    onUnavailable();
    return;
  }

  const drafts = draftsFor(storage);
  // 화면을 나가도 지연 시간은 유지하되, 저장 직전에 같은 계정과 방의 쓰기 권한을 재확인한다.
  const timer = setTimeout(() => {
    drafts.delete(key);
    if (!canPersist()) return;
    try {
      if (storage.getItem(marker) !== generation) return;
      const target = payloadKey(key, generation);
      storage.setItem(target, text);
      // localStorage는 여러 키를 원자적으로 갱신하지 못한다. 경합 중 기록된 이전 세대는
      // 복원할 수 없고 새 세대를 덮어쓰지도 않는다. 이 탭이 살아 있으면 원문도 정리한다.
      if (storage.getItem(marker) !== generation) storage.removeItem(target);
    } catch {
      onUnavailable();
    }
  }, SAVE_DELAY_MS);
  drafts.set(key, { timer, generation, text, canPersist });
}
