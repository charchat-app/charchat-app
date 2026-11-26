// BASE-03 로그아웃 버튼. 로그인 세션이 있을 때만 보인다(개발용 헤더 모드에서는 숨긴다).
import { Button } from '@/components/ui';
import { useAuthGate, useSignOut } from '@/features/auth/hooks/useAuth';

export function SignOutButton() {
  const { signedIn } = useAuthGate();
  const { signOut, pending } = useSignOut();
  if (!signedIn) return null;
  return (
    <Button
      label={pending ? '로그아웃 중…' : '로그아웃'}
      variant="secondary"
      disabled={pending}
      onPress={() => void signOut()}
    />
  );
}
