import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { fetchTagSuggestions } from '../api';

const DEBOUNCE_MS = 250;

/** 입력이 잠시 멈춘 뒤의 값을 돌려준다. 글자마다 서버를 부르지 않기 위해서다. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** 해시태그 자동검색. 한 글자부터 조회한다 (CREATE-US-01-AC17). */
export function useTagSuggestions(input: string) {
  const query = useDebounced(input.trim(), DEBOUNCE_MS);
  return useQuery({
    queryKey: ['tag-suggestions', query],
    queryFn: () => fetchTagSuggestions(query),
    enabled: query.length > 0,
    staleTime: 30_000,
  });
}
