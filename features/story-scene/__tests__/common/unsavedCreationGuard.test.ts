import { act, renderHook } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import { usePreventRemove } from 'expo-router';
import { useUnsavedCreationGuard } from '../../hooks/useUnsavedCreationGuard';

jest.mock('expo-router', () => ({ usePreventRemove: jest.fn() }));
it('미저장 완성 스토리 이탈에서 취소는 유지하고 나가기 확정만 진행한다', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    const repeat = jest.fn();
    const view = await renderHook(() => useUnsavedCreationGuard(true));
    const callback = jest.mocked(usePreventRemove).mock.calls.at(-1)?.[1];
    expect(jest.mocked(usePreventRemove).mock.calls.at(-1)?.[0]).toBe(true);
    await act(() => callback?.({ data: { action: { type: 'GO_BACK' } }, repeat }));
    const buttons = alert.mock.calls[0][2];
    expect(buttons?.[0].text).toBe('취소');
    expect(repeat).not.toHaveBeenCalled();
    await act(() => buttons?.[1].onPress?.());
    expect(repeat).toHaveBeenCalledTimes(1);
    expect(jest.mocked(usePreventRemove).mock.calls.at(-1)?.[0]).toBe(false);
    await view.unmount();
  } finally {
    jest.restoreAllMocks();
  }
});
