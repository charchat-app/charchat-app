import { act, renderHook } from '@testing-library/react-native';

import { useSaveFlow } from '../hooks/useSaveFlow';

/** 밖에서 끝낼 수 있는 Promise. 저장 요청이 아직 진행 중인 상태를 만든다. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useSaveFlow — 기본 정보 → 이미지 저장 잠금 (CREATE-US-06)', () => {
  it('첫 요청부터 이미지 저장이 끝날 때까지 다시 눌러도 저장을 새로 시작하지 않는다', async () => {
    const { result } = await renderHook(() => useSaveFlow());
    const basic = deferred<boolean>();
    const refetch = deferred<void>();
    const saveBasic = jest.fn(() => basic.promise);
    const saveImages = jest.fn(() => refetch.promise);

    let first!: Promise<boolean>;
    await act(async () => {
      first = result.current.saveAll(saveBasic, saveImages);
    });
    expect(result.current.running).toBe(true);

    // 기본 정보 저장 중 두 번째 누름
    let second!: boolean;
    await act(async () => {
      second = await result.current.saveAll(saveBasic, saveImages);
    });
    expect(second).toBe(false);

    // 기본 정보가 끝나고 이미지 단계(재조회 포함)가 진행 중인 동안에도 잠겨 있다
    await act(async () => {
      basic.resolve(true);
    });
    expect(saveImages).toHaveBeenCalledTimes(1);
    expect(result.current.running).toBe(true);
    let third!: boolean;
    await act(async () => {
      third = await result.current.saveAll(saveBasic, saveImages);
    });
    expect(third).toBe(false);
    let retried!: boolean;
    await act(async () => {
      retried = await result.current.retryImages(saveImages);
    });
    expect(retried).toBe(false);

    await act(async () => {
      refetch.resolve();
      await first;
    });
    expect(saveBasic).toHaveBeenCalledTimes(1);
    expect(saveImages).toHaveBeenCalledTimes(1);
    expect(result.current.running).toBe(false);
    expect(result.current.imageError).toBeNull();
  });

  it('기본 정보 저장이 실패하면 이미지 단계로 넘어가지 않고 이미지 실패로 표시하지 않는다', async () => {
    const { result } = await renderHook(() => useSaveFlow());
    const saveImages = jest.fn(async () => {});
    await act(async () => {
      await result.current.saveAll(async () => false, saveImages);
    });
    expect(saveImages).not.toHaveBeenCalled();
    expect(result.current.imageError).toBeNull();
    expect(result.current.running).toBe(false);
  });

  it('이미지 단계가 실패하면 그 이유를 남기고, 사진만 다시 저장하면 기본 정보는 다시 보내지 않는다', async () => {
    const { result } = await renderHook(() => useSaveFlow());
    const saveBasic = jest.fn(async () => true);
    const failing = jest.fn(async () => {
      throw new Error('네트워크 오류');
    });
    await act(async () => {
      await result.current.saveAll(saveBasic, failing);
    });
    expect(result.current.imageError?.message).toBe('네트워크 오류');
    expect(result.current.running).toBe(false);

    const succeeding = jest.fn(async () => {});
    await act(async () => {
      await result.current.retryImages(succeeding);
    });
    expect(saveBasic).toHaveBeenCalledTimes(1);
    expect(succeeding).toHaveBeenCalledTimes(1);
    expect(result.current.imageError).toBeNull();
  });

  it('다시 저장을 시작하면 이전 이미지 실패 표시를 지운다', async () => {
    const { result } = await renderHook(() => useSaveFlow());
    await act(async () => {
      await result.current.saveAll(
        async () => true,
        async () => {
          throw new Error('실패');
        },
      );
    });
    expect(result.current.imageError).not.toBeNull();
    await act(() =>
      result.current.saveAll(
        async () => false,
        async () => {},
      ),
    );
    expect(result.current.imageError).toBeNull();
  });
});
