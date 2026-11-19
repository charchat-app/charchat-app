import { render, screen, within } from '@testing-library/react-native';
import { emptyScene } from '@/shared/story-types';
import { SceneSummary } from '../components/initial-state/SceneSummary';

const characters = [
  { id: '5', name: '하린', position: 0 },
  { id: '6', name: '도윤', position: 1 },
];

it('CREATE-US-04-AC18: 공통 장면과 캐릭터별 착장·속마음을 다른 영역에 인물과 함께 보여 준다', async () => {
  await render(
    <SceneSummary
      scene={{
        ...emptyScene(),
        place: '서점',
        characters: [{ characterId: '5', clothing: '검은 코트', innerThought: '' }],
      }}
      characters={characters}
    />,
  );
  const common = screen.getByLabelText('공통 장면');
  expect(within(common).getByText('📍 장소 · 서점')).toBeTruthy();
  expect(within(common).getByText('📅 날짜 · 미지정')).toBeTruthy();
  expect(within(common).queryByText(/착장/)).toBeNull();

  const people = screen.getByLabelText('캐릭터별 상태');
  const harin = within(people).getByLabelText('하린의 상태');
  expect(within(harin).getByText('👔 착장 · 검은 코트')).toBeTruthy();
  // 비운 값은 미지정으로만 표시하고 채우지 않는다.
  expect(within(harin).getByText('💭 속마음 · 미지정')).toBeTruthy();
  expect(within(within(people).getByLabelText('도윤의 상태')).getByText('👔 착장 · 미지정')).toBeTruthy();
  expect(within(people).queryByText(/장소/)).toBeNull();
});
