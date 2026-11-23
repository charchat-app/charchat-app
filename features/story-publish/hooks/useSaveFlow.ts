// CREATE-US-06 기본 정보 → 이미지 순서 저장의 진행 잠금과 단계별 실패 상태.
import { useCallback, useRef, useState } from 'react';

/** 기본 정보 저장. 성공하면 true, 실패하면 false (실패 안내는 기본 정보 저장 상태가 맡는다). */
export type SaveBasicStep = () => Promise<boolean>;
/** 이미지 목록 재조회와 저장. 실패하면 예외를 던진다. */
export type SaveImagesStep = () => Promise<void>;

export type SaveFlow = {
  /** 첫 요청부터 이미지 저장이 끝날 때까지 true. 이 동안 저장 버튼과 편집을 잠근다. */
  running: boolean;
  /** 기본 정보는 저장됐지만 이미지 단계(재조회·저장)가 실패한 이유. 없으면 null. */
  imageError: Error | null;
  /** 기본 정보 → 이미지 순서로 저장한다. 이미 진행 중이면 아무것도 하지 않고 false. */
  saveAll: (saveBasic: SaveBasicStep, saveImages: SaveImagesStep) => Promise<boolean>;
  /** 기본 정보는 다시 보내지 않고 이미지 단계만 다시 시도한다. 이미 진행 중이면 false. */
  retryImages: (saveImages: SaveImagesStep) => Promise<boolean>;
  /**
   * 사진 단계 없이 한 요청만 같은 진행 잠금 안에서 보낸다(CREATE-US-05-AC06 임시 저장).
   * 앞선 사진 단계 실패(imageError)는 지우지 않는다. 이미 진행 중이면 false.
   */
  run: (job: () => Promise<unknown>) => Promise<boolean>;
};

export function useSaveFlow(): SaveFlow {
  // 상태 갱신은 다음 렌더에 반영되므로, 같은 순간의 두 번째 누름은 ref로 막는다.
  const lock = useRef(false);
  const [running, setRunning] = useState(false);
  const [imageError, setImageError] = useState<Error | null>(null);

  const guarded = useCallback(async (job: () => Promise<void>) => {
    if (lock.current) return false;
    lock.current = true;
    setRunning(true);
    try {
      await job();
      return true;
    } finally {
      lock.current = false;
      setRunning(false);
    }
  }, []);

  const runImages = useCallback(async (saveImages: SaveImagesStep) => {
    try {
      await saveImages();
      setImageError(null);
    } catch (error) {
      setImageError(error instanceof Error ? error : new Error(String(error)));
    }
  }, []);

  const saveAll = useCallback(
    (saveBasic: SaveBasicStep, saveImages: SaveImagesStep) =>
      guarded(async () => {
        setImageError(null);
        if (!(await saveBasic())) return;
        await runImages(saveImages);
      }),
    [guarded, runImages],
  );

  const retryImages = useCallback(
    (saveImages: SaveImagesStep) => guarded(() => runImages(saveImages)),
    [guarded, runImages],
  );

  const run = useCallback(
    (job: () => Promise<unknown>) =>
      guarded(async () => {
        await job();
      }),
    [guarded],
  );

  return { running, imageError, saveAll, retryImages, run };
}
