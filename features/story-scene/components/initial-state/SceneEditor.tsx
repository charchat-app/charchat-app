import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, ChipGroup, Notice, Text, TextArea } from '@/components/ui';
import { Spacing } from '@/constants/theme';
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
import { LimitedField } from './fields';

const MODE_LABELS: Record<'none' | DateMode, string> = {
  none: '미지정',
  calendar: '일반 날짜',
  world: '세계관 날짜',
  elapsed: '경과일',
};
const FORMAT_LABELS: Record<TimeFormat, string> = { '24h': '24시간제', '12h': '12시간제' };
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
      <Text variant="subheading">🌿 이야기의 무대</Text>
      <LimitedField
        label="📍 장소 · 선택"
        accessibilityLabel="장소"
        value={scene.place}
        limit={SCENE_LIMITS.place}
        onChange={(place) => set({ place })}
      />

      <Text variant="subheading">📅 날짜 방식</Text>
      <ChipGroup
        accessibilityLabel="날짜 방식"
        options={Object.values(MODE_LABELS)}
        value={[MODE_LABELS[scene.dateMode ?? 'none']]}
        onChange={(next) => {
          const key = (Object.keys(MODE_LABELS) as ('none' | DateMode)[]).find((k) => MODE_LABELS[k] === next[0]);
          if (key) chooseMode(key === 'none' ? null : key);
        }}
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
      {scene.dateMode === 'world' ? (
        <LimitedField
          label="연호"
          accessibilityLabel="연호"
          value={scene.era}
          limit={SCENE_LIMITS.era}
          onChange={(era) => set({ era })}
        />
      ) : null}
      {scene.dateMode === 'calendar' || scene.dateMode === 'world' ? (
        <View style={styles.row}>
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

      <Text variant="subheading">⏰ 시간</Text>
      <ChipGroup
        accessibilityLabel="시간제"
        options={Object.values(FORMAT_LABELS)}
        value={[FORMAT_LABELS[scene.timeFormat]]}
        onChange={(next) => {
          const format = (Object.keys(FORMAT_LABELS) as TimeFormat[]).find((k) => FORMAT_LABELS[k] === next[0]);
          if (format) chooseFormat(format);
        }}
      />
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
        <ChipGroup
          accessibilityLabel="오전 오후"
          options={['오전', '오후']}
          value={scene.meridiem === 'am' ? ['오전'] : scene.meridiem === 'pm' ? ['오후'] : []}
          onChange={(next) => set({ meridiem: next[0] === '오전' ? 'am' : next[0] === '오후' ? 'pm' : null })}
        />
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
      <Text variant="caption" color={time ? 'danger' : 'textSecondary'} accessibilityLiveRegion="polite">
        {time ?? '시간은 비워 둘 수 있어요. 시·분을 숫자로 입력해요.'}
      </Text>

      <Text variant="subheading">캐릭터별 상태</Text>
      {characters.length === 0 ? <Text variant="caption">등록된 등장 캐릭터가 없어요.</Text> : null}
      {characters.map((person, index) => {
        const name = person.name || `캐릭터 ${index + 1}`;
        const state = scene.characters.find((c) => c.characterId === person.id);
        return (
          <View key={person.id} style={styles.wrap}>
            <Text>{name}</Text>
            <Text variant="caption">👔 착장 · 선택</Text>
            <TextArea
              accessibilityLabel={`${name} 착장`}
              value={state?.clothing ?? ''}
              maxLength={SCENE_LIMITS.clothing}
              onChangeText={(clothing) =>
                onChange((current) => withCharacterState(current, characters, person.id, { clothing }))
              }
            />
            <Text variant="caption">💭 속마음 · 선택</Text>
            <TextArea
              accessibilityLabel={`${name} 속마음`}
              value={state?.innerThought ?? ''}
              maxLength={SCENE_LIMITS.innerThought}
              onChangeText={(innerThought) =>
                onChange((current) => withCharacterState(current, characters, person.id, { innerThought }))
              }
            />
          </View>
        );
      })}
      <Text variant="caption">유저 캐릭터의 착장·속마음은 이용자가 정하므로 여기서 입력하지 않아요.</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  cell: { flexGrow: 1, flexBasis: 80 },
});
