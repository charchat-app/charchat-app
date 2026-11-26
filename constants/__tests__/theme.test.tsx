// CREATE-US-12 앱 공통 다크 전용 테마: 목업 v15 최종 덮어쓰기(Palette 06 브라이트 블루·readable-text) 값과 같고,
// 기기 설정이 밝은 모드여도 같은 다크 값을 쓴다(웹 하이드레이션도 서버·클라이언트가 같은 값).
import { renderHook } from '@testing-library/react-native';

import { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'light' }));

describe('CREATE-US-12: 다크 전용 테마', () => {
  it('CREATE-US-12: 기기 설정이 밝은 모드여도 다크 팔레트를 쓴다', async () => {
    const { result } = await renderHook(() => useTheme());

    expect(result.current).toBe(Colors.dark);
    expect(result.current.background).toBe('#11161d');
  });

  it('CREATE-US-12: 목업 최종 색 토큰과 같다', () => {
    expect(Colors.dark).toMatchObject({
      background: '#11161d', // --paper
      text: '#e8eef7', // --ink
      textSecondary: '#c1cbdc', // readable-text --muted
      accent: '#3685ff', // .primary
      onAccent: '#060b13',
      backgroundElement: '#1e2733', // .section
      border: '#3b4556',
      surface: '#28313d', // .item, .state-card
      surfaceBorder: '#49515f',
      inputSurface: '#151d29',
      inputBorder: '#465263',
      actionFill: '#214a80', // 선택·하단 저장
      actionBorder: '#4c85cb',
      actionText: '#edf3fb',
      footer: '#1e2733', // .bottom
      footerBorder: '#414b5b',
      danger: '#eda3aa',
      userToken: '#c5a5ef',
    });
  });

  it('CREATE-US-12: 밝은 제작 색(이전 라이트 팔레트)이 남아 있지 않다', () => {
    const lightLeftovers = ['#f5f3ef', '#252d2a', '#245a46', '#fcfbf7', '#fffefa', '#e9eee8', '#dedfd8'];
    const values = Object.values(Colors.dark).map((value) => value.toLowerCase());
    for (const color of lightLeftovers) expect(values).not.toContain(color);
  });
});
