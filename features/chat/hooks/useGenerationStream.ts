// CHAT-US-02 응답 스트리밍: 롱 폴링으로 원문을 offset부터 이어 받는다
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { pollGeneration } from '@/features/chat/api';
import { finishGeneration, isActiveStatus, refreshTurns, streamKey } from '@/features/chat/hooks/chatCache';
import { ApiError } from '@/lib/api-client';
import type { ChatGeneration } from '@/shared/story-types';

export const POLL_WAIT_SECONDS = 10;
const MAX_BACKOFF_MS = 15000;

/** 이 앱 실행에서 받은 생성 상태와 지금까지 모은 원문 */
export type GenerationStream = { generation: ChatGeneration; text: string; offset: number };

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

/**
 * 진행 중인 생성을 끝날 때까지 이어 받는다. 화면을 떠나면 조회만 멈추고 서버 생성은 취소하지 않는다(AC12·AC13).
 * 연결이 끊겨도 실패로 단정하지 않고 같은 생성 상태를 다시 조회한다(AC14). 생성 자체를 다시 요청하지 않는다.
 */
export function useGenerationStream(sessionId: string, generation: ChatGeneration | null | undefined) {
  const client = useQueryClient();
  const id = generation?.id ?? 0;
  const active = !!generation && isActiveStatus(generation.status);
  const { data } = useQuery<GenerationStream>({ queryKey: streamKey(id), queryFn: skipToken, gcTime: Infinity });

  useEffect(() => {
    if (!active || !generation) return;
    const controller = new AbortController();
    const { signal } = controller;
    const key = streamKey(generation.id);

    const run = async () => {
      // 재진입하면 이 앱 실행에서 모은 원문부터, 처음이면 0부터 받는다.
      let state = client.getQueryData<GenerationStream>(key) ?? { generation, text: '', offset: 0 };
      if (!isActiveStatus(state.generation.status)) {
        finishGeneration(client, sessionId, state.generation);
        return;
      }
      let failures = 0;
      while (!signal.aborted) {
        try {
          const next = await pollGeneration(generation.id, state.offset, POLL_WAIT_SECONDS, signal);
          if (signal.aborted) return;
          failures = 0;
          const grew = next.next_offset >= state.offset;
          state = {
            generation: next,
            text: grew ? state.text + next.text : state.text,
            offset: grew ? next.next_offset : state.offset,
          };
          client.setQueryData<GenerationStream>(key, state);
          if (!isActiveStatus(next.status)) {
            finishGeneration(client, sessionId, next);
            return;
          }
        } catch (error) {
          if (signal.aborted) return;
          if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
            void refreshTurns(client, sessionId);
            return;
          }
          failures += 1;
          await delay(Math.min(1000 * 2 ** failures, MAX_BACKOFF_MS), signal);
        }
      }
    };
    void run();
    return () => controller.abort();
    // generation 객체가 새로 와도 같은 생성이면 조회를 다시 시작하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, sessionId, id, active]);

  return data && data.generation.id === id ? data : undefined;
}
