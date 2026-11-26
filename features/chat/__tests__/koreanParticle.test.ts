// CHAT-US-13 모델 안내 문구의 조사 고르기
import { finalConsonant, withParticle } from '@/features/chat/koreanParticle';

it.each([
  ['루나', '루나로', '루나를'],
  ['테라', '테라로', '테라를'],
  ['하늘', '하늘로', '하늘을'],
  ['달빛', '달빛으로', '달빛을'],
  ['별', '별로', '별을'],
  ['GPT-6', 'GPT-6으로', 'GPT-6을'],
  ['GPT-7', 'GPT-7로', 'GPT-7을'],
  ['모델 2', '모델 2로', '모델 2를'],
])('CHAT-US-13-AC02: %s 뒤에는 받침에 맞는 조사를 붙인다', (word, euro, eul) => {
  expect(withParticle(word, '으로')).toBe(euro);
  expect(withParticle(word, '을')).toBe(eul);
});

it('CHAT-US-13-AC02: 읽는 법을 모르는 이름은 두 조사를 함께 적는다', () => {
  expect(withParticle('Claude', '으로')).toBe('Claude(으)로');
  expect(withParticle('Claude', '을')).toBe('Claude을(를)');
  expect(withParticle('', '으로')).toBe('(으)로');
});

it('CHAT-US-13-AC02: ㄹ받침은 다른 받침과 구분한다', () => {
  expect(finalConsonant('하늘')).toBe('rieul');
  expect(finalConsonant('달빛 ')).toBe('other');
  expect(finalConsonant('루나')).toBe('none');
  expect(finalConsonant('luna')).toBeNull();
});
