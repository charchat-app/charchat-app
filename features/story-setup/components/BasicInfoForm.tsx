import { StyleSheet, View } from 'react-native';

import { FormField, Section, TextArea, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { FieldIssue } from '@/lib/api-client';

import type { BasicInfoValues } from '../types';

export type BasicInfoFormProps = {
  values: BasicInfoValues;
  onChange: (values: BasicInfoValues) => void;
  /** 서버가 알려 준 완성 저장 조건 위반. field는 title·subtitle·world. */
  issues?: FieldIssue[];
  editable?: boolean;
};

/**
 * 기본 설정 탭: 제목·한 줄 소개·세계관·해시태그 (CREATE-US-01).
 * 입력을 막거나 자르지 않고, 필수 항목 안내는 저장 후 서버 판정(issues)으로 표시한다 (AC02).
 * 캐릭터·스토리 이미지 영역은 각 피처(characters, CREATE-US-06)에서 추가한다.
 */
export function BasicInfoForm({ values, onChange, issues = [], editable = true }: BasicInfoFormProps) {
  const errorOf = (field: keyof BasicInfoValues) => issues.find((i) => i.field === field)?.message;
  const set = (field: keyof BasicInfoValues) => (text: string) => onChange({ ...values, [field]: text });

  return (
    <Section title="이야기의 시작" description="세계관과 그 안에 등장할 인물을 정해 주세요." first>
      <FormField label="제목 *" error={errorOf('title')}>
        <TextField
          value={values.title}
          onChangeText={set('title')}
          invalid={!!errorOf('title')}
          editable={editable}
          accessibilityLabel="제목"
        />
      </FormField>
      <FormField label="한 줄 소개 *" error={errorOf('subtitle')}>
        <TextField
          value={values.subtitle}
          onChangeText={set('subtitle')}
          invalid={!!errorOf('subtitle')}
          editable={editable}
          accessibilityLabel="한 줄 소개"
        />
      </FormField>
      <FormField label="세계관 · 서사 *" error={errorOf('world')}>
        <TextArea
          value={values.world}
          onChangeText={set('world')}
          invalid={!!errorOf('world')}
          editable={editable}
          showCount={false}
          accessibilityLabel="세계관 · 서사"
        />
      </FormField>
      <View style={styles.tags}>
        <FormField label="해시태그 · 선택" hint="검색·노출·대화에 활용되니 입력을 권장해요. 쉼표로 구분해 주세요.">
          <TextField
            value={values.tagsText}
            onChangeText={set('tagsText')}
            editable={editable}
            placeholder="로맨스, 일상처럼 쉼표로 구분"
            accessibilityLabel="해시태그"
          />
        </FormField>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  tags: { marginTop: Spacing.one },
});
