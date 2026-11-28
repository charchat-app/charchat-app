// CHAT-US-09 여러 세션: 새로하기(새 방 만들기)·이어하기 목록·대화 삭제
import { type QueryClient, type InfiniteData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import {
  deleteConversationSession,
  getConversationSession,
  getConversationStory,
  getStorySessions,
  restartConversation,
} from '@/features/chat/api';
import { getConversationOwnerId } from '@/features/chat/conversationIdentity';
import { clearSessionDeviceData } from '@/features/chat/deviceDataCleanup';
import {
  conversationSessionKey,
  draftKey,
  isDefiniteRejection,
  retryAttemptKey,
  sendAttemptKey,
  turnsKey,
} from '@/features/chat/hooks/chatCache';
import { newRequestId } from '@/features/chat/requestId';
import type { StorySessionPage, StorySessionSummary } from '@/features/chat/types';
import { ApiError } from '@/lib/api-client';

/** 이어하기 목록. 계정·스토리·뺄 방(지금 방)마다 따로 둔다. 방을 바꾸면 다른 키라 이전 방 목록이 섞이지 않는다. */
export const storySessionsKey = (ownerId: string | null, storyId: string, excludeSessionId: string) =>
  ['conversation', 'story-sessions', ownerId, storyId, excludeSessionId] as const;
const ALL_STORY_SESSIONS = ['conversation', 'story-sessions'] as const;
/** 새로하기 인트로 카드용 스토리 조회. 스토리 상세 화면의 조회(시작 버튼 상태와 묶임)와 따로 둔다. */
const restartStoryKey = (storyId: string) => ['conversation', 'restart-story', storyId] as const;
/** 결과를 모르는 새로하기 요청. 같은 원본 방·같은 인트로로 다시 누르면 같은 request_id를 쓴다. */
const restartAttemptKey = (sessionId: string) => ['conversation', 'restart-attempt', sessionId] as const;

type RestartAttempt = { introId: number; requestId: string };

/** 목록에 보일 기본 제목. 제목이 없으면 그 방을 시작한 인트로 제목(임시 기본값 4). */
export function sessionTitle(session: StorySessionSummary) {
  return session.intro_title?.trim() || '저장된 대화';
}

const pad = (value: number) => String(value).padStart(2, '0');

/** 마지막 활동 시각을 기기 시간대로 `2026.11.22 14:08`처럼 쓴다. 값이 없거나 읽을 수 없으면 null. */
export function formatActivity(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 항목을 구별하는 이름. 같은 인트로로 만든 방은 기본 제목이 같으므로 시각을 붙인다(접근성 라벨용). */
export function sessionName(session: StorySessionSummary) {
  const time = formatActivity(session.last_activity_at);
  return time ? `${sessionTitle(session)}, ${time}` : sessionTitle(session);
}

export function useRestartStory(storyId: string) {
  return useQuery({
    queryKey: restartStoryKey(storyId),
    queryFn: ({ signal }) => getConversationStory(storyId, signal),
    retry: false,
    // 메뉴를 열 때마다 최신 인트로를 읽는다.
    staleTime: 0,
  });
}

export function useStorySessions(storyId: string, excludeSessionId: string, enabled: boolean) {
  const ownerId = getConversationOwnerId();
  return useInfiniteQuery({
    queryKey: storySessionsKey(ownerId, storyId, excludeSessionId),
    queryFn: ({ pageParam, signal }) => getStorySessions(storyId, excludeSessionId, pageParam, signal),
    initialPageParam: null as number | null,
    getNextPageParam: ({ next_before_id }, _pages, lastCursor) =>
      next_before_id !== null &&
      Number.isSafeInteger(next_before_id) &&
      next_before_id > 0 &&
      (lastCursor === null || next_before_id < lastCursor)
        ? next_before_id
        : undefined,
    enabled: enabled && ownerId !== null,
    retry: false,
    // 목록을 열 때마다 서버에서 다시 읽는다(다른 기기에서 지운 방·새 미리보기).
    staleTime: 0,
  });
}

/**
 * 지운 방(또는 이미 없는 방)을 이 앱에서 잊는다(CHAT-US-09-AC14).
 * 그 방의 화면 캐시(상세·이력·입력·전송 기록)와 기기 보관분을 지우고, 목록에서 빼고, 다른 목록은 다시 읽게 한다.
 */
export async function forgetSession(client: QueryClient, sessionId: string, ownerId: string | null) {
  for (const key of [
    conversationSessionKey(sessionId),
    turnsKey(sessionId),
    draftKey(sessionId),
    sendAttemptKey(sessionId),
    retryAttemptKey(sessionId),
    restartAttemptKey(sessionId),
  ]) {
    client.removeQueries({ queryKey: key, exact: true });
  }
  client.setQueriesData<InfiniteData<StorySessionPage>>({ queryKey: ALL_STORY_SESSIONS }, (old) =>
    old
      ? {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            sessions: page.sessions.filter((session) => String(session.id) !== sessionId),
          })),
        }
      : old,
  );
  // 대화 탭 목록과 스토리 상세(이어하기 대상 방)도 지운 방을 가리키지 않게 다시 읽는다.
  void client.invalidateQueries({ queryKey: ['conversation', 'sessions'] });
  void client.invalidateQueries({ queryKey: ['conversation', 'story'] });
  await clearSessionDeviceData(ownerId, sessionId);
}

/**
 * 방 하나를 서버에서 지운다. 성공하거나 이미 없는 방(404)이면 이 앱에서도 잊는다.
 * 실패(409 응답 생성 중 등)는 그대로 던져 화면이 서버 안내를 보이게 한다.
 */
export async function deleteSession(client: QueryClient, sessionId: string) {
  const ownerId = getConversationOwnerId();
  try {
    await deleteConversationSession(sessionId);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }
  await forgetSession(client, sessionId, ownerId);
}

/** 삭제 실패 안내. 409 GENERATION_IN_PROGRESS는 서버 문구를 그대로 보인다. */
export function deleteErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.code === 'GENERATION_IN_PROGRESS') {
    return error.detail.startsWith('요청 실패') ? '응답이 끝난 뒤 삭제할 수 있어요.' : error.detail;
  }
  if (error instanceof ApiError && isDefiniteRejection(error) && error.code !== 'HTTP_ERROR') return error.detail;
  return '대화방을 삭제하지 못했어요. 다시 시도해 주세요.';
}

export function useDeleteSession() {
  const client = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ sessionId: string; message: string } | null>(null);
  const busy = useRef(false);
  return {
    pending,
    failure,
    reset: () => setFailure(null),
    remove: async (sessionId: string, onDone: () => void) => {
      if (busy.current) return;
      busy.current = true;
      setPending(sessionId);
      setFailure(null);
      try {
        await deleteSession(client, sessionId);
        onDone();
      } catch (error) {
        setFailure({ sessionId, message: deleteErrorMessage(error) });
      } finally {
        busy.current = false;
        setPending(null);
      }
    },
  };
}

export type RestartFailure = { message: string; uncertain: boolean };

/**
 * 새로하기(CHAT-US-09-AC01~AC04). 순서:
 * 1) 원본 방 기준으로 새 방을 만든다(request_id는 결과가 정해질 때까지 같은 값을 다시 쓴다).
 * 2) 새 방 상세를 실제로 읽어 열리는지 확인한다.
 * 3) 새 방으로 바꾼다(onOpened).
 * 4) 보관을 끈 경우에만 그 뒤에 원본 방을 지운다. 취소·실패하면 원본 방은 그대로다(AC04).
 */
export function useRestartSession(sessionId: string) {
  const client = useQueryClient();
  const [posting, setPosting] = useState(false);
  const [failure, setFailure] = useState<RestartFailure | null>(null);
  const busy = useRef(false);
  const key = restartAttemptKey(sessionId);

  const start = async (introId: number, keep: boolean, onOpened: (newSessionId: string) => void) => {
    if (busy.current) return;
    busy.current = true;
    setPosting(true);
    setFailure(null);
    // 팝업을 닫았다 다시 열어도(관찰자가 없어도) 결과를 모르는 요청을 잊지 않는다.
    client.setQueryDefaults(['conversation', 'restart-attempt'], { gcTime: Infinity });
    const saved = client.getQueryData<RestartAttempt>(key);
    // 인트로를 바꿨으면 새 요청이다. 같은 인트로의 결과를 모르는 요청은 같은 ID로 확인한다.
    const attempt = saved?.introId === introId ? saved : { introId, requestId: newRequestId() };
    client.setQueryData<RestartAttempt>(key, attempt);
    let created: string | null = null;
    try {
      const response = await restartConversation(sessionId, { intro_id: introId, request_id: attempt.requestId });
      if (!Number.isSafeInteger(response?.id) || response.id <= 0) throw new Error('대화방 ID를 확인할 수 없습니다.');
      created = String(response.id);
      const newId = created;
      await client.fetchQuery({
        queryKey: conversationSessionKey(newId),
        queryFn: ({ signal }) => getConversationSession(newId, signal),
        retry: false,
      });
      client.removeQueries({ queryKey: key, exact: true });
      void client.invalidateQueries({ queryKey: ALL_STORY_SESSIONS });
      void client.invalidateQueries({ queryKey: ['conversation', 'sessions'] });
      void client.invalidateQueries({ queryKey: ['conversation', 'story'] });
      onOpened(newId);
      // 새 방이 열린 뒤에만 원본을 지운다. 실패하면 원본은 이어하기 목록에 남는다.
      if (!keep) void deleteSession(client, sessionId).catch(() => {});
    } catch (error) {
      if (created === null && isDefiniteRejection(error)) {
        // 서버가 확실히 거절했다. 같은 요청을 다시 보내도 결과가 같으므로 다음에는 새 요청으로 시작한다.
        client.removeQueries({ queryKey: key, exact: true });
        setFailure({ message: error.detail, uncertain: false });
      } else {
        setFailure({
          message:
            created === null
              ? '새 대화방을 만들었는지 확인하지 못했어요. 다시 누르면 같은 요청으로 확인해요.'
              : '새 대화방을 열지 못했어요. 다시 누르면 같은 대화방을 다시 열어요.',
          uncertain: true,
        });
      }
    } finally {
      busy.current = false;
      setPosting(false);
    }
  };

  return { posting, failure, start, reset: () => setFailure(null) };
}
