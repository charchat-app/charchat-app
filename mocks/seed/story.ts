import type { StoryDraft } from '@/shared/story-types';

/**
 * 백엔드 전 화면 개발용 시드 스토리. 모든 내용은 가상의 예시다.
 * story-scene(이휘)이 이 데이터로 먼저 개발하고, API가 준비되면 api.ts를 교체한다.
 */
export const seedStory: StoryDraft = {
  id: 'seed-story-001',
  title: '예시 스토리',
  subtitle: '시드 데이터로 만든 예시 소개',
  world: '가상의 도시를 배경으로 한 예시 세계관입니다.',
  tags: ['예시', '테스트'],
  coverPhotoUrls: [],
  characters: [{ name: '하린', detail: '예시 캐릭터의 상세 설명입니다.', photoUrls: [] }],
  speech: {
    pov: '3인칭',
    tense: '과거형',
    lengthTarget: '보통',
    styles: [],
    customStyle: '',
  },
  fewshotGroups: [],
  intros: [
    {
      title: '첫 만남',
      messages: [{ speaker: '나레이터', body: '예시 인트로 본문입니다.' }],
      scene: {
        location: '예시 장소',
        date: null,
        time: null,
        clothing: {},
        innerThought: {},
      },
    },
  ],
  relations: [],
  userProfilePresets: [],
  saveState: '임시 저장',
  updatedAt: null,
};
