// CHAT-US-09 대화방 ☰ 메뉴: 오른쪽 서랍의 「새로하기」「이어하기」(AC01),
// 새로하기 확인 팝업(기존 대화 보관 기본 체크) → 인트로 카드(AC03) → 새 방으로 전환, 보관 해제면 그 뒤 원본 삭제(AC04),
// 이어하기 목록에서 방 전환(AC07~AC09)·대화 삭제 확인(AC13·AC14)
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { MinTouchSize } from '@/constants/theme';
import { DeleteSessionDialog } from '@/features/chat/components/sessions/DeleteSessionDialog';
import { IntroPicker } from '@/features/chat/components/sessions/IntroPicker';
import { SessionList } from '@/features/chat/components/sessions/SessionList';
import {
  CheckBox,
  Dialog,
  Drawer,
  MenuItem,
  sessionStyles,
} from '@/features/chat/components/sessions/SessionMenuParts';
import { positiveConversationId } from '@/features/chat/conversationIdentity';
import { useDeleteSession, useRestartSession } from '@/features/chat/hooks/useSessions';
import type { ConversationRoom, StorySessionSummary } from '@/features/chat/types';
import { useTheme } from '@/hooks/use-theme';

type Step = 'menu' | 'confirm' | 'intro' | 'list';

export function SessionMenu({
  session,
  onOpenSession,
}: {
  session: ConversationRoom;
  /** 다른 방으로 바꾼다. 라우트는 뒤로 가기 기록을 쌓지 않게 replace로 연결한다. */
  onOpenSession: (sessionId: string) => void;
}) {
  const c = useTheme();
  const sessionId = String(session.id);
  const storyId = positiveConversationId(String(session.story_id));
  const [step, setStep] = useState<Step | null>(null);
  const [keep, setKeep] = useState(true);
  const [deleting, setDeleting] = useState<StorySessionSummary | null>(null);
  const restart = useRestartSession(sessionId);
  const remover = useDeleteSession();

  // 옛 서버처럼 스토리 번호를 모르면 새로하기·이어하기를 열 수 없으므로 버튼을 그리지 않는다.
  if (!storyId) return null;

  const busy = restart.posting || remover.pending !== null;
  const close = () => {
    if (busy) return;
    setStep(null);
    setDeleting(null);
    remover.reset();
  };
  const openConfirm = () => {
    // 팝업을 열 때마다 「기존 대화 보관」은 체크된 상태로 시작한다(AC01).
    setKeep(true);
    restart.reset();
    setStep('confirm');
  };
  const open = (id: string) => {
    setStep(null);
    onOpenSession(id);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="대화 메뉴"
        accessibilityHint="새로하기와 이어하기를 열어요"
        accessibilityState={{ expanded: step !== null }}
        aria-expanded={step !== null}
        onPress={() => setStep('menu')}
        hitSlop={4}
        style={styles.trigger}
      >
        <Text variant="title" color="headerIcon">
          ☰
        </Text>
      </Pressable>
      <Modal visible={step !== null} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.root}>
          {/* 바깥을 눌러 닫기. 화면 읽기 프로그램은 서랍의 닫기 버튼·팝업의 취소 버튼을 쓴다. */}
          <Pressable
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            testID="session-menu-backdrop"
            onPress={close}
            style={[styles.backdrop, { backgroundColor: c.background + 'cc' }]}
          />
          {step === 'menu' ? (
            <Drawer title="대화 메뉴" closeLabel="대화 메뉴 닫기" onClose={close}>
              <MenuItem
                label="새로하기"
                description="지금 대화를 보관하고 새 이야기를 시작할 수 있어요."
                onPress={openConfirm}
              />
              <MenuItem
                label="이어하기"
                description="저장된 다른 대화를 골라 이어가요."
                onPress={() => setStep('list')}
              />
            </Drawer>
          ) : null}
          {step === 'confirm' ? (
            <Dialog title="새로운 이야기를 시작할까요?">
              <CheckBox label="기존 대화 보관" checked={keep} onToggle={() => setKeep((value) => !value)} />
              <Text variant="caption">
                {keep
                  ? '지금 대화는 이어하기 목록에 남아요.'
                  : '새 대화방이 열린 뒤에 지금 대화방을 삭제해요. 삭제하면 되돌릴 수 없어요.'}
              </Text>
              <View style={sessionStyles.actions}>
                <Button
                  label="취소"
                  accessibilityLabel="새로하기 취소"
                  variant="secondary"
                  onPress={close}
                  style={sessionStyles.flex}
                />
                <Button
                  label="확인"
                  accessibilityLabel="새로하기 확인"
                  onPress={() => setStep('intro')}
                  style={sessionStyles.flex}
                />
              </View>
            </Dialog>
          ) : null}
          {step === 'intro' ? (
            <IntroPicker
              storyId={storyId}
              keep={keep}
              posting={restart.posting}
              failure={restart.failure}
              onCancel={close}
              onStart={(introId) => void restart.start(introId, keep, open)}
            />
          ) : null}
          {step === 'list' ? (
            <SessionList
              storyId={storyId}
              sessionId={sessionId}
              onClose={close}
              onOpen={open}
              onRestart={openConfirm}
              covered={!!deleting}
              onDelete={(target) => {
                remover.reset();
                setDeleting(target);
              }}
            />
          ) : null}
          {step === 'list' && deleting ? (
            <>
              <View style={[styles.backdrop, { backgroundColor: c.background + 'cc' }]} />
              <DeleteSessionDialog
                session={deleting}
                pending={remover.pending === String(deleting.id)}
                error={remover.failure?.sessionId === String(deleting.id) ? remover.failure.message : null}
                onCancel={() => {
                  setDeleting(null);
                  remover.reset();
                }}
                onConfirm={() => void remover.remove(String(deleting.id), () => setDeleting(null))}
              />
            </>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { minWidth: MinTouchSize, minHeight: MinTouchSize, alignItems: 'center', justifyContent: 'center' },
  root: { flex: 1 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
