// CHAT-US-02 대화방: 이력·스트리밍 응답·생성 진행 표시·입력창을 묶는다 · CHAT-US-03 작성 중 입력 기기 보관
// CHAT-US-13 대화 중 모델 변경: 다음 응답부터 적용, 진행 중 생성은 기존 모델 유지
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, Notice, Section, Text } from '@/components/ui';
import { MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { parseAssistantText } from '@/features/chat/assistantParser';
import { ConversationFrame } from '@/features/chat/components/ConversationFrame';
import { ChatComposer } from '@/features/chat/components/room/ChatComposer';
import { ChatHistory } from '@/features/chat/components/room/ChatHistory';
import { GenerationNotice } from '@/features/chat/components/room/GenerationNotice';
import { ModelPicker } from '@/features/chat/components/room/ModelPicker';
import { useSpeakers } from '@/features/chat/hooks/useSpeakers';
import { streamKey } from '@/features/chat/hooks/chatCache';
import { useChangeSessionModel } from '@/features/chat/hooks/useChatModel';
import { useChatDraft, useChatTurns } from '@/features/chat/hooks/useChatTurns';
import { type GenerationStream, useGenerationStream } from '@/features/chat/hooks/useGenerationStream';
import { useRetryGeneration } from '@/features/chat/hooks/useRetryGeneration';
import { type SendAttempt, useSendMessage } from '@/features/chat/hooks/useSendMessage';
import { withParticle } from '@/features/chat/koreanParticle';
import { emptyDraft } from '@/features/chat/messageDraft';
import { useTheme } from '@/hooks/use-theme';
import type { ChatMessage, ConversationMessage, ConversationSession, SessionModelChange } from '@/shared/story-types';

const PENDING_NOTES: Record<SendAttempt['status'], string | null> = {
  posting: '보내는 중…',
  uncertain: '접수 여부 확인 필요',
  accepted: null,
  rejected: '보내지 못함',
};

/** 모델을 바꾼 뒤 남기는 안내. 진행 중 생성은 기존 모델로 끝까지 만든다(CHAT-US-13-AC02). */
function modelChangeNotice({ model, active_generation }: SessionModelChange, activeId: number | null) {
  const next = `다음 답변부터 ${withParticle(model, '을')} 써요.`;
  // 그 답변이 끝나면 "지금 만드는 답변은…" 부분은 맞지 않으므로 다음 답변 안내만 남긴다.
  return active_generation && active_generation.id === activeId
    ? `지금 만드는 답변은 ${withParticle(active_generation.model, '으로')} 끝까지 만들고, ${next}`
    : next;
}

function showPending(attempt: SendAttempt | null | undefined, messages: ChatMessage[]) {
  if (!attempt) return false;
  if (attempt.status === 'accepted') return !messages.some(({ id }) => id === attempt.generation.user_message_id);
  return attempt.status !== 'rejected' || !attempt.restored;
}

export function ChatRoom({ session, onBack }: { session: ConversationSession; onBack?: () => void }) {
  const sessionId = String(session.id);
  const colors = useTheme();
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
  const modelChange = useChangeSessionModel(sessionId);
  const [pickingModel, setPickingModel] = useState(false);
  const selectModel = (picked: { id: number; name: string }) => {
    const currentId = turns.data?.model_id;
    if (currentId !== undefined ? picked.id === currentId : picked.name === model) {
      setPickingModel(false);
      return;
    }
    // 응답 생성 중에도 바꿀 수 있다. 진행 중 생성은 서버가 기존 모델로 끝까지 만든다(CHAT-US-13-AC02).
    modelChange.mutate(picked.id, { onSuccess: () => setPickingModel(false) });
  };

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
            : modelChange.isPending
              ? '모델을 바꾸는 중입니다.'
              : active
                ? 'AI 응답이 끝나면 보낼 수 있습니다.'
                : null;

  const send = (parts: Parameters<typeof sender.send>[0]) => {
    const secured = sender.send(parts);
    if (!secured) return false;
    // 보낸 내용만 비우고 다음 발화자는 유저 캐릭터로 되돌린다(CHAT-US-02-AC01·AC05).
    clearSent(secured, emptyDraft());
    // 모델 변경 안내는 바꾼 뒤 첫 전송까지만 보인다. 이후에는 진행 표시의 모델 이름이 대신한다.
    // 변경 요청이 진행 중일 때 reset하면 결과(성공·실패 안내)를 잃으므로 그때는 두지 않는다.
    if (!modelChange.isPending) modelChange.reset();
    return true;
  };

  return (
    <ConversationFrame
      title="대화방"
      onBack={onBack}
      top={
        generating ? (
          <View style={styles.progress}>
            <View accessibilityRole="progressbar" accessibilityLabel="응답 생성 중">
              <Text variant="subheading">...</Text>
            </View>
            {/* 진행 중 생성이 요청한 모델. 도중에 모델을 바꿔도 이 이름은 그대로다(CHAT-US-13-AC02). */}
            {active?.model ? <Text variant="caption">{active.model} 답변 중</Text> : null}
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
      {model ? (
        session.read_only ? (
          <Text variant="caption">모델: {model}</Text>
        ) : (
          // 현재 모델 표시를 눌러 바로 바꾼다(PR #23 리뷰). ▾/▴로 목록이 펼쳐졌는지 보인다.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="대화 모델 변경"
            accessibilityHint={`지금 모델은 ${model}입니다`}
            accessibilityValue={{ text: model }}
            accessibilityState={{ expanded: pickingModel }}
            aria-expanded={pickingModel}
            onPress={() => setPickingModel((open) => !open)}
            style={[styles.modelToggle, { borderColor: colors.chipBorder }]}
          >
            <Text variant="caption">모델: {model}</Text>
            <Text variant="caption">{pickingModel ? '▴' : '▾'}</Text>
          </Pressable>
        )
      ) : null}
      {pickingModel && !session.read_only ? (
        <ModelPicker
          currentId={turns.data?.model_id}
          currentName={model}
          busy={modelChange.isPending}
          onSelect={selectModel}
        />
      ) : null}
      {modelChange.isError ? <Notice tone="alert" message="모델을 바꾸지 못했어요. 다시 시도해 주세요." /> : null}
      {modelChange.data ? (
        // 목록이 닫히며 초점이 사라져도 바뀐 결과를 화면 읽기 프로그램이 읽도록 알린다.
        <View accessibilityLiveRegion="polite" aria-live="polite">
          <Notice message={modelChangeNotice(modelChange.data, active?.id ?? null)} />
        </View>
      ) : null}
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
          currentModel={model}
          retryBlocked={modelChange.isPending}
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
  modelToggle: {
    alignSelf: 'flex-start',
    minHeight: MinTouchSize,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.lg,
  },
});
