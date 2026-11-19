import { useCallback, useEffect, useRef, useState } from 'react';
import type { FewshotRepository } from '@/features/story-publish';
import { ApiError } from '@/lib/api-client';
import {
  applyAllocatedIds,
  newFewshotKey,
  type FewshotCharacter,
  type FewshotGroup,
  type FewshotsDocument,
} from '@/shared/story-types';
import { removeMissingSpeakers } from '../characterSync';
import { countRawText } from '@/lib/rawText';
import { useStoryCharacters } from './useStoryCharacters';

/** 발화자 목록이 같은지 본다. position은 서버 순서 번호라 비교하지 않고 id·이름·순서만 본다. */
const sameRoster = (a: readonly FewshotCharacter[] | null, b: readonly FewshotCharacter[]) =>
  !!a &&
  a.length === b.length &&
  a.every((person, index) => person.id === b[index].id && person.name === b[index].name);

export function useFewshotEditor(repository: FewshotRepository, storyId: string) {
  const [snapshot, setSnapshot] = useState<FewshotsDocument | null>(null);
  const [groups, setGroups] = useState<FewshotGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState(false);
  const [characterNotice, setCharacterNotice] = useState<string | null>(null);
  const people = useRef<FewshotCharacter[] | null>(null);
  // 지금 쓰는 발화자 목록이 서버 기준 언제 시점의 정보인지(ms). 더 오래된 목록으로 말풍선을 지우지 않기 위해 비교한다.
  const rosterAt = useRef(0);
  const alive = useRef(false),
    generation = useRef(0),
    busy = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const pending = useRef<{ document: FewshotsDocument; key: string; issuedAt: number } | null>(null);
  /** 서버 응답(퓨샷 조회·저장)에 들어 있는 발화자 목록을 요청 시각 기준 정보로 채택한다. 더 새 목록이 이미 있으면 유지한다. */
  // 스토리 조회 캐시에서 마지막으로 받은 목록. 퓨샷 조회가 끝나기 전에 도착해도 버리지 않고 비교에 쓴다.
  const cached = useRef<{ characters: FewshotCharacter[]; updatedAt: number } | null>(null);
  const adoptServerPeople = (characters: FewshotCharacter[], requestedAt: number) => {
    const cache = cached.current;
    if (cache && cache.updatedAt >= requestedAt && (people.current === null || cache.updatedAt >= rosterAt.current)) {
      // 요청 뒤에 받은 스토리 조회 결과가 더 새 정보다.
      people.current = cache.characters;
      rosterAt.current = cache.updatedAt;
    } else if (people.current === null || rosterAt.current <= requestedAt) {
      people.current = characters;
      rosterAt.current = requestedAt;
    }
    return people.current;
  };
  const applyPeople = useCallback((next: FewshotCharacter[], updatedAt: number) => {
    cached.current = { characters: next, updatedAt };
    if (!alive.current || people.current === null) return;
    // 이미 반영한 퓨샷 응답보다 오래된 스토리 조회 결과는 버린다(다른 기기에서 추가한 인물의 말풍선을 지우지 않게).
    // 같은 밀리초면 스토리 조회 결과를 더 새 정보로 본다(빠른 환경에서 시각이 겹칠 수 있음).
    if (updatedAt < rosterAt.current) return;
    rosterAt.current = updatedAt;
    if (sameRoster(people.current, next)) return;
    setCharacterNotice('캐릭터 변경을 반영했습니다. 삭제된 발화자의 말풍선만 제거했습니다.');
    people.current = next;
    setSnapshot(
      (value) => value && { ...value, characters: next, fewshots: removeMissingSpeakers(value.fewshots, next) },
    );
    setGroups((value) => removeMissingSpeakers(value, next));
  }, []);
  const reload = useCallback(async () => {
    if (busy.current || pending.current) return;
    const current = ++generation.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setError(null);
    const requestedAt = Date.now();
    try {
      const data = await repository.load(storyId, controller.signal);
      if (!alive.current || current !== generation.current) return;
      const currentPeople = adoptServerPeople(data.characters, requestedAt);
      const reconciled = {
        ...data,
        characters: currentPeople,
        fewshots: removeMissingSpeakers(data.fewshots, currentPeople),
      };
      setSnapshot(reconciled);
      setGroups(reconciled.fewshots);
    } catch {
      if (alive.current && current === generation.current && !controller.signal.aborted)
        setError('퓨샷을 불러오지 못했습니다. 입력은 유지됩니다.');
    } finally {
      if (alive.current && current === generation.current) setLoading(false);
    }
  }, [repository, storyId]);
  useEffect(() => {
    alive.current = true;
    busy.current = false;
    pending.current = null;
    people.current = null;
    rosterAt.current = 0;
    cached.current = null;
    setCharacterNotice(null);
    setSnapshot(null);
    setGroups([]);
    setSaving(false);
    setPendingSave(false);
    void reload();
    return () => {
      alive.current = false;
      ++generation.current;
      abort.current?.abort();
    };
  }, [reload]);
  // 캐릭터 추가·삭제·이름 변경은 스토리 조회 캐시 구독으로 반영한다(폴링 없음).
  const storyCharacters = useStoryCharacters(storyId);
  useEffect(() => {
    if (storyCharacters.characters) applyPeople(storyCharacters.characters, storyCharacters.updatedAt);
  }, [storyCharacters.characters, storyCharacters.updatedAt, applyPeople]);
  const acceptSaved = (result: FewshotsDocument, requestedAt: number, current: number) => {
    if (!alive.current || current !== generation.current) return;
    const currentPeople = adoptServerPeople(result.characters, requestedAt);
    setSnapshot({
      ...result,
      characters: currentPeople,
      fewshots: removeMissingSpeakers(result.fewshots, currentPeople),
    });
    setGroups((value) => removeMissingSpeakers(applyAllocatedIds(value, result.fewshots), currentPeople));
  };
  const save = async () => {
    if (busy.current || loading || !snapshot) return;
    const operation = pending.current ?? {
      document: { ...snapshot, fewshots: groups },
      key: newFewshotKey('fewshots-write'),
      issuedAt: Date.now(),
    };
    const current = generation.current;
    // 재시도 응답은 최초 저장 시점의 원장일 수 있어 최초 요청 시각을 기준으로 비교한다.
    const epoch = operation.issuedAt;
    pending.current = operation;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await repository.save(operation.document, operation.key);
      if (!alive.current || current !== generation.current) return;
      acceptSaved(result, epoch, current);
      pending.current = null;
      setPendingSave(false);
    } catch (failure) {
      if (!alive.current || current !== generation.current) return;
      const rejected = failure instanceof ApiError && failure.status >= 400 && failure.status < 500;
      if (rejected) pending.current = null;
      setPendingSave(!rejected);
      setError(
        rejected
          ? '저장이 거절되었습니다. 발화자와 예시 연결을 확인해 주세요. 입력은 유지됩니다.'
          : '저장 성공 여부를 확인하지 못했습니다. 같은 요청으로 재시도할 수 있습니다.',
      );
    } finally {
      if (current === generation.current) {
        busy.current = false;
        if (alive.current) setSaving(false);
      }
    }
  };
  return {
    snapshot,
    groups,
    setGroups,
    loading,
    saving,
    error,
    pendingSave,
    captureCommit: () => {
      const epoch = Date.now(),
        current = generation.current;
      return (result: FewshotsDocument) => acceptSaved(result, epoch, current);
    },
    characterNotice,
    characterSyncError: storyCharacters.failed
      ? '캐릭터 변경을 확인하지 못했습니다. 기존 입력과 발화자 목록을 유지합니다.'
      : null,
    reload,
    save,
    dirty: !!snapshot && JSON.stringify(groups) !== JSON.stringify(snapshot.fewshots),
    length: groups.reduce(
      (count, group) => count + group.messages.reduce((n, message) => n + countRawText(message.body ?? ''), 0),
      0,
    ),
  };
}
