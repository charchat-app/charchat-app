// CHAT-US-09-AC13·AC14 대화 삭제 확인 팝업: 대상 방 제목, 삭제 범위, 복구 불가 안내.
// 「취소」면 아무것도 바뀌지 않고, 「대화방 삭제」를 눌러야 서버에서 실제로 지운다.
import { View } from 'react-native';

import { Button, Notice, Text } from '@/components/ui';
import { Dialog, sessionStyles } from '@/features/chat/components/sessions/SessionMenuParts';
import { sessionTitle } from '@/features/chat/hooks/useSessions';
import type { StorySessionSummary } from '@/features/chat/types';

export function DeleteSessionDialog({
  session,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  session: StorySessionSummary;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const title = sessionTitle(session);
  return (
    <Dialog title="대화방을 삭제할까요?">
      <Text variant="subheading">「{title}」</Text>
      <Text>이 대화방의 대화 기록·장면·관계가 모두 삭제되고 되돌릴 수 없어요.</Text>
      <Text variant="caption">같은 스토리의 다른 대화방과 스토리 원본은 그대로예요.</Text>
      {error ? (
        <View accessibilityLiveRegion="polite" aria-live="polite">
          <Notice tone="alert" message={error} />
        </View>
      ) : null}
      <View style={sessionStyles.actions}>
        <Button
          label="취소"
          accessibilityLabel={`${title} 대화방 삭제 취소`}
          variant="secondary"
          disabled={pending}
          onPress={onCancel}
          style={sessionStyles.flex}
        />
        <Button
          label={pending ? '삭제 중…' : '대화방 삭제'}
          accessibilityLabel={`${title} 대화방 삭제`}
          variant="danger"
          disabled={pending}
          onPress={onConfirm}
          style={sessionStyles.flex}
        />
      </View>
    </Dialog>
  );
}
