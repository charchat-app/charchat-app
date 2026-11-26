import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar, Button, Card, Notice, Text, TextArea } from '@/components/ui';
import { countRawText } from '@/lib/rawText';
import { Radius, Spacing } from '@/constants/theme';
import {
  dateIssue,
  formatSceneDate,
  hasDateInput,
  hasTimeInput,
  SCENE_LIMITS,
  switchDateMode,
  switchTimeFormat,
  timeIssue,
  type DateMode,
  type FewshotCharacter,
  type IntroScene,
  type SceneCharacterState,
  type TimeFormat,
} from '@/shared/story-types';
import { Eyebrow, FieldLabel, Hint } from '../SceneParts';
import { LimitedField } from './fields';
import { SceneDropdown, type SceneDropdownOption } from './SceneDropdown';

// 목업 select 순서. 실제 모델은 날짜 미지정(null)을 허용하므로 「미지정」을 맨 앞에 둔다.
const MODE_OPTIONS: SceneDropdownOption<'none' | DateMode>[] = [
  { key: 'none', label: '미지정' },
  { key: 'calendar', label: '일반 날짜' },
  { key: 'world', label: '세계관 날짜' },
  { key: 'elapsed', label: '경과일' },
];
const FORMAT_OPTIONS: SceneDropdownOption<TimeFormat>[] = [
  { key: '24h', label: '24시간제' },
  { key: '12h', label: '12시간제' },
];
const MERIDIEM_OPTIONS: SceneDropdownOption<'none' | 'am' | 'pm'>[] = [
  { key: 'none', label: '선택 안 함' },
  { key: 'am', label: '오전' },
  { key: 'pm', label: '오후' },
];
type Pending = { kind: 'date'; mode: DateMode | null } | { kind: 'time'; format: TimeFormat } | null;

/** 착장·속마음이 모두 비면 미지정이므로 항목을 빼고, 캐릭터 순서대로 유지한다(서버 조회 순서와 같음). */
function withCharacterState(
  scene: IntroScene,
  characters: FewshotCharacter[],
  characterId: string,
  patch: Partial<SceneCharacterState>,
): IntroScene {
  const current = scene.characters.find((c) => c.characterId === characterId) ?? {
    characterId,
    clothing: '',
    innerThought: '',
  };
  const next = { ...current, ...patch };
  const order = (id: string) => characters.findIndex((person) => person.id === id);
  const list = scene.characters.filter((c) => c.characterId !== characterId);
  if (next.clothing !== '' || next.innerThought !== '') list.push(next);
  return { ...scene, characters: list.sort((a, b) => order(a.characterId) - order(b.characterId)) };
}

/** CREATE-US-04 인트로 하나의 장면: 장소·날짜·시간·캐릭터별 착장/속마음. 모두 선택 입력이다. */
export function SceneEditor({
  scene,
  characters,
  onChange,
}: {
  scene: IntroScene;
  characters: FewshotCharacter[];
  /** 최신 장면을 받아 바꾸는 업데이트 함수. 화면에 그려진 시점의 장면으로 덮어쓰지 않게 한다. */
  onChange: (update: (scene: IntroScene) => IntroScene) => void;
}) {
  const [pending, setPending] = useState<Pending>(null);
  const set = (patch: Partial<IntroScene>) => onChange((current) => ({ ...current, ...patch }));
  const chooseMode = (mode: DateMode | null) => {
    if (mode === scene.dateMode) return;
    // 기존 날짜 입력이 있으면 지워진다는 확인을 먼저 보여준다(AC07).
    if (hasDateInput(scene)) setPending({ kind: 'date', mode });
    else onChange((current) => switchDateMode(current, mode));
  };
  const chooseFormat = (format: TimeFormat) => {
    if (format === scene.timeFormat) return;
    if (hasTimeInput(scene)) setPending({ kind: 'time', format });
    else onChange((current) => switchTimeFormat(current, format));
  };
  const date = dateIssue(scene),
    time = timeIssue(scene),
    preview = formatSceneDate(scene);
  return (
    <View style={styles.wrap}>
      {/* CREATE-US-04-AC18: 공통 장면(날짜·시간·장소)과 캐릭터별 착장·속마음을 다른 영역으로 나눈다. */}
      {/* CREATE-US-12 목업 state(): SCENE / 배경 → 「이야기의 무대」 카드(장소·날짜·시간) */}
      <Eyebrow>SCENE / 배경</Eyebrow>
      <Card tone="state" accessibilityLabel="공통 장면 입력" style={styles.card}>
        <Text variant="subheading" accessibilityRole="header" style={styles.cardTitle}>
          🌿 이야기의 무대
        </Text>
        <LimitedField
          label="📍 장소 · 선택"
          accessibilityLabel="장소"
          value={scene.place}
          limit={SCENE_LIMITS.place}
          onChange={(place) => set({ place })}
        />

        <FieldLabel>📅 날짜 방식</FieldLabel>
        <SceneDropdown
          label="날짜 방식"
          options={MODE_OPTIONS}
          value={scene.dateMode ?? 'none'}
          onChange={(key) => chooseMode(key === 'none' ? null : key)}
        />
        {pending?.kind === 'date' ? (
          <View style={styles.wrap}>
            <Notice tone="alert" message="방식을 바꾸면 지금 입력한 날짜가 지워져요. 다시 되돌려도 나타나지 않아요." />
            <View style={styles.row}>
              <Button label="날짜 바꾸지 않기" variant="secondary" onPress={() => setPending(null)} />
              <Button
                label="날짜 지우고 바꾸기"
                variant="danger"
                onPress={() => {
                  const mode = pending.mode;
                  onChange((current) => switchDateMode(current, mode));
                  setPending(null);
                }}
              />
            </View>
          </View>
        ) : null}
        {scene.dateMode === 'calendar' || scene.dateMode === 'world' ? (
          // 목업: 세계관 날짜는 연호·연·월·일, 일반 날짜는 연·월·일을 한 줄에 둔다. 연·월·일은 숫자 글자 입력이다.
          <View style={styles.row}>
            {scene.dateMode === 'world' ? (
              <View style={styles.cell}>
                <LimitedField
                  label="연호"
                  accessibilityLabel="연호"
                  value={scene.era}
                  limit={SCENE_LIMITS.era}
                  onChange={(era) => set({ era })}
                />
              </View>
            ) : null}
            {(
              [
                ['year', '연'],
                ['month', '월'],
                ['day', '일'],
              ] as const
            ).map(([key, label]) => (
              <View key={key} style={styles.cell}>
                <LimitedField
                  label={label}
                  accessibilityLabel={`날짜 ${label}`}
                  value={scene[key]}
                  keyboardType="number-pad"
                  onChange={(value) => set({ [key]: value })}
                />
              </View>
            ))}
          </View>
        ) : null}
        {scene.dateMode === 'elapsed' ? (
          <View style={styles.row}>
            <View style={styles.cell}>
              <LimitedField
                label="기준 사건"
                accessibilityLabel="기준 사건"
                value={scene.referenceEvent}
                limit={SCENE_LIMITS.referenceEvent}
                placeholder="감금"
                onChange={(referenceEvent) => set({ referenceEvent })}
              />
            </View>
            <View style={styles.cell}>
              <LimitedField
                label="시작 일차"
                accessibilityLabel="시작 일차"
                value={scene.elapsedDay}
                keyboardType="number-pad"
                placeholder="3"
                onChange={(elapsedDay) => set({ elapsedDay })}
              />
            </View>
          </View>
        ) : null}
        {scene.dateMode ? (
          <Text variant="caption" color={date ? 'danger' : 'textSecondary'} accessibilityLiveRegion="polite">
            {date ?? (preview ? `표시: ${preview}` : '날짜는 비워 둘 수 있어요 · 숫자로 직접 입력')}
          </Text>
        ) : null}

        <FieldLabel>⏰ 시간제</FieldLabel>
        <SceneDropdown label="시간제" options={FORMAT_OPTIONS} value={scene.timeFormat} onChange={chooseFormat} />
        {pending?.kind === 'time' ? (
          <View style={styles.wrap}>
            <Notice tone="alert" message="시간제를 바꾸면 지금 입력한 시각이 지워져요." />
            <View style={styles.row}>
              <Button label="시간제 바꾸지 않기" variant="secondary" onPress={() => setPending(null)} />
              <Button
                label="시각 지우고 바꾸기"
                variant="danger"
                onPress={() => {
                  const format = pending.format;
                  onChange((current) => switchTimeFormat(current, format));
                  setPending(null);
                }}
              />
            </View>
          </View>
        ) : null}
        {scene.timeFormat === '12h' ? (
          <>
            <FieldLabel>오전/오후</FieldLabel>
            <SceneDropdown
              label="오전/오후"
              options={MERIDIEM_OPTIONS}
              value={scene.meridiem ?? 'none'}
              onChange={(key) => set({ meridiem: key === 'none' ? null : key })}
            />
          </>
        ) : null}
        <View style={styles.row}>
          <View style={styles.cell}>
            <LimitedField
              label="시"
              accessibilityLabel="시"
              value={scene.hour}
              keyboardType="number-pad"
              onChange={(hour) => set({ hour })}
            />
          </View>
          <View style={styles.cell}>
            <LimitedField
              label="분"
              accessibilityLabel="분"
              value={scene.minute}
              keyboardType="number-pad"
              onChange={(minute) => set({ minute })}
            />
          </View>
        </View>
        {time ? (
          <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
            {time}
          </Text>
        ) : null}
      </Card>

      {/* CREATE-US-12 목업: CHARACTERS / 캐릭터별 상태 → 캐릭터마다 한 장의 카드(아바타 + 이름 머리글) */}
      <Eyebrow>CHARACTERS / 캐릭터별 상태</Eyebrow>
      <View accessibilityLabel="캐릭터별 상태 입력" style={styles.wrap}>
        {characters.length === 0 ? <Text variant="caption">등록된 등장 캐릭터가 없어요.</Text> : null}
        {characters.map((person, index) => {
          const name = person.name || `캐릭터 ${index + 1}`;
          const state = scene.characters.find((c) => c.characterId === person.id);
          return (
            <Card key={person.id} tone="state" accessibilityLabel={`${name} 상태 입력`} style={styles.card}>
              <View style={styles.person}>
                <Avatar name={name} />
                <Text variant="subheading" accessibilityRole="header" style={styles.personName}>
                  {name}
                </Text>
              </View>
              <Text variant="caption">이 인트로에서 시작할 모습과 마음이에요.</Text>
              <FieldLabel>{`👔 착장 · 선택 · 최대 ${SCENE_LIMITS.clothing}자`}</FieldLabel>
              {/* AC11·12: 초과해도 입력을 막거나 자르지 않고 글자 수와 초과만 표시한다. */}
              <TextArea
                accessibilityLabel={`${name} 착장`}
                value={state?.clothing ?? ''}
                onChangeText={(clothing) =>
                  onChange((current) => withCharacterState(current, characters, person.id, { clothing }))
                }
              />
              <LengthNote value={state?.clothing ?? ''} limit={SCENE_LIMITS.clothing} />
              <FieldLabel>{`💭 속마음 · 선택 · 최대 ${SCENE_LIMITS.innerThought}자`}</FieldLabel>
              <TextArea
                accessibilityLabel={`${name} 속마음`}
                value={state?.innerThought ?? ''}
                onChangeText={(innerThought) =>
                  onChange((current) => withCharacterState(current, characters, person.id, { innerThought }))
                }
              />
              <LengthNote value={state?.innerThought ?? ''} limit={SCENE_LIMITS.innerThought} />
            </Card>
          );
        })}
        <Hint>유저 캐릭터의 착장·속마음은 이용자가 정하므로 여기서 입력하지 않아요.</Hint>
      </View>
    </View>
  );
}

/** 원문 글자 수와 초과량. 초과는 공개·비공개 저장만 막고 임시 저장은 허용한다(CREATE-US-04-AC12). */
function LengthNote({ value, limit }: { value: string; limit: number }) {
  const length = countRawText(value);
  const over = length > limit;
  return (
    <Text variant="caption" color={over ? 'danger' : 'textSecondary'}>
      {`${length} / ${limit}자${over ? ` · ${length - limit}자 초과` : ''}`}
    </Text>
  );
}
const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  // 목업 .state-card: radius 14, padding 16. 카드 사이 간격은 묶음(wrap)의 gap이 맡는다
  card: { gap: Spacing.two, marginVertical: 0, borderRadius: Radius.state, padding: Spacing.three },
  // .state-card h3: 16px, 아래 12px
  cardTitle: { fontSize: 16 },
  person: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  personName: { flex: 1, minWidth: 0, fontSize: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  cell: { flexGrow: 1, flexBasis: 80 },
});
