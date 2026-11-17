import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Text, TextField } from '@/components/ui';
import { MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { useTagSuggestions } from '../hooks/useTagSuggestions';
import { addTag, findSameTag, MAX_TAG_LENGTH, MAX_TAGS, removeTag, tagLength, tagProblem } from '../tags';
import type { BasicInfoValues } from '../types';

export type TagInputProps = {
  tags: string[];
  onChange: (update: (values: BasicInfoValues) => BasicInfoValues) => void;
  /** 서버가 알려 준 태그 목록 전체의 안내(예: 개수 초과) */
  error?: string;
  editable?: boolean;
};

/**
 * 해시태그 칩 입력과 자동검색 (CREATE-US-01-AC13·AC15·AC17·AC18).
 * - 입력하면 앞부분이 같은 태그 후보와 공개 스토리 수를 보여 준다. 후보에 없어도 그대로 추가할 수 있다.
 * - 10자·10개를 넘는 태그도 잘라내지 않고 추가해 문제로 표시한다(임시 저장 보존, 완성 저장은 서버가 막음).
 */
export function TagInput({ tags, onChange, error, editable = true }: TagInputProps) {
  const c = useTheme();
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const suggestions = useTagSuggestions(input);

  const commit = (raw: string) => {
    const tag = raw.trim();
    setInput('');
    if (tag === '') return;
    const same = findSameTag(tags, tag);
    if (same !== undefined) {
      setNotice(
        same === tag
          ? `'${tag}'는 이미 추가한 태그예요.`
          : `'${tag}'는 '${same}'와 같은 태그예요. 대소문자와 띄어쓰기는 구분하지 않아요.`,
      );
      return;
    }
    setNotice(null);
    // 같은 입력에서 여러 개를 연달아 추가해도 addTag가 최신 목록 기준으로 중복을 거른다.
    onChange((v) => addTag(v, tag).values);
  };

  // 쉼표를 입력하면 그 앞까지를 태그로 추가한다.
  const onChangeText = (text: string) => {
    if (!text.includes(',')) {
      setInput(text);
      return;
    }
    const parts = text.split(',');
    const rest = parts.pop() ?? '';
    parts.forEach((part) => commit(part));
    setInput(rest);
  };

  const countOver = tags.length > MAX_TAGS;
  const inputLength = tagLength(input.trim());
  const candidates = (suggestions.data ?? []).filter((s) => findSameTag(tags, s.name) === undefined);
  const showSuggestions = editable && input.trim() !== '';
  const problems = tags.map((t) => [t, tagProblem(t)] as const).filter(([, p]) => p !== null);

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text variant="subheading" style={styles.label}>
          해시태그 · 선택
        </Text>
        <Text variant="caption" color={countOver ? 'danger' : 'textSecondary'}>
          {tags.length}/{MAX_TAGS}개
        </Text>
      </View>

      {tags.length > 0 ? (
        <View style={styles.chips} accessibilityRole="list">
          {tags.map((tag) => {
            const bad = tagProblem(tag) !== null;
            return (
              <Pressable
                key={tag}
                accessibilityRole="button"
                accessibilityLabel={`${tag} 태그 삭제`}
                disabled={!editable}
                onPress={() => onChange((v) => removeTag(v, tag))}
                style={[styles.chip, { borderColor: bad ? c.danger : c.chipBorder, backgroundColor: c.surface }]}
              >
                <Text variant="body" color={bad ? 'danger' : 'text'} style={styles.chipText}>
                  #{tag} ✕
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.inputRow}>
        <View style={styles.inputGrow}>
          <TextField
            value={input}
            onChangeText={onChangeText}
            onSubmitEditing={() => commit(input)}
            submitBehavior="submit"
            returnKeyType="done"
            editable={editable}
            invalid={inputLength > MAX_TAG_LENGTH}
            placeholder="태그를 입력하고 추가를 눌러 주세요"
            accessibilityLabel="해시태그 입력"
          />
        </View>
        <Button
          label="추가"
          variant="secondary"
          onPress={() => commit(input)}
          disabled={!editable || input.trim() === ''}
        />
      </View>
      {input.trim() !== '' ? (
        <Text variant="caption" color={inputLength > MAX_TAG_LENGTH ? 'danger' : 'textSecondary'}>
          {inputLength}/{MAX_TAG_LENGTH}자
        </Text>
      ) : null}

      {showSuggestions ? (
        <View style={[styles.suggestions, { borderColor: c.border, backgroundColor: c.surface }]}>
          {suggestions.isFetching && candidates.length === 0 ? (
            <Text variant="caption">찾는 중…</Text>
          ) : suggestions.isError ? (
            <Text variant="caption">후보를 불러오지 못했어요. 입력한 태그는 그대로 추가할 수 있어요.</Text>
          ) : candidates.length === 0 ? (
            <Text variant="caption">검색 결과에 없어요. 입력한 태그를 그대로 추가할 수 있어요.</Text>
          ) : (
            candidates.map((s) => (
              <Pressable
                key={s.name}
                accessibilityRole="button"
                accessibilityLabel={`${s.name} 태그 추가, 공개 스토리 ${s.publicStoryCount}개`}
                onPress={() => commit(s.name)}
                style={styles.suggestion}
              >
                <Text variant="body">#{s.name}</Text>
                <Text variant="caption">공개 스토리 {s.publicStoryCount.toLocaleString()}개</Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}

      {notice ? <Text variant="caption">{notice}</Text> : null}
      {countOver ? (
        <Text variant="error">
          해시태그는 최대 {MAX_TAGS}개까지 등록할 수 있어요. 공개·비공개 저장 전에 줄여 주세요.
        </Text>
      ) : null}
      {problems.map(([tag, problem]) => (
        <Text key={tag} variant="error">
          #{tag}: {problem}
        </Text>
      ))}
      {error && !countOver ? <Text variant="error">{error}</Text> : null}
      <Text variant="caption">
        검색·노출·대화에 활용되니 입력을 권장해요. 길거나 구체적인 태그는 검색에 잘 잡히지 않을 수 있어요.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: Spacing.three, gap: Spacing.two },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 13, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    minHeight: MinTouchSize - 8,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
  },
  chipText: { fontSize: 13, lineHeight: 18 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  inputGrow: { flex: 1 },
  suggestions: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.two, gap: Spacing.one },
  suggestion: {
    minHeight: MinTouchSize,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
  },
});
