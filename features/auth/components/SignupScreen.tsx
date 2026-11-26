// BASE-03 이메일·비밀번호 회원가입 화면. 가입하면 계정이 온보딩 전(pending)이라 가입 마무리 화면으로 이어진다.
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, FormField, Notice, Surface, Text, TextField } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import {
  emailAuthErrors,
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_RULE_HINT,
} from '@/features/auth/components/emailAuthErrors';
import { offersEmailPassword, useAuthProviders, useEmailSignup } from '@/features/auth/hooks/useAuth';
import { clearAuthNotice } from '@/lib/authSession';

function goToLogin() {
  if (router.canGoBack()) router.back();
  else router.replace('/login');
}

function SignupForm() {
  const signup = useEmailSignup();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const errors = emailAuthErrors(signup.error);
  // 요청 중에는 다시 보내지 않는다(중복 가입 방지).
  const canSubmit = email.trim() !== '' && password !== '' && confirm !== '' && !signup.isPending;

  const submit = () => {
    if (!canSubmit) return;
    // 비밀번호 확인이 다르면 서버에 보내지 않고 안내한다.
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    clearAuthNotice();
    signup.mutate({ email, password });
  };

  const changePassword = (value: string) => {
    setPassword(value);
    setMismatch(false);
  };
  const changeConfirm = (value: string) => {
    setConfirm(value);
    setMismatch(false);
  };

  return (
    <>
      <FormField label="이메일 *" error={errors.email}>
        <TextField
          accessibilityLabel="이메일"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          invalid={errors.email !== undefined}
        />
      </FormField>
      <FormField label="비밀번호 *" hint={PASSWORD_RULE_HINT} error={errors.password}>
        <TextField
          accessibilityLabel="비밀번호"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          secureTextEntry
          value={password}
          onChangeText={changePassword}
          invalid={errors.password !== undefined}
        />
      </FormField>
      <FormField label="비밀번호 확인 *" error={mismatch ? PASSWORD_MISMATCH_MESSAGE : undefined}>
        <TextField
          accessibilityLabel="비밀번호 확인"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          secureTextEntry
          value={confirm}
          onChangeText={changeConfirm}
          onSubmitEditing={submit}
          invalid={mismatch}
        />
      </FormField>
      {errors.form ? <Notice tone="alert" message={errors.form} /> : null}
      <Button
        label={signup.isPending ? '가입 중…' : '가입하기'}
        disabled={!canSubmit}
        // 웹(react-native-web)에도 비활성 상태를 알린다.
        aria-disabled={!canSubmit}
        onPress={submit}
      />
    </>
  );
}

export function SignupScreen() {
  const providers = useAuthProviders();

  return (
    <Surface style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text variant="eyebrow">CHAR / CHAT</Text>
          <Text variant="heading">회원가입</Text>

          {providers.isPending ? (
            <Text accessibilityLiveRegion="polite" variant="caption">
              가입 방법을 불러오는 중…
            </Text>
          ) : providers.isError ? (
            <>
              <Notice tone="alert" message="가입 방법을 불러오지 못했습니다." />
              <Button label="다시 시도" variant="secondary" onPress={() => void providers.refetch()} />
            </>
          ) : offersEmailPassword(providers.data) ? (
            <SignupForm />
          ) : (
            <Text variant="caption">지금은 회원가입을 할 수 없어요.</Text>
          )}

          <Button label="이미 계정이 있어요 · 로그인" variant="secondary" onPress={goToLogin} />
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
