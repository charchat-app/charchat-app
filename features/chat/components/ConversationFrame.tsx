// CHAT-US-01 대화 화면 공통 레이아웃
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Notice, ScreenHeader, Surface, Text } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';

export function ConversationFrame({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <Surface style={styles.fill}>
      <ScreenHeader title={title} onBack={onBack} />
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
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
});
