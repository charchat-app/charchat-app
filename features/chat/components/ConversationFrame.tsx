// CHAT-US-01 대화 화면 공통 레이아웃 · CHAT-US-02 상단 진행 표시·하단 입력창 자리
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Notice, ScreenHeader, Surface, Text } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';

export function ConversationFrame({
  title,
  onBack,
  headerRight,
  top,
  footer,
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
  children: ReactNode;
}) {
  return (
    <Surface style={styles.fill}>
      <ScreenHeader title={title} onBack={onBack} right={headerRight} />
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.fill}>
        {top}
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
