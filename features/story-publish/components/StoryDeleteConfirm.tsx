// CREATE-US-07-AC10 스토리 삭제 확인
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { Button, Notice, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { ApiError } from '@/lib/api-client';

const PENDING_MESSAGE = '스토리를 삭제하는 중이에요.';

export type StoryDeleteConfirmProps = {
  /** 안내 문구에 보여 줄 스토리 제목. 비어 있으면 '제목 없는 스토리'로 표시한다 */
  storyTitle: string;
  /**
   * 삭제 확인 시 호출한다. 실제 삭제 연결은 공통 통합에서 한다.
   * 삭제가 끝날 때 이행되는 Promise를 반드시 돌려준다. 이행 전까지 잠금이 유지되고,
   * 거부되거나 던지면 실패로 보여 준다. 성공하면 호스트가 이 안내를 닫는다(언마운트).
   */
  onConfirm: () => Promise<void>;
  /** 취소 시 호출한다. 어떤 저장도 일어나지 않는다. 호스트가 이 안내를 닫는다(언마운트) */
  onCancel: () => void;
  /**
   * 호스트가 이미 삭제를 진행 중이다. 탭을 오가며 이 안내가 다시 만들어져도 진행 중으로 보이고 잠긴다.
   * 중복 삭제를 막는 기준은 호스트의 잠금이며, 이 값은 표시와 버튼 비활성화에 쓴다.
   */
  pending?: boolean;
  /** 호스트가 다른 작업(저장)을 하는 중이라 지금은 삭제를 확인할 수 없다. 취소는 할 수 있다 */
  blocked?: boolean;
  /** 호스트가 기억하는 마지막 삭제 실패 문구. 다시 만들어진 안내에서도 실패를 보여 주려고 쓴다 */
  error?: string | null;
};

/**
 * 삭제 확인 안내. 확인만 담당하고 삭제 방법은 모른다.
 * - 복구할 수 없고 기존 이용자의 대화가 중단된다고 경고한다.
 * - 진행 중에는 중복 호출과 취소를 막고, 실패하면 오류를 보여 준 뒤 다시 시도할 수 있다.
 * - 취소했거나 삭제에 성공하면 끝난 상태로 보고, 다시 렌더되기 전에 들어온 누름도 무시한다.
 */
export function StoryDeleteConfirm({
  storyTitle,
  onConfirm,
  onCancel,
  pending: hostPending = false,
  blocked = false,
  error: hostError = null,
}: StoryDeleteConfirmProps) {
  const [localPending, setPending] = useState(false);
  const [localError, setError] = useState<string | null>(null);
  const pending = localPending || hostPending;
  const error = pending ? null : (hostError ?? localError);
  // state·disabled는 다시 렌더되기 전 같은 틱의 누름을 막지 못하므로 ref로 먼저 잠근다
  const inFlight = useRef(false);
  // 취소 또는 삭제 성공 뒤에는 어떤 동작도 받지 않는다 (호스트가 언마운트할 때까지)
  const closed = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const confirm = async () => {
    if (closed.current || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    AccessibilityInfo.announceForAccessibility(PENDING_MESSAGE);
    try {
      await onConfirm();
      // 성공: 끝난 상태로 두고 잠금을 풀지 않는다. 호스트가 언마운트한다
      closed.current = true;
    } catch (e) {
      inFlight.current = false;
      if (mounted.current) {
        setError(e instanceof ApiError ? e.detail : '알 수 없는 오류가 발생했습니다.');
        setPending(false);
      }
    }
  };

  const cancel = () => {
    if (closed.current || inFlight.current) return;
    closed.current = true;
    onCancel();
  };

  return (
    <View style={styles.container}>
      <Text variant="subheading">‘{storyTitle.trim() || '제목 없는 스토리'}’를 삭제할까요?</Text>
      <Text variant="body">삭제한 스토리는 복구할 수 없어요.</Text>
      <Text variant="body">이 스토리로 나누던 기존 이용자의 대화도 중단돼요.</Text>
      {error ? <Notice tone="alert" message={error} /> : null}
      {pending ? (
        <Text variant="caption" accessibilityLiveRegion="polite">
          {PENDING_MESSAGE}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button label="취소" variant="secondary" onPress={cancel} disabled={pending} />
        <Button
          label={pending ? '삭제 중…' : '삭제'}
          variant="danger"
          onPress={() => void confirm()}
          disabled={pending || blocked}
          accessibilityState={{ disabled: pending || blocked, busy: pending }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two, padding: Spacing.four },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two, marginTop: Spacing.two },
});
