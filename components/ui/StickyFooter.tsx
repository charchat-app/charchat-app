// CREATE-US-12 하단 고정 줄: 목업 v15 .bottom:not(.nav) (왼쪽 저장 상태 + 오른쪽 저장 버튼)
import { Children, isValidElement } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContentInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type StickyFooterProps = ViewProps & {
  /** 왼쪽 상태 영역 (저장 시각·진행·오류 안내). 남는 폭을 모두 쓴다. */
  status?: React.ReactNode;
  /** 조치가 필요한 오류 등 긴 상태 안내를 위 줄 전체 폭으로 두고, 동작은 그 아래 줄에 둔다. 기본값 false */
  statusFullWidth?: boolean;
};

/** 화면 아래에 붙는 저장 줄. 아래쪽 안전 영역만큼 띄운다. 버튼 등 동작은 children으로 받는다. */
export function StickyFooter({ status, statusFullWidth = false, children, style, ...rest }: StickyFooterProps) {
  const c = useTheme();
  // null·false 등 그리지 않는 자식은 빼고, 실제 동작만 칸으로 감싼다
  const actions = Children.toArray(children);

  return (
    <SafeAreaView
      edges={['bottom']}
      style={[
        styles.footer,
        statusFullWidth && styles.footerStacked,
        { backgroundColor: c.footer, borderTopColor: c.footerBorder },
        style,
      ]}
      {...rest}
    >
      <View testID="sticky-footer-status" style={[styles.status, statusFullWidth && styles.fullWidth]}>
        {status}
      </View>
      <View testID="sticky-footer-actions" style={[styles.actions, statusFullWidth && styles.fullWidth]}>
        {actions.map((child, index) => (
          <View
            // Children.toArray가 붙인 key를 그대로 쓴다
            key={isValidElement(child) && child.key != null ? child.key : String(child)}
            testID="sticky-footer-action"
            style={[styles.action, index === actions.length - 1 ? styles.actionGrow : styles.actionFixed]}
          >
            {child}
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // .unified-theme .bottom: padding 10px 16px, gap 14px
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 2,
    paddingHorizontal: ContentInset.horizontal,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  // 조치가 필요한 오류: 상태 줄 위, 동작 줄 아래로 쌓고 둘 다 전체 폭을 쓴다
  footerStacked: { flexDirection: 'column', alignItems: 'stretch' },
  fullWidth: { flex: 0, width: '100%' },
  // 상태:버튼 = 1:3. 좁은 폭에서는 상태 글자가 줄어들고 여러 줄로 내려간다
  status: { flex: 1, minWidth: 0 },
  actions: { flex: 3, minWidth: 0, flexDirection: 'row', gap: 8 },
  // 동작이 둘 이상이면 나란히 두고 모두 줄어들 수 있다. 마지막(주 행동)이 남는 폭을 갖는다
  action: { flexShrink: 1, minWidth: 0 },
  actionGrow: { flexGrow: 1 },
  actionFixed: { flexGrow: 0 },
});
