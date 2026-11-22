import { useLocalSearchParams, useRouter } from 'expo-router';

import { StoryEditorScreen } from '@/features/story-publish';

/** 제작 → 스토리 편집 */
export default function StoryEditorRoute() {
  const router = useRouter();
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/create'));
  const openCreation = () => router.push({ pathname: '/create/scene/[storyId]', params: { storyId } });
  return <StoryEditorScreen key={storyId} storyId={storyId} onBack={back} onOpenCreation={openCreation} />;
}
