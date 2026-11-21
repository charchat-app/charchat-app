// CHAT-US-01 인트로·대화방 말풍선
import { StyleSheet, View } from 'react-native';

import { Surface, Text } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import type { ConversationMessage } from '@/shared/story-types';

const speakerLabels = { character: '캐릭터', user: '유저', narrator: '나레이터' };

export function ConversationBubbles({ messages }: { messages: ConversationMessage[] }) {
  return (
    <View style={styles.list}>
      {messages.map((message, index) => (
        <Surface
          key={index}
          testID="conversation-bubble"
          tone={message.speaker_kind === 'user' ? 'selected' : 'element'}
          style={[styles.bubble, styles[message.speaker_kind]]}
        >
          <Text variant="caption">{message.speaker_name || speakerLabels[message.speaker_kind]}</Text>
          <Text>{message.body}</Text>
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
