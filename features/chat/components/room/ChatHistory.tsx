// CHAT-US-02 대화 이력 표시: 인트로 → 저장된 메시지 → 보내는 중인 메시지 → 생성 중·미저장 응답
import { StyleSheet, View } from 'react-native';

import { Notice, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { ConversationBubbles } from '@/features/chat/components/ConversationBubbles';
import type { ChatMessage, ConversationMessage } from '@/shared/story-types';

export function ChatHistory({
  intro,
  messages,
  pending,
  pendingNote,
  streaming,
  unsaved,
}: {
  intro: ConversationMessage[];
  messages: ChatMessage[];
  /** 아직 저장 이력에 없는 내가 보낸 메시지 */
  pending: ConversationMessage[];
  pendingNote: string | null;
  /** 생성 중인 응답(완료 전 조각). 저장된 응답으로 취급하지 않는다(AC09). */
  streaming: ConversationMessage[];
  /** 중간에 끊겼거나 저장하지 못한 응답 */
  unsaved: ConversationMessage[];
}) {
  const saved = messages.flatMap((message) => message.parts);
  const empty = !intro.length && !saved.length && !pending.length && !streaming.length && !unsaved.length;
  if (empty) return <Text variant="caption">표시할 대화가 없습니다.</Text>;
  return (
    <View style={styles.list}>
      {intro.length ? <ConversationBubbles messages={intro} /> : null}
      {saved.length ? <ConversationBubbles messages={saved} testID="chat-message-bubble" /> : null}
      {pending.length ? (
        <View style={styles.list}>
          <ConversationBubbles messages={pending} testID="chat-pending-bubble" />
          {pendingNote ? (
            <Text variant="caption" style={styles.note}>
              {pendingNote}
            </Text>
          ) : null}
        </View>
      ) : null}
      {streaming.length ? (
        <View accessibilityLiveRegion="polite">
          <ConversationBubbles messages={streaming} testID="chat-streaming-bubble" />
        </View>
      ) : null}
      {unsaved.length ? (
        <View style={styles.list}>
          <ConversationBubbles messages={unsaved} testID="chat-unsaved-bubble" />
          <Notice message="이 응답은 대화 이력에 저장되지 않았습니다." />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  note: { alignSelf: 'flex-end' },
});
