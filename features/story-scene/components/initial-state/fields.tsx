import { FormField, TextField } from '@/components/ui';
import { countRawText } from '@/lib/rawText';
import type { TextInputProps } from 'react-native';

/** 한 줄 입력 + 원문 글자 수. 초과해도 입력을 막거나 자르지 않고 표시만 한다(CREATE-US-04-AC11·12). */
export function LimitedField({
  label,
  accessibilityLabel,
  value,
  onChange,
  limit,
  error,
  hint,
  keyboardType,
  placeholder,
}: {
  label: string;
  accessibilityLabel: string;
  value: string;
  onChange: (value: string) => void;
  limit?: number;
  /** 공개·비공개 저장을 막는 입력 오류. 임시 저장은 가능하다. */
  error?: string | null;
  hint?: string;
  keyboardType?: TextInputProps['keyboardType'];
  placeholder?: string;
}) {
  const length = countRawText(value);
  const over = limit !== undefined && length > limit;
  const count = limit !== undefined ? `${length} / ${limit}자${over ? ` · ${length - limit}자 초과` : ''}` : undefined;
  return (
    <FormField
      label={label}
      error={over ? count : (error ?? undefined)}
      hint={[count, hint].filter(Boolean).join(' · ') || undefined}
    >
      <TextField
        accessibilityLabel={accessibilityLabel}
        value={value}
        onChangeText={onChange}
        invalid={over || !!error}
        keyboardType={keyboardType}
        placeholder={placeholder}
      />
    </FormField>
  );
}
