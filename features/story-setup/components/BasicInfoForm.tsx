import { StyleSheet, View } from 'react-native';

import { Button, FormField, Section, Text, TextArea, TextField } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { addCharacter, MAX_CHARACTERS, removeCharacter, updateCharacter } from '../basicInfo';
import type { BasicInfoValues, CharacterValues } from '../types';

export type BasicInfoFormProps = {
  values: BasicInfoValues;
  onChange: (values: BasicInfoValues) => void;
  /** toFieldErrors()로 만든 위치별 안내 문구 */
  errors?: Record<string, string>;
  editable?: boolean;
};

/**
 * 기본 설정 탭: 제목·한 줄 소개·세계관·해시태그와 등장 캐릭터 (CREATE-US-01).
 * 입력을 막거나 자르지 않고, 필수·인원·이름 규칙 안내는 저장 후 서버 판정으로 표시한다.
 * 스토리·캐릭터 사진은 CREATE-US-06, 캐릭터 순서 변경은 limits-order 피처에서 추가한다.
 */
export function BasicInfoForm({ values, onChange, errors = {}, editable = true }: BasicInfoFormProps) {
  const set = (field: 'title' | 'subtitle' | 'world' | 'tagsText') => (text: string) =>
    onChange({ ...values, [field]: text });
  const full = values.characters.length >= MAX_CHARACTERS;

  return (
    <>
      <Section title="이야기의 시작" description="세계관과 그 안에 등장할 인물을 정해 주세요." first>
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
        <FormField label="해시태그 · 선택" hint="검색·노출·대화에 활용되니 입력을 권장해요. 쉼표로 구분해 주세요.">
          <TextField
            value={values.tagsText}
            onChangeText={set('tagsText')}
            editable={editable}
            placeholder="로맨스, 일상처럼 쉼표로 구분"
            accessibilityLabel="해시태그"
          />
        </FormField>
      </Section>

      <Section title="등장 캐릭터" description="이야기에 등장할 인물을 1~10명 등록해 주세요.">
        <Text variant="caption" color={errors.characters ? 'danger' : 'textSecondary'}>
          {values.characters.length}/{MAX_CHARACTERS}명
        </Text>
        {errors.characters ? <Text variant="error">{errors.characters}</Text> : null}
        {values.characters.map((character, index) => (
          <CharacterItem
            key={character.key}
            index={index}
            character={character}
            errors={errors}
            editable={editable}
            onChange={(patch) => onChange(updateCharacter(values, character.key, patch))}
            onRemove={() => onChange(removeCharacter(values, character.key))}
          />
        ))}
        <Button
          label={full ? `캐릭터는 최대 ${MAX_CHARACTERS}명이에요` : '+ 캐릭터 추가'}
          variant="secondary"
          onPress={() => onChange(addCharacter(values))}
          disabled={!editable || full}
        />
      </Section>
    </>
  );
}

type CharacterItemProps = {
  index: number;
  character: CharacterValues;
  errors: Record<string, string>;
  editable: boolean;
  onChange: (patch: Partial<Pick<CharacterValues, 'name' | 'detail'>>) => void;
  onRemove: () => void;
};

function CharacterItem({ index, character, errors, editable, onChange, onRemove }: CharacterItemProps) {
  const c = useTheme();
  const label = `캐릭터 ${index + 1}`;
  const nameError = errors[`${character.key}.name`];
  const detailError = errors[`${character.key}.detail`];

  return (
    <View
      style={[styles.item, { backgroundColor: c.surface, borderColor: c.border }]}
      accessibilityLabel={character.name || label}
    >
      <View style={styles.itemHeader}>
        <Text variant="subheading">{label}</Text>
        <Button label="삭제" variant="danger" onPress={onRemove} disabled={!editable} />
      </View>
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
  item: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
