// CREATE-US-05 제작자 추천 유저 프로필 프리셋 편집기
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { Button, FormField, PhotoSlot, Text, TextArea, TextField } from '@/components/ui';
import { MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  MAX_PRESET_TEXT_LENGTH,
  MAX_USER_PROFILE_PRESETS,
  USER_NAME_PLACEHOLDER,
  type PresetImage,
} from '@/shared/story-types/presets';

import {
  addPreset,
  isUserNamePreset,
  issuesToErrors,
  movePreset,
  presetTotalLength,
  removePreset,
  setPresetImage,
  toggleUserNamePreset,
  updatePreset,
  validatePresets,
  type PresetValues,
} from '../userProfilePresetRules';
import { useDragList, type DragList } from './useDragList';

/** 카드 사이 간격. 끌어 놓을 자리 계산에도 같은 값을 쓴다. */
const ITEM_GAP = Spacing.three;

/** fromKey 프리셋을 toKey 프리셋 자리로 옮긴다. 최신 값 기준으로 계산하며, 둘 중 하나가 없으면 그대로 둔다. */
function movePresetTo(presets: PresetValues[], fromKey: string, toKey: string): PresetValues[] {
  const from = presets.findIndex((x) => x.key === fromKey);
  const to = presets.findIndex((x) => x.key === toKey);
  if (from < 0 || to < 0) return presets;
  return movePreset(presets, fromKey, to - from);
}

/** 고른 이미지: 서버 정수 id와 표시용 주소 */
export type PresetImageChoice = PresetImage;

export type UserProfilePresetEditorProps = {
  presets: PresetValues[];
  /** 등장 캐릭터 이름들. 직접 지은 프리셋 이름이 이들과 같으면 안내한다. */
  characterNames?: string[];
  /** 입력 변경. 화면이 그려진 시점의 값으로 덮어쓰지 않도록 "이전 값 → 새 값" 함수로 전달한다. */
  onChange: (update: (presets: PresetValues[]) => PresetValues[]) => void;
  /**
   * 이미 올라가 있는 이미지 중 하나를 고르는 동작(호스트가 연결). 고른 이미지(imageId·표시 주소)를 돌려주고,
   * 취소하면 undefined를 돌려준다. 이 컴포넌트는 업로드를 하지 않으며, 없으면 이미지 버튼을 만들지 않는다.
   */
  onSelectImage?: (key: string) => Promise<PresetImageChoice | null | undefined>;
  editable?: boolean;
  /**
   * 끌기 시작(true)·끝(false) 알림. 바깥 스크롤을 감싼 호스트가 끄는 동안 스크롤을 멈출 때 쓴다(선택).
   * 캐릭터 목록 등 다른 목록의 끌기와는 상태를 공유하지 않는다.
   */
  onDragActiveChange?: (active: boolean) => void;
};

/**
 * 프리셋 목록 편집(추가·수정·삭제·순서 변경). 입력을 막거나 자르지 않고 문제는 안내로만 알린다.
 * 문제가 있어도 임시 저장 조각은 presetsToDraftPatch로 만들 수 있고, 완료 여부는 validatePresets가 알려 준다.
 *
 * 순서 변경(AC08):
 * - 카드 머리의 전용 손잡이(≡)를 길게 누른 뒤 위아래로 끌어 놓는다. 이름·상세 입력칸에서는 시작되지 않는다.
 * - 카드 높이가 서로 달라도 실제 높이로 놓을 자리를 계산한다(useDragList).
 * - 끄는 중에 제스처가 취소되거나 제자리에 놓으면 순서는 그대로다.
 * - 끌기가 어려운 경우를 위해 위·아래 버튼과 손잡이의 접근성 동작(위로/아래로)을 함께 둔다.
 * - 편집 불가 상태에서는 끌기·버튼·접근성 동작 모두 순서를 바꾸지 않는다.
 */
export function UserProfilePresetEditor({
  presets,
  characterNames = [],
  onChange,
  onSelectImage,
  editable = true,
  onDragActiveChange,
}: UserProfilePresetEditorProps) {
  const { issues } = validatePresets(presets, characterNames);
  const errors = issuesToErrors(issues);
  const full = presets.length >= MAX_USER_PROFILE_PRESETS;
  const keys = presets.map((preset) => preset.key);
  const moveTo = (fromKey: string, toKey: string) => {
    if (!editable) return;
    onChange((v) => movePresetTo(v, fromKey, toKey));
  };
  const drag = useDragList({ keys, gap: ITEM_GAP, disabled: !editable, onMove: moveTo, onDragActiveChange });

  return (
    <View style={styles.list}>
      <Text variant="caption" color={errors.list ? 'danger' : 'textSecondary'}>
        {presets.length}/{MAX_USER_PROFILE_PRESETS}개
      </Text>
      {errors.list ? <Text variant="error">{errors.list}</Text> : null}
      {presets.length === 0 ? <Text variant="body">아직 추천 프로필이 없어요.</Text> : null}
      {presets.map((preset, index) => (
        <PresetItem
          key={preset.key}
          index={index}
          last={index === presets.length - 1}
          drag={drag}
          prevKey={keys[index - 1]}
          nextKey={keys[index + 1]}
          onMoveTo={moveTo}
          preset={preset}
          nameError={errors[`${preset.key}.name`]}
          textError={errors[`${preset.key}.text`]}
          imageError={errors[`${preset.key}.image`]}
          editable={editable}
          canSelectImage={onSelectImage !== undefined}
          onName={(name) => onChange((v) => updatePreset(v, preset.key, { name }))}
          onDetail={(detail) => onChange((v) => updatePreset(v, preset.key, { detail }))}
          onToggleUserName={() => onChange((v) => toggleUserNamePreset(v, preset.key))}
          onRemove={() => onChange((v) => removePreset(v, preset.key))}
          onMove={(offset) => onChange((v) => movePreset(v, preset.key, offset))}
          onSelectImage={async () => onSelectImage?.(preset.key)}
          onApplyImage={(image) => onChange((v) => setPresetImage(v, preset.key, image))}
        />
      ))}
      <Button
        label={full ? `프로필은 최대 ${MAX_USER_PROFILE_PRESETS}개예요` : '+ 프로필 추가'}
        variant="secondary"
        onPress={() => onChange(addPreset)}
        disabled={!editable || full}
      />
    </View>
  );
}

type PresetItemProps = {
  index: number;
  last: boolean;
  /** 이 목록 전용 끌기 상태 */
  drag: DragList;
  prevKey?: string;
  nextKey?: string;
  /** 손잡이 접근성 동작으로 한 칸 옮길 때 */
  onMoveTo: (fromKey: string, toKey: string) => void;
  preset: PresetValues;
  nameError?: string;
  textError?: string;
  imageError?: string;
  editable: boolean;
  canSelectImage: boolean;
  onName: (name: string) => void;
  onDetail: (detail: string) => void;
  onToggleUserName: () => void;
  onRemove: () => void;
  onMove: (offset: number) => void;
  /** 호스트의 이미지 고르기. 결과 반영은 onApplyImage로 따로 한다. */
  onSelectImage: () => Promise<PresetImageChoice | null | undefined>;
  /** 이미지 지정(null이면 해제) */
  onApplyImage: (image: PresetImageChoice | null) => void;
};

function PresetItem({
  index,
  last,
  drag,
  prevKey,
  nextKey,
  onMoveTo,
  preset,
  nameError,
  textError,
  imageError,
  editable,
  canSelectImage,
  onName,
  onDetail,
  onToggleUserName,
  onRemove,
  onMove,
  onSelectImage,
  onApplyImage,
}: PresetItemProps) {
  const c = useTheme();
  const [pickError, setPickError] = useState<string | null>(null);
  // 이미지 선택·해제마다 번호를 올린다. 늦게 끝난 이전 선택은 번호가 달라 결과를 반영하지 않는다.
  const pickSeq = useRef(0);
  useEffect(
    () => () => {
      pickSeq.current += 1;
    },
    [],
  );
  const label = `프로필 ${index + 1}`;
  const usesUserName = isUserNamePreset(preset.name);
  const total = presetTotalLength(preset);

  const pickImage = async () => {
    pickSeq.current += 1;
    const seq = pickSeq.current;
    setPickError(null);
    try {
      const image = await onSelectImage();
      if (seq !== pickSeq.current || image === undefined) return;
      onApplyImage(image);
    } catch {
      if (seq !== pickSeq.current) return;
      setPickError('이미지를 불러오지 못했어요. 다시 시도해 주세요.');
    }
  };

  const clearImage = () => {
    pickSeq.current += 1;
    setPickError(null);
    onApplyImage(null);
  };

  const lifted = drag.draggingKey === preset.key;

  return (
    <Animated.View
      testID={`preset-item-${preset.key}`}
      onLayout={(e) => drag.setHeight(preset.key, e.nativeEvent.layout.height)}
      style={[
        styles.item,
        { backgroundColor: c.surface, borderColor: c.border },
        { transform: [{ translateY: drag.offsetOf(preset.key) }, { scale: lifted ? 1.02 : 1 }] },
        lifted && [styles.lifted, { borderColor: c.accent, shadowColor: c.text }],
      ]}
    >
      <View style={styles.itemHeader}>
        <View style={styles.titleRow}>
          {/* 전용 손잡이: 길게 누른 뒤 위아래로 끈다. 제스처는 여기에만 붙는다. */}
          <View
            testID={`preset-drag-handle-${preset.key}`}
            {...drag.responderOf(preset.key).panHandlers}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`${label} 순서 손잡이(길게 눌러 끌기)`}
            accessibilityState={{ disabled: !editable }}
            accessibilityActions={[
              { name: 'decrement', label: '위로 이동' },
              { name: 'increment', label: '아래로 이동' },
            ]}
            onAccessibilityAction={(e) => {
              const target = e.nativeEvent.actionName === 'decrement' ? prevKey : nextKey;
              if (editable && target !== undefined) onMoveTo(preset.key, target);
            }}
            style={[styles.handle, !editable && styles.handleDisabled]}
          >
            <Text variant="subheading" color={lifted ? 'accent' : 'textSecondary'}>
              ≡
            </Text>
          </View>
          <Text variant="subheading" color={lifted ? 'accent' : 'text'}>
            {label}
          </Text>
        </View>
        <View style={styles.actions}>
          <Button
            label={`${label} 위로 이동`}
            variant="secondary"
            onPress={() => onMove(-1)}
            disabled={!editable || index === 0}
          />
          <Button
            label={`${label} 아래로 이동`}
            variant="secondary"
            onPress={() => onMove(1)}
            disabled={!editable || last}
          />
          <Button label={`${label} 삭제`} variant="danger" onPress={onRemove} disabled={!editable} />
        </View>
      </View>
      {canSelectImage ? (
        <View style={styles.photoRow}>
          <PhotoSlot uri={preset.photoUrl} accessibilityLabel={`${label} 이미지 미리보기`} />
          <View style={styles.actions}>
            <Button label={`${label} 이미지 선택`} variant="secondary" onPress={pickImage} disabled={!editable} />
            <Button
              label={`${label} 이미지 해제`}
              variant="secondary"
              onPress={clearImage}
              disabled={!editable || preset.imageId === null}
            />
          </View>
        </View>
      ) : null}
      {pickError ? <Text variant="error">{pickError}</Text> : null}
      {imageError ? <Text variant="error">{imageError}</Text> : null}
      <FormField label="이름 *" error={nameError}>
        <Button
          label={`${label} 플레이하는 유저 이름 사용하기`}
          variant={usesUserName ? 'primary' : 'secondary'}
          onPress={onToggleUserName}
          disabled={!editable}
          accessibilityState={{ selected: usesUserName, disabled: !editable }}
        />
        <TextField
          value={preset.name}
          onChangeText={onName}
          invalid={!!nameError}
          editable={editable && !usesUserName}
          accessibilityLabel={`${label} 이름`}
        />
      </FormField>
      <FormField label="상세" error={textError} hint={`${USER_NAME_PLACEHOLDER}는 바꾸지 않고 그대로 저장돼요.`}>
        <TextArea
          value={preset.detail}
          onChangeText={onDetail}
          invalid={!!textError}
          editable={editable}
          showCount={false}
          accessibilityLabel={`${label} 상세`}
        />
        <Text variant="caption" color={textError ? 'danger' : 'textSecondary'}>
          {total} / {MAX_PRESET_TEXT_LENGTH}자
        </Text>
      </FormField>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  list: { gap: ITEM_GAP },
  item: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  // 들고 있는 카드는 다른 카드 위에 떠 보이게 한다(웹 zIndex, 안드로이드 elevation, iOS 그림자)
  lifted: {
    zIndex: 10,
    elevation: 8,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  itemHeader: { gap: Spacing.two },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  handle: { minWidth: MinTouchSize, minHeight: MinTouchSize, alignItems: 'center', justifyContent: 'center' },
  handleDisabled: { opacity: 0.3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});
