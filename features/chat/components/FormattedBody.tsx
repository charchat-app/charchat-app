// CHAT-US-02 본문 서식 표시: *서술* 기울임, **강조** 굵게, 나머지는 일반 대사 (퓨샷·인트로와 같은 해석기)
import { StyleSheet } from 'react-native';

import { Text } from '@/components/ui';
import { parseFormatted } from '@/features/story-scene';

export function FormattedBody({ body }: { body: string }) {
  return (
    <Text>
      {parseFormatted(body).map((part, index) =>
        part.bold || part.italic ? (
          <Text
            key={index}
            testID={part.bold ? 'formatted-bold' : 'formatted-italic'}
            style={[part.bold && styles.bold, part.italic && styles.italic]}
          >
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
});
