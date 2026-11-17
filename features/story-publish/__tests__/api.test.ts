import { toEditorStory, toWriteDto } from '../api';
import type { StoryResponseDto } from '../types';

const dto: StoryResponseDto = {
  id: 7,
  save_state: 'draft',
  title: null,
  subtitle: '부제',
  world_description: null,
  tags: [],
  saved_at: '2026-11-17T11:00:00Z',
  issues: [
    { field: 'title', code: 'REQUIRED', message: '제목을 입력하세요.' },
    { field: 'world_description', code: 'REQUIRED', message: '세계관을 입력하세요.' },
  ],
};

describe('서버 응답 ↔ 앱 타입 변환', () => {
  it('서버 필드·상태 이름을 앱 이름으로 바꾼다', () => {
    const story = toEditorStory(dto);
    expect(story).toMatchObject({ id: '7', title: '', subtitle: '부제', world: '', saveState: '임시 저장' });
    expect(story.issues.map((i) => i.field)).toEqual(['title', 'world']);
    expect(toEditorStory({ ...dto, save_state: 'public' }).saveState).toBe('공개');
  });

  it('빈 입력만 null로 보내고 공백 원문은 그대로 보낸다', () => {
    expect(toWriteDto({ title: '', subtitle: '  ', world: '세계', tags: ['로맨스'] })).toEqual({
      title: null,
      subtitle: '  ',
      world_description: '세계',
      tags: ['로맨스'],
    });
  });
});
