/**
 * CREATE-US-12: 앱 공통 다크 전용 테마. 기기 설정과 관계없이 같은 팔레트를 돌려준다.
 * 기기 설정을 읽지 않으므로 웹 서버 렌더링과 하이드레이션 결과도 같다.
 */

import { Colors } from '@/constants/theme';

export function useTheme() {
  return Colors.dark;
}
