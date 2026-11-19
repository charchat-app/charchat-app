import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ExpressionScreen } from '../components/ExpressionScreen';
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

import { seedStory } from '@/mocks/seed/story';
import type { StoryRepository } from '@/features/story-publish';

it('제작 화면에서 편집·저장하고 다시 열면 저장한 표현을 복원한다', async () => {
  let stored = JSON.parse(JSON.stringify(seedStory)) as typeof seedStory;
  const repo: StoryRepository = {
    mode: 'fixture',
    async load() {
      return JSON.parse(JSON.stringify(stored));
    },
    async save(document) {
      stored = { ...JSON.parse(JSON.stringify(document)), updatedAt: '2026-11-17T00:00:00Z' };
      return JSON.parse(JSON.stringify(stored));
    },
  };
  const element = () => (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ExpressionScreen repository={repo} />
    </SafeAreaProvider>
  );
  const first = await render(element());
  await waitFor(() => expect(screen.getByRole('radio', { name: '현재형' })).toBeTruthy());
  expect(screen.getByText(/로컬 예제 모드/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('radio', { name: '현재형' }));
  await fireEvent.press(screen.getByRole('button', { name: '표현 설정 임시 저장' }));
  await waitFor(() => expect(screen.getByText(/마지막 저장:/)).toBeTruthy());
  await first.unmount();
  await render(element());
  await waitFor(() => expect(screen.getByRole('radio', { name: '현재형' })).toBeChecked());
  await fireEvent.press(screen.getByRole('radio', { name: '대사 중심' }));
  await fireEvent.press(screen.getByRole('button', { name: '저장한 설정 다시 불러오기' }));
  expect(screen.getByText(/저장하지 않은 변경이 사라집니다/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '변경 유지' }));
  expect(screen.getByRole('radio', { name: '대사 중심' })).toBeChecked();
});

it.each(['비공개', '공개'] as const)(
  '완성(%s)된 스토리에서는 말투 임시 저장을 막고 공통 저장 안내를 보여 준다',
  async (saveState) => {
    const repo: StoryRepository = {
      mode: 'server',
      load: jest.fn(async () => ({ ...JSON.parse(JSON.stringify(seedStory)), saveState })),
      save: jest.fn(),
    };
    await render(<ExpressionScreen repository={repo} storyId={seedStory.id} />);
    await waitFor(() => expect(screen.getByRole('radio', { name: '현재형' })).toBeTruthy());
    await fireEvent.press(screen.getByRole('radio', { name: '현재형' }));
    expect(screen.getByText('저장하지 않은 변경이 있습니다.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '표현 설정 임시 저장' })).toBeDisabled();
    expect(screen.getByText('완성된 스토리는 공통 저장 흐름에서 수정해야 합니다.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '표현 설정 임시 저장' }));
    expect(repo.save).not.toHaveBeenCalled();
  },
);

it('임시 저장 상태에서는 완성 안내 없이 저장할 수 있다', async () => {
  const repo: StoryRepository = {
    mode: 'server',
    load: jest.fn(async () => JSON.parse(JSON.stringify(seedStory))),
    save: jest.fn(async (document) => document),
  };
  await render(<ExpressionScreen repository={repo} storyId={seedStory.id} />);
  await waitFor(() => expect(screen.getByRole('radio', { name: '현재형' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('radio', { name: '현재형' }));
  expect(screen.queryByText('완성된 스토리는 공통 저장 흐름에서 수정해야 합니다.')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: '표현 설정 임시 저장' }));
  await waitFor(() => expect(repo.save).toHaveBeenCalledTimes(1));
});
