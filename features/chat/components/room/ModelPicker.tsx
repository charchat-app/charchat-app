// CHAT-US-13 대화 모델 선택: 모델 목록을 라디오 형태로 보이고 현재 선택 모델을 표시한다
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Notice, Text } from '@/components/ui';
import { MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { useChatModels } from '@/features/chat/hooks/useChatModel';
import { useTheme } from '@/hooks/use-theme';
import type { ChatModel } from '@/shared/story-types';

const RADIO_SIZE = 18;
const RADIO_DOT = 8;

/** 현재 모델 id를 모르면(이력을 읽기 전) 이름으로 표시한다. */
const isCurrent = (model: ChatModel, currentId: number | undefined, currentName: string | null) =>
  currentId !== undefined ? model.id === currentId : model.name === currentName;

export function ModelPicker({
  currentId,
  currentName,
  busy,
  onSelect,
}: {
  currentId: number | undefined;
  currentName: string | null;
  /** 변경 요청 중이면 목록을 누를 수 없다. */
  busy: boolean;
  onSelect: (model: ChatModel) => void;
}) {
  const colors = useTheme();
  const query = useChatModels(true);

  if (query.isPending) {
    return <Text accessibilityLiveRegion="polite">모델 목록을 불러오는 중이에요…</Text>;
  }
  if (query.isError) {
    return (
      <View>
        <Notice tone="alert" message="모델 목록을 불러오지 못했어요." />
        <Button
          label="다시 불러오기"
          accessibilityLabel="모델 목록 다시 불러오기"
          variant="secondary"
          onPress={() => void query.refetch()}
        />
      </View>
    );
  }
  const models = query.data.models;
  if (!models.length) return <Text variant="caption">고를 수 있는 모델이 없어요.</Text>;

  return (
    <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel="대화 모델 목록">
      {models.map((model) => {
        const checked = isCurrent(model, currentId, currentName);
        return (
          <Pressable
            key={model.id}
            accessibilityRole="radio"
            accessibilityLabel={`${model.name} 모델 선택`}
            accessibilityState={{ checked, disabled: busy }}
            // 웹(react-native-web)은 accessibilityState.checked를 aria-checked로 옮기지 않아 직접 넣는다.
            aria-checked={checked}
            disabled={busy}
            onPress={() => onSelect(model)}
            style={[
              styles.option,
              {
                borderColor: checked ? colors.accent : colors.chipBorder,
                backgroundColor: checked ? colors.backgroundSelected : colors.surface,
              },
              busy && styles.disabled,
            ]}
          >
            <View style={[styles.radio, { borderColor: checked ? colors.accent : colors.chipBorder }]}>
              {checked ? <View style={[styles.dot, { backgroundColor: colors.accent }]} /> : null}
            </View>
            <Text>{model.name}</Text>
            {checked ? <Text variant="caption">현재</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  option: {
    minHeight: MinTouchSize,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.lg,
  },
  radio: {
    width: RADIO_SIZE,
    height: RADIO_SIZE,
    borderRadius: RADIO_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: RADIO_DOT, height: RADIO_DOT, borderRadius: RADIO_DOT / 2 },
  disabled: { opacity: 0.45 },
});
