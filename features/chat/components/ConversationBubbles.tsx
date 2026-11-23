// CHAT-US-01 인트로·대화방 말풍선 · CHAT-US-02 본문 서식 표시
import { StyleSheet, View } from 'react-native';

import { Surface, Text } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { FormattedBody } from '@/features/chat/components/FormattedBody';
import type { ConversationMessage } from '@/shared/story-types';

const speakerLabels = { character: '캐릭터', user: '유저', narrator: '나레이터' };

export function ConversationBubbles({
  messages,
  testID = 'conversation-bubble',
}: {
  messages: ConversationMessage[];
  testID?: string;
}) {
  return (
    <View style={styles.list}>
      {messages.map((message, index) => (
        <Surface
          key={index}
          testID={testID}
          tone={message.speaker_kind === 'user' ? 'selected' : 'element'}
          style={[styles.bubble, styles[message.speaker_kind]]}
        >
          <Text variant="caption">{message.speaker_name || speakerLabels[message.speaker_kind]}</Text>
          <FormattedBody body={message.body} />
        </Surface>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  bubble: { borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.one },
  character: { alignSelf: 'flex-start', maxWidth: '90%' },
  user: { alignSelf: 'flex-end', maxWidth: '90%' },
  narrator: { alignSelf: 'stretch' },
});
