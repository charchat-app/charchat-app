// CHAT-US-02 대화방: 이력·스트리밍 응답·생성 진행 표시·입력창을 묶는다 · CHAT-US-03 작성 중 입력 기기 보관
import { useQueryClient } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Notice, Section, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { parseAssistantText } from '@/features/chat/assistantParser';
import { ConversationFrame } from '@/features/chat/components/ConversationFrame';
import { ChatComposer } from '@/features/chat/components/room/ChatComposer';
import { ChatHistory } from '@/features/chat/components/room/ChatHistory';
import { GenerationNotice } from '@/features/chat/components/room/GenerationNotice';
import { useSpeakers } from '@/features/chat/hooks/useSpeakers';
import { streamKey } from '@/features/chat/hooks/chatCache';
import { useChatDraft, useChatTurns } from '@/features/chat/hooks/useChatTurns';
import { type GenerationStream, useGenerationStream } from '@/features/chat/hooks/useGenerationStream';
import { useRetryGeneration } from '@/features/chat/hooks/useRetryGeneration';
import { type SendAttempt, useSendMessage } from '@/features/chat/hooks/useSendMessage';
import { emptyDraft } from '@/features/chat/messageDraft';
import type { ChatMessage, ConversationMessage, ConversationSession } from '@/shared/story-types';

const PENDING_NOTES: Record<SendAttempt['status'], string | null> = {
  posting: '보내는 중…',
  uncertain: '접수 여부 확인 필요',
  accepted: null,
  rejected: '보내지 못함',
};

function showPending(attempt: SendAttempt | null | undefined, messages: ChatMessage[]) {
  if (!attempt) return false;
  if (attempt.status === 'accepted') return !messages.some(({ id }) => id === attempt.generation.user_message_id);
  return attempt.status !== 'rejected' || !attempt.restored;
}

export function ChatRoom({ session, onBack }: { session: ConversationSession; onBack?: () => void }) {
  const sessionId = String(session.id);
  const client = useQueryClient();
  const turns = useChatTurns(sessionId, true);
  const { draft, update, clearSent, deviceUnavailable } = useChatDraft(sessionId, !session.read_only);
  const sender = useSendMessage(sessionId);
  const retrier = useRetryGeneration(sessionId, turns.data);
  const messages = turns.data?.messages ?? [];
  const active = turns.data?.active_generation ?? null;
  const lastFailed = turns.data?.last_failed_generation ?? null;
  const stream = useGenerationStream(sessionId, active);
  const { options, labelOf, characterNames } = useSpeakers(session);
  const retryAttempt = retrier.attempt;
  // 결과를 모르는 재시도의 실패 안내가 이력에서 사라졌으면 따로 확인 버튼을 보인다(같은 요청 ID로 확인).
  const orphanRetry =
    retrier.isBusy &&
    retryAttempt?.status === 'uncertain' &&
    (!!active || lastFailed?.id !== retryAttempt.generationId);

  const toBubbles = (text: string): ConversationMessage[] => parseAssistantText(text, characterNames);
  const failedText = lastFailed
    ? (client.getQueryData<GenerationStream>(streamKey(lastFailed.id))?.text ?? lastFailed.text)
    : '';
  const attempt = sender.attempt;
  const pending: ConversationMessage[] = showPending(attempt, messages)
    ? (attempt?.parts ?? []).map((part) => ({
        speaker_kind: part.speaker_kind,
        speaker_name: labelOf(
          part.speaker_kind === 'character' && part.character_id !== null
            ? { kind: 'character', characterId: part.character_id }
            : { kind: part.speaker_kind === 'user' ? 'user' : 'narrator' },
        ),
        body: part.body,
      }))
    : [];
  const generating = !!active || attempt?.status === 'posting' || retrier.attempt?.status === 'posting';
  // turns.model은 이 세션에 적용될 모델(서버가 항상 줌). 이력을 읽기 전이거나 빈 값이면 세션 값을 쓴다.
  const model = turns.data?.model || session.model;

  const blockedReason = !turns.isSuccess
    ? '대화 이력을 불러온 뒤 보낼 수 있습니다.'
    : sender.checking
      ? '이전 전송 기록을 확인하는 중입니다.'
      : attempt?.status === 'posting'
        ? '메시지를 보내는 중입니다.'
        : attempt?.status === 'uncertain'
          ? '이전 메시지의 접수 여부를 먼저 확인하세요.'
          : retrier.isBusy
            ? '재시도 요청을 처리하는 중입니다.'
            : active
              ? 'AI 응답이 끝나면 보낼 수 있습니다.'
              : null;

  const send = (parts: Parameters<typeof sender.send>[0]) => {
    const secured = sender.send(parts);
    if (!secured) return false;
    // 보낸 내용만 비우고 다음 발화자는 유저 캐릭터로 되돌린다(CHAT-US-02-AC01·AC05).
    clearSent(secured, emptyDraft());
    return true;
  };

  return (
    <ConversationFrame
      title="대화방"
      onBack={onBack}
      top={
        generating ? (
          <View style={styles.progress} accessibilityRole="progressbar" accessibilityLabel="응답 생성 중">
            <Text variant="subheading">...</Text>
          </View>
        ) : null
      }
      footer={
        session.read_only ? null : (
          <ChatComposer
            draft={draft}
            update={update}
            options={options}
            labelOf={labelOf}
            blockedReason={blockedReason}
            onSend={send}
          />
        )
      }
    >
      <Text variant="heading" accessibilityRole="header">
        {session.story_title}
      </Text>
      {session.read_only ? <Badge label="읽기 전용" /> : null}
      {model ? <Text variant="caption">적용 모델: {model}</Text> : null}
      {session.characters.length ? (
        <Section title="등장 캐릭터" first>
          {session.characters.map(({ id, name }) => (
            <Text key={id}>{name}</Text>
          ))}
        </Section>
      ) : null}
      <ChatHistory
        intro={session.messages}
        messages={messages}
        pending={pending}
        pendingNote={attempt ? PENDING_NOTES[attempt.status] : null}
        streaming={active && stream ? toBubbles(stream.text) : []}
        unsaved={lastFailed && lastFailed.status !== 'failed' && !active && failedText ? toBubbles(failedText) : []}
      />
      {turns.isPending && turns.fetchStatus !== 'idle' ? (
        <Text accessibilityLiveRegion="polite">대화 이력을 불러오는 중…</Text>
      ) : null}
      {turns.isError ? (
        <>
          <Notice tone="alert" message="대화 이력을 불러오지 못했습니다." />
          <Button
            label="다시 불러오기"
            accessibilityLabel="대화 이력 다시 불러오기"
            variant="secondary"
            onPress={() => void turns.refetch()}
          />
        </>
      ) : null}
      {deviceUnavailable && !session.read_only ? (
        <Text variant="caption">이 기기에 작성 중인 내용을 보관하지 못했습니다. 입력은 계속할 수 있습니다.</Text>
      ) : null}
      {attempt?.status === 'uncertain' ? (
        <>
          <Notice
            tone="alert"
            message="메시지 접수 여부를 확인하지 못했습니다. 새로 보내지 않고 같은 요청으로 확인합니다."
          />
          <Button
            label="전송 결과 확인"
            accessibilityLabel="보낸 메시지 접수 확인"
            variant="secondary"
            onPress={sender.confirm}
          />
        </>
      ) : null}
      {attempt?.status === 'rejected' ? (
        <>
          <Notice
            tone="alert"
            message={`${attempt.message}${attempt.restored ? ' 보낸 내용을 입력창에 되돌렸습니다.' : ''}`}
          />
          <Button label="닫기" accessibilityLabel="전송 실패 안내 닫기" variant="secondary" onPress={sender.dismiss} />
        </>
      ) : null}
      {lastFailed && !active ? (
        <GenerationNotice
          generation={lastFailed}
          retryAttempt={retryAttempt}
          onRetry={() => retrier.retry(lastFailed)}
        />
      ) : null}
      {orphanRetry ? (
        <>
          <Notice
            tone="alert"
            message="재시도 접수 여부를 확인하지 못했습니다. 새로 요청하지 않고 같은 요청으로 확인합니다."
          />
          <Button
            label="재시도 결과 확인"
            accessibilityLabel="재시도 접수 확인"
            variant="secondary"
            onPress={retrier.confirm}
          />
        </>
      ) : null}
    </ConversationFrame>
  );
}

const styles = StyleSheet.create({
  progress: { alignItems: 'center', paddingVertical: Spacing.one },
});
