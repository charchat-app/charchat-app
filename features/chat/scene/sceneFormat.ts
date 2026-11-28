// CHAT-US-08 상태 카드 표시 형식: current_scene을 사람이 읽는 줄로 바꾼다. 빈 항목은 줄을 만들지 않는다.
import type { CurrentScene, SceneDate, SceneTime } from '@/shared/story-types';

const pad2 = (value: number) => String(value).padStart(2, '0');
const filled = (value: string | null | undefined): value is string => typeof value === 'string' && value !== '';

/**
 * 날짜 방식별 표시. calendar `2026년 11월 23일` / world `광무 2년 3월 3일` / elapsed `전학 3일째`.
 * 일부만 있으면 있는 칸만 잇는다(0 등으로 채우지 않는다). 보일 값이 없으면 null.
 */
export function formatChatSceneDate(date: SceneDate | null): string | null {
  if (!date) return null;
  if (date.mode === 'elapsed') {
    if (date.elapsed_day === null) return null;
    return [date.reference_event, `${date.elapsed_day}일째`].filter(filled).join(' ');
  }
  const ymd = [
    date.year !== null ? `${date.year}년` : null,
    date.month !== null ? `${date.month}월` : null,
    date.day !== null ? `${date.day}일` : null,
  ];
  const parts = date.mode === 'world' ? [date.era, ...ymd] : ymd;
  const text = parts.filter(filled).join(' ');
  return text || null;
}

/** 시간. 분까지 있으면 `07:05`(서버 info 줄과 같은 모양), 시만 있으면 `19시`. */
export function formatChatSceneTime(time: SceneTime | null): string | null {
  if (!time) return null;
  return time.minute === null ? `${time.hour}시` : `${pad2(time.hour)}:${pad2(time.minute)}`;
}

export type SceneCardCharacter = { name: string; clothing: string | null; innerThought: string | null };
export type SceneCardLines = {
  date: string | null;
  time: string | null;
  place: string | null;
  /** 착장·속마음 중 하나라도 있는 캐릭터만 */
  characters: SceneCardCharacter[];
};

/** 카드에 그릴 줄. 값이 없는 줄과 값이 하나도 없는 캐릭터는 뺀다. */
export function sceneCardLines(scene: CurrentScene): SceneCardLines {
  return {
    date: formatChatSceneDate(scene.date),
    time: formatChatSceneTime(scene.time),
    place: filled(scene.place) ? scene.place : null,
    characters: scene.characters
      .map(({ name, clothing, inner_thought }) => ({
        name,
        clothing: filled(clothing) ? clothing : null,
        innerThought: filled(inner_thought) ? inner_thought : null,
      }))
      .filter(({ clothing, innerThought }) => clothing !== null || innerThought !== null),
  };
}

export const isSceneCardEmpty = (lines: SceneCardLines) =>
  !lines.date && !lines.time && !lines.place && lines.characters.length === 0;
