// charchat-app#36 말풍선 옆 화자 사진: 동그란 사진, 없거나 못 불러오면 이름 첫 글자
import { Image } from 'expo-image';
import { useState } from 'react';
import { type ImageStyle, Platform, type StyleProp, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui';
import { imageSource, imageUri, ServerImage } from '@/shared/media';

export const SPEAKER_AVATAR_SIZE = 34;

type Loaded = { uri: string; status: 'loaded' | 'failed' };

/**
 * 사진 아래에 이름 첫 글자(공통 Avatar)를 깔아 두고, 사진을 다 불러오면 첫 글자를 치운다.
 * 사진이 없거나, 불러오지 못하면(비공개로 바뀐 스토리·삭제된 스토리의 사진은 소유자 외에 404) 첫 글자가 남는다.
 * 웹의 ServerImage는 실패해도 onError를 부르지 않고 빈 칸을 그리므로, 이 겹침 방식이 두 플랫폼 모두에서 첫 글자를 보장한다.
 * 기기는 expo-image로 인증 헤더를 붙여 불러온다. React Native Image는 안드로이드 실기기에서 source.headers를
 * 보내지 않아 소유자 전용 사진(개인 프로필 사진, 비공개 스토리 사진)이 404가 됐다(갤럭시 탭 S7 확인).
 * 이름은 말풍선 안에도 적혀 있어 화면 읽기 프로그램에는 사진을 숨긴다.
 */
export function SpeakerAvatar({
  name,
  uri,
  size = SPEAKER_AVATAR_SIZE,
}: {
  name: string;
  uri: string | null;
  size?: number;
}) {
  const source = uri ? imageUri(uri) : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const status = source && loaded?.uri === source ? loaded.status : 'loading';
  const shape = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View
      testID="speaker-avatar"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={[styles.box, shape]}
    >
      {status !== 'loaded' ? <Avatar name={name} size={size} /> : null}
      {source && status !== 'failed' ? (
        <Photo
          uri={source}
          onLoad={() => setLoaded({ uri: source, status: 'loaded' })}
          onError={() => setLoaded({ uri: source, status: 'failed' })}
          style={[StyleSheet.absoluteFill, shape]}
        />
      ) : null}
    </View>
  );
}

type PhotoProps = {
  uri: string;
  onLoad: () => void;
  onError: () => void;
  style: StyleProp<ImageStyle>;
};

function Photo({ uri, onLoad, onError, style }: PhotoProps) {
  // 웹: 헤더를 붙일 수 없어 ServerImage가 인증 헤더로 파일을 받아 임시 주소로 보여 준다.
  if (Platform.OS === 'web') {
    return <ServerImage uri={uri} testID="speaker-avatar-image" onLoad={onLoad} onError={onError} style={style} />;
  }
  return (
    <Image
      source={imageSource(uri)}
      testID="speaker-avatar-image"
      onLoad={onLoad}
      onError={onError}
      contentFit="cover"
      // 소유자 전용 사진은 서버가 `private, no-store`로 보낸다. 기기 디스크에 남기지 않고 메모리에만 둔다.
      cachePolicy="memory"
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  box: { flexShrink: 0, overflow: 'hidden' },
});
