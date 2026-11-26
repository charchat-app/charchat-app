import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, CreationIcon, FormField, Section, Text, TextArea, TextField } from '@/components/ui';
import { MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import {
  addCharacter,
  basicTextLength,
  MAX_BASIC_TEXT_LENGTH,
  MAX_CHARACTERS,
  removeCharacter,
  updateCharacter,
} from '../basicInfo';
import type { StoryImagesValues } from '../images';
import { moveCharacter } from '../reorder';
import type { BasicInfoValues, CharacterValues } from '../types';
import { DraggableItem } from './DraggableItem';
import { CharacterImagesEditor, type CharacterImagesEditorProps } from './StoryImagesEditor';
import { useDragList } from './useDragList';
import { TagInput } from './TagInput';

/** 목업 v15 .item margin 13px 0 → 캐릭터 카드 사이 13px, .item padding 15px, .section 세로 패딩 18px */
const ITEM_GAP = 13;
const ITEM_PADDING = 15;
const SECTION_PADDING_VERTICAL = 18;

export type BasicInfoFormProps = {
  values: BasicInfoValues;
  /**
   * 입력 변경. 화면에 그려진 시점의 값으로 덮어쓰지 않도록 항상 "이전 값 → 새 값" 함수로 전달한다.
   * 저장 응답이 붙인 캐릭터 id 같은 비동기 변경이 같은 순간의 입력에 지워지지 않게 하기 위해서다.
   */
  onChange: (update: (values: BasicInfoValues) => BasicInfoValues) => void;
  /**
   * 위치별 안내 문구. key는 'title' | 'subtitle' | 'world' | 'characters' |
   * 'tags' | 'basic_text' | '<캐릭터 key>.name' | '<캐릭터 key>.detail'.
   */
  errors?: Record<string, string>;
  editable?: boolean;
  /** 캐릭터를 끄는 중이면 true. 바깥 스크롤을 멈춰 드래그와 페이지 스크롤이 겹치지 않게 한다. */
  onDragActiveChange?: (active: boolean) => void;
  /**
   * CREATE-US-12 목업 v15: 스토리 정보 카드와 등장 캐릭터 카드 사이에 둘 「스토리 사진」 카드.
   * 저장·업로드 상태는 호스트(story-publish)가 맡으므로 다 만든 요소를 받는다.
   */
  storyPhotos?: ReactNode;
  /** CREATE-US-12 목업 v15: 캐릭터 카드마다 이름·상세 위에 그 캐릭터의 얼굴 사진을 둔다(CREATE-US-06 규칙 그대로). */
  characterPhotos?: CharacterPhotosProps;
  /**
   * true면 캐릭터 삭제 버튼만 막는다(다른 입력은 그대로). 캐릭터 카드를 지우면 그 안의 사진 편집기가 언마운트되므로,
   * 호스트가 사진 업로드·성패를 모르는 사진 저장이 남아 있는 동안 켠다.
   */
  removeCharacterDisabled?: boolean;
};

export type CharacterPhotosProps = Pick<
  CharacterImagesEditorProps,
  'onChange' | 'disabled' | 'onDragActiveChange' | 'onUploadActiveChange'
> & {
  /** 사진 목록. null이면 아직 불러오는 중이다. */
  values: StoryImagesValues | null;
  /** 불러오지 못했을 때의 안내(다시 시도는 스토리 사진 카드가 맡는다) */
  error?: string | null;
  /**
   * 캐릭터 행 → values.characters의 characterId. null이면 아직 사진을 붙일 수 없는 캐릭터다
   * (미등록 스토리의 새 캐릭터: 먼저 저장해야 한다).
   */
  photoIdOf: (character: CharacterValues) => string | null;
};

/**
 * 기본 설정 탭: 제목·한 줄 소개·세계관·해시태그와 등장 캐릭터 (CREATE-US-01).
 * 입력을 막거나 자르지 않고, 필수·인원·이름 규칙 안내는 저장 후 서버 판정으로 표시한다.
 * 합산 3000자(AC09)는 입력 중에도 표시하고, 캐릭터 순서는 카드 머리를 길게 눌러 끌어 바꾼다(AC14).
 * 화면 읽기 기능에서는 카드 머리의 접근성 동작(위로/아래로)으로 한 칸씩 옮긴다.
 * 스토리·캐릭터 사진은 CREATE-US-06에서 추가한다.
 */
export function BasicInfoForm({
  values,
  onChange,
  errors = {},
  editable = true,
  onDragActiveChange,
  storyPhotos,
  characterPhotos,
  removeCharacterDisabled = false,
}: BasicInfoFormProps) {
  const set = (field: 'title' | 'subtitle' | 'world') => (text: string) => onChange((v) => ({ ...v, [field]: text }));
  const c = useTheme();
  const full = values.characters.length >= MAX_CHARACTERS;
  const total = basicTextLength(values);
  const over = total > MAX_BASIC_TEXT_LENGTH;
  const keys = values.characters.map((ch) => ch.key);
  const move = (from: string, to: string) => onChange((v) => moveCharacter(v, from, to));
  // 캐릭터 카드 사이 간격(styles.items의 gap)과 같아야 비켜나는 거리가 맞는다.
  const drag = useDragList({ keys, gap: ITEM_GAP, disabled: !editable, onMove: move, onDragActiveChange });

  return (
    <>
      <Section title="이야기의 시작" description="세계관과 그 안에 등장할 인물을 정해 주세요." first card>
        <FormField label="제목 *" error={errors.title}>
          <TextField
            value={values.title}
            onChangeText={set('title')}
            invalid={!!errors.title}
            editable={editable}
            accessibilityLabel="제목"
          />
        </FormField>
        <FormField label="한 줄 소개 *" error={errors.subtitle}>
          <TextField
            value={values.subtitle}
            onChangeText={set('subtitle')}
            invalid={!!errors.subtitle}
            editable={editable}
            accessibilityLabel="한 줄 소개"
          />
        </FormField>
        <FormField label="세계관 · 서사 *" error={errors.world}>
          <TextArea
            value={values.world}
            onChangeText={set('world')}
            invalid={!!errors.world}
            editable={editable}
            showCount={false}
            accessibilityLabel="세계관 · 서사"
          />
        </FormField>
        <View style={styles.total} accessibilityLiveRegion="polite">
          <Text variant="caption" color={over ? 'danger' : 'textSecondary'}>
            {total.toLocaleString()} / {MAX_BASIC_TEXT_LENGTH.toLocaleString()}자 · 제목·소개·세계관·캐릭터 합계
          </Text>
          {over ? (
            <Text variant="error">
              {(total - MAX_BASIC_TEXT_LENGTH).toLocaleString()}자 넘었어요. 임시 저장은 되지만, 공개·비공개 저장 전에
              줄여 주세요.
            </Text>
          ) : null}
          {errors.basic_text && !over ? <Text variant="error">{errors.basic_text}</Text> : null}
        </View>
        <TagInput
          tags={values.tags}
          input={values.tagInput}
          onChange={onChange}
          error={errors.tags}
          editable={editable}
        />
      </Section>

      {storyPhotos}

      {/* 목업 v15 basic() 세 번째 .section: 머리 줄(.links)에 h3 「등장 캐릭터」와 인원 */}
      <View style={[styles.section, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
        <View style={styles.sectionHead}>
          <Text variant="subheading" accessibilityRole="header">
            등장 캐릭터
          </Text>
          <Text variant="caption" color={errors.characters ? 'danger' : 'textSecondary'}>
            {values.characters.length}/{MAX_CHARACTERS}명
          </Text>
        </View>
        {errors.characters ? <Text variant="error">{errors.characters}</Text> : null}
        {values.characters.length > 1 ? (
          <Text variant="caption">카드 왼쪽 위 점 손잡이를 길게 누른 채 끌어 순서를 바꿀 수 있어요.</Text>
        ) : null}
        <View style={styles.items}>
          {values.characters.map((character, index) => (
            <DraggableItem
              key={character.key}
              itemKey={character.key}
              index={index}
              keys={keys}
              drag={drag}
              label={`캐릭터 ${index + 1}`}
              disabled={!editable}
              onMove={move}
              style={[styles.item, { backgroundColor: c.surface, borderColor: c.surfaceBorder }]}
              actions={
                <IconButton
                  icon="trash"
                  label={`캐릭터 ${index + 1} 삭제`}
                  onPress={() => onChange((v) => removeCharacter(v, character.key))}
                  disabled={!editable || removeCharacterDisabled}
                />
              }
            >
              {characterPhotos ? <CharacterPhoto character={character} photos={characterPhotos} /> : null}
              <CharacterItem
                index={index}
                character={character}
                errors={errors}
                editable={editable}
                onChange={(patch) => onChange((v) => updateCharacter(v, character.key, patch))}
              />
            </DraggableItem>
          ))}
        </View>
        <Button
          label={full ? `캐릭터는 최대 ${MAX_CHARACTERS}명이에요` : '+ 캐릭터 추가'}
          variant="secondary"
          fullWidth
          onPress={() => onChange(addCharacter)}
          disabled={!editable || full}
        />
      </View>
    </>
  );
}

/** 목업 v15 .item-header svg 21px */
const ICON_SIZE = 21;

/** 목업 v15 .item-header 오른쪽 아이콘 버튼(44px 원형). 목업 svg 아이콘을 옮긴 CreationIcon을 쓴다. */
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
        disabled && styles.dim,
      ]}
    >
      <CreationIcon testID="icon-trash" name={icon} size={ICON_SIZE} color={c.headerIcon} />
    </Pressable>
  );
}

/**
 * 캐릭터 카드 안 얼굴 사진(목업 v15 .character-photo). 사진을 붙일 수 없는 상태면 그 이유만 짧게 보여 준다.
 * 캐릭터 카드는 key로 그려지므로 순서를 바꿔도 진행 중인 업로드는 같은 캐릭터에 남는다.
 */
function CharacterPhoto({ character, photos }: { character: CharacterValues; photos: CharacterPhotosProps }) {
  const id = photos.photoIdOf(character);
  if (id === null) {
    return (
      <Text variant="caption" style={styles.photoNote}>
        사진은 이 캐릭터를 저장한 뒤 추가할 수 있어요.
      </Text>
    );
  }
  if (photos.values === null) {
    return photos.error ? null : (
      <Text variant="caption" style={styles.photoNote}>
        사진 불러오는 중…
      </Text>
    );
  }
  // 사진 목록에 아직 없는 캐릭터(저장 직후 목록을 다시 불러오기 전)는 올려도 붙일 자리가 없어 칸을 열지 않는다.
  if (!photos.values.characters.some((c) => c.characterId === id)) {
    return (
      <Text variant="caption" style={styles.photoNote}>
        사진 목록을 다시 불러오면 사진을 추가할 수 있어요.
      </Text>
    );
  }
  return (
    <View style={styles.photo}>
      <CharacterImagesEditor
        characterId={id}
        values={photos.values}
        onChange={photos.onChange}
        disabled={photos.disabled}
        onDragActiveChange={photos.onDragActiveChange}
        onUploadActiveChange={photos.onUploadActiveChange}
      />
    </View>
  );
}

type CharacterItemProps = {
  index: number;
  character: CharacterValues;
  errors: Record<string, string>;
  editable: boolean;
  onChange: (patch: Partial<Pick<CharacterValues, 'name' | 'detail'>>) => void;
};

/** 캐릭터 한 명의 이름·상세 입력. 순서 손잡이와 삭제 버튼은 감싸는 DraggableItem 머리에 있다. */
function CharacterItem({ index, character, errors, editable, onChange }: CharacterItemProps) {
  const label = `캐릭터 ${index + 1}`;
  const nameError = errors[`${character.key}.name`];
  const detailError = errors[`${character.key}.detail`];

  return (
    <View accessibilityLabel={character.name || label}>
      <FormField label="이름 *" error={nameError} hint="앞뒤 띄어쓰기 없이 입력해요. 이름 안의 띄어쓰기는 괜찮아요.">
        <TextField
          value={character.name}
          onChangeText={(name) => onChange({ name })}
          invalid={!!nameError}
          editable={editable}
          accessibilityLabel={`${label} 이름`}
        />
      </FormField>
      <FormField label="상세 *" error={detailError} hint="성격·외형·배경 등을 자유롭게 적어 주세요.">
        <TextArea
          value={character.detail}
          onChangeText={(detail) => onChange({ detail })}
          invalid={!!detailError}
          editable={editable}
          showCount={false}
          accessibilityLabel={`${label} 상세`}
        />
      </FormField>
    </View>
  );
}

const styles = StyleSheet.create({
  // 목업 v15 .unified-theme .section (Section card와 같은 값): padding 18px 16px, radius 15, 아래 16
  section: {
    borderWidth: 1,
    borderRadius: Radius.section,
    paddingVertical: SECTION_PADDING_VERTICAL,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.three,
    gap: Spacing.two,
  },
  // .links: 양끝 정렬, 아래 13px
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: ITEM_GAP - Spacing.two,
  },
  items: { gap: ITEM_GAP },
  // .item: radius 12, padding 15
  item: {
    borderWidth: 1,
    borderRadius: Radius.item,
    padding: ITEM_PADDING,
  },
  icon: {
    width: MinTouchSize,
    height: MinTouchSize,
    borderRadius: MinTouchSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.3 },
  photo: { marginBottom: Spacing.one },
  photoNote: { marginBottom: Spacing.one },
  // .count: 오른쪽 정렬
  total: { gap: Spacing.half, alignItems: 'flex-end' },
});
