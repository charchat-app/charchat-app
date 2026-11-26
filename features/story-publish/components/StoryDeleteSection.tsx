// CREATE-US-07-AC10 스토리 삭제 구역. CREATE-US-12: 공개 범위 탭(작업 화면)과 편집 화면이 같은 삭제 흐름을 쓴다.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { ApiError } from '@/lib/api-client';

import { announceStoryDeleted } from '../hooks/useDeletedNotice';
import { useDeleteStory } from '../hooks/useStories';
import { useStoryWriteLock } from '../hooks/useStoryWriteLock';

import { StoryDeleteConfirm } from './StoryDeleteConfirm';

const DELETE_BLOCKED_MESSAGE = '저장하는 중에는 삭제할 수 없어요. 저장이 끝난 뒤 다시 시도해 주세요.';

export type StoryDeleteSectionProps = {
  storyId: string;
  /** 확인 안내에 보여 줄 제목 */
  storyTitle: string;
  /**
   * 삭제 성공 전용 이동. 서버가 삭제를 확인하고 캐시 정리가 끝난 뒤, 이 구역이 아직 마운트되어 있고
   * 라우트가 포커스 상태일 때만 한 번 부른다. 목록 안내는 이 구역이 남긴다.
   */
  onDeleted: () => void;
  /** 이 화면이 지금 포커스된 라우트인지. 넘기지 않으면 항상 포커스된 것으로 본다. */
  isRouteFocused?: () => boolean;
  /** 제목·설명을 함께 보일지. 호스트가 이미 제목을 그리면 false. */
  showHeading?: boolean;
  /** 확인 안내를 열고 닫을 때 알린다. 호스트가 같은 삭제 오류를 두 번 보이지 않게 할 때 쓴다. */
  onConfirmingChange?: (confirming: boolean) => void;
  /**
   * 확인 안내가 열려 있는지를 호스트가 쥘 때 넘긴다(onConfirmingChange와 함께). 탭을 오가며 이 구역이
   * 언마운트됐다가 다시 그려져도 진행 중·실패 확인 안내가 그대로 이어진다. 넘기지 않으면 구역이 직접 쥔다.
   */
  confirming?: boolean;
  /**
   * 늦게 도착한 삭제 성공에서 이동할지 판단할 마운트 기준. 호스트가 탭을 바꿀 때 이 구역을 내렸다 다시 그리면,
   * 삭제를 시작한 구역은 이미 언마운트됐어도 호스트(화면)는 그대로이므로 호스트의 마운트 상태를 넘긴다.
   * 넘기지 않으면 이 구역의 마운트 상태를 본다.
   */
  isHostMounted?: () => boolean;
};

const alwaysFocused = () => true;

/**
 * 같은 스토리의 저장과 삭제가 겹치지 않도록 스토리 쓰기 잠금(useStoryWriteLock)을 쥔 채 삭제한다.
 * 다른 화면이 저장하는 중이면 시작하지 않는다. 실패하면 확인 안내가 오류를 보여 주고 머문다.
 */
export function StoryDeleteSection({
  storyId,
  storyTitle,
  onDeleted,
  isRouteFocused = alwaysFocused,
  showHeading = true,
  onConfirmingChange,
  confirming: hostConfirming,
  isHostMounted,
}: StoryDeleteSectionProps) {
  const queryClient = useQueryClient();
  const { status, acquire, deleteError } = useStoryWriteLock(storyId);
  const remove = useDeleteStory(storyId);
  const [localConfirming, setConfirmingState] = useState(false);
  const confirming = hostConfirming ?? localConfirming;
  const setConfirming = (next: boolean) => {
    setConfirmingState(next);
    onConfirmingChange?.(next);
  };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const doDelete = async (): Promise<void> => {
    const release = acquire('delete');
    if (!release) return Promise.reject(new Error(DELETE_BLOCKED_MESSAGE));
    try {
      await remove.mutateAsync();
    } catch (e) {
      release(false, e instanceof ApiError ? e.detail : '알 수 없는 오류가 발생했습니다.');
      throw e;
    }
    release(true);
    // 응답이 늦어 그 사이 화면을 떠났다면 이동하지 않는다(다른 화면에 있는 사용자를 뒤로 보내지 않게).
    const stillMounted = isHostMounted ? isHostMounted() : mounted.current;
    if (stillMounted && isRouteFocused()) {
      announceStoryDeleted(queryClient);
      onDeleted();
    }
  };

  return (
    <View style={styles.wrap}>
      {showHeading ? (
        <>
          <Text variant="subheading">스토리 삭제</Text>
          <Text variant="caption">삭제 전 복구 불가와 이용자 대화 중단을 안내해요.</Text>
        </>
      ) : null}
      {confirming ? (
        <StoryDeleteConfirm
          storyTitle={storyTitle}
          onConfirm={doDelete}
          onCancel={() => setConfirming(false)}
          pending={status === 'delete'}
          blocked={status === 'save'}
          error={deleteError}
        />
      ) : (
        <View style={styles.action}>
          <Button
            label="스토리 삭제"
            variant="danger"
            onPress={() => setConfirming(true)}
            disabled={status !== 'idle'}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  action: { alignItems: 'flex-start' },
});
