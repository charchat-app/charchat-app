// CREATE-US-06 소유자 전용 이미지 미리보기. 서버 이미지 파일을 불러올 때 인증을 함께 보낸다.
import { useEffect, useState } from 'react';
import { Image, Platform, View, type ImageProps } from 'react-native';

import { imageSource, isServerImage, loadImageObjectUrl } from '../api';

export type ServerImageProps = Omit<ImageProps, 'source'> & { uri: string };

/**
 * 서버 이미지(미등록·비공개 스토리 사진, 아직 연결하지 않은 사진은 소유자만 볼 수 있음)와
 * 기기에서 고른 사진을 같은 방식으로 보여 준다.
 * - 기기: Image source에 인증 헤더를 붙인다.
 * - 웹: Image가 헤더를 붙일 수 없어 인증 헤더로 받은 파일을 임시 주소로 바꿔 보여 준다.
 *   받는 동안과 실패했을 때는 빈 칸(같은 크기)을 보여 준다.
 */
export function ServerImage({ uri, ...rest }: ServerImageProps) {
  const webUri = useWebAuthorizedUri(uri);
  if (Platform.OS !== 'web') return <Image {...rest} source={imageSource(uri)} />;
  if (webUri === null) return <View testID={rest.testID} style={rest.style} />;
  return <Image {...rest} source={{ uri: webUri }} />;
}

type Loaded = { source: string; url: string | null };

function useWebAuthorizedUri(uri: string): string | null {
  const needsFetch = Platform.OS === 'web' && isServerImage(uri);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!needsFetch) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    loadImageObjectUrl(uri, controller.signal)
      .then((url) => {
        if (controller.signal.aborted) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setLoaded({ source: uri, url });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ source: uri, url: null });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [uri, needsFetch]);

  if (!needsFetch) return uri;
  return loaded?.source === uri ? loaded.url : null;
}
