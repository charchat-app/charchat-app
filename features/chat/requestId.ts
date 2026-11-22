// CHAT-US-02 전송 시도마다 한 번 만드는 클라이언트 요청 ID (서버 형식: 8~64자 [A-Za-z0-9-_])

/** 결과를 모르는 재전송은 새 ID가 아니라 같은 ID를 다시 쓴다(AC10·AC15). */
export function newRequestId(): string {
  const bytes = new Uint8Array(16);
  const crypto = globalThis.crypto;
  if (crypto && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    // 보안 난수가 없는 환경에서는 충돌만 피하면 된다. 비밀값이 아니다.
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return `msg-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
