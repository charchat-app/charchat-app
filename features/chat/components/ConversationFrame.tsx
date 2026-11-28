// CHAT-US-01 대화 화면 공통 레이아웃 · CHAT-US-02 상단 진행 표시·하단 입력창 자리
import { type ReactNode, useEffect, useRef } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Notice, ScreenHeader, Surface, Text } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';

/** 맨 아래에서 이만큼(px) 안이면 「맨 아래를 보는 중」으로 보고 새 내용을 따라 내려간다. */
export const FOLLOW_THRESHOLD = 80;

export function ConversationFrame({
  title,
  onBack,
  headerRight,
  top,
  footer,
  followLatest = false,
  jumpToLatestKey,
  children,
}: {
  title: string;
  onBack?: () => void;
  /** 헤더 오른쪽 끝 표시 (예: CHAT-US-08 상태 보기 켜기·끄기) */
  headerRight?: ReactNode;
  /** 스크롤과 관계없이 대화 영역 위쪽에 고정하는 표시 (예: 응답 생성 진행) */
  top?: ReactNode;
  /** 스크롤 영역 아래에 고정하는 입력창 */
  footer?: ReactNode;
  /**
   * 대화방처럼 최신 내용이 아래에 붙는 화면. 처음에는 맨 아래에서 시작하고, 맨 아래를 보고 있는 동안
   * 내용이 늘어나면(스트리밍 응답 포함) 따라 내려간다. 위로 올려 읽는 중이면 끌어내리지 않는다.
   */
  followLatest?: boolean;
  /** 값이 바뀌면(내가 메시지를 보냄 등) 읽던 위치와 관계없이 맨 아래로 내린다. */
  jumpToLatestKey?: string | number | null;
  children: ReactNode;
}) {
  const scroll = useRef<ScrollViewInstance>(null);
  const atBottom = useRef(true);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    atBottom.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) <= FOLLOW_THRESHOLD;
  };
  // Android는 크기 변경 알림 직후에는 아직 새 높이로 스크롤할 수 없어 한 프레임 뒤에 내린다.
  const scrollToEndNextFrame = (animated: boolean) => {
    requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated }));
  };
  const follow = () => {
    if (followLatest && atBottom.current) scrollToEndNextFrame(false);
  };

  useEffect(() => {
    if (!followLatest || jumpToLatestKey === undefined || jumpToLatestKey === null) return;
    atBottom.current = true;
    requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }));
  }, [followLatest, jumpToLatestKey]);

  return (
    <Surface style={styles.fill}>
      <ScreenHeader title={title} onBack={onBack} right={headerRight} />
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.fill}>
        {top}
        <ScrollView
          ref={scroll}
          testID="conversation-scroll"
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onScroll={followLatest ? onScroll : undefined}
          scrollEventThrottle={followLatest ? 16 : undefined}
          // 내용이 늘거나(새 메시지·스트리밍 조각) 화면 높이가 줄어도(키보드) 맨 아래를 보고 있었으면 따라간다.
          onContentSizeChange={followLatest ? follow : undefined}
          onLayout={followLatest ? follow : undefined}
        >
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </SafeAreaView>
    </Surface>
  );
}

export function ConversationLoadState({
  loading,
  loadingMessage,
  errorMessage,
  onRetry,
}: {
  loading: boolean;
  loadingMessage: string;
  errorMessage: string;
  onRetry?: () => void;
}) {
  return loading ? (
    <Text accessibilityLiveRegion="polite">{loadingMessage}</Text>
  ) : (
    <>
      <Notice tone="alert" message={errorMessage} />
      {onRetry ? <Button label="다시 시도" variant="secondary" onPress={onRetry} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  footer: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
});
