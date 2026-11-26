// BASE-03 로그인 세션마다 새 서버 상태 캐시(QueryClient)를 쓴다.
// 계정이 바뀌면(로그인·로그아웃·만료) 이전 클라이언트를 버리므로 늦게 도착한 이전 계정 응답이 새 화면에 보이지 않는다.
import type { QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

export function useSessionQueryClient(sessionKey: number, create: () => QueryClient): QueryClient {
  const [current, setCurrent] = useState(() => ({ sessionKey, client: create() }));
  let active = current;
  if (current.sessionKey !== sessionKey) {
    // 렌더 중 이전 값 갱신 패턴: 같은 렌더에서 바로 새 클라이언트를 쓴다.
    active = { sessionKey, client: create() };
    setCurrent(active);
  }
  const { client } = active;
  useEffect(
    () => () => {
      // 버린 클라이언트의 진행 중 조회를 취소하고 캐시를 비운다.
      void client.cancelQueries();
      client.clear();
    },
    [client],
  );
  return client;
}
