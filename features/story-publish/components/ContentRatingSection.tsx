// CREATE-US-08-AC01·AC12(제작자 화면 일부) 공개 범위 탭의 등급 선택과 적용 등급·검토 상태 표시
import { Platform, Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import { Text } from '@/components/ui';
import { MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  CONTENT_RATINGS,
  RATING_REVIEW_STATUS_LABELS,
  type ContentRating,
  type RatingReviewStatus,
} from '@/shared/rating';
import type { SaveState } from '@/shared/story-types';

export type ContentRatingSectionProps = {
  /** 지금 공개 상태(표시만 한다. 이 부품은 공개 상태를 바꾸지 않는다) */
  visibility: SaveState;
  /** 고른 등급. 아직 불러오지 못했으면 null(선택 없음) */
  selected: ContentRating | null;
  onSelect: (rating: ContentRating) => void;
  disabled: boolean;
  /** 정본에 적용된 등급. 없으면 null */
  applied: ContentRating | null;
  /** 등급 검토 상태. 서버가 알려 주지 않았으면 null */
  reviewStatus: RatingReviewStatus | null;
};

const RADIO_GROUP_WEB: ViewProps = { accessibilityRole: 'radiogroup', accessibilityLabel: '콘텐츠 등급' };

/**
 * 공개 상태 표시 아래에 등급 선택(SAFE·UNSAFE)을 두고, 고른 등급과 구분해 적용 등급·검토 상태를 보여 준다.
 * 저장은 하단 저장 버튼(공통 저장)이 맡는다.
 */
export function ContentRatingSection({
  visibility,
  selected,
  onSelect,
  disabled,
  applied,
  reviewStatus,
}: ContentRatingSectionProps) {
  const c = useTheme();
  return (
    <View style={styles.container}>
      <Text variant="subheading">{`공개 상태: ${visibility}`}</Text>
      <View style={styles.group}>
        <Text variant="heading" accessibilityRole="header">
          콘텐츠 등급
        </Text>
        {/* 네이티브에서 accessible 묶음은 자식 라디오를 한 요소로 합쳐 따로 초점이 가지 않는다. 묶음 역할은 웹에만 둔다. */}
        <View {...(Platform.OS === 'web' ? RADIO_GROUP_WEB : {})} style={styles.options}>
          {CONTENT_RATINGS.map((rating) => {
            const checked = selected === rating;
            return (
              <Pressable
                key={rating}
                accessibilityRole="radio"
                accessibilityLabel={rating}
                accessibilityState={{ checked, disabled }}
                aria-checked={checked}
                disabled={disabled}
                onPress={() => onSelect(rating)}
                style={({ pressed }) => [
                  styles.option,
                  {
                    borderColor: checked ? c.accent : c.chipBorder,
                    backgroundColor: checked ? c.accent : c.surface,
                  },
                  disabled && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text variant="body" color={checked ? 'onAccent' : 'text'}>
                  {rating}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text variant="caption">고른 등급은 저장하면 함께 저장돼요. 적용 등급은 저장만으로 바뀌지 않아요.</Text>
      </View>
      <View style={[styles.applied, { borderColor: c.border }]}>
        <Text variant="body">{`적용 등급: ${applied ?? '아직 없음'}`}</Text>
        <Text variant="body">{`등급 검토: ${reviewStatus ? RATING_REVIEW_STATUS_LABELS[reviewStatus] : '정보 없음'}`}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three, marginTop: Spacing.three },
  group: { gap: Spacing.two },
  options: { flexDirection: 'row', gap: Spacing.two },
  option: {
    minHeight: MinTouchSize,
    minWidth: MinTouchSize * 2,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  applied: { gap: Spacing.one, borderTopWidth: 1, paddingTop: Spacing.three },
});
