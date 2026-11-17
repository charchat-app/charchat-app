import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import type { StoryRepository } from '@/features/story-publish';
import type { ExpressionSettings, StoryExpressionDocument } from '@/shared/story-types';
import { fromDraft, toDraftPatch } from '../expressionAdapter';

const same = (a: ExpressionSettings | null, b: ExpressionSettings | null) => JSON.stringify(a) === JSON.stringify(b);
let requestCounter = 0;
const requestId = () => `expression-${Date.now()}-${++requestCounter}-${Math.random().toString(36).slice(2)}`;

export function useExpressionEditor(repository: StoryRepository, storyId: string) {
  const [draft, setDraft] = useState<StoryExpressionDocument | null>(null);
  const [settings, setSettings] = useState<ExpressionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasPendingSave, setHasPendingSave] = useState(false);
  const alive = useRef(false);
  const savingRef = useRef(false);
  const loadNumber = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const pending = useRef<{ document: StoryExpressionDocument; requestId: string } | null>(null);

  const reload = useCallback(async () => {
    if (savingRef.current || pending.current) return;
    const number = ++loadNumber.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await repository.load(storyId, controller.signal);
      if (!alive.current || number !== loadNumber.current) return;
      setDraft(result);
      setSettings(fromDraft(result));
      setSaveError(null);
    } catch {
      if (alive.current && number === loadNumber.current && !controller.signal.aborted) {
        setLoadError('설정을 불러오지 못했습니다. 연결을 확인해 주세요.');
      }
    } finally {
      if (alive.current && number === loadNumber.current) setLoading(false);
    }
  }, [repository, storyId]);

  useEffect(() => {
    alive.current = true;
    pending.current = null;
    savingRef.current = false;
    setSaving(false);
    setHasPendingSave(false);
    setDraft(null);
    setSettings(null);
    void reload();
    return () => {
      alive.current = false;
      ++loadNumber.current;
      abort.current?.abort();
    };
  }, [reload]);

  const save = async () => {
    if (savingRef.current || loading || !draft || !settings) return;
    if (!pending.current && same(draft.speech, settings)) return;
    const operation = pending.current ?? {
      document: { ...draft, ...toDraftPatch(settings) },
      requestId: requestId(),
    };
    const generation = loadNumber.current;
    pending.current = operation;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await repository.save(operation.document, operation.requestId);
      if (!alive.current || generation !== loadNumber.current) return;
      setDraft(result);
      // 저장 중 추가한 입력을 성공 응답으로 덮어쓰지 않는다.
      setSettings((current) => (same(current, operation.document.speech) ? fromDraft(result) : current));
      pending.current = null;
      setHasPendingSave(false);
    } catch (error) {
      if (!alive.current || generation !== loadNumber.current) return;
      const rejected = error instanceof ApiError && error.status >= 400 && error.status < 500;
      if (rejected) pending.current = null;
      setHasPendingSave(!rejected);
      setSaveError(
        rejected
          ? '저장이 거절되었습니다. 입력은 유지되며 저장되지 않았습니다.'
          : '저장 성공 여부를 확인하지 못했습니다. 입력을 유지하고 같은 요청으로 재시도합니다.',
      );
    } finally {
      if (generation === loadNumber.current) {
        savingRef.current = false;
        if (alive.current) setSaving(false);
      }
    }
  };

  return {
    draft,
    settings,
    setSettings,
    loading,
    saving,
    loadError,
    saveError,
    hasPendingSave,
    dirty: !!draft && !!settings && !same(draft.speech, settings),
    reload,
    save,
  };
}
