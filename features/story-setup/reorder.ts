// 캐릭터 순서 변경 계산 (CREATE-US-01-AC14). 화면과 분리해 테스트한다.
import type { BasicInfoValues } from './types';

/**
 * 드래그를 놓은 위치에서 가장 가까운 항목의 key를 찾는다.
 *
 * 각 항목의 위치는 저장해 두지 않고 **현재 순서와 높이로 매번 계산**한다.
 * 웹(react-native-web)의 onLayout은 크기가 바뀔 때만 다시 알려 줘서, 순서가 바뀐 뒤 저장해 둔
 * 위치(y)가 낡은 값으로 남아 다음 드래그가 엉뚱한 자리로 가는 문제가 있었다. 높이는 순서가 바뀌어도 같다.
 *
 * @param heights 항목별 높이(onLayout으로 받은 값)
 * @param keys 현재 화면 순서
 * @param gap 항목 사이 간격
 */
export function dropTargetKey(
  heights: Map<string, number>,
  keys: string[],
  source: string,
  dy: number,
  gap: number,
): string {
  const centers = new Map<string, number>();
  let top = 0;
  for (const key of keys) {
    const height = heights.get(key);
    if (height === undefined) return source; // 아직 그려지지 않은 항목이 있으면 옮기지 않는다
    centers.set(key, top + height / 2);
    top += height + gap;
  }
  const origin = centers.get(source);
  if (origin === undefined) return source;
  const dropped = origin + dy;
  let target = source;
  let closest = Infinity;
  for (const [key, center] of centers) {
    const distance = Math.abs(dropped - center);
    if (distance < closest) {
      closest = distance;
      target = key;
    }
  }
  return target;
}

/**
 * source 항목을 끌 수 있는 세로 범위(CREATE-US-12). 목록 첫 자리 위·마지막 자리 아래로 나가지 않는다.
 * dropTargetKey와 같이 현재 순서·실제 높이·간격으로 계산한다. 높이를 모르는 항목이 있으면 null.
 */
export function dragBounds(
  heights: Map<string, number>,
  keys: string[],
  source: string,
  gap: number,
): { min: number; max: number } | null {
  let top = 0;
  let sourceTop: number | null = null;
  let sourceHeight = 0;
  for (const key of keys) {
    const height = heights.get(key);
    if (height === undefined) return null;
    if (key === source) {
      sourceTop = top;
      sourceHeight = height;
    }
    top += height + gap;
  }
  if (sourceTop === null) return null;
  const total = keys.length > 0 ? top - gap : 0;
  return { min: -sourceTop, max: total - sourceTop - sourceHeight };
}

/**
 * fromKey 캐릭터를 toKey 캐릭터 자리로 옮긴다. 각 캐릭터의 id·이름·상세는 그대로 따라간다.
 * 순서만 바뀌며 메인/서브 같은 역할은 부여하지 않는다.
 */
export function moveCharacter(values: BasicInfoValues, fromKey: string, toKey: string): BasicInfoValues {
  const from = values.characters.findIndex((c) => c.key === fromKey);
  const to = values.characters.findIndex((c) => c.key === toKey);
  if (from < 0 || to < 0 || from === to) return values;
  const characters = [...values.characters];
  const [moved] = characters.splice(from, 1);
  characters.splice(to, 0, moved);
  return { ...values, characters };
}
