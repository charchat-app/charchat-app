// CHAT-US-01-AC01 제작 목록에서 공통 스토리 상세 진입
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import CreateListRoute from '@/app/(tabs)/create';
import type { SaveState } from '@/shared/story-types';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const stories: { id: string; title: string; saveState: SaveState; updatedAt: string }[] = [
  { id: '7', title: '별빛 서점', saveState: '비공개', updatedAt: '2026-11-20T00:00:00Z' },
  { id: '8', title: '새벽 서점', saveState: '공개', updatedAt: '2026-11-20T00:00:00Z' },
  { id: '9', title: '초안 서점', saveState: '임시 저장', updatedAt: '2026-11-20T00:00:00Z' },
];
const mockPush = jest.fn();
let client: QueryClient;

beforeEach(async () => {
  mockPush.mockClear();
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity } } });
  client.setQueryData(['stories', 'list'], stories);
  await render(
    <QueryClientProvider client={client}>
      <CreateListRoute />
    </QueryClientProvider>,
  );
});

afterEach(() => client.clear());

it.each([
  ['별빛 서점', '7'],
  ['새벽 서점', '8'],
])('CHAT-US-01-AC01: 저장본 %s를 공통 상세로 연다', async (title, id) => {
  await fireEvent.press(screen.getByRole('button', { name: `${title} 대화 시작` }));
  expect(mockPush).toHaveBeenCalledWith(`/story/${id}`);
});

it('CHAT-US-01-AC06: 초안에는 대화 시작 버튼이 없고 편집은 가능하다', async () => {
  expect(screen.queryByRole('button', { name: '초안 서점 대화 시작' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: '초안 서점 편집' }));
  expect(mockPush).toHaveBeenCalledWith('/create/9');
});

it('CHAT-US-01-AC01: 저장된 스토리의 기존 편집 버튼도 유지한다', async () => {
  await fireEvent.press(screen.getByRole('button', { name: '별빛 서점 편집' }));
  expect(mockPush).toHaveBeenCalledWith('/create/7');
});
