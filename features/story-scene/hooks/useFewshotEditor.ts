import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

interface EditorSource {
  repository: FewshotRepository;
  storyId: string;
}
interface EditorState {
  source: EditorSource;
  snapshot: FewshotsDocument | null;
  groups: FewshotGroup[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  pendingSave: boolean;
  characterNotice: string | null;
}
const freshState = (source: EditorSource): EditorState => ({
  source,
  snapshot: null,
  groups: [],
  loading: true,
  saving: false,
  error: null,
  pendingSave: false,
  characterNotice: null,
});
type Patch = Partial<Omit<EditorState, 'source'>> | ((state: EditorState) => Partial<Omit<EditorState, 'source'>>);

export function useFewshotEditor(repository: FewshotRepository, storyId: string) {
  const source = useMemo(() => ({ repository, storyId }), [repository, storyId]);
  const [state, setState] = useState<EditorState>(() => freshState(source));
  // 이전 출처의 값은 화면에 표시하지 않는다. 새 조회 응답이 새 출처의 상태를 시작한다.
  const view = state.source === source ? state : freshState(source);
  const { snapshot, groups, loading, saving, error, pendingSave, characterNotice } = view;
  const update = useCallback(
    (patch: Patch, fromLoad = false) =>
      setState((current) => {
        // 조회 완료는 React가 이전 출처의 상태에서 갱신을 다시 적용해도 누락되면 안 된다.
        if (current.source !== source && !fromLoad) return current;
        const base = current.source === source ? current : freshState(source);
        return { ...base, ...(typeof patch === 'function' ? patch(base) : patch) };
      }),
    [source],
  );
  const setSnapshot = useCallback(
    (next: FewshotsDocument | null | ((value: FewshotsDocument | null) => FewshotsDocument | null)) =>
      update((current) => ({ snapshot: typeof next === 'function' ? next(current.snapshot) : next })),
    [update],
  );
  const setGroups = useCallback(
    (next: FewshotGroup[] | ((value: FewshotGroup[]) => FewshotGroup[])) =>
      update((current) => ({ groups: typeof next === 'function' ? next(current.groups) : next })),
    [update],
  );
  const setLoading = useCallback((loading: boolean) => update({ loading }), [update]);
  const setSaving = useCallback((saving: boolean) => update({ saving }), [update]);
  const setError = useCallback((error: string | null) => update({ error }), [update]);
  const setPendingSave = useCallback((pendingSave: boolean) => update({ pendingSave }), [update]);
  const setCharacterNotice = useCallback((characterNotice: string | null) => update({ characterNotice }), [update]);
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
  const applyPeople = useCallback(
    (next: FewshotCharacter[], updatedAt: number) => {
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
    },
    [setCharacterNotice, setSnapshot, setGroups],
  );
  // 조회 본체. 로딩 표시는 호출하는 쪽이 정한다(첫 조회·스토리 변경은 렌더에서, 다시 불러오기는 reload에서).
  const load = useCallback(async () => {
    const current = ++generation.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
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
      update({ snapshot: reconciled, groups: reconciled.fewshots, loading: false }, true);
    } catch {
      if (alive.current && current === generation.current && !controller.signal.aborted)
        update({ error: '퓨샷을 불러오지 못했습니다. 입력은 유지됩니다.', loading: false }, true);
    }
  }, [repository, storyId, update]);
  const reload = useCallback(async () => {
    if (busy.current || pending.current) return;
    setLoading(true);
    setError(null);
    await load();
  }, [load, setError, setLoading]);
  // 스토리·저장소가 바뀌면 이전 요청을 중단하고 새 조회를 시작한다.
  useEffect(() => {
    alive.current = true;
    busy.current = false;
    pending.current = null;
    people.current = null;
    rosterAt.current = 0;
    cached.current = null;
    // load가 세대를 올려 이전 스토리의 늦은 응답을 버린다. 정리 단계에서는 alive로 막는다.
    void load();
    return () => {
      alive.current = false;
      abort.current?.abort();
    };
  }, [load]);
  // 캐릭터 추가·삭제·이름 변경은 스토리 조회 캐시 구독으로 반영한다(폴링 없음).
  const storyCharacters = useStoryCharacters(storyId);
  useEffect(() => {
    if (storyCharacters.characters) applyPeople(storyCharacters.characters, storyCharacters.updatedAt);
  }, [storyCharacters.characters, storyCharacters.updatedAt, applyPeople]);
  /**
   * submitted(보낸 묶음)가 있고 저장 중 손대지 않았으면 응답의 묶음을 따른다(서버가 더 새 정본을 돌려줄 수 있다).
   * 손댔거나 submitted가 없으면 지금 입력을 유지하고 발급된 ID만 합친다.
   */
  const acceptSaved = (
    result: FewshotsDocument,
    requestedAt: number,
    current: number,
    submitted?: readonly FewshotGroup[],
  ) => {
    if (!alive.current || current !== generation.current) return;
    const currentPeople = adoptServerPeople(result.characters, requestedAt);
    update((state) => ({
      snapshot: {
        ...result,
        characters: currentPeople,
        fewshots: removeMissingSpeakers(result.fewshots, currentPeople),
      },
      groups: removeMissingSpeakers(
        submitted && JSON.stringify(state.groups) === JSON.stringify(submitted)
          ? result.fewshots
          : applyAllocatedIds(state.groups, result.fewshots),
        currentPeople,
      ),
    }));
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
      return (result: FewshotsDocument, submitted?: readonly FewshotGroup[]) =>
        acceptSaved(result, epoch, current, submitted);
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
