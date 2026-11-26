// CREATE-US-05 제작자 추천 유저 프로필 프리셋 편집기
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { Button, CreationIcon, FormField, Text, TextArea, TextField } from '@/components/ui';
import { MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ImageCropper, ServerImage, useImageUpload, type MediaImage } from '@/shared/media';
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
import { DragGripDots, webDragHandle } from './DragGrip';
import { useDragList, type DragList } from './useDragList';

/** 카드 사이 간격. 끌어 놓을 자리 계산에도 같은 값을 쓴다. */
const ITEM_GAP = Spacing.three;
/** 유저 프로필 이미지 미리보기(1:1) 한 변. PhotoSlot 기본 너비(목업 78px)와 같다. */
const PHOTO_SIZE = 78;
/** 목업 v15 .item padding 15px, label.check 체크 상자 18px */
const ITEM_PADDING = 15;
const CHECK_SIZE = 18;
/** 목업 v15 .item-header svg 21px */
const ICON_SIZE = 21;

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
   * 취소하면 undefined를 돌려준다. 이 경로에서는 업로드를 하지 않는다.
   * onSelectImage도 uploadImages도 없으면 이미지 버튼을 만들지 않는다.
   */
  onSelectImage?: (key: string) => Promise<PresetImageChoice | null | undefined>;
  /**
   * true면 이 컴포넌트가 직접 이미지를 올린다(AC03): 앨범에서 고르기 → 1:1 자르기 → 유저 프로필(profile) 대상 업로드.
   * 업로드가 끝나면 서버 imageId와 표시 주소를 그 프리셋에 지정한다. 취소·실패하면 기존 이미지를 그대로 둔다.
   * onSelectImage를 함께 넘기면 onSelectImage가 우선한다. 기본값은 false(업로드하지 않음).
   */
  uploadImages?: boolean;
  editable?: boolean;
  /**
   * 끌기 시작(true)·끝(false) 알림. 바깥 스크롤을 감싼 호스트가 끄는 동안 스크롤을 멈출 때 쓴다(선택).
   * 캐릭터 목록 등 다른 목록의 끌기와는 상태를 공유하지 않는다.
   */
  onDragActiveChange?: (active: boolean) => void;
  /**
   * 업로드 모드에서 카드별 이미지 업로드(자르기·올리기)가 시작(true)·끝(false)될 때 알린다.
   * source는 카드마다 고유하다. 카드가 사라지면 false로 알린다. 호스트가 저장·탭 이동을 막을 때 쓴다(선택).
   */
  onUploadActiveChange?: (source: string, active: boolean) => void;
};

/**
 * 프리셋 목록 편집(추가·수정·삭제·순서 변경). 입력을 막거나 자르지 않고 문제는 안내로만 알린다.
 * 문제가 있어도 임시 저장 조각은 presetsToDraftPatch로 만들 수 있고, 완료 여부는 validatePresets가 알려 준다.
 *
 * 순서 변경(AC08):
 * - 카드 머리의 전용 손잡이(점 6개)를 길게 누른 뒤 위아래로 끌어 놓는다. 제목·이름·상세·사진에서는 시작되지 않는다.
 * - 손잡이는 순서를 바꿀 수 있을 때(2개 이상·편집 가능)만 보인다.
 * - 카드 높이가 서로 달라도 실제 높이로 놓을 자리를 계산한다(useDragList).
 * - 끄는 중에 제스처가 취소되거나 제자리에 놓으면 순서는 그대로다.
 * - 끌기가 어려운 경우를 위해 손잡이에 접근성 동작(위로/아래로)을 둔다. 화면에 보이는 이동 버튼은 두지 않는다(CREATE-US-12 목업).
 * - 편집 불가 상태에서는 끌기·접근성 동작 모두 순서를 바꾸지 않는다.
 */
export function UserProfilePresetEditor({
  presets,
  characterNames = [],
  onChange,
  onSelectImage,
  uploadImages = false,
  editable = true,
  onDragActiveChange,
  onUploadActiveChange,
}: UserProfilePresetEditorProps) {
  const imageMode: ImageMode = onSelectImage ? 'select' : uploadImages ? 'upload' : 'none';
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
          drag={drag}
          prevKey={keys[index - 1]}
          nextKey={keys[index + 1]}
          onMoveTo={moveTo}
          preset={preset}
          nameError={errors[`${preset.key}.name`]}
          textError={errors[`${preset.key}.text`]}
          imageError={imageMode !== 'none' ? errors[`${preset.key}.image`] : undefined}
          editable={editable}
          imageMode={imageMode}
          onName={(name) => onChange((v) => updatePreset(v, preset.key, { name }))}
          onDetail={(detail) => onChange((v) => updatePreset(v, preset.key, { detail }))}
          onToggleUserName={() => onChange((v) => toggleUserNamePreset(v, preset.key))}
          onRemove={() => onChange((v) => removePreset(v, preset.key))}
          onSelectImage={async () => onSelectImage?.(preset.key)}
          onApplyImage={(image) => onChange((v) => setPresetImage(v, preset.key, image))}
          onUploadActiveChange={
            onUploadActiveChange ? (active) => onUploadActiveChange(`preset:${preset.key}`, active) : undefined
          }
        />
      ))}
      <Button
        label={full ? `추천 프로필은 최대 ${MAX_USER_PROFILE_PRESETS}개예요` : '+ 추천 프로필 추가'}
        variant="secondary"
        fullWidth
        onPress={() => onChange(addPreset)}
        disabled={!editable || full}
      />
    </View>
  );
}

/** 목업 v15 .item-header 아이콘 버튼(44px 원형). 목업 svg와 같은 모양의 휴지통 아이콘(CreationIcon)을 쓴다. */
function IconButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: 'trash';
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.icon,
        pressed && { backgroundColor: c.backgroundSelected },
        disabled && styles.handleDisabled,
      ]}
    >
      <CreationIcon testID="icon-trash" name={icon} size={ICON_SIZE} color={c.headerIcon} />
    </Pressable>
  );
}

/** 이미지 지정 방식: 호스트가 고르기(select), 직접 업로드(upload), 이미지 칸 없음(none) */
type ImageMode = 'select' | 'upload' | 'none';

type PresetItemProps = {
  index: number;
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
  imageMode: ImageMode;
  onName: (name: string) => void;
  onDetail: (detail: string) => void;
  onToggleUserName: () => void;
  onRemove: () => void;
  /** 호스트의 이미지 고르기. 결과 반영은 onApplyImage로 따로 한다. */
  onSelectImage: () => Promise<PresetImageChoice | null | undefined>;
  /** 이미지 지정(null이면 해제) */
  onApplyImage: (image: PresetImageChoice | null) => void;
  /** 이 카드의 업로드 진행 여부 알림 */
  onUploadActiveChange?: (active: boolean) => void;
};

function PresetItem({
  index,
  drag,
  prevKey,
  nextKey,
  onMoveTo,
  preset,
  nameError,
  textError,
  imageError,
  editable,
  imageMode,
  onName,
  onDetail,
  onToggleUserName,
  onRemove,
  onSelectImage,
  onApplyImage,
  onUploadActiveChange,
}: PresetItemProps) {
  const c = useTheme();
  const [pickError, setPickError] = useState<string | null>(null);
  // 이미지 선택·업로드 시작·해제·카드 제거(언마운트)마다 번호를 올린다.
  // 늦게 끝난 이전 선택·업로드는 번호가 달라 결과를 반영하지 않는다.
  const pickSeq = useRef(0);
  /** 진행 중인 업로드가 시작될 때의 번호. 업로드 결과는 이 번호가 아직 최신일 때만 반영한다. */
  const uploadSeq = useRef(-1);
  useEffect(
    () => () => {
      pickSeq.current += 1;
    },
    [],
  );
  // 업로드 모드: 카드마다 업로드 흐름을 따로 둔다. 카드는 프리셋 key로 그려지므로 순서가 바뀌어도
  // 이 흐름은 처음 고른 프리셋에 남고, 결과는 key 기준으로 그 프리셋에만 붙는다.
  const upload = useImageUpload({
    target: 'profile',
    onActiveChange: imageMode === 'upload' ? onUploadActiveChange : undefined,
    onUploaded: (image: MediaImage) => {
      if (uploadSeq.current !== pickSeq.current) return;
      onApplyImage({ imageId: image.imageId, photoUrl: image.uri });
    },
  });
  const label = `프로필 ${index + 1}`;
  const usesUserName = isUserNamePreset(preset.name);
  const total = presetTotalLength(preset);
  const uploading = imageMode === 'upload' && (upload.busy || upload.crop !== null);

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

  const uploadImage = () => {
    if (!editable || uploading) return;
    pickSeq.current += 1;
    uploadSeq.current = pickSeq.current;
    void upload.pick();
  };

  // 자르기 확인은 고르기 때 받은 번호를 그대로 쓴다. 새 번호를 주면 자르기 창이 열린 사이의 해제가 무효가 된다.
  // 고른 뒤 해제·새 선택이 있었으면 그 선택은 이미 낡았으므로 올리지 않고 자르기 창만 닫는다.
  const confirmCrop = (rect: Parameters<typeof upload.confirmCrop>[0]) => {
    if (uploadSeq.current !== pickSeq.current) {
      upload.cancelCrop();
      return;
    }
    void upload.confirmCrop(rect);
  };

  const lifted = drag.draggingKey === preset.key;
  // 옆에 다른 카드가 있어야(목록 2개 이상) 순서를 바꿀 수 있다
  const reorderable = prevKey !== undefined || nextKey !== undefined;

  return (
    <Animated.View
      testID={`preset-item-${preset.key}`}
      onLayout={(e) => drag.setHeight(preset.key, e.nativeEvent.layout.height)}
      style={[
        styles.item,
        { backgroundColor: c.surface, borderColor: c.surfaceBorder },
        { transform: [{ translateY: drag.offsetOf(preset.key) }, { scale: lifted ? 1.02 : 1 }] },
        lifted && [styles.lifted, { borderColor: c.accent, shadowColor: c.text }],
      ]}
    >
      {/* 목업 v15 .item-header: 왼쪽 「프로필 n」, 오른쪽 삭제 버튼. 손잡이는 실제 순서 변경(AC08)이라 남긴다. */}
      <View style={styles.itemHeader}>
        <View style={styles.titleRow}>
          {/* 전용 손잡이(점 6개): 길게 누른 뒤 위아래로 끈다. 제스처는 여기에만 붙는다.
              순서를 바꿀 수 있을 때(2개 이상)만 그리고, 편집 불가 동안은 자리만 두고 감춘다. */}
          {reorderable ? (
            <View
              testID={`preset-drag-handle-${preset.key}`}
              // 웹은 Pointer Events, 네이티브는 PanResponder. 한쪽만 붙인다.
              ref={drag.pointerRefOf(preset.key)}
              {...(drag.pointerRefOf(preset.key) ? null : drag.responderOf(preset.key).panHandlers)}
              accessible={editable}
              accessibilityElementsHidden={!editable}
              importantForAccessibility={editable ? 'auto' : 'no-hide-descendants'}
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
              style={[styles.handle, webDragHandle, !editable && styles.handleHidden]}
            >
              <DragGripDots testID={`preset-drag-grip-${preset.key}`} color={lifted ? c.accent : c.headerIcon} />
            </View>
          ) : null}
          <Text variant="subheading" color={lifted ? 'accent' : 'text'} style={styles.title}>
            {label}
          </Text>
          <IconButton icon="trash" label={`${label} 삭제`} onPress={onRemove} disabled={!editable} />
        </View>
      </View>
      {imageMode !== 'none' ? (
        // 목업 v15 photosUI(최대 1장): 78px 사진 칸(비었으면 +) → 「프로필 사진 · n/1장」.
        // 칸 하나가 추가·교체를 모두 맡는다. 비었으면 고르고, 사진이 있으면 새로 고른 사진으로 바꾼다(별도 해제 버튼 없음).
        <View style={styles.photoBlock}>
          <View style={styles.photoRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${label} 이미지 선택`}
              accessibilityHint={preset.photoUrl ? '누르면 새 사진으로 바꿔요' : '누르면 사진을 골라요'}
              accessibilityState={{ disabled: !editable || uploading }}
              disabled={!editable || uploading}
              onPress={imageMode === 'select' ? pickImage : uploadImage}
              style={[
                styles.photo,
                { backgroundColor: c.placeholderBackground, borderColor: c.placeholderBorder },
                preset.photoUrl ? [styles.photoFilled, { borderColor: c.accentText }] : styles.photoEmpty,
              ]}
            >
              {preset.photoUrl ? (
                // 서버 이미지는 소유자만 볼 수 있어 인증을 붙여 불러오는 ServerImage로 보여 준다
                <ServerImage
                  testID={`preset-photo-${preset.key}`}
                  uri={preset.photoUrl}
                  resizeMode="cover"
                  style={styles.photoImage}
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <Text variant="subheading" color="avatarText">
                  +
                </Text>
              )}
            </Pressable>
          </View>
          <Text variant="caption">{`프로필 사진 · ${preset.imageId === null ? 0 : 1}/1장`}</Text>
        </View>
      ) : null}
      {imageMode === 'upload' && upload.busy && upload.crop === null ? (
        <Text variant="caption">이미지를 올리는 중…</Text>
      ) : null}
      {imageMode === 'upload' && upload.error ? (
        <Text variant="error">{`${label} 이미지: ${upload.error}`}</Text>
      ) : null}
      {imageMode === 'upload' && upload.crop ? (
        <ImageCropper
          uri={upload.crop.uri}
          imageSize={upload.crop.imageSize}
          target="profile"
          busy={upload.busy}
          onCancel={upload.cancelCrop}
          onConfirm={confirmCrop}
        />
      ) : null}
      {pickError ? <Text variant="error">{pickError}</Text> : null}
      {imageError ? <Text variant="error">{imageError}</Text> : null}
      {/* 목업 v15 label.check: 18px 체크 상자 + 「플레이하는 유저 이름 사용하기」 */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} 플레이하는 유저 이름 사용하기`}
        accessibilityState={{ selected: usesUserName, disabled: !editable }}
        disabled={!editable}
        onPress={onToggleUserName}
        style={[styles.check, !editable && styles.handleDisabled]}
      >
        <View
          style={[
            styles.checkBox,
            { borderColor: c.inputBorder, backgroundColor: c.inputSurface },
            usesUserName && { backgroundColor: c.accent, borderColor: c.accent },
          ]}
        >
          {usesUserName ? (
            <Text variant="caption" color="onAccent">
              ✓
            </Text>
          ) : null}
        </View>
        <Text variant="body">플레이하는 유저 이름 사용하기</Text>
      </Pressable>
      <FormField label="이름 *" error={nameError}>
        <TextField
          value={preset.name}
          onChangeText={onName}
          invalid={!!nameError}
          editable={editable && !usesUserName}
          accessibilityLabel={`${label} 이름`}
        />
      </FormField>
      <FormField label="상세 · 선택" error={textError} hint={`${USER_NAME_PLACEHOLDER}는 바꾸지 않고 그대로 저장돼요.`}>
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
  // 목업 v15 .item: radius 12, padding 15
  item: {
    borderWidth: 1,
    borderRadius: Radius.item,
    padding: ITEM_PADDING,
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  title: { flex: 1 },
  handle: { minWidth: MinTouchSize, minHeight: MinTouchSize, alignItems: 'center', justifyContent: 'center' },
  handleDisabled: { opacity: 0.3 },
  // 순서를 바꿀 수 없는 동안(편집 불가)은 손잡이를 감춘다. 자리는 남겨 머리 줄이 움직이지 않는다.
  handleHidden: { opacity: 0 },
  icon: {
    width: MinTouchSize,
    height: MinTouchSize,
    borderRadius: MinTouchSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBlock: { gap: Spacing.two },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  // 목업 v15 .upload: 78px, 둥근 10px, 비었으면 점선 테두리 / 사진은 첫 사진 강조 테두리 2px
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderWidth: 1,
    borderRadius: Radius.control,
    overflow: 'hidden',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmpty: { borderStyle: 'dashed' },
  photoFilled: { borderWidth: 2 },
  check: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: MinTouchSize },
  checkBox: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderWidth: 1,
    borderRadius: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoImage: { width: '100%', height: '100%' },
});
