import { useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { usePreventRemove } from 'expo-router';

const message = '저장하지 않은 변경 내용이 사라집니다. 나가시겠습니까?';

/** 미저장 이탈 확인 창. 나가기를 확정했을 때만 onLeave를 부른다(취소하면 아무것도 하지 않는다). */
export function confirmUnsavedLeave(onLeave: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm(message)) onLeave();
  } else
    Alert.alert('미저장 변경', message, [
      { text: '취소', style: 'cancel' },
      { text: '나가기', style: 'destructive', onPress: onLeave },
    ]);
}

export function useUnsavedCreationGuard(unsaved: boolean) {
  const [discard, setDiscard] = useState(false);
  useEffect(() => {
    if (!unsaved) setDiscard(false);
  }, [unsaved]);
  // 설치된 Expo Router의 훅은 웹 beforeunload도 함께 처리한다.
  usePreventRemove(unsaved && !discard, ({ repeat }) => {
    confirmUnsavedLeave(() => {
      setDiscard(true);
      repeat();
    });
  });
}
