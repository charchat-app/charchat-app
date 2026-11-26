// CREATE-US-12 제작 편집 셸 배치: 목업 v15 최종 CSS(.unified-theme .head/.sub/.tabs, .bottom:not(.nav))를 393x852 기준으로 옮긴 값.
// 실제 픽셀 배치는 Expo 실행 화면에서 확인한다. 여기서는 배치를 정하는 스타일 값이 바뀌지 않게 막는다.
import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text as RNText, type TextStyle, type ViewStyle } from 'react-native';

import { Button } from '@/components/ui/Button';
import { EditorHeader } from '@/components/ui/EditorHeader';
import { StickyFooter } from '@/components/ui/StickyFooter';
import { MinTouchSize } from '@/constants/theme';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const TABS = ['기본 설정', '말투·서술', '인트로'];

function flat(style: unknown): ViewStyle {
  return (StyleSheet.flatten(style as ViewStyle) ?? {}) as ViewStyle;
}

describe('CREATE-US-12: 편집 머리글 (목업 .head / .sub / .tabs)', () => {
  async function renderHeader(status?: string) {
    await render(
      <EditorHeader
        title="새 스토리"
        onBack={() => {}}
        backLabel="목록으로 돌아가기"
        badge="임시 저장"
        status={status}
        tabs={TABS}
        activeIndex={0}
        onTabChange={() => {}}
      />,
    );
  }

  it('CREATE-US-12: 뒤로 가기는 x16·y12에 놓인 44x44 원형 버튼이다', async () => {
    await renderHeader('저장 전');
    const back = screen.getByRole('button', { name: '목록으로 돌아가기' });
    expect(back).toHaveStyle({ width: 44, height: 44, borderRadius: 22 });

    // 머리 줄 좌우 16px·위 12px 여백 안에서 시작한다
    const row = flat(screen.getByTestId('editor-header-row').props.style);
    expect(row.paddingHorizontal).toBe(16);
    expect(row.paddingTop).toBe(12);
    expect(row.alignItems).toBe('center');
    expect(row.minHeight).toBe(60);
    // 60 = 위 12 + 버튼 44 + 아래 4
    expect((row.paddingTop as number) + 44 + (row.paddingBottom as number)).toBe(row.minHeight);
  });

  it('CREATE-US-12: 탭은 높이 36·라운드 8 알약이고 터치 영역은 hitSlop으로 44 이상이다', async () => {
    await renderHeader('저장 전');
    const tab = screen.getByRole('tab', { name: '말투·서술' });
    const style = flat(tab.props.style);
    expect(style.height ?? style.minHeight).toBe(36);
    expect(style.borderRadius).toBe(8);
    const slop = tab.props.hitSlop as { top: number; bottom: number };
    expect(36 + slop.top + slop.bottom).toBeGreaterThanOrEqual(MinTouchSize);
  });

  it('CREATE-US-12: 탭 줄은 hitSlop을 품을 만큼 세로 여백을 두어 알약 위쪽이 y90에 온다', async () => {
    await renderHeader('저장 전');
    const tab = screen.getByRole('tab', { name: '말투·서술' });
    const slop = tab.props.hitSlop as { top: number; bottom: number };
    const scroller = screen.getByTestId('editor-tabs');
    const content = flat(scroller.props.contentContainerStyle);
    // 안드로이드는 부모 밖 hitSlop을 받지 않으므로 스크롤 줄이 늘린 터치 영역을 감싼다
    expect(content.paddingVertical).toBeGreaterThanOrEqual(Math.max(slop.top, slop.bottom));
    expect(content.paddingHorizontal).toBe(16);

    // 머리 줄 60 + 상태 줄(글자 높이 + 아래 여백) + 탭 줄 위 여백 = 90
    const status = flat(screen.getByText('저장 전').props.style) as TextStyle;
    const top = 60 + (status.lineHeight as number) + (status.paddingBottom as number);
    expect(top + (content.paddingVertical as number)).toBe(90);
    // 알약 아래 12px 뒤에 구분선(.tabs padding-bottom 12px)
    const wrapper = flat(screen.getByTestId('editor-tabs-row').props.style);
    expect((content.paddingVertical as number) + (wrapper.paddingBottom as number)).toBe(12);
  });
});

describe('CREATE-US-12: 하단 저장 줄 (목업 .bottom:not(.nav))', () => {
  it('CREATE-US-12: 위아래 10px·좌우 16px·간격 14px이고 왼쪽 상태를 유지한다', async () => {
    await render(
      <StickyFooter testID="footer" status={<RNText>저장 시각</RNText>}>
        <Button label="임시 저장" variant="action" onPress={() => {}} />
      </StickyFooter>,
    );
    expect(screen.getByTestId('footer')).toHaveStyle({ paddingVertical: 10, paddingHorizontal: 16, gap: 14 });
    expect(screen.getByText('저장 시각')).toBeTruthy();
  });

  it('CREATE-US-12: 상태:버튼 폭 비율은 1:3이라 393 폭에서 버튼이 약 255px, 320 폭에서도 넘치지 않는다', async () => {
    await render(
      <StickyFooter status={<RNText>저장 시각</RNText>}>
        <Button label="임시 저장" variant="action" onPress={() => {}} />
      </StickyFooter>,
    );
    const status = flat(screen.getByTestId('sticky-footer-status').props.style);
    const actions = flat(screen.getByTestId('sticky-footer-actions').props.style);
    expect(status.minWidth).toBe(0);
    expect(actions.minWidth).toBe(0);
    const share = (width: number) =>
      ((width - 32 - 14) * (actions.flex as number)) / ((status.flex as number) + (actions.flex as number));
    expect(Math.abs(share(393) - 255)).toBeLessThanOrEqual(8);
    // 320 폭에서도 상태 칸이 남고 버튼은 44 이상 너비를 가진다
    expect(share(320)).toBeGreaterThan(180);
    expect(320 - 32 - 14 - share(320)).toBeGreaterThan(60);
  });

  it('CREATE-US-12: 버튼 하나는 남은 폭을 채우고, 두 개면 나란히 두되 줄어들 수 있다', async () => {
    await render(
      <StickyFooter status={<RNText>상태</RNText>}>
        {null}
        <Button label="임시 저장" variant="secondary" onPress={() => {}} />
        <Button label="변경 내용 저장" variant="action" onPress={() => {}} />
      </StickyFooter>,
    );
    const actions = flat(screen.getByTestId('sticky-footer-actions').props.style);
    expect(actions.flexDirection).toBe('row');
    const slots = screen.getAllByTestId('sticky-footer-action');
    expect(slots).toHaveLength(2);
    expect(flat(slots[0].props.style)).toMatchObject({ flexGrow: 0, flexShrink: 1, minWidth: 0 });
    expect(flat(slots[1].props.style)).toMatchObject({ flexGrow: 1, flexShrink: 1, minWidth: 0 });
  });

  it('CREATE-US-12: statusFullWidth면 오류 안내가 위 줄 전체 폭을 쓰고 다시 시도 버튼은 아래 줄에 따로 놓인다', async () => {
    const onRetry = jest.fn();
    await render(
      <StickyFooter testID="footer" statusFullWidth status={<RNText>이미지 저장에 실패했어요</RNText>}>
        <Button label="다시 시도" variant="secondary" onPress={onRetry} />
      </StickyFooter>,
    );
    expect(screen.getByTestId('footer')).toHaveStyle({ flexDirection: 'column', alignItems: 'stretch' });
    const status = flat(screen.getByTestId('sticky-footer-status').props.style);
    const actions = flat(screen.getByTestId('sticky-footer-actions').props.style);
    expect(status).toMatchObject({ flex: 0, width: '100%' });
    expect(actions).toMatchObject({ flex: 0, width: '100%' });
    expect(screen.getByText('이미지 저장에 실패했어요')).toBeTruthy();
    // 다시 시도 버튼은 상태 칸 밖 동작 칸에 있다
    const retry = screen.getByRole('button', { name: '다시 시도' });
    expect(screen.getByTestId('sticky-footer-status')).not.toContainElement(retry);
    expect(screen.getByTestId('sticky-footer-actions')).toContainElement(retry);
  });

  it('CREATE-US-12: 저장 버튼은 높이 46·라운드 11이다', async () => {
    await render(<Button label="임시 저장" variant="action" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: '임시 저장' })).toHaveStyle({ minHeight: 46, borderRadius: 11 });
  });
});
