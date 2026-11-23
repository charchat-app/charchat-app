// CHAT-US-02 발화자 선택: 유저 캐릭터(기본)·세션 등장 캐릭터·나레이터
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { type DraftSpeaker, sameSpeaker } from '@/features/chat/messageDraft';
import { useTheme } from '@/hooks/use-theme';

export type SpeakerOption = { key: string; label: string; speaker: DraftSpeaker };

export function SpeakerPicker({
  options,
  selected,
  onSelect,
}: {
  options: SpeakerOption[];
  selected: DraftSpeaker;
  onSelect: (speaker: DraftSpeaker) => void;
}) {
  const colors = useTheme();
  return (
    <View style={styles.list} accessibilityLabel="발화자 목록">
      {options.map((option) => {
        const checked = sameSpeaker(option.speaker, selected);
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityLabel={`발화자 ${option.label} 선택`}
            accessibilityState={{ selected: checked }}
            onPress={() => onSelect(option.speaker)}
            style={[
              styles.option,
              {
                borderColor: checked ? colors.accent : colors.chipBorder,
                backgroundColor: checked ? colors.backgroundSelected : colors.surface,
              },
            ]}
          >
            <Text>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  option: {
    minHeight: MinTouchSize,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.lg,
  },
});
