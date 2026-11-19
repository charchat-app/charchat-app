import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { countRawText } from '@/lib/rawText';
import {
  INTRO_BODY_LIMIT,
  INTRO_TITLE_LIMIT,
  newFewshotKey,
  type IntroItem,
  type CreationSaveDocument,
  type CreationSaveState,
  type CreationSaveMode,
} from '@/shared/story-types';
import type { CommonSaveRepository } from '../commonRepository';
import { storyKeys } from './useStories';

export function completionIssues(document: CreationSaveDocument): string[] {
  const issues: string[] = [];
  if (document.speech.style.mode === 'custom' && countRawText(document.speech.style.text) > 1000)
    issues.push('커스텀 문체는 1000자 이내로 작성해 주세요.');
  if (
    document.fewshots.reduce((sum, g) => sum + g.messages.reduce((n, m) => n + countRawText(m.body ?? ''), 0), 0) > 2000
  )
    issues.push('퓨샷 전체를 2000자 이내로 작성해 주세요.');
  issues.push(...introIssues(document.intros));
  return issues;
}
/** CREATE-US-03 완성 저장 조건. 서버 validate_completed와 같은 순서·기준이다. */
export function introIssues(intros: IntroItem[]): string[] {
  if (!intros.length) return [messages.INTRO_REQUIRED];
  const issues: string[] = [];
  if (intros.some((intro) => !intro.title.trim())) issues.push(messages.INTRO_TITLE_REQUIRED);
  if (intros.some((intro) => countRawText(intro.title) > INTRO_TITLE_LIMIT)) issues.push(messages.INTRO_TITLE_TOO_LONG);
  if (intros.some((intro) => !intro.messages.some((m) => (m.body ?? '').trim())))
    issues.push(messages.INTRO_BODY_REQUIRED);
  if (intros.some((intro) => introLength(intro) > INTRO_BODY_LIMIT)) issues.push(messages.INTRO_TOO_LONG);
  return issues;
}
/** 인트로 하나의 본문 원문 글자 수. 제목은 제외한다. */
export const introLength = (intro: IntroItem) =>
  intro.messages.reduce((n, message) => n + countRawText(message.body ?? ''), 0);
const messages: Record<string, string> = {
  CUSTOM_STYLE_TOO_LONG: '커스텀 문체는 1000자 이내로 작성해 주세요.',
  FEWSHOTS_TOO_LONG: '퓨샷 전체를 2000자 이내로 작성해 주세요.',
  BASIC_SETTINGS_INCOMPLETE: '1번의 제목·한 줄 소개·세계관과 캐릭터 1~10명의 이름·상세를 먼저 작성해 주세요.',
  BASIC_SETTINGS_TOO_LONG: '1번 기본 설정 전체가 3000자를 초과했습니다.',
  INVALID_CHARACTER_NAME: '캐릭터 이름의 앞뒤 공백과 중복을 확인해 주세요.',
  INVALID_TAGS: '해시태그는 최대10개, 각10자 이내로 작성해 주세요.',
  SAVE_STATE_TRANSITION: '완성 저장은 임시 저장으로, 공개는 비공개로 되돌릴 수 없습니다.',
  AUTO_SAVE_NOT_ALLOWED: '자동 저장은 임시 저장에만 적용됩니다.',
  INTRO_REQUIRED: '인트로를 1개 이상 작성해 주세요.',
  INTRO_TITLE_REQUIRED: '모든 인트로의 상황 제목을 작성해 주세요.',
  INTRO_TITLE_TOO_LONG: '인트로 상황 제목은 30자 이내로 작성해 주세요.',
  INTRO_BODY_REQUIRED: '모든 인트로에 대사나 서술을 작성해 주세요.',
  INTRO_TOO_LONG: '인트로 본문은 인트로마다 2000자 이내로 작성해 주세요.',
  MESSAGE_INTRO_CHANGED: '말풍선은 다른 인트로로 옮길 수 없습니다.',
};
type Options = {
  document: CreationSaveDocument | null;
  dirty: boolean;
  loading: boolean;
  pendingInput: boolean;
  captureCommit: () => (result: CreationSaveDocument, submitted: CreationSaveDocument) => void;
};
type Operation = {
  document: CreationSaveDocument;
  state: CreationSaveState;
  mode: CreationSaveMode;
  key: string;
  commit: ReturnType<Options['captureCommit']>;
};
/**
 * 거절 응답의 안내 문구. 매핑한 코드는 앱 문구를, 매핑에 없는 코드는 서버 Problem Details의 detail을 보여 준다.
 * detail이 없어 api-client가 채운 기본값(`요청 실패: 상태 코드`)이면 일반 문구를 쓴다.
 */
export function rejectionMessage(failure: ApiError): string {
  const mapped = messages[failure.code];
  if (mapped) return mapped;
  const detail = failure.detail.trim();
  return detail && detail !== `요청 실패: ${failure.status}` ? detail : '저장이 거절되었습니다. 입력은 유지됩니다.';
}
export function useCommonSave(repository: CommonSaveRepository, options: Options) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null),
    [pendingSave, setPendingSave] = useState(false);
  const latest = useRef(options),
    busy = useRef(false),
    alive = useRef(false),
    pending = useRef<Operation | null>(null);
  latest.current = options;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const save = async (state: CreationSaveState, mode: CreationSaveMode = 'manual') => {
    const current = latest.current;
    if (busy.current || current.loading || !current.document) return false;
    if (mode === 'auto' && (pending.current || current.document.saveState !== 'draft' || !current.dirty)) return false;
    if (!pending.current) {
      if (mode === 'manual' && current.pendingInput) {
        setError('말풍선을 추가하거나 수정 완료·취소한 뒤 저장해 주세요.');
        return false;
      }
      if (state !== 'draft') {
        const issues = completionIssues(current.document);
        if (issues.length) {
          setError(issues.join('\n'));
          return false;
        }
      }
      if (!current.dirty && state === current.document.saveState) return true;
    }
    const operation = pending.current ?? {
      document: current.document,
      state,
      mode,
      key: newFewshotKey('creation'),
      commit: current.captureCommit(),
    };
    pending.current = operation;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await repository.save(operation.document, operation.state, operation.mode, operation.key);
      // 저장 상태(임시 저장→비공개·공개)와 저장 시각이 바뀌므로 스토리 목록·상세 캐시를 다시 받게 한다.
      // 응답 전에 화면을 떠났어도 서버에는 저장됐으므로 무효화는 항상 한다.
      void queryClient.invalidateQueries({ queryKey: storyKeys.all });
      if (!alive.current) return false;
      operation.commit(result, operation.document);
      pending.current = null;
      setPendingSave(false);
      return true;
    } catch (failure) {
      if (!alive.current) return false;
      // 408(시간 초과)·429(요청 과다)는 같은 요청으로 다시 시도할 수 있는 실패로 본다.
      const rejected =
        failure instanceof ApiError &&
        failure.status >= 400 &&
        failure.status < 500 &&
        failure.status !== 408 &&
        failure.status !== 429;
      if (rejected) pending.current = null;
      setPendingSave(!rejected);
      setError(
        rejected
          ? rejectionMessage(failure)
          : '저장 성공 여부를 확인하지 못했습니다. 입력을 유지하고 같은 요청으로 재시도할 수 있습니다.',
      );
      return false;
    } finally {
      if (alive.current) {
        busy.current = false;
        setSaving(false);
      }
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const timer = setInterval(() => void saveRef.current('draft', 'auto'), 60000);
    return () => clearInterval(timer);
  }, []);
  return { saving, error, pendingSave, save };
}
