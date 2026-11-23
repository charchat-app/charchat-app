// CHAT-US-03 미전송 입력 편집
import { StyleSheet, View } from 'react-native';

import { Text, TextArea } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useChatDraft } from '@/features/chat/hooks/useChatDraft';

export function ChatComposer({ draftKey, canPersist }: { draftKey: string | null; canPersist: () => boolean }) {
  const draft = useChatDraft(draftKey, canPersist);
  return (
    <View style={styles.composer}>
      <TextArea
        accessibilityLabel="보내지 않은 메시지"
        placeholder="메시지 입력"
        value={draft.text}
        onChangeText={draft.setText}
        editable={draft.ready}
      />
      <Text variant="caption">지금은 메시지를 전송할 수 없습니다.</Text>
      {draft.ready && !draft.persistenceAvailable ? (
        <Text variant="caption">이 환경에서는 임시 저장을 사용할 수 없습니다.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ composer: { gap: Spacing.two } });
