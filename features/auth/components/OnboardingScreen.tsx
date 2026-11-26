// BASE-03 가입 온보딩: 필수 동의 3개(만 14세 이상·이용약관·개인정보 수집·이용)와 기본 플레이 이름
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, FormField, Notice, Surface, Text, TextField } from '@/components/ui';
import { MaxContentWidth, MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { useCompleteOnboarding, useMe, useSignOut } from '@/features/auth/hooks/useAuth';
import { UNDERAGE_NOTICE } from '@/features/auth/session';
import type { MeResponse } from '@/features/auth/types';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api-client';

function ConsentCheck({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      // 웹(react-native-web)은 accessibilityState.checked를 aria-checked로 옮기지 않아 직접 넣는다.
      aria-checked={checked}
      onPress={onToggle}
      style={styles.check}
    >
      <View
        style={[
          styles.box,
          { borderColor: checked ? c.accent : c.inputBorder, backgroundColor: checked ? c.accent : c.inputSurface },
        ]}
      >
        {checked ? (
          <Text variant="caption" style={{ color: c.onAccent }}>
            ✓
          </Text>
        ) : null}
      </View>
      <Text variant="body" style={styles.checkLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

type Checks = { age: boolean; terms: boolean; privacy: boolean };
const UNCHECKED: Checks = { age: false, terms: false, privacy: false };

function OnboardingForm({ me, onReloadMe }: { me: MeResponse; onReloadMe: () => void }) {
  // 미리 체크해 두지 않는다(개인정보 보호법 안내서: 만 14세 이상 자기 체크).
  const [checks, setChecks] = useState<Checks>(UNCHECKED);
  const [playName, setPlayName] = useState(me.default_play_name ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const complete = useCompleteOnboarding();
  const { signOut, pending: signingOut } = useSignOut();
  const nameError =
    complete.error instanceof ApiError && complete.error.code === 'PLAY_NAME_INVALID'
      ? complete.error.detail
      : undefined;
  const ready = checks.age && checks.terms && checks.privacy && playName.trim() !== '';
  const busy = complete.isPending || signingOut;

  const toggle = (key: keyof Checks) => setChecks((current) => ({ ...current, [key]: !current[key] }));

  const submit = () => {
    if (!ready || busy) return;
    setMessage(null);
    complete.mutate(
      {
        default_play_name: playName.trim(),
        consents: {
          terms: me.required_consents.terms,
          privacy: me.required_consents.privacy,
          age_14_plus: me.required_consents.age_14_plus,
        },
      },
      {
        onSuccess: (next) => {
          if (next.onboarding_required) setMessage('필수 항목을 모두 확인해 주세요.');
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'CONSENT_VERSION_MISMATCH') {
            // 약관 버전이 바뀌었으면 새 버전을 다시 읽고 동의를 다시 받는다.
            setChecks((current) => ({ ...current, terms: false, privacy: false }));
            setMessage('약관이 바뀌었습니다. 내용을 다시 확인하고 동의해 주세요.');
            onReloadMe();
          } else if (!(error instanceof ApiError && error.code === 'PLAY_NAME_INVALID')) {
            setMessage(
              error instanceof ApiError && error.detail ? error.detail : '저장하지 못했습니다. 다시 시도해 주세요.',
            );
          }
        },
      },
    );
  };

  return (
    <>
      <View style={styles.checks}>
        <ConsentCheck label="(필수) 만 14세 이상입니다" checked={checks.age} onToggle={() => toggle('age')} />
        <ConsentCheck label="(필수) 이용약관 동의" checked={checks.terms} onToggle={() => toggle('terms')} />
        <ConsentCheck
          label="(필수) 개인정보 수집·이용 동의"
          checked={checks.privacy}
          onToggle={() => toggle('privacy')}
        />
      </View>
      <FormField label="기본 플레이 이름 *" hint="대화에서 내 캐릭터를 부를 이름입니다." error={nameError}>
        <TextField
          accessibilityLabel="기본 플레이 이름"
          value={playName}
          onChangeText={setPlayName}
          invalid={nameError !== undefined}
        />
      </FormField>
      {message ? <Notice tone="alert" message={message} /> : null}
      <Button label={complete.isPending ? '저장 중…' : '시작하기'} disabled={!ready || busy} onPress={submit} />
      <Button
        label="만 14세 미만이에요"
        variant="secondary"
        disabled={busy}
        onPress={() => void signOut(UNDERAGE_NOTICE)}
      />
    </>
  );
}

export function OnboardingScreen() {
  const me = useMe();
  const { signOut, pending } = useSignOut();

  return (
    <Surface style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text variant="eyebrow">CHAR / CHAT</Text>
          <Text variant="heading">가입을 마무리해 주세요</Text>
          {me.data ? (
            <OnboardingForm me={me.data} onReloadMe={() => void me.refetch()} />
          ) : me.isError ? (
            <>
              <Notice tone="alert" message="계정 정보를 불러오지 못했습니다." />
              <Button label="다시 시도" variant="secondary" onPress={() => void me.refetch()} />
              <Button label="로그아웃" variant="secondary" disabled={pending} onPress={() => void signOut()} />
            </>
          ) : (
            <Text accessibilityLiveRegion="polite" variant="caption">
              계정 정보를 불러오는 중…
            </Text>
          )}
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
  checks: { gap: Spacing.two },
  check: { minHeight: MinTouchSize, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  box: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderRadius: Radius.sm / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkLabel: { flex: 1 },
});
