import { useState } from 'react';
import { View } from 'react-native';
import { Button, ChipGroup, FormField, Notice, Section, Text, TextArea } from '@/components/ui';
import {
  COMPOSITIONS,
  POINTS_OF_VIEW,
  RESPONSE_LENGTHS,
  STYLE_CODES,
  TENSES,
  type ExpressionSettings as Settings,
} from '@/shared/story-types';
import { Spacing } from '@/constants/theme';

const pointLabels = ['1인칭', '2인칭', '3인칭'];
const tenseLabels = ['과거형', '현재형'];
const compositionLabels = ['대사 중심', '행동 중심', '밸런스형'];
const lengthLabels = ['짧게', '보통', '길게'];
const styleLabels = ['역동적인', '서정적인', '긴장감 있는', '유쾌한', '담백한', '섬세한', '설레는', '포근한'];
const modeLabels = ['미선택', '기본 문체', '직접 작성'];
const modes = ['none', 'preset', 'custom'] as const;

const hasStyleInput = (style: Settings['style']) =>
  (style.mode === 'custom' && style.text.length > 0) || (style.mode === 'preset' && style.codes.length > 0);

type SelectionProps<T extends string> = {
  label: string;
  codes: readonly T[];
  labels: string[];
  value: T;
  onChange: (value: T) => void;
};
function RequiredSelection<T extends string>({ label, codes, labels, value, onChange }: SelectionProps<T>) {
  return (
    <FormField label={label}>
      <ChipGroup
        accessibilityLabel={label}
        options={labels}
        value={[labels[codes.indexOf(value)]]}
        onChange={(next) => {
          const index = labels.indexOf(next[0]);
          if (index >= 0) onChange(codes[index]);
        }}
      />
    </FormField>
  );
}
export function ExpressionSettings({ value, onChange }: { value: Settings; onChange: (value: Settings) => void }) {
  const [limitMessage, setLimitMessage] = useState(false);
  const [pendingMode, setPendingMode] = useState<Settings['style']['mode'] | null>(null);
  const style = value.style;
  const switchMode = (mode: Settings['style']['mode']) => {
    setLimitMessage(false);
    setPendingMode(null);
    onChange({
      ...value,
      style: mode === 'preset' ? { mode, codes: [] } : mode === 'custom' ? { mode, text: '' } : { mode },
    });
  };
  return (
    <Section
      title="말투·서술"
      description="시점·대화 구성·문체를 설정하고 저장한 내용을 다시 편집할 수 있습니다."
      first
    >
      <View style={{ gap: Spacing.three }}>
        <RequiredSelection
          label="시점"
          codes={POINTS_OF_VIEW}
          labels={pointLabels}
          value={value.pointOfView}
          onChange={(pointOfView) => onChange({ ...value, pointOfView })}
        />
        <RequiredSelection
          label="시제"
          codes={TENSES}
          labels={tenseLabels}
          value={value.tense}
          onChange={(tense) => onChange({ ...value, tense })}
        />
        <RequiredSelection
          label="대화 구성"
          codes={COMPOSITIONS}
          labels={compositionLabels}
          value={value.composition}
          onChange={(composition) => onChange({ ...value, composition })}
        />
        <RequiredSelection
          label="응답 길이"
          codes={RESPONSE_LENGTHS}
          labels={lengthLabels}
          value={value.responseLength}
          onChange={(responseLength) => onChange({ ...value, responseLength })}
        />
        <Text variant="caption">
          목표 분량: 짧게 300~500자 · 보통 500~1000자 · 길게 1000~2000자. 실제 분량을 보장하거나 응답을 자르지 않습니다.
        </Text>
        <RequiredSelection
          label="문체 방식"
          codes={modes}
          labels={modeLabels}
          value={style.mode}
          onChange={(mode) => {
            if (mode === style.mode) return;
            // 지워질 입력이 있으면 바로 바꾸지 않고 확인을 먼저 보여준다.
            if (hasStyleInput(style)) setPendingMode(mode);
            else switchMode(mode);
          }}
        />
        <Text variant="caption">문체는 선택 사항입니다. 방식을 바꾸면 이전 방식의 입력은 유지하지 않습니다.</Text>
        {pendingMode ? (
          <View style={{ gap: Spacing.two }}>
            <Notice
              tone="alert"
              message={`방식을 바꾸면 지금 ${style.mode === 'custom' ? '작성한 커스텀 문체' : '선택한 기본 문체'}가 지워져요. 다시 되돌려도 나타나지 않아요.`}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
              <Button label="문체 바꾸지 않기" variant="secondary" onPress={() => setPendingMode(null)} />
              <Button label="지우고 바꾸기" variant="danger" onPress={() => switchMode(pendingMode)} />
            </View>
          </View>
        ) : null}
        {style.mode === 'preset' ? (
          <FormField label="기본 문체 (최대 2개)">
            <ChipGroup
              accessibilityLabel="기본 문체"
              options={styleLabels}
              mode="multi"
              max={2}
              value={style.codes.map((code) => styleLabels[STYLE_CODES.indexOf(code)])}
              onLimitReached={() => setLimitMessage(true)}
              onChange={(next) => {
                setLimitMessage(false);
                onChange({
                  ...value,
                  style: { mode: 'preset', codes: next.map((label) => STYLE_CODES[styleLabels.indexOf(label)]) },
                });
              }}
            />
            {limitMessage ? <Notice tone="alert" message="문체는 최대 2개까지 선택할 수 있습니다." /> : null}
          </FormField>
        ) : null}
        {style.mode === 'custom' ? (
          <FormField label="커스텀 문체" hint="1000자를 넘어도 입력은 유지되며 임시 저장할 수 있습니다.">
            <TextArea
              accessibilityLabel="커스텀 문체"
              value={style.text}
              maxLength={1000}
              onChangeText={(text) => onChange({ ...value, style: { mode: 'custom', text } })}
            />
          </FormField>
        ) : null}
      </View>
    </Section>
  );
}
