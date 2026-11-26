import { useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Notice, PhotoSlot, Text } from '@/components/ui';
import { MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  ImageCropper,
  MAX_IMAGES,
  ServerImage,
  isGif,
  useImageUpload,
  type ImageTarget,
  type MediaImage,
} from '@/shared/media';

import {
  addImage,
  charactersMissingImages,
  coverOf,
  listOf,
  moveImage,
  removeImage,
  replaceImage,
  updateList,
  type ImageListKey,
  type StoryImagesValues,
} from '../images';
import { DragGripDots, webDragHandle } from './DragGrip';
import { usePhotoReorder, type PhotoReorder } from './usePhotoReorder';

/** 사진 칸 너비(PhotoSlot 기본값과 같음)와 칸 사이 간격 */
const PHOTO_WIDTH = 78;
const PHOTO_GAP = Spacing.two;
/** 사진 손잡이 칩 한 변(보이는 크기). 누르는 범위는 GRIP_HIT_SLOP만큼 넓혀 최소 터치 크기(44)를 맞춘다. */
const GRIP_SIZE = 24;
const GRIP_HIT_SLOP = (MinTouchSize - GRIP_SIZE) / 2;

export type StoryImagesEditorProps = {
  values: StoryImagesValues;
  onChange: (update: (values: StoryImagesValues) => StoryImagesValues) => void;
  /** 저장 중에는 편집을 막는다 */
  disabled?: boolean;
  /** 아직 저장하지 않아 id가 없는 캐릭터 이름. 저장 후에 이미지를 붙일 수 있다. */
  unsavedCharacterNames?: string[];
  /** 사진을 끄는 동안 바깥 화면 스크롤을 멈추게 알린다 */
  onDragActiveChange?: (active: boolean) => void;
  /**
   * 사진 칸별 업로드(고르기·자르기·업로드) 진행 알림. source는 칸마다 고유하다(`story`, `character:<id>`).
   * 호스트가 진행 중인 업로드가 끝날 때까지 저장을 막는 데 쓴다(선택).
   */
  onUploadActiveChange?: (source: string, active: boolean) => void;
  /**
   * CREATE-US-12 목업 v15: false면 캐릭터 사진 줄을 그리지 않는다(표지·스토리 사진과 안내만).
   * 캐릭터 사진은 호스트가 캐릭터 카드 안에 CharacterImagesEditor로 그린다. 기본값 true(지금 배치).
   */
  includeCharacters?: boolean;
};

export type CharacterImagesEditorProps = Pick<
  StoryImagesEditorProps,
  'values' | 'onChange' | 'disabled' | 'onDragActiveChange' | 'onUploadActiveChange'
> & {
  /** values.characters의 characterId. 목록에 없으면 빈 목록으로 보인다. */
  characterId: string;
  /** 「{이름} 이미지」 제목을 보일지. 캐릭터 카드 안에서는 카드 머리가 제목을 맡아 기본값 false. */
  showHeading?: boolean;
};

/**
 * CREATE-US-12 목업 v15 .character-photo: 캐릭터 카드 안(이름·상세 위)에 두는 한 캐릭터의 얼굴 사진 줄.
 * 업로드·자르기·순서·교체·삭제 규칙은 StoryImagesEditor의 캐릭터 줄과 같다(CREATE-US-06).
 * onUploadActiveChange의 source는 `character:<characterId>`로 StoryImagesEditor와 같다.
 */
export function CharacterImagesEditor({
  values,
  characterId,
  onChange,
  disabled = false,
  onDragActiveChange,
  onUploadActiveChange,
  showHeading = false,
}: CharacterImagesEditorProps) {
  const character = values.characters.find((c) => c.characterId === characterId);
  return (
    <ImageStrip
      title={`${character?.name || '이름 없는 캐릭터'} 이미지`}
      heading={showHeading ? `${character?.name || '이름 없는 캐릭터'} 이미지` : undefined}
      kind="캐릭터 사진"
      hint="1~5장 필수 · 1:1 · 첫 사진이 대표 얼굴"
      target="character"
      listKey={{ kind: 'character', characterId }}
      values={values}
      onChange={onChange}
      disabled={disabled}
      onDragActiveChange={onDragActiveChange}
      onUploadActiveChange={
        onUploadActiveChange ? (active) => onUploadActiveChange(`character:${characterId}`, active) : undefined
      }
    />
  );
}

/**
 * 스토리·등장 캐릭터 이미지 편집 (CREATE-US-06).
 * - 스토리: 3:4, 선택 입력, 최대 10장, GIF 허용. 등장 캐릭터: 1:1, 1~5장, GIF 불가.
 * - 사진의 점 손잡이를 길게 눌러 끌면 순서가 바뀐다. 사진을 누르면 앞으로·뒤로·교체·삭제를 고른다.
 *   맨 앞 사진이 표지·대표 얼굴이다(AC06).
 * - 업로드에 실패하면 어느 칸에서 왜 실패했는지 알리고 기존 사진은 그대로 둔다.
 */
export function StoryImagesEditor({
  values,
  onChange,
  disabled = false,
  unsavedCharacterNames = [],
  onDragActiveChange,
  onUploadActiveChange,
  includeCharacters = true,
}: StoryImagesEditorProps) {
  const missing = charactersMissingImages(values);
  return (
    <View style={styles.container}>
      <ImageStrip
        title="스토리 이미지"
        heading="스토리 이미지"
        kind="스토리 이미지"
        hint="선택 입력 · 첫 사진이 표지 · 3:4 · GIF 가능"
        target="story"
        listKey={{ kind: 'story' }}
        values={values}
        onChange={onChange}
        disabled={disabled}
        onDragActiveChange={onDragActiveChange}
        onUploadActiveChange={onUploadActiveChange ? (active) => onUploadActiveChange('story', active) : undefined}
      />
      {/* AC09 표지 미리보기: 목업에는 없지만 대체 표지(캐릭터 첫 사진)를 알리는 실제 규칙이라 사진 줄 아래에 남긴다 */}
      <CoverPreview values={values} />
      {includeCharacters
        ? values.characters.map((c) => (
            <CharacterImagesEditor
              key={c.characterId}
              characterId={c.characterId}
              showHeading
              values={values}
              onChange={onChange}
              disabled={disabled}
              onDragActiveChange={onDragActiveChange}
              onUploadActiveChange={onUploadActiveChange}
            />
          ))
        : null}
      {unsavedCharacterNames.length > 0 ? (
        <Notice message={`${unsavedCharacterNames.join(', ')}: 캐릭터를 먼저 저장하면 이미지를 추가할 수 있어요.`} />
      ) : null}
      {missing.length > 0 ? (
        <Notice
          message={`이미지가 없는 캐릭터: ${missing.map((c) => c.name || '이름 없음').join(', ')}. 임시 저장은 되지만 공개·비공개 저장에는 캐릭터마다 이미지가 1장 이상 필요해요.`}
        />
      ) : null}
    </View>
  );
}

/** AC09: 표지 미리보기. 대체 표지는 자르지 않고 여백을 두어 전체를 보여 준다. */
function CoverPreview({ values }: { values: StoryImagesValues }) {
  const c = useTheme();
  const cover = coverOf(values);
  return (
    <View style={styles.coverRow}>
      <View style={[styles.cover, { backgroundColor: c.placeholderBackground, borderColor: c.placeholderBorder }]}>
        {cover ? (
          <ServerImage
            testID="cover-image"
            uri={cover.image.uri}
            resizeMode={cover.source === 'story' ? 'cover' : 'contain'}
            style={styles.coverImage}
            accessibilityIgnoresInvertColors
          />
        ) : null}
      </View>
      <View style={styles.coverText}>
        <Text variant="subheading">표지</Text>
        <Text variant="caption">
          {cover === null
            ? '스토리 이미지나 캐릭터 이미지를 추가하면 표지로 보여요.'
            : cover.source === 'story'
              ? '스토리 이미지의 첫 번째 사진이 표지예요.'
              : `스토리 이미지가 없어 ${cover.characterName || '첫 번째 캐릭터'}의 첫 사진을 표지로 써요. 스토리 표지 이미지를 따로 설정하는 걸 권장해요.`}
        </Text>
      </View>
    </View>
  );
}

type PendingAction = { kind: 'add' } | { kind: 'replace'; index: number };

function ImageStrip({
  title,
  heading,
  kind,
  hint,
  target,
  listKey,
  values,
  onChange,
  disabled,
  onDragActiveChange,
  onUploadActiveChange,
}: {
  /** 접근성 이름·오류 안내 앞에 붙는 이름 (예: 「하린 이미지」) */
  title: string;
  /** 화면에 보이는 제목(목업 h3). 캐릭터 카드 안에서는 카드 머리가 제목을 맡아 두지 않는다. */
  heading?: string;
  /** 장수 줄 앞말 (목업 「스토리 이미지」·「캐릭터 사진」) */
  kind: string;
  hint: string;
  target: ImageTarget;
  listKey: ImageListKey;
  values: StoryImagesValues;
  onChange: StoryImagesEditorProps['onChange'];
  disabled: boolean;
  onDragActiveChange?: (active: boolean) => void;
  onUploadActiveChange?: (active: boolean) => void;
}) {
  const images = listOf(values, listKey);
  const max = MAX_IMAGES[target];
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingAction>({ kind: 'add' });
  const change = (update: (list: MediaImage[]) => MediaImage[]) => onChange((v) => updateList(v, listKey, update));
  const upload = useImageUpload({
    target,
    onUploaded: (image) =>
      change((list) =>
        pending.kind === 'replace' ? replaceImage(list, pending.index, image) : addImage(list, image, max),
      ),
    onActiveChange: onUploadActiveChange,
  });
  const ratio = target === 'story' ? '3:4' : '1:1';
  const busy = disabled || upload.busy;

  const start = (action: PendingAction) => {
    setPending(action);
    void upload.pick();
  };
  const move = (from: number, to: number) => {
    change((list) => moveImage(list, from, to));
    setSelected(to);
  };
  const keys = images.map((image) => String(image.imageId));
  const reorder = usePhotoReorder({
    keys,
    slot: PHOTO_WIDTH + PHOTO_GAP,
    disabled: busy,
    onMove: (from, to) => {
      change((list) => moveImage(list, from, to));
      setSelected(null);
    },
    onDragActiveChange,
  });
  const labelOf = (image: MediaImage, index: number) =>
    `${title} ${index + 1}번째${index === 0 ? '(대표)' : ''}${isGif(image.mimeType) ? ' GIF' : ''}`;

  return (
    <View style={styles.strip}>
      {/* 목업 v15 photosUI: (스토리만 h3) → 사진 줄 → 「{종류} · n/max장」 → 안내(.hint) */}
      {heading ? (
        <Text variant="subheading" accessibilityRole="header">
          {heading}
        </Text>
      ) : null}
      <ScrollView
        horizontal
        contentContainerStyle={styles.thumbs}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        scrollEnabled={reorder.draggingKey === null}
      >
        {images.map((image, index) => (
          <DraggablePhoto
            key={image.imageId}
            photoKey={String(image.imageId)}
            uri={image.uri}
            ratio={ratio}
            label={labelOf(image, index)}
            first={index === 0}
            selected={selected === index}
            reorder={reorder}
            // 손잡이는 순서를 바꿀 수 있을 때만 보인다: 사진 2장 이상, 편집 가능(올리는 중·저장 중이 아님)
            reorderable={images.length > 1}
            disabled={busy}
            onAction={(action) => {
              if (action === 'activate') setSelected(selected === index ? null : index);
              if (action === 'decrement' && index > 0) move(index, index - 1);
              if (action === 'increment' && index < images.length - 1) move(index, index + 1);
            }}
          />
        ))}
        {images.length < max ? (
          <PhotoSlot
            ratio={ratio}
            onPress={busy ? undefined : () => start({ kind: 'add' })}
            accessibilityLabel={`${title} 추가`}
          />
        ) : null}
      </ScrollView>
      <Text variant="caption">{`${kind} · ${images.length} / ${max}장`}</Text>
      <Text variant="caption">{hint}</Text>
      {selected !== null && selected < images.length ? (
        <View style={styles.actions}>
          <Button
            label="앞으로"
            accessibilityLabel={`${title} ${selected + 1}번째 앞으로`}
            variant="secondary"
            disabled={busy || selected === 0}
            onPress={() => move(selected, selected - 1)}
          />
          <Button
            label="뒤로"
            accessibilityLabel={`${title} ${selected + 1}번째 뒤로`}
            variant="secondary"
            disabled={busy || selected === images.length - 1}
            onPress={() => move(selected, selected + 1)}
          />
          <Button
            label="교체"
            accessibilityLabel={`${title} ${selected + 1}번째 교체`}
            variant="secondary"
            disabled={busy}
            onPress={() => start({ kind: 'replace', index: selected })}
          />
          <Button
            label="삭제"
            accessibilityLabel={`${title} ${selected + 1}번째 삭제`}
            variant="danger"
            disabled={busy}
            onPress={() => {
              change((list) => removeImage(list, selected));
              setSelected(null);
            }}
          />
        </View>
      ) : null}
      {upload.busy && !upload.crop ? <Text variant="caption">올리는 중…</Text> : null}
      {upload.error ? <Notice tone="alert" message={`${title}: ${upload.error}`} /> : null}
      {upload.crop ? (
        <ImageCropper
          uri={upload.crop.uri}
          imageSize={upload.crop.imageSize}
          target={target}
          busy={upload.busy}
          onCancel={upload.cancelCrop}
          onConfirm={(rect) => void upload.confirmCrop(rect)}
        />
      ) : null}
    </View>
  );
}

/**
 * 끌 수 있는 사진 한 장 (CREATE-US-06-AC06, CREATE-US-12).
 * - 사진을 누르면 선택(앞으로·뒤로·교체·삭제 글자 버튼이 열린다). 사진을 누르거나 끌어도 순서 끌기는 시작되지 않는다.
 * - 순서 끌기는 사진 오른쪽 아래의 전용 손잡이(점 6개)를 길게 누른 뒤 끈다. 손잡이는 순서를 바꿀 수 있을 때만 보인다.
 * - 화면 읽기 기능에서는 사진을 두 번 눌러 선택하고, 위·아래로 쓸어 앞으로·뒤로 옮긴다. 손잡이는 화면 읽기에서 숨긴다(같은 동작 중복 방지).
 */
function DraggablePhoto({
  photoKey,
  uri,
  ratio,
  label,
  first,
  selected,
  reorder,
  reorderable,
  disabled,
  onAction,
}: {
  photoKey: string;
  uri: string;
  ratio: '1:1' | '3:4';
  label: string;
  first: boolean;
  selected: boolean;
  reorder: PhotoReorder;
  /** 같은 줄에 사진이 2장 이상이라 순서를 바꿀 수 있는지 */
  reorderable: boolean;
  /** 올리는 중·저장 중이라 순서를 바꿀 수 없는지. 손잡이 자리는 두고 감춘다. */
  disabled: boolean;
  onAction: (action: string) => void;
}) {
  const c = useTheme();
  const lifted = reorder.draggingKey === photoKey;
  const height = ratio === '3:4' ? (PHOTO_WIDTH * 4) / 3 : PHOTO_WIDTH;
  return (
    <Animated.View
      testID={`photo-${photoKey}`}
      style={[
        styles.photo,
        { transform: [{ translateX: reorder.offsetOf(photoKey) }, { scale: lifted ? 1.06 : 1 }] },
        lifted && [styles.lifted, { shadowColor: c.text }],
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="누르면 앞으로·뒤로·교체·삭제를 고를 수 있어요"
        accessibilityState={{ selected }}
        accessibilityActions={[
          { name: 'activate', label: '선택' },
          { name: 'decrement', label: '앞으로' },
          { name: 'increment', label: '뒤로' },
        ]}
        onAccessibilityAction={(e) => onAction(e.nativeEvent.actionName)}
        onPress={() => onAction('activate')}
        style={[
          styles.photoFrame,
          { width: PHOTO_WIDTH, height, backgroundColor: c.placeholderBackground, borderColor: c.placeholderBorder },
          // 목업 v15: 첫 사진(표지·대표 얼굴)은 밝은 파랑 2px 테두리, 고른 사진은 강조색 테두리
          first && [styles.firstFrame, { borderColor: c.accentText }],
          selected && { borderColor: c.accent, borderWidth: 2 },
        ]}
      >
        <ServerImage uri={uri} style={styles.photoImage} accessibilityIgnoresInvertColors />
      </Pressable>
      {reorderable ? (
        // 전용 손잡이: 사진 위에 겹쳐 두는 작은 칩. 끌기 제스처는 여기에만 붙는다.
        <View
          testID={`photo-drag-handle-${photoKey}`}
          {...reorder.responderOf(photoKey).panHandlers}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          hitSlop={GRIP_HIT_SLOP}
          pointerEvents={disabled ? 'none' : 'auto'}
          style={[
            styles.photoGrip,
            { backgroundColor: c.inputSurface, borderColor: c.surfaceBorder },
            webDragHandle,
            disabled && styles.hidden,
          ]}
        >
          <DragGripDots testID={`photo-drag-grip-${photoKey}`} color={lifted ? c.accent : c.headerIcon} />
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.four },
  coverRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  cover: { width: 96, height: 128, borderRadius: Radius.sm, borderWidth: 1, overflow: 'hidden' },
  coverImage: { width: '100%', height: '100%' },
  coverText: { flex: 1, gap: Spacing.one },
  strip: { gap: Spacing.two },
  thumbs: { gap: PHOTO_GAP, alignItems: 'flex-start' },
  photo: { gap: Spacing.half },
  // 목업 v15 .upload: 둥근 10px, 1px 테두리
  photoFrame: { borderRadius: Radius.control, borderWidth: 1, overflow: 'hidden' },
  firstFrame: { borderWidth: 2 },
  photoImage: { width: '100%', height: '100%' },
  // 사진 오른쪽 아래에 겹치는 손잡이 칩
  photoGrip: {
    position: 'absolute',
    right: Spacing.one,
    bottom: Spacing.one,
    width: GRIP_SIZE,
    height: GRIP_SIZE,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 순서를 바꿀 수 없는 동안(올리는 중·저장 중)은 손잡이를 감춘다
  hidden: { opacity: 0 },
  // 들고 있는 사진은 다른 사진 위에 떠 보이게 한다(웹 zIndex, 안드로이드 elevation, iOS 그림자)
  lifted: { zIndex: 10, elevation: 8, shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
