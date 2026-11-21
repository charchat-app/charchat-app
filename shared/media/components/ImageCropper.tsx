import { useMemo, useRef, useState } from 'react';
import { Image, Modal, PanResponder, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Button, Text } from '@/components/ui';
import { MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import {
  CROP_RATIO,
  MAX_ZOOM,
  MIN_ZOOM,
  clampView,
  layoutOf,
  toCropRect,
  type CropFrame,
  type CropRect,
  type CropView,
  type ImageTarget,
} from '../rules';

const ZOOM_STEP = 0.25;
const MAX_FRAME_WIDTH = 320;
const MIN_FRAME_WIDTH = 120;
/** 자르기 틀 외에 제목·안내·확대·버튼이 차지하는 높이 */
const RESERVED_HEIGHT = 260;

export type ImageCropperProps = {
  uri: string;
  imageSize: CropFrame;
  target: ImageTarget;
  /** 자른 결과를 만들고 올리는 중 */
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (rect: CropRect) => void;
};

/**
 * 정지 이미지 자르기 (CREATE-US-06-AC04). 스토리는 3:4, 등장 캐릭터·유저 프로필은 1:1 틀이다.
 * 틀 안의 이미지를 끌어 옮기고 ＋/－로 확대한다. 확인하면 보이는 영역만 쓰고, 취소하면 아무것도 바꾸지 않는다.
 * GIF는 자르지 않으므로 이 화면을 쓰지 않는다(AC05).
 */
export function ImageCropper({ uri, imageSize, target, busy = false, onCancel, onConfirm }: ImageCropperProps) {
  const c = useTheme();
  const window = useWindowDimensions();
  const ratio = CROP_RATIO[target];
  // 낮은 화면(가로 모드·작은 창)에서도 확인 버튼이 보이도록 높이도 함께 고려한다.
  const byHeight = ((window.height - RESERVED_HEIGHT) * ratio.width) / ratio.height;
  const frameWidth = Math.max(MIN_FRAME_WIDTH, Math.min(MAX_FRAME_WIDTH, window.width - Spacing.six * 2, byHeight));
  const frame = useMemo(
    () => ({ width: frameWidth, height: (frameWidth * ratio.height) / ratio.width }),
    [frameWidth, ratio.height, ratio.width],
  );
  const [view, setView] = useState<CropView>({ zoom: 1, offsetX: 0, offsetY: 0 });
  // 제스처는 한 번만 만들어지므로 최신 값은 ref로 읽는다.
  const latest = useRef({ view, frame, imageSize });
  latest.current = { view, frame, imageSize };
  const start = useRef<CropView>(view);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          start.current = latest.current.view;
        },
        onPanResponderMove: (_, g) => {
          const { frame: f, imageSize: size } = latest.current;
          setView(
            clampView(size, f, {
              zoom: start.current.zoom,
              offsetX: start.current.offsetX + g.dx,
              offsetY: start.current.offsetY + g.dy,
            }),
          );
        },
      }),
    [],
  );

  const zoomBy = (delta: number) => setView((v) => clampView(imageSize, frame, { ...v, zoom: v.zoom + delta }));
  const layout = layoutOf(imageSize, frame, clampView(imageSize, frame, view));
  const ratioLabel = `${ratio.width}:${ratio.height}`;

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel} visible>
      <View style={styles.backdrop}>
        <View style={[StyleSheet.absoluteFill, styles.dim, { backgroundColor: c.text }]} />
        <View style={[styles.sheet, { backgroundColor: c.surface }]}>
          <Text variant="subheading">이미지 자르기 ({ratioLabel})</Text>
          <Text variant="caption">끌어서 위치를 옮기고 ＋/－로 확대해요. 틀 안에 보이는 부분만 저장돼요.</Text>
          <View
            testID="crop-frame"
            accessibilityLabel={`${ratioLabel} 자르기 영역`}
            style={[
              styles.frame,
              { width: frame.width, height: frame.height, borderColor: c.accent, backgroundColor: c.backgroundElement },
            ]}
            {...responder.panHandlers}
          >
            <Image
              source={{ uri }}
              accessibilityIgnoresInvertColors
              style={{
                position: 'absolute',
                left: layout.left,
                top: layout.top,
                width: layout.width,
                height: layout.height,
              }}
            />
          </View>
          <View style={styles.zoomRow}>
            <ZoomButton
              label="축소"
              glyph="－"
              disabled={busy || view.zoom <= MIN_ZOOM}
              onPress={() => zoomBy(-ZOOM_STEP)}
            />
            <Text variant="caption">{`${Math.round(view.zoom * 100)}%`}</Text>
            <ZoomButton
              label="확대"
              glyph="＋"
              disabled={busy || view.zoom >= MAX_ZOOM}
              onPress={() => zoomBy(ZOOM_STEP)}
            />
          </View>
          <View style={styles.actions}>
            <Button label="취소" variant="secondary" onPress={onCancel} disabled={busy} />
            <Button
              label={busy ? '올리는 중…' : '확인'}
              onPress={() => onConfirm(toCropRect(imageSize, frame, view))}
              disabled={busy}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ZoomButton({
  label,
  glyph,
  disabled,
  onPress,
}: {
  label: string;
  glyph: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.zoomButton, { borderColor: c.chipBorder }, disabled && styles.disabled]}
    >
      <Text variant="body">{glyph}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.55 },
  sheet: { padding: Spacing.four, borderRadius: Radius.lg, gap: Spacing.three, alignItems: 'center', maxWidth: 400 },
  frame: { overflow: 'hidden', borderWidth: 2, borderRadius: Radius.sm },
  zoomRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  zoomButton: {
    minWidth: MinTouchSize,
    minHeight: MinTouchSize,
    borderWidth: 1,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.3 },
  actions: { flexDirection: 'row', gap: Spacing.two, alignSelf: 'stretch', justifyContent: 'flex-end' },
});
