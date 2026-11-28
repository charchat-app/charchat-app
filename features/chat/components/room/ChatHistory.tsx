// CHAT-US-02 대화 이력 표시: 인트로 → 저장된 메시지 → 보내는 중인 메시지 → 생성 중·미저장 응답
// CHAT-US-08 가장 뒤 AI 응답 바로 아래에 상태 카드 자리를 둔다.
// charchat-app#36 말풍선 옆 화자 사진. 같은 화자가 묶음을 넘어 이어져도 첫 말풍선에만 사진을 보인다.
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Notice, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { ConversationBubbles } from '@/features/chat/components/ConversationBubbles';
import type { SpeakerImages } from '@/features/chat/speakerAvatars';
import type { ChatMessage, ConversationMessage } from '@/shared/story-types';

export function ChatHistory({
  intro,
  messages,
  pending,
  pendingNote,
  streaming,
  unsaved,
  afterLatestReply,
  speakers,
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
  /** 저장된 가장 뒤 AI 응답 바로 아래에 둘 내용(상태 카드). AI 응답이 없으면 그리지 않는다. */
  afterLatestReply?: ReactNode;
  /** 화자 사진(캐릭터 대표 사진·유저 프로필 사진). 없으면 이름만 보인다. */
  speakers?: SpeakerImages;
}) {
  const saved = messages.flatMap((message) => message.parts);
  const latestReply = messages.findLastIndex((message) => message.role === 'assistant');
  const card = afterLatestReply && latestReply >= 0 ? afterLatestReply : null;
  // 카드가 있으면 그 응답까지와 그 뒤(실패한 턴의 내 메시지 등)를 나눠 그 사이에 카드를 둔다.
  const before = card ? messages.slice(0, latestReply + 1).flatMap((message) => message.parts) : saved;
  const after = card ? messages.slice(latestReply + 1).flatMap((message) => message.parts) : [];
  const empty = !intro.length && !saved.length && !pending.length && !streaming.length && !unsaved.length;
  if (empty) return <Text variant="caption">표시할 대화가 없습니다.</Text>;
  // 바로 위에 붙어 그려진 말풍선. 상태 카드·안내 문구가 사이에 끼면 이어지지 않는다.
  const lastSaved = card ? (after.at(-1) ?? null) : (saved.at(-1) ?? intro.at(-1) ?? null);
  const lastPending = pending.length ? (pendingNote ? null : (pending.at(-1) ?? null)) : lastSaved;
  const lastStreaming = streaming.length ? (streaming.at(-1) ?? null) : lastPending;
  return (
    <View style={styles.list}>
      {intro.length ? <ConversationBubbles messages={intro} speakers={speakers} /> : null}
      {before.length ? (
        <ConversationBubbles
          messages={before}
          testID="chat-message-bubble"
          speakers={speakers}
          previous={intro.at(-1)}
        />
      ) : null}
      {card}
      {after.length ? <ConversationBubbles messages={after} testID="chat-message-bubble" speakers={speakers} /> : null}
      {pending.length ? (
        <View style={styles.list}>
          <ConversationBubbles
            messages={pending}
            testID="chat-pending-bubble"
            speakers={speakers}
            previous={lastSaved}
          />
          {pendingNote ? (
            <Text variant="caption" style={styles.note}>
              {pendingNote}
            </Text>
          ) : null}
        </View>
      ) : null}
      {streaming.length ? (
        <View accessibilityLiveRegion="polite">
          <ConversationBubbles
            messages={streaming}
            testID="chat-streaming-bubble"
            speakers={speakers}
            previous={lastPending}
          />
        </View>
      ) : null}
      {unsaved.length ? (
        <View style={styles.list}>
          <ConversationBubbles
            messages={unsaved}
            testID="chat-unsaved-bubble"
            speakers={speakers}
            previous={lastStreaming}
          />
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
