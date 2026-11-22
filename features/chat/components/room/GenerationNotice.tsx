// CHAT-US-02 생성 실패 안내: 실패(재시도 가능)·중간 끊김·저장 실패를 구분한다. 자동 재시도는 없다.
import { View } from 'react-native';

import { Button, Notice, Text } from '@/components/ui';
import type { RetryAttempt } from '@/features/chat/hooks/useRetryGeneration';
import type { ChatGeneration } from '@/shared/story-types';

const FAILURE_MESSAGES = {
  failed: '응답을 생성하지 못했습니다. 보낸 메시지는 그대로 남아 있습니다.',
  failed_partial: '응답이 중간에 끊겼습니다.',
  save_failed: '응답을 저장하지 못했습니다.',
} as const;

/** 서버 error_code별 보조 설명. 모르는 코드는 기본 안내만 보인다. */
const ERROR_DETAILS: Record<string, string> = {
  STREAM_INTERRUPTED: '응답을 받는 중 연결이 끊겼습니다.',
  EMPTY_RESPONSE: '모델이 빈 응답을 보냈습니다.',
  SAVE_FAILED: '생성된 응답을 대화 이력에 저장하지 못했습니다.',
  GENERATION_STALE: '응답 생성이 오래 멈춰 중단되었습니다.',
  PROVIDER_NOT_CONFIGURED: '응답 모델 연결이 아직 설정되지 않았습니다.',
};

export function GenerationNotice({
  generation,
  retryAttempt,
  onRetry,
}: {
  generation: ChatGeneration;
  retryAttempt: RetryAttempt | null | undefined;
  onRetry: () => void;
}) {
  if (generation.status !== 'failed' && generation.status !== 'failed_partial' && generation.status !== 'save_failed') {
    return null;
  }
  const attempt = retryAttempt?.generationId === generation.id ? retryAttempt : null;
  const canRetry = generation.status === 'failed' && generation.retryable;
  return (
    <View testID="generation-notice">
      <Notice tone="alert" message={FAILURE_MESSAGES[generation.status]} />
      {generation.error_code && ERROR_DETAILS[generation.error_code] ? (
        <Text variant="caption">{ERROR_DETAILS[generation.error_code]}</Text>
      ) : null}
      {canRetry && attempt?.status === 'uncertain' ? (
        <Text variant="caption">재시도 접수 여부를 확인하지 못했습니다. 다시 누르면 같은 요청으로 확인합니다.</Text>
      ) : null}
      {attempt?.status === 'rejected' && attempt.message ? <Text variant="caption">{attempt.message}</Text> : null}
      {canRetry ? (
        <Button
          label={attempt?.status === 'posting' ? '다시 시도하는 중…' : '다시 시도'}
          accessibilityLabel="응답 생성 다시 시도"
          variant="secondary"
          disabled={attempt?.status === 'posting'}
          onPress={onRetry}
        />
      ) : null}
    </View>
  );
}
