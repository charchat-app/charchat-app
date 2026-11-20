import type { MediaImage } from '@/shared/media';

import {
  addImage,
  charactersMissingImages,
  coverOf,
  dropIndex,
  mergeCharacters,
  moveImage,
  removeImage,
  replaceImage,
  requiredImageMessage,
  sameImages,
  shiftDuringDrag,
  toImagesPatch,
  type StoryImagesValues,
} from '../images';

const img = (imageId: number, mimeType = 'image/png'): MediaImage => ({
  imageId,
  mimeType,
  byteSize: 10,
  uri: `http://x/${imageId}`,
});
const ids = (list: MediaImage[]) => list.map((i) => i.imageId);

describe('이미지 목록 편집 (CREATE-US-06)', () => {
  it('최대 장수를 넘으면 추가하지 않는다 (AC03)', () => {
    const five = [1, 2, 3, 4, 5].map((n) => img(n));
    expect(ids(addImage(five, img(6), 5))).toEqual([1, 2, 3, 4, 5]);
    expect(ids(addImage(five.slice(0, 4), img(6), 5))).toEqual([1, 2, 3, 4, 6]);
  });

  it('옮긴 순서대로 두고 맨 앞이 대표가 된다. GIF도 같은 규칙이다 (AC06)', () => {
    const list = [img(1), img(2, 'image/gif'), img(3)];
    expect(ids(moveImage(list, 1, 0))).toEqual([2, 1, 3]);
    expect(ids(moveImage(list, 0, 2))).toEqual([2, 3, 1]);
    expect(moveImage(list, 0, 9)).toBe(list);
  });

  it('끌어서 놓은 거리로 새 자리를 정하고 목록 밖으로 나가지 않는다 (AC06)', () => {
    const slot = 86;
    expect(dropIndex(0, 0, slot, 4)).toBe(0);
    expect(dropIndex(0, 40, slot, 4)).toBe(0); // 반 칸 미만
    expect(dropIndex(0, 50, slot, 4)).toBe(1); // 반 칸 넘으면 다음 자리
    expect(dropIndex(3, -2 * slot, slot, 4)).toBe(1);
    expect(dropIndex(1, 10 * slot, slot, 4)).toBe(3);
    expect(dropIndex(2, -10 * slot, slot, 4)).toBe(0);
  });

  it('끄는 동안 지나간 자리의 사진만 한 칸씩 비켜난다 (AC06)', () => {
    // 0번을 2번 자리로: 1·2번이 앞으로 한 칸, 3번은 그대로
    expect([0, 1, 2, 3].map((i) => shiftDuringDrag(i, 0, 2))).toEqual([0, -1, -1, 0]);
    // 3번을 1번 자리로: 1·2번이 뒤로 한 칸
    expect([0, 1, 2, 3].map((i) => shiftDuringDrag(i, 3, 1))).toEqual([0, 1, 1, 0]);
  });

  it('교체는 그 자리만 바꾸고 순서를 유지한다 (AC07)', () => {
    expect(ids(replaceImage([img(1), img(2), img(3)], 1, img(9)))).toEqual([1, 9, 3]);
  });

  it('마지막 이미지까지 지울 수 있고 남은 순서를 유지한다 (AC08)', () => {
    expect(ids(removeImage([img(1), img(2), img(3)], 0))).toEqual([2, 3]);
    expect(removeImage([img(1)], 0)).toEqual([]);
  });
});

describe('표지와 필수 이미지 (AC08·AC09)', () => {
  const values: StoryImagesValues = {
    story: [],
    characters: [
      { characterId: '1', name: '하린', images: [img(11), img(12)] },
      { characterId: '2', name: '도윤', images: [] },
    ],
  };

  it('스토리 이미지가 없으면 첫 번째 캐릭터의 첫 사진을 대체 표지로 쓴다', () => {
    expect(coverOf(values)).toEqual({ source: 'character', image: img(11), characterName: '하린' });
    expect(coverOf({ ...values, story: [img(5)] })).toEqual({ source: 'story', image: img(5) });
    expect(coverOf({ story: [], characters: [] })).toBeNull();
  });

  it('이미지가 없는 캐릭터를 알려 준다', () => {
    expect(charactersMissingImages(values).map((c) => c.name)).toEqual(['도윤']);
  });
});

describe('저장 조각', () => {
  it('서버 캐릭터 목록을 반영하되 화면에서 고친 이미지는 지킨다', () => {
    const local: StoryImagesValues = {
      story: [img(1)],
      characters: [
        { characterId: '1', name: '하린', images: [img(11)] },
        { characterId: '2', name: '삭제될 캐릭터', images: [img(21)] },
      ],
    };
    const server: StoryImagesValues = {
      story: [],
      characters: [
        { characterId: '3', name: '새 캐릭터', images: [] },
        { characterId: '1', name: '하린(이름 변경)', images: [] },
      ],
    };
    const merged = mergeCharacters(local, server);
    expect(ids(merged.story)).toEqual([1]);
    expect(merged.characters.map((c) => [c.characterId, c.name, ids(c.images)])).toEqual([
      ['3', '새 캐릭터', []],
      ['1', '하린(이름 변경)', [11]],
    ]);
  });

  it('요청 본문은 id와 순서만 담고 같은 내용이면 저장하지 않는다', () => {
    const values: StoryImagesValues = {
      story: [img(2), img(1)],
      characters: [{ characterId: '7', name: 'A', images: [img(3)] }],
    };
    expect(toImagesPatch(values)).toEqual({
      story_image_ids: [2, 1],
      characters: [{ character_id: 7, image_ids: [3] }],
    });
    expect(sameImages(values, { ...values, story: [img(2), img(1)] })).toBe(true);
    expect(sameImages(values, { ...values, story: [img(1), img(2)] })).toBe(false);
  });
});

describe('완성 스토리의 필수 이미지 안내 (CREATE-US-06-AC08)', () => {
  const values: StoryImagesValues = {
    story: [],
    characters: [
      { characterId: '1', name: '하린', images: [img(1)] },
      { characterId: '2', name: '도윤', images: [] },
      { characterId: '3', name: '', images: [] },
    ],
  };

  it('서버가 알려 준 캐릭터 id로 누락 대상 이름을 보여 준다', () => {
    expect(requiredImageMessage(values, ['2', '3'])).toContain('(도윤, 이름 없음)');
  });

  it('이름을 찾지 못하면 일부 캐릭터로 안내한다', () => {
    expect(requiredImageMessage(values, ['99'])).toContain('(일부 캐릭터)');
    expect(requiredImageMessage(null, ['2'])).toContain('(일부 캐릭터)');
  });
});
