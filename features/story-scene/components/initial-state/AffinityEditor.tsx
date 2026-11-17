import { StyleSheet, View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  affinityIssue,
  affinityValue,
  setAffinity,
  type FewshotCharacter,
  type InitialAffinity,
} from '@/shared/story-types';
import { LimitedField } from './fields';
import { people } from './people';

/**
 * CREATE-US-04-AC09 방향별 초기 호감도. 관계 카드와 독립이며 스토리 공통이다.
 * 등장 캐릭터마다 유저·다른 캐릭터에 대한 값을 보여주고, 입력하지 않은 조합은 0으로 표시한다.
 * 유저가 출발점인 호감도는 미정이라 입력받지 않는다.
 */
export function AffinityEditor({
  affinities,
  characters,
  onChange,
}: {
  affinities: InitialAffinity[];
  characters: FewshotCharacter[];
  onChange: (affinities: InitialAffinity[]) => void;
}) {
  const everyone = people(characters);
  const sources = everyone.filter((p) => p.kind === 'character');
  return (
    <View style={styles.wrap}>
      <Text variant="subheading">💗 초기 호감도</Text>
      <Text variant="caption">
        각 캐릭터가 상대에게 느끼는 시작 호감도예요(-100~100 정수). 정하지 않으면 0으로 시작하고, 인트로와 관계없이 같은
        값을 써요. A→B와 B→A는 따로 정해요.
      </Text>
      {sources.length ? null : <Text>등장 캐릭터를 먼저 등록해 주세요.</Text>}
      {sources.map((source) => (
        <Card key={source.key} tone="state" style={styles.wrap}>
          <Text variant="subheading">{source.label}의 호감도</Text>
          {everyone
            .filter((target) => target.key !== source.key)
            .map((target) => {
              const direction = {
                sourceCharacterId: source.characterId ?? '',
                targetKind: target.kind,
                targetCharacterId: target.characterId,
              };
              const value = affinityValue(affinities, direction);
              return (
                <LimitedField
                  key={target.key}
                  label={`→ ${target.label}`}
                  accessibilityLabel={`${source.label}→${target.label} 호감도`}
                  value={value}
                  hint="-100~100 정수"
                  error={affinityIssue(value)}
                  keyboardType="numbers-and-punctuation"
                  onChange={(next) => onChange(setAffinity(affinities, { ...direction, value: next }))}
                />
              );
            })}
        </Card>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({ wrap: { gap: Spacing.two } });
