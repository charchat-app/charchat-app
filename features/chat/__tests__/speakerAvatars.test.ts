// charchat-app#36 화자 사진 고르기·이어진 말풍선 판정
import { runStarts, speakerAvatar, type SpeakerImages } from '@/features/chat/speakerAvatars';

const images: SpeakerImages = {
  user: '/u.png',
  characters: [
    { id: 2, name: '윤슬', image_url: '/y.png' },
    { id: 3, name: '서윤', image_url: null },
    { id: 4, name: '하람' },
  ],
};

it('#36: 나레이터는 사진이 없고, 유저는 프로필 사진, 캐릭터는 ID(저장 메시지) 또는 이름(인트로·스트리밍)으로 대표 사진을 찾는다', () => {
  expect(speakerAvatar({ speaker_kind: 'narrator', speaker_name: null, body: 'x' }, images)).toBeNull();
  expect(speakerAvatar({ speaker_kind: 'user', speaker_name: '여행자', body: 'x' }, images)).toEqual({
    name: '여행자',
    uri: '/u.png',
  });
  expect(speakerAvatar({ speaker_kind: 'character', speaker_name: '윤슬', body: 'x' }, images)).toEqual({
    name: '윤슬',
    uri: '/y.png',
  });
  // 저장된 부분은 이름이 달라도(이름 바꾼 뒤 옛 이름) 세션 캐릭터 ID를 먼저 본다.
  expect(
    speakerAvatar({ speaker_kind: 'character', speaker_name: '옛 이름', character_id: 2, body: 'x' }, images),
  ).toEqual({ name: '옛 이름', uri: '/y.png' });
  // 사진 없음·옛 서버(칸 없음)·모르는 이름은 첫 글자용 이름만 준다.
  expect(speakerAvatar({ speaker_kind: 'character', speaker_name: '서윤', body: 'x' }, images)?.uri).toBeNull();
  expect(speakerAvatar({ speaker_kind: 'character', speaker_name: '하람', body: 'x' }, images)?.uri).toBeNull();
  expect(speakerAvatar({ speaker_kind: 'character', speaker_name: '모름', body: 'x' }, images)?.uri).toBeNull();
  expect(speakerAvatar({ speaker_kind: 'user', speaker_name: '', body: 'x' }, { ...images, user: null })).toEqual({
    name: '유저',
    uri: null,
  });
});

it('#36: 같은 화자가 이어지면 첫 말풍선만 묶음의 시작이다. 앞 묶음의 마지막 말풍선도 이어서 본다', () => {
  const a = { speaker_kind: 'character' as const, speaker_name: '윤슬', body: '1' };
  const b = { speaker_kind: 'character' as const, speaker_name: '서윤', body: '2' };
  const u = { speaker_kind: 'user' as const, speaker_name: '윤슬', body: '3' };
  expect(runStarts([a, a, b, a, u, u])).toEqual([true, false, true, true, true, false]);
  expect(runStarts([a, b], a)).toEqual([false, true]);
  expect(runStarts([a], null)).toEqual([true]);
});
