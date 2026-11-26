// CREATE-US-02 말투·서술 표현 설정. CREATE-US-12: 목업 v15 speech()의 「표현 설정」 카드와 「문체 스타일」 구역 배치.
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Notice, Text, TextArea } from '@/components/ui';
import {
  COMPOSITIONS,
  POINTS_OF_VIEW,
  RESPONSE_LENGTHS,
  STYLE_CODES,
  TENSES,
  type ExpressionSettings as Settings,
} from '@/shared/story-types';
import { Spacing } from '@/constants/theme';
import { SectionHeading, SegmentedChoice, StylePicks, type SegmentOption } from './SceneParts';

const pointLabels = ['1인칭', '2인칭', '3인칭'];
const tenseLabels = ['과거형', '현재형'];
const compositionLabels = ['대사 중심', '행동 중심', '밸런스형'];
const lengthLabels = ['짧게', '보통', '길게'];
/** 목업 .speech-length 보조 글자(목표 분량) */
const lengthSubs = ['300–500자', '500–1000자', '1000–2000자'];
const styleLabels = ['역동적인', '서정적인', '긴장감 있는', '유쾌한', '담백한', '섬세한', '설레는', '포근한'];
/** 목업은 기본/직접 두 칸이지만, 문체를 비우는 「미선택」(스타일 없음으로 되돌리기)을 유지한다. */
const modeLabels = ['미선택', '기본 문체', '직접 작성'];
const modes = ['none', 'preset', 'custom'] as const;
const CUSTOM_LIMIT = 1000;
const STYLE_LIMIT = 2;

const hasStyleInput = (style: Settings['style']) =>
  (style.mode === 'custom' && style.text.length > 0) || (style.mode === 'preset' && style.codes.length > 0);

const toOptions = <T extends string>(codes: readonly T[], labels: string[], subs?: string[]): SegmentOption<T>[] =>
  codes.map((code, index) => ({ value: code, label: labels[index], sub: subs?.[index] }));

function Field({ label, aside, children }: { label: string; aside?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabel}>
        <Text variant="caption" color="text" style={styles.fieldTitle}>
          {label}
        </Text>
        {aside ? <Text variant="caption">{aside}</Text> : null}
      </View>
      {children}
    </View>
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
  const selectedStyles =
    style.mode === 'preset' ? style.codes.map((code) => styleLabels[STYLE_CODES.indexOf(code)]) : [];
  const toggleStyle = (label: string) => {
    if (style.mode !== 'preset') return;
    const code = STYLE_CODES[styleLabels.indexOf(label)];
    if (style.codes.includes(code)) {
      setLimitMessage(false);
      onChange({ ...value, style: { mode: 'preset', codes: style.codes.filter((c) => c !== code) } });
      return;
    }
    if (style.codes.length >= STYLE_LIMIT) {
      setLimitMessage(true);
      return;
    }
    setLimitMessage(false);
    onChange({ ...value, style: { mode: 'preset', codes: [...style.codes, code] } });
  };
  const styleCaption =
    style.mode === 'custom'
      ? `최대 ${CUSTOM_LIMIT.toLocaleString()}자`
      : style.mode === 'preset'
        ? `${style.codes.length} / ${STYLE_LIMIT}개`
        : '선택 안 함';
  return (
    <View style={styles.layout}>
      {/* 목업 .speech-settings: 필수 네 항목을 한 카드에 묶는다 */}
      <Card tone="section" style={styles.card} accessibilityLabel="표현 설정">
        <SectionHeading title="표현 설정" caption="대화의 기본 톤" />
        <Field label="시점">
          <SegmentedChoice
            label="시점"
            options={toOptions(POINTS_OF_VIEW, pointLabels)}
            value={value.pointOfView}
            onChange={(pointOfView) => onChange({ ...value, pointOfView })}
          />
        </Field>
        <Field label="시제">
          <SegmentedChoice
            label="시제"
            options={toOptions(TENSES, tenseLabels)}
            value={value.tense}
            onChange={(tense) => onChange({ ...value, tense })}
          />
        </Field>
        <Field label="대화 구성">
          <SegmentedChoice
            label="대화 구성"
            options={toOptions(COMPOSITIONS, compositionLabels)}
            value={value.composition}
            onChange={(composition) => onChange({ ...value, composition })}
          />
        </Field>
        <Field label="응답 길이" aside="목표 분량">
          <SegmentedChoice
            label="응답 길이"
            options={toOptions(RESPONSE_LENGTHS, lengthLabels, lengthSubs)}
            value={value.responseLength}
            onChange={(responseLength) => onChange({ ...value, responseLength })}
          />
          <Text variant="caption">
            정확한 글자 수보다 자연스러운 마무리를 우선해요. 실제 분량을 보장하거나 응답을 자르지 않습니다.
          </Text>
        </Field>
      </Card>

      {/* 목업 .speech-style: 카드 밖 구역. 방식 전환 확인·최대 개수 안내는 그대로 둔다. */}
      <View style={styles.section} accessibilityLabel="문체 스타일">
        <SectionHeading title="문체 스타일" optional caption={styleCaption} level="subheading" />
        <SegmentedChoice
          label="문체 방식"
          options={toOptions(modes, modeLabels)}
          value={style.mode}
          onChange={(mode) => {
            // 지워질 입력이 있으면 바로 바꾸지 않고 확인을 먼저 보여준다.
            if (hasStyleInput(style)) setPendingMode(mode);
            else switchMode(mode);
          }}
        />
        {pendingMode ? (
          <View style={styles.confirm}>
            <Notice
              tone="alert"
              message={`방식을 바꾸면 지금 ${style.mode === 'custom' ? '작성한 커스텀 문체' : '선택한 기본 문체'}가 지워져요. 다시 되돌려도 나타나지 않아요.`}
            />
            <View style={styles.row}>
              <Button label="문체 바꾸지 않기" variant="secondary" onPress={() => setPendingMode(null)} />
              <Button label="지우고 바꾸기" variant="danger" onPress={() => switchMode(pendingMode)} />
            </View>
          </View>
        ) : null}
        {style.mode === 'preset' ? (
          <>
            <StylePicks label="기본 문체" options={styleLabels} value={selectedStyles} onToggle={toggleStyle} />
            {limitMessage ? <Notice tone="alert" message="문체는 최대 2개까지 선택할 수 있습니다." /> : null}
            <Text variant="caption">최대 2개까지 선택 · 선택하지 않아도 괜찮아요.</Text>
          </>
        ) : null}
        {style.mode === 'custom' ? (
          <>
            <TextArea
              accessibilityLabel="커스텀 문체"
              placeholder="원하는 문체를 자유롭게 적어 주세요."
              value={style.text}
              maxLength={CUSTOM_LIMIT}
              onChangeText={(text) => onChange({ ...value, style: { mode: 'custom', text } })}
            />
            <Text variant="caption">1000자를 넘어도 입력은 유지되며 임시 저장할 수 있습니다.</Text>
          </>
        ) : null}
        {style.mode === 'none' ? (
          <Text variant="caption">문체는 선택 사항이에요. 방식을 바꾸면 이전 방식의 입력은 유지하지 않아요.</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 목업 .speech-layout gap 22
  layout: { gap: Spacing.four + Spacing.half },
  card: { marginBottom: 0, gap: Spacing.three },
  field: { gap: Spacing.two },
  fieldLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldTitle: { fontWeight: '600' },
  section: { gap: Spacing.three - Spacing.one, paddingHorizontal: Spacing.half },
  confirm: { gap: Spacing.two },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
