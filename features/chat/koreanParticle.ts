// CHAT-US-13 모델 이름 뒤 조사: 마지막 글자의 받침에 맞춰 '으로/로', '을/를'을 고른다.

/** 숫자를 한국어로 읽을 때의 받침 유무(0 영, 1 일, 3 삼, 6 육, 7 칠, 8 팔에 받침이 있다). 1·7·8은 ㄹ받침이다. */
const DIGIT_FINAL: Record<string, 'none' | 'rieul' | 'other'> = {
  '0': 'other',
  '1': 'rieul',
  '2': 'none',
  '3': 'other',
  '4': 'none',
  '5': 'none',
  '6': 'other',
  '7': 'rieul',
  '8': 'rieul',
  '9': 'none',
};

const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** 종성 표에서 ㄹ의 순번 */
const RIEUL = 8;

/** 마지막 글자의 받침. 한글·숫자가 아니면(영문 등) 읽는 법을 알 수 없어 null */
export function finalConsonant(word: string): 'none' | 'rieul' | 'other' | null {
  const last = [...word.trim()].at(-1);
  if (!last) return null;
  const code = last.codePointAt(0) ?? 0;
  if (code >= HANGUL_FIRST && code <= HANGUL_LAST) {
    const jong = (code - HANGUL_FIRST) % 28;
    return jong === 0 ? 'none' : jong === RIEUL ? 'rieul' : 'other';
  }
  return DIGIT_FINAL[last] ?? null;
}

/**
 * 단어 뒤에 조사를 붙인다.
 * - '으로': 받침 없음·ㄹ받침 → '로'(루나로, 하늘로), 그 밖의 받침 → '으로'(달빛으로)
 * - '을': 받침 없음 → '를'(테라를), 받침 있음 → '을'(하늘을)
 * 받침을 알 수 없으면 '(으)로', '을(를)'처럼 둘 다 적는다.
 */
export function withParticle(word: string, particle: '으로' | '을') {
  const final = finalConsonant(word);
  if (particle === '으로') {
    if (final === null) return `${word}(으)로`;
    return `${word}${final === 'other' ? '으로' : '로'}`;
  }
  if (final === null) return `${word}을(를)`;
  return `${word}${final === 'none' ? '를' : '을'}`;
}
