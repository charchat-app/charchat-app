import { getStoryImages, saveStoryImages } from '../imagesRepository';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, apiRequest: jest.fn() };
});
// eslint-disable-next-line import/first
import { apiRequest } from '@/lib/api-client';

const apiMock = apiRequest as jest.Mock;

const dto = (workingCopySavedAt: string | null) => ({
  story_id: 1,
  save_state: 'private',
  saved_at: '2026-11-20T00:00:00Z',
  story_images: [],
  characters: [{ character_id: 7, name: '하린', images: [] }],
  characters_missing_images: [7],
  working_copy_saved_at: workingCopySavedAt,
});

describe('이미지 목록 저장소 — 사진 임시 저장본 (안 B)', () => {
  afterEach(() => apiMock.mockReset());

  it('임시 저장 여부를 요청 본문의 kind로 보낸다. 기본값은 save다', async () => {
    apiMock.mockResolvedValue(dto(null));
    const patch = { story_image_ids: [], characters: [{ character_id: 7, image_ids: [3] }] };

    await saveStoryImages('1', patch, 'temporary');
    expect(JSON.parse(apiMock.mock.calls[0][1].body)).toEqual({ ...patch, kind: 'temporary' });

    await saveStoryImages('1', patch);
    expect(JSON.parse(apiMock.mock.calls[1][1].body)).toEqual({ ...patch, kind: 'save' });
  });

  it('서버가 알려 준 사진 임시 저장 시각을 함께 돌려준다', async () => {
    apiMock.mockResolvedValueOnce(dto('2026-11-20T08:00:00Z'));
    expect((await getStoryImages('1')).workingCopySavedAt).toBe('2026-11-20T08:00:00Z');
    apiMock.mockResolvedValueOnce({ ...dto(null), working_copy_saved_at: undefined });
    expect((await getStoryImages('1')).workingCopySavedAt).toBeNull();
  });
});
