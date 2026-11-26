// BASE-03 로그인 화면. 1차(A1)는 개발용 로그인 키만 있다. 카카오·구글·Apple 버튼은 A2에서 붙인다.
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, FormField, Notice, Surface, Text, TextField } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuthGate, useAuthProviders, useDevLogin } from '@/features/auth/hooks/useAuth';
import { ApiError } from '@/lib/api-client';
import { clearAuthNotice } from '@/lib/authSession';

function devLoginMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return '로그인하지 못했습니다. 다시 시도해 주세요.';
  if (error.code === 'AUTH_DEV_LOGIN_DISABLED') return '서버에서 개발용 로그인이 꺼져 있습니다.';
  if (error.code === 'VALIDATION_ERROR') return '로그인 키를 확인해 주세요.';
  if (error.code === 'NETWORK_ERROR') return '서버에 연결하지 못했습니다. 네트워크를 확인하세요.';
  return error.detail || '로그인하지 못했습니다. 다시 시도해 주세요.';
}

export function LoginScreen() {
  const { notice } = useAuthGate();
  const providers = useAuthProviders();
  const devLogin = useDevLogin();
  const [devKey, setDevKey] = useState('');
  // EXPO_PUBLIC_ 값은 빌드 때 들어간다. 운영 빌드에서는 켜지 않는다.
  const devLoginEnabled = process.env.EXPO_PUBLIC_DEV_LOGIN === '1';
  const socialProviders = providers.data?.providers.filter((item) => item.provider !== 'dev') ?? [];
  const canSubmit = devKey.trim() !== '' && !devLogin.isPending;

  const submit = () => {
    if (!canSubmit) return;
    clearAuthNotice();
    devLogin.mutate(devKey);
  };

  return (
    <Surface style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text variant="eyebrow">CHAR / CHAT</Text>
          <Text variant="heading">로그인</Text>
          {notice ? <Notice tone="alert" message={notice} /> : null}

          {providers.isPending ? (
            <Text accessibilityLiveRegion="polite" variant="caption">
              로그인 방법을 불러오는 중…
            </Text>
          ) : providers.isError ? (
            <>
              <Notice tone="alert" message="로그인 방법을 불러오지 못했습니다." />
              <Button label="다시 시도" variant="secondary" onPress={() => void providers.refetch()} />
            </>
          ) : socialProviders.length === 0 && !devLoginEnabled ? (
            <Text variant="caption">아직 사용할 수 있는 로그인 방법이 없습니다.</Text>
          ) : (
            <Text variant="caption">카카오·구글·Apple 로그인은 준비 중입니다.</Text>
          )}

          {devLoginEnabled ? (
            <>
              <FormField label="개발용 로그인 키" hint="서버의 개발용 로그인에 쓰는 값입니다. 예: 1">
                <TextField
                  accessibilityLabel="개발용 로그인 키"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={devKey}
                  onChangeText={setDevKey}
                  onSubmitEditing={submit}
                  invalid={devLogin.isError}
                />
              </FormField>
              {devLogin.isError ? <Notice tone="alert" message={devLoginMessage(devLogin.error)} /> : null}
              <Button
                label={devLogin.isPending ? '로그인 중…' : '개발용 로그인'}
                disabled={!canSubmit}
                onPress={submit}
              />
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Surface>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    gap: Spacing.three,
    padding: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
});
