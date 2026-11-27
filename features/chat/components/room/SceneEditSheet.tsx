// CHAT-US-08 장면 정보 수정 시트(KAN-40 결정 C): 가장 뒤 AI 응답의 날짜·시간·장소·캐릭터별 착장·속마음을 고친다.
// 바뀐 칸만 보내고, 서버 거절(409·422)은 시트 맨 위나 해당 칸 옆에 한국어로 보인다.
import { useState } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Button, FormField, Notice, Text, TextField } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useUpdateSceneInfo } from '@/features/chat/hooks/useSceneCard';
import {
  charCount,
  clothingKey,
  planSceneUpdate,
  SCENE_EDIT_LIMITS,
  sceneEditErrors,
  sceneToForm,
  thoughtKey,
  type SceneErrorKey,
  type SceneErrors,
  type SceneForm,
} from '@/features/chat/scene/sceneEdit';
import { useTheme } from '@/hooks/use-theme';
import type { CurrentScene } from '@/shared/story-types';

type TextKey = Exclude<keyof SceneForm, 'characters'>;
const DATE_ERROR_KEYS: TextKey[] = ['era', 'year', 'month', 'day', 'referenceEvent', 'elapsedDay'];
const errorKeyOf = (key: TextKey): SceneErrorKey =>
  DATE_ERROR_KEYS.includes(key) ? 'date' : key === 'hour' || key === 'minute' ? 'time' : 'place';
const counter = (value: string, limit: number) => `${charCount(value.trim())}/${limit}자`;

export function SceneEditSheet({
  sessionId,
  messageId,
  scene,
  onClose,
}: {
  sessionId: string;
  /** 시트를 연 때의 가장 뒤 AI 응답. 그사이 새 응답이 끝나면 서버가 409로 거절한다. */
  messageId: number;
  /** 시트를 연 때의 장면. 바뀐 칸은 이 값과 비교한다. */
  scene: CurrentScene;
  onClose: () => void;
}) {
  const c = useTheme();
  const [form, setForm] = useState<SceneForm>(() => sceneToForm(scene));
  const [errors, setErrors] = useState<SceneErrors>({});
  const save = useUpdateSceneInfo(sessionId);
  const mode = scene.date?.mode ?? null;

  // 고친 칸의 오류만 지운다. 맨 위 안내(409 등)는 다시 저장할 때까지 둔다.
  const clearError = (key: SceneErrorKey) =>
    setErrors((old) => {
      if (!old[key]) return old;
      const next = { ...old };
      delete next[key];
      return next;
    });
  const setText = (key: TextKey) => (value: string) => {
    setForm((old) => ({ ...old, [key]: value }));
    clearError(errorKeyOf(key));
  };
  const setCharacter = (name: string, key: 'clothing' | 'innerThought') => (value: string) => {
    setForm((old) => ({
      ...old,
      characters: old.characters.map((person) => (person.name === name ? { ...person, [key]: value } : person)),
    }));
    clearError(key === 'clothing' ? clothingKey(name) : thoughtKey(name));
  };

  const submit = () => {
    if (save.isPending) return;
    const plan = planSceneUpdate(scene, form);
    if (!plan.ok) {
      setErrors({ form: '입력한 값을 확인해 주세요.', ...plan.errors });
      return;
    }
    if (!Object.keys(plan.input).length) {
      onClose();
      return;
    }
    setErrors({});
    save.mutate(
      { messageId, input: plan.input },
      {
        onSuccess: () => {
          AccessibilityInfo.announceForAccessibility('장면 정보를 고쳤어요.');
          onClose();
        },
        onError: (error) => setErrors(sceneEditErrors(error, plan.characterNames)),
      },
    );
  };

  const input = (key: TextKey, label: string, numeric = false) => (
    <TextField
      accessibilityLabel={label}
      placeholder={label}
      value={form[key]}
      onChangeText={setText(key)}
      invalid={!!errors[errorKeyOf(key)]}
      editable={!save.isPending}
      keyboardType={numeric ? 'number-pad' : 'default'}
    />
  );
  /**
   * 한 줄에 여러 칸을 둘 때의 칸 하나. 값이 차 있어도 무슨 칸인지 보이게 칸 위에 이름(연호·기준 사건)이나
   * 단위(년·월·일·일째·시·분)를 작게 적는다.
   */
  const cell = (key: TextKey, label: string, unit: string, numeric = false) => (
    <View style={styles.cell}>
      <Text variant="caption">{unit}</Text>
      {input(key, label, numeric)}
    </View>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* 키보드가 올라오면 시트를 그만큼 올려 아래쪽 칸(마지막 캐릭터의 속마음)과 저장 버튼이 가려지지 않게 한다. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.backdrop, { backgroundColor: c.background + 'cc' }]}
      >
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: c.backgroundElement, borderColor: c.border }]}
        >
          <Text variant="subheading" accessibilityRole="header">
            장면 정보 수정
          </Text>
          <Text variant="caption">가장 최근 응답의 장면 정보를 고쳐요. 다음 응답부터 고친 값으로 이어져요.</Text>
          {errors.form ? <Notice tone="alert" message={errors.form} /> : null}
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {mode ? (
              <FormField label="📅 날짜" error={errors.date}>
                {mode === 'elapsed' ? (
                  <View style={styles.row}>
                    {cell('referenceEvent', '기준 사건', '기준 사건')}
                    {cell('elapsedDay', '일차', '일째', true)}
                  </View>
                ) : (
                  <View style={styles.row}>
                    {mode === 'world' ? cell('era', '연호', '연호') : null}
                    {cell('year', '연', '년', true)}
                    {cell('month', '월', '월', true)}
                    {cell('day', '일', '일', true)}
                  </View>
                )}
              </FormField>
            ) : null}
            <FormField label="⏰ 시간" hint="분을 비우면 「19시」처럼 시만 써요." error={errors.time}>
              <View style={styles.row}>
                {cell('hour', '시', '시', true)}
                {cell('minute', '분', '분', true)}
              </View>
            </FormField>
            <FormField label="📍 장소" hint={counter(form.place, SCENE_EDIT_LIMITS.place)} error={errors.place}>
              {input('place', '장소')}
            </FormField>
            {form.characters.map((person) => (
              <View key={person.name} testID={`scene-edit-person-${person.name}`} style={styles.person}>
                <Text accessibilityRole="header" style={styles.name}>
                  {person.name}
                </Text>
                <FormField
                  label="👔 착장"
                  hint={counter(person.clothing, SCENE_EDIT_LIMITS.clothing)}
                  error={errors[clothingKey(person.name)]}
                >
                  <TextField
                    accessibilityLabel={`${person.name} 착장`}
                    value={person.clothing}
                    onChangeText={setCharacter(person.name, 'clothing')}
                    invalid={!!errors[clothingKey(person.name)]}
                    editable={!save.isPending}
                    multiline
                  />
                </FormField>
                <FormField
                  label="💭 속마음"
                  hint={counter(person.innerThought, SCENE_EDIT_LIMITS.innerThought)}
                  error={errors[thoughtKey(person.name)]}
                >
                  <TextField
                    accessibilityLabel={`${person.name} 속마음`}
                    value={person.innerThought}
                    onChangeText={setCharacter(person.name, 'innerThought')}
                    invalid={!!errors[thoughtKey(person.name)]}
                    editable={!save.isPending}
                  />
                </FormField>
              </View>
            ))}
          </ScrollView>
          <View style={styles.actions}>
            <Button
              label="취소"
              accessibilityLabel="장면 정보 수정 취소"
              variant="secondary"
              onPress={onClose}
              style={styles.flex}
            />
            <Button
              label={save.isPending ? '저장 중…' : '저장'}
              accessibilityLabel="장면 정보 저장"
              disabled={save.isPending}
              onPress={submit}
              style={styles.flex}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    maxHeight: '90%',
    borderWidth: 1,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  body: { paddingBottom: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.two },
  // 웹 입력창은 기본 너비가 있어 한 줄에 여러 칸을 두면 넘친다. 0에서 늘려 나눠 갖게 한다.
  flex: { flex: 1, flexBasis: 0, minWidth: 0 },
  cell: { flex: 1, flexBasis: 0, minWidth: 0, gap: Spacing.half },
  person: { marginTop: Spacing.three, gap: Spacing.half },
  name: { fontWeight: '600' },
  actions: { flexDirection: 'row', gap: Spacing.two },
});
