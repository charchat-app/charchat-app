// CHAT-US-08 (KAN-22) ```info 장면 상태 블록 떼어 내기: 서버·앱 공통 계약 A의 규칙 1~7
import { splitInfo } from '@/features/chat/infoBlock';

const done = (text: string) => splitInfo(text, { streaming: false });
const live = (text: string) => splitInfo(text, { streaming: true });

const INFO =
  '날짜: 2026년 11월 27일\n시간: 19:30\n장소: 헌책방 온새미\n[도경] 착장: 젖은 트렌치코트 | 속마음: 사건 생각뿐이다';

describe('splitInfo', () => {
  it('CHAT-US-08 규칙 6: info 블록이 없으면 본문은 원문 그대로, info는 null', () => {
    const text = '@도경: 안녕\r\n*비가 온다*\n\n';
    expect(done(text)).toEqual({ body: text, info: null });
    expect(live(text)).toEqual({ body: text, info: null });
    expect(done('')).toEqual({ body: '', info: null });
  });

  it('CHAT-US-08 규칙 5·6: 끝의 닫힌 블록을 떼어 내고 두 펜스 사이를 info로 준다', () => {
    expect(done(`@도경: 안녕\n@나레이터: 비\n\`\`\`info\n${INFO}\n\`\`\``)).toEqual({
      body: '@도경: 안녕\n@나레이터: 비',
      info: INFO,
    });
  });

  it('CHAT-US-08 규칙 5: 닫는 줄이 없으면 여는 줄부터 원문 끝까지가 블록이다', () => {
    expect(done('@도경: 안녕\n```info\n날짜: 오늘\n시간:')).toEqual({ body: '@도경: 안녕', info: '날짜: 오늘\n시간:' });
    expect(done('@도경: 안녕\n```info')).toEqual({ body: '@도경: 안녕', info: '' });
    expect(done('@도경: 안녕\n```info\n')).toEqual({ body: '@도경: 안녕', info: '' });
  });

  it('CHAT-US-08 규칙 6: 닫는 줄 뒤의 글은 본문에 남긴다', () => {
    expect(done('@도경: 앞\n```info\n장소: 집\n```\n@나레이터: 뒤\n')).toEqual({
      body: '@도경: 앞\n@나레이터: 뒤',
      info: '장소: 집',
    });
  });

  it('CHAT-US-08 규칙 3: 닫는 줄은 여는 줄 뒤에서 처음 나오는 ``` 줄이다', () => {
    expect(done('```\n앞\n```info\n장소: 집\n```\n가운데\n```\n끝')).toEqual({
      body: '```\n앞\n가운데\n```\n끝',
      info: '장소: 집',
    });
  });

  it('CHAT-US-08 규칙 4: 여는 줄이 여러 개면 마지막 여는 줄만 쓴다', () => {
    expect(done('본문\n```info\n장소: 집\n```\n사이\n```info\n장소: 바다\n```')).toEqual({
      body: '본문\n```info\n장소: 집\n```\n사이',
      info: '장소: 바다',
    });
    // 닫히지 않은 앞 블록 뒤에 새 여는 줄이 오면 앞 여는 줄은 본문에 남는다.
    expect(done('본문\n```info\n장소: 집\n```info\n장소: 바다')).toEqual({
      body: '본문\n```info\n장소: 집',
      info: '장소: 바다',
    });
  });

  it('CHAT-US-08 규칙 2·3: 앞뒤 공백·탭만 무시하고 정확히 ```info / ``` 인 줄만 펜스다', () => {
    expect(done('본문\n \t```info\t \n장소: 집\n \t``` \t\n뒤')).toEqual({ body: '본문\n뒤', info: '장소: 집' });
    // 대소문자 구분, 다른 글자가 붙으면 여는 줄이 아니다.
    for (const fence of ['```INFO', '```Info', '```info x', '```infos', '````info', '``` info', 'x```info']) {
      const text = `본문\n${fence}\n장소: 집\n\`\`\``;
      expect(done(text)).toEqual({ body: text, info: null });
    }
    // 닫는 줄도 정확히 ``` 이어야 한다. 아니면 블록은 끝까지 간다.
    expect(done('본문\n```info\n장소: 집\n````\n```x\n뒤')).toEqual({ body: '본문', info: '장소: 집\n````\n```x\n뒤' });
  });

  it('CHAT-US-08 규칙 2·3: BOM·NBSP 같은 다른 공백이 붙은 펜스는 펜스가 아니다', () => {
    for (const fence of ['\ufeff```info', '\u00a0```info', '```info\u00a0', '```info\u3000']) {
      const text = `본문\n${fence}\n장소: 집\n\`\`\``;
      expect(done(text)).toEqual({ body: text, info: null });
    }
    expect(done('본문\n```info\n장소: 집\n\u00a0```\n\ufeff```')).toEqual({
      body: '본문',
      info: '장소: 집\n\u00a0```\n\ufeff```',
    });
  });

  it('CHAT-US-08: ```json 같은 다른 코드 블록은 건드리지 않는다', () => {
    const text = '본문\n```json\n{"a": 1}\n```\n끝';
    expect(done(text)).toEqual({ body: text, info: null });
    expect(done(`${text}\n\`\`\`info\n장소: 집\n\`\`\``)).toEqual({ body: text, info: '장소: 집' });
  });

  it.each([
    ['\\n', '\n'],
    ['\\r\\n', '\r\n'],
    ['\\r', '\r'],
    ['\\v', '\v'],
    ['\\f', '\f'],
    ['\\x1c', '\x1c'],
    ['\\x1d', '\x1d'],
    ['\\x1e', '\x1e'],
    ['\\x85', '\x85'],
    ['\\u2028', '\u2028'],
    ['\\u2029', '\u2029'],
  ])('CHAT-US-08 규칙 1: 줄 경계 %s 로 나뉜 펜스도 인식하고 본문·info는 \\n으로 잇는다', (_label, br) => {
    const text = ['@도경: 안녕', '@나레이터: 비', '```info', '장소: 집', '시간: 밤', '```', '끝'].join(br);
    expect(done(text)).toEqual({ body: '@도경: 안녕\n@나레이터: 비\n끝', info: '장소: 집\n시간: 밤' });
    expect(live(text)).toEqual({ body: '@도경: 안녕\n@나레이터: 비\n끝', info: '장소: 집\n시간: 밤' });
  });

  it('CHAT-US-08 규칙 1: CRLF 원문의 끝 줄바꿈은 빈 줄을 만들지 않는다', () => {
    expect(done('@도경: 안녕\r\n```info\r\n장소: 집\r\n```\r\n')).toEqual({ body: '@도경: 안녕', info: '장소: 집' });
    expect(done('a\r\n\r\n```info\r\nb')).toEqual({ body: 'a\n', info: 'b' });
  });

  it.each(['`', '``', '```', '```i', '```in', '```inf', '```info', '  ```in', '\t``'])(
    'CHAT-US-08 규칙 7: 스트리밍 중 끝 줄 %j 는 반쯤 온 펜스일 수 있어 숨기고, 완료·실패 원문에서는 숨기지 않는다',
    (tail) => {
      const text = `@도경: 안녕\n${tail}`;
      expect(live(text).body).toBe('@도경: 안녕\n');
      // 완료·실패 확정 원문: ```info 자체(앞 공백·탭 포함)만 여는 줄이고, 나머지는 본문에 남는다.
      const isOpen = tail.trim() === '```info';
      expect(done(text)).toEqual(isOpen ? { body: '@도경: 안녕', info: '' } : { body: text, info: null });
    },
  );

  it('CHAT-US-08 규칙 7: 줄바꿈이 붙었거나 앞부분이 아닌 끝 줄, 빈 끝 줄은 스트리밍 중에도 숨기지 않는다', () => {
    for (const text of [
      '@도경: 안녕\n`\n',
      '@도경: 안녕\n```\r',
      '@도경: 안녕\n```j',
      '@도경: 안녕\n``` ',
      '@도경: 안\n  ',
    ]) {
      expect(live(text)).toEqual({ body: text, info: null });
    }
    expect(live('`')).toEqual({ body: '', info: null });
    expect(live('@도경: `코드`')).toEqual({ body: '@도경: `코드`', info: null });
  });

  it('CHAT-US-08 규칙 7: 닫힌 블록 뒤 반쯤 온 펜스 줄도 스트리밍 중에는 숨긴다', () => {
    const text = '@도경: 안녕\n```info\n장소: 집\n```\n@나레이터: 뒤\n```i';
    expect(live(text)).toEqual({ body: '@도경: 안녕\n@나레이터: 뒤', info: '장소: 집' });
    expect(done(text)).toEqual({ body: '@도경: 안녕\n@나레이터: 뒤\n```i', info: '장소: 집' });
  });

  it('CHAT-US-08 규칙 5·7: 스트리밍 중 열린 블록의 내용은 도착하는 대로 info이고 본문에 보이지 않는다', () => {
    expect(live('@도경: 안녕\n```info\n장소: 헌')).toEqual({ body: '@도경: 안녕', info: '장소: 헌' });
    expect(live('@도경: 안녕\n```info\n장소: 집\n``')).toEqual({ body: '@도경: 안녕', info: '장소: 집' });
    expect(live('@도경: 안녕\n```info\n장소: 집\n```')).toEqual({ body: '@도경: 안녕', info: '장소: 집' });
  });
});
