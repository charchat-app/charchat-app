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
