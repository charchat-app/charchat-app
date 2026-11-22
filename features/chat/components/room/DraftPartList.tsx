// CHAT-US-02 이번 메시지에 이미 구성한 부분(발화자별)을 작성 순서대로 보여 준다
import { Pressable, StyleSheet, View } from 'react-native';

import { Surface, Text } from '@/components/ui';
import { MinTouchSize, Radius, Spacing } from '@/constants/theme';
import type { DraftPart, DraftSpeaker } from '@/features/chat/messageDraft';

export function DraftPartList({
  parts,
  labelOf,
  onRemove,
}: {
  parts: DraftPart[];
  labelOf: (speaker: DraftSpeaker) => string;
  onRemove: (index: number) => void;
}) {
  if (!parts.length) return null;
  return (
    <View style={styles.list}>
      {parts.map((part, index) => {
        const label = labelOf(part.speaker);
        return (
          <Surface key={index} tone="element" style={styles.part} testID="draft-part">
            <View style={styles.text}>
              <Text variant="caption">{label}</Text>
              <Text numberOfLines={3}>{part.body}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${index + 1}번째 부분(${label}) 삭제`}
              onPress={() => onRemove(index)}
              style={styles.remove}
            >
              <Text variant="caption">삭제</Text>
            </Pressable>
          </Surface>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.one },
  part: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.sm,
    paddingLeft: Spacing.three,
  },
  text: { flex: 1, paddingVertical: Spacing.two },
  remove: { minHeight: MinTouchSize, minWidth: MinTouchSize, alignItems: 'center', justifyContent: 'center' },
});
