import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * 웹 전용. 서버 렌더링은 기기의 다크 모드를 모르므로 항상 밝은 모드로 그린다.
 * 첫 화면을 서버와 같은 밝은 모드로 맞춘 뒤(하이드레이션 후) 실제 설정으로 바꿔
 * "A tree hydrated but some attributes ... didn't match" 경고를 막는다.
 */
export function useColorScheme() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  const scheme = useRNColorScheme();
  return hydrated ? scheme : 'light';
}
