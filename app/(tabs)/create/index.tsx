import { useRouter } from 'expo-router';

import { StoryListScreen } from '@/features/story-publish';

/** 제작 → 내 스토리 목록 */
export default function CreateListRoute() {
  const router = useRouter();
  return (
    <StoryListScreen onOpen={(id) => router.push(`/create/${id}`)} onStartChat={(id) => router.push(`/story/${id}`)} />
  );
}
