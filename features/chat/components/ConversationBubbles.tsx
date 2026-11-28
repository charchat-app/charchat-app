// CHAT-US-01 인트로·대화방 말풍선 · CHAT-US-02 본문 서식 표시 · charchat-app#36 화자 사진
import { StyleSheet, View } from 'react-native';

import { Surface, Text } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { FormattedBody } from '@/features/chat/components/FormattedBody';
import { SPEAKER_AVATAR_SIZE, SpeakerAvatar } from '@/features/chat/components/SpeakerAvatar';
import { type BubbleMessage, runStarts, type SpeakerImages, speakerAvatar } from '@/features/chat/speakerAvatars';
import type { ConversationMessage } from '@/shared/story-types';

const speakerLabels = { character: '캐릭터', user: '유저', narrator: '나레이터' };

export function ConversationBubbles({
  messages,
  testID = 'conversation-bubble',
  speakers,
  previous,
}: {
  messages: BubbleMessage[];
  testID?: string;
  /**
   * charchat-app#36: 대화방이면 화자 사진을 말풍선 옆에 둔다(캐릭터 왼쪽, 유저 오른쪽, 나레이터 없음).
   * 같은 화자가 이어지면 첫 말풍선에만 사진과 이름을 보인다. 없으면(인트로 미리보기 등) 지금처럼 이름만 보인다.
   */
  speakers?: SpeakerImages;
  /** 바로 위에 붙어 그려진 말풍선. 같은 화자면 이 묶음의 첫 말풍선도 이어진 말풍선으로 본다. */
  previous?: ConversationMessage | null;
}) {
  const starts = runStarts(messages, previous);
  return (
    <View style={styles.list}>
      {messages.map((message, index) => {
        const avatar = speakers ? speakerAvatar(message, speakers) : null;
        const bubble = (
          <Surface
            key={avatar ? undefined : index}
            testID={testID}
            tone={message.speaker_kind === 'user' ? 'selected' : 'element'}
            style={[styles.bubble, avatar ? styles.withAvatar : styles[message.speaker_kind]]}
          >
            {!avatar || starts[index] ? (
              <Text variant="caption">{message.speaker_name || speakerLabels[message.speaker_kind]}</Text>
            ) : null}
            <FormattedBody body={message.body} />
          </Surface>
        );
        if (!avatar) return bubble;
        return (
          <View
            key={index}
            testID={`${testID}-row`}
            // 이어진 말풍선은 이름을 숨기므로 화면 읽기 프로그램에는 누가 한 말인지 붙여 읽힌다.
            accessible={!starts[index]}
            accessibilityLabel={starts[index] ? undefined : `${avatar.name}: ${message.body.replaceAll('*', '')}`}
            style={[styles.row, message.speaker_kind === 'user' ? styles.userRow : styles.characterRow]}
          >
            {starts[index] ? <SpeakerAvatar name={avatar.name} uri={avatar.uri} /> : <View style={styles.spacer} />}
            {bubble}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  bubble: { borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.one },
  character: { alignSelf: 'flex-start', maxWidth: '90%' },
  user: { alignSelf: 'flex-end', maxWidth: '90%' },
  narrator: { alignSelf: 'stretch' },
  // 사진 옆 말풍선: 줄(row) 안에서 남은 폭까지만 늘어난다.
  withAvatar: { flexShrink: 1, maxWidth: '85%' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  characterRow: { justifyContent: 'flex-start' },
  userRow: { flexDirection: 'row-reverse' },
  spacer: { width: SPEAKER_AVATAR_SIZE, flexShrink: 0 },
});
