// CHAT-US-02 AI 응답 원문 해석 (서버 parse_assistant_text와 같은 공유 사례)
import { parseAssistantText } from '@/features/chat/assistantParser';

const character = (name: string, body: string) => ({ speaker_kind: 'character', speaker_name: name, body });
const narrator = (body: string) => ({ speaker_kind: 'narrator', speaker_name: null, body });

describe('CHAT-US-02-AC09: 응답 원문을 발화자·본문 순서대로 나눈다 (공유 사례)', () => {
  it('1. 캐릭터 태그 한 개', () => {
    expect(parseAssistantText('@도경: 안녕', ['도경'])).toEqual([character('도경', '안녕')]);
  });

  it('2. 태그 없는 글은 나레이터', () => {
    expect(parseAssistantText('그냥 텍스트', ['도경'])).toEqual([narrator('그냥 텍스트')]);
  });

  it('3. 순서를 지키고 같은 발화자가 이어져도 부분을 합치지 않는다', () => {
    expect(parseAssistantText('@도경: 하나\n@나레이터: 둘\n@도경: 셋\n@도경: 넷', ['도경'])).toEqual([
      character('도경', '하나'),
      narrator('둘'),
      character('도경', '셋'),
      character('도경', '넷'),
    ]);
  });

  it('4. 모르는 이름의 태그는 원문 그대로 나레이터', () => {
    expect(parseAssistantText('@모르는사람: 말', ['도경'])).toEqual([narrator('@모르는사람: 말')]);
  });

  it('5. 여러 줄 본문은 한 부분으로 유지한다', () => {
    expect(parseAssistantText('@도경: 첫줄\n둘째줄', ['도경'])).toEqual([character('도경', '첫줄\n둘째줄')]);
  });

  it('6. 스트리밍 중 끝의 미완성 태그는 앞 부분의 글로 보이고, 완성되면 새 부분이 된다', () => {
    expect(parseAssistantText('@도경: 안녕\n@나', ['도경'])).toEqual([character('도경', '안녕\n@나')]);
    expect(parseAssistantText('@도경: 안녕\n@나레이터: 비', ['도경'])).toEqual([
      character('도경', '안녕'),
      narrator('비'),
    ]);
  });

  it('첫 태그 앞 글은 나레이터, 유저 이름 태그 줄은 원문 그대로 새 나레이터 부분, 서식 기호는 남긴다 (서버 사례)', () => {
    const text = '서두\n@도경: 대사\n@민서: 내가 말한다\n@Bea: *웃는다* **정말?**';
    expect(parseAssistantText(text, ['도경', 'Bea'])).toEqual([
      narrator('서두'),
      character('도경', '대사'),
      narrator('@민서: 내가 말한다'),
      character('Bea', '*웃는다* **정말?**'),
    ]);
  });

  it('빈 부분은 버리고 앞뒤 빈 줄·공백은 정리한다 (서버 사례)', () => {
    expect(parseAssistantText('\n@도경:\n@나레이터: 비\n\n', ['도경', 'Bea'])).toEqual([narrator('비')]);
    expect(parseAssistantText('   ', ['도경'])).toEqual([]);
  });

  it('모르는 태그 줄은 앞 부분에 붙지 않고 새 나레이터 부분이 되며, 그 뒤 일반 줄은 그 부분에 붙는다', () => {
    expect(parseAssistantText('@도경: 응\n@여행자: 나도\n같이 가자', ['도경'])).toEqual([
      character('도경', '응'),
      narrator('@여행자: 나도\n같이 가자'),
    ]);
  });

  it('캐릭터 이름이 나레이터여도 `@나레이터:`는 나레이터다', () => {
    expect(parseAssistantText('@나레이터: 비', ['나레이터'])).toEqual([narrator('비')]);
  });
});
