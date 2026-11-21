import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, Button, Notice, ScreenHeader, Surface, Text, TopTabs } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, type FieldIssue } from '@/lib/api-client';
import {
  BasicInfoForm,
  StoryImagesEditor,
  UserProfilePresetEditor,
  fromDraft,
  mergeCharacters,
  requiredImageMessage,
  sameImages,
  toDraftPatch,
  toImagesPatch,
  type BasicInfoValues,
  type StoryImagesValues,
} from '@/features/story-setup';

import { toAppIssues } from '../api';
import type { CommonSaveRepository } from '../commonRepository';
import { applySavedIds, currentBasicIssues, toFieldErrors } from '../formSync';
import { useSaveFlow } from '../hooks/useSaveFlow';
import { useSaveStoryImages, useStoryImages } from '../hooks/useStoryImages';
import { useSaveStoryBasic, useStory } from '../hooks/useStories';
import { useStoryPresets } from '../hooks/useStoryPresets';
import { formatSavedAt } from '../savedAt';

/** 목업의 제작 탭 구성. 기본 설정·유저 프로필 탭이 서버와 연결되어 있다. */
const TABS = ['기본 설정', '말투·서술', '인트로', '초기 상태', '유저 프로필', '공개 범위'] as const;

export type StoryEditorScreenProps = {
  storyId: string;
  onBack: () => void;
  onOpenCreation?: () => void;
  /** CREATE-US-05 유저 프로필 공통 저장 저장소. 테스트에서 바꿔 끼운다. 없으면 EXPO_PUBLIC_API_URL 기준. */
  presetRepository?: CommonSaveRepository;
};

/**
 * 스토리 편집 화면. 탭별 저장 조각을 모아 저장한다 (story-publish 책임).
 * 저장이 실패하면 입력을 그대로 두고 실패를 알린다. 성공 응답을 받기 전에는 저장 완료로 표시하지 않는다.
 */
export function StoryEditorScreen({ storyId, onBack, onOpenCreation, presetRepository }: StoryEditorScreenProps) {
  const c = useTheme();
  const story = useStory(storyId);
  const save = useSaveStoryBasic(storyId);
  const [tab, setTab] = useState(0);
  // 캐릭터를 끄는 동안 화면 스크롤을 멈춘다 (AC14: 드래그와 페이지 스크롤이 겹치지 않게)
  const [dragging, setDragging] = useState(false);
  const [values, setValues] = useState<BasicInfoValues | null>(null);
  const isProfileTab = TABS[tab] === '유저 프로필';
  // CREATE-US-05: 유저 프로필은 탭을 처음 열 때 공통 저장(/creation)에서 불러온다.
  const [profileOpened, setProfileOpened] = useState(false);
  const presetState = useStoryPresets(storyId, profileOpened, presetRepository);
  // CREATE-US-05-AC03: 진행 중인 프로필 사진 업로드(자르기·올리기). 남아 있으면 이전 사진으로 저장하지 않도록
  // 프로필 저장을 막고, 업로드 주인(편집기)이 사라지지 않게 탭 이동을 막는다. 기본 설정 탭의 저장과는 무관하다.
  const uploadSources = useRef<Set<string>>(new Set());
  const [presetUploading, setPresetUploading] = useState(false);
  const trackPresetUpload = (source: string, active: boolean) => {
    if (active) uploadSources.current.add(source);
    else uploadSources.current.delete(source);
    setPresetUploading(uploadSources.current.size > 0);
  };
  const changeTab = (index: number) => {
    if (uploadSources.current.size > 0 || presetState.saving) return;
    if (TABS[index] === '유저 프로필') setProfileOpened(true);
    setTab(index);
  };
  // 서버 issues의 characters[i]가 어느 캐릭터인지 알려면, 그 판정을 받은 저장본의 캐릭터 순서(key)가 필요하다.
  const [savedKeys, setSavedKeys] = useState<string[]>([]);
  const [attemptKeys, setAttemptKeys] = useState<string[]>([]);
  // CREATE-US-06: 이미지 목록. 기본 정보 저장이 성공한 뒤 이어서 저장한다(캐릭터 id가 있어야 연결 가능).
  const images = useStoryImages(storyId);
  const saveImages = useSaveStoryImages(storyId);
  const [imageValues, setImageValues] = useState<StoryImagesValues | null>(null);
  // 기본 정보 저장부터 이미지 저장까지 한 번의 저장으로 묶어 잠그고, 어느 단계에서 실패했는지 기억한다.
  const flow = useSaveFlow();

  useEffect(() => {
    if (images.data && imageValues === null) setImageValues(images.data.values);
  }, [images.data, imageValues]);

  // 처음 불러온 저장본으로 입력값을 채운다. 이후 서버 응답이 입력 중인 내용을 덮어쓰지 않게 한 번만 한다.
  useEffect(() => {
    if (story.data && values === null) {
      const loaded = fromDraft(story.data);
      setValues(loaded);
      setSavedKeys(loaded.characters.map((ch) => ch.key));
    }
  }, [story.data, values]);

  if (story.isPending || (story.data && values === null)) {
    return <Centered onBack={onBack} message="불러오는 중…" />;
  }
  if (story.isError || !values) {
    const notFound = story.error instanceof ApiError && story.error.status === 404;
    return (
      <Centered
        onBack={onBack}
        message={notFound ? '스토리를 찾을 수 없어요.' : messageOf(story.error)}
        onRetry={notFound ? undefined : () => void story.refetch()}
      />
    );
  }

  const saved = story.data;
  const failedIssues = save.error instanceof ApiError ? toAppIssues(save.error.issues) : [];
  const issueKeys = failedIssues.length > 0 ? attemptKeys : savedKeys;
  const issues: FieldIssue[] = currentBasicIssues(
    failedIssues.length > 0 ? failedIssues : saved.issues,
    issueKeys,
    values,
  );
  const errors = toFieldErrors(issues, issueKeys);
  const isDraft = saved.saveState === '임시 저장';
  /** 1단계: 기본 정보 저장. 실패 안내는 save.error로 보여 준다. */
  const saveBasic = async () => {
    const sent = values.characters.map((ch) => ch.key);
    setAttemptKeys(sent);
    try {
      const savedStory = await save.mutateAsync(toDraftPatch(values));
      // 새 캐릭터에 서버 id를 붙여 다음 저장 때 같은 캐릭터로 수정되게 한다.
      setValues((v) =>
        v
          ? applySavedIds(
              v,
              sent,
              savedStory.characters.map((ch) => ch.id ?? ''),
            )
          : v,
      );
      setSavedKeys(sent);
      return true;
    } catch {
      return false;
    }
  };
  /**
   * 2단계: 기본 정보 저장으로 바뀐 캐릭터 목록(추가·삭제·이름)을 다시 불러와 반영한 뒤, 바뀐 이미지가 있으면 저장한다.
   * 재조회나 저장이 실패하면 예외를 던져 「사진만 다시 저장」을 보여 준다. 고른 사진은 그대로 둔다.
   */
  const saveImagesStep = async () => {
    if (imageValues === null) return;
    const fresh = await images.refetch();
    if (fresh.isError || !fresh.data) throw fresh.error ?? new Error('이미지 목록을 다시 불러오지 못했어요.');
    const merged = mergeCharacters(imageValues, fresh.data.values);
    setImageValues(merged);
    if (sameImages(merged, fresh.data.values)) return;
    // 안 B: 비공개·공개 스토리의 사진은 임시 저장본에 두고, 저장·공개 탭의 「저장」에서 함께 반영한다.
    const snapshot = await saveImages.mutateAsync({
      patch: toImagesPatch(merged),
      kind: isDraft ? 'save' : 'temporary',
    });
    setImageValues(snapshot.values);
  };
  const doSave = () => void flow.saveAll(saveBasic, saveImagesStep);
  const retryImages = () => void flow.retryImages(saveImagesStep);
  const unsavedCharacterNames = values.characters.filter((ch) => !ch.id).map((ch) => ch.name || '새 캐릭터');
  const saving = flow.running;
  // CREATE-US-05: 공개·비공개(완성 저장) 스토리의 프로필은 임시 저장만 하고, 제작 화면의 「저장」으로 반영한다.
  const presetFinalized = (presetState.saveState ?? 'draft') !== 'draft';
  const presetSaveBlocked = presetState.saving || presetUploading || saving || !presetState.dirty;
  const saveProfile = (kind: 'temporary' | 'save') => {
    if (uploadSources.current.size === 0 && !flow.running) void presetState.save(kind);
  };

  return (
    <Surface style={styles.container}>
      <ScreenHeader
        title={values.title || '새 스토리'}
        onBack={onBack}
        backLabel="목록으로 돌아가기"
        right={<Badge label={saved.saveState} />}
      />
      {/* 가로 스크롤 탭이 세로로 늘어나지 않게 높이를 내용에 맞춘다 */}
      <View style={styles.tabs}>
        <TopTabs tabs={TABS} activeIndex={tab} onChange={changeTab} />
      </View>
      <ScrollView
        testID="story-editor-body"
        style={styles.body}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!dragging}
      >
        {tab === 0 ? (
          <>
            {issues.length > 0 ? (
              <Notice tone="alert" message="공개·비공개로 저장하려면 표시된 항목을 채워 주세요." />
            ) : null}
            <BasicInfoForm
              values={values}
              onChange={(update) => setValues((v) => (v ? update(v) : v))}
              errors={errors}
              onDragActiveChange={setDragging}
            />
            <View style={styles.imagesSection}>
              <Text variant="heading">이미지</Text>
              {!isDraft && images.data?.workingCopySavedAt ? (
                <Notice message="사진은 임시 저장됐어요. 이용자는 아직 이전 사진을 봐요. 저장·공개 탭에서 저장하면 함께 반영돼요." />
              ) : null}
              {images.isError ? (
                <View style={styles.centered}>
                  <Text variant="error">{`이미지를 불러오지 못했어요. (${messageOf(images.error)})`}</Text>
                  <Button label="다시 시도" variant="secondary" onPress={() => void images.refetch()} />
                </View>
              ) : imageValues === null ? (
                <Text variant="caption">이미지 불러오는 중…</Text>
              ) : (
                <StoryImagesEditor
                  values={imageValues}
                  onChange={(update) => setImageValues((v) => (v ? update(v) : v))}
                  disabled={saving}
                  unsavedCharacterNames={unsavedCharacterNames}
                  onDragActiveChange={setDragging}
                />
              )}
            </View>
          </>
        ) : isProfileTab ? (
          presetState.status === 'ready' && presetState.presets ? (
            <>
              {presetFinalized ? (
                <Notice
                  message={
                    presetState.staged
                      ? '임시 저장한 유저 프로필이 있어요. 이용자는 아직 이전 프로필을 봐요. 제작 화면에서 「저장」을 누르면 반영돼요.'
                      : '공개·비공개 스토리의 유저 프로필은 임시 저장한 뒤 제작 화면의 「저장」으로 반영해요.'
                  }
                />
              ) : null}
              <UserProfilePresetEditor
                presets={presetState.presets}
                characterNames={values.characters.map((character) => character.name)}
                onChange={presetState.setPresets}
                uploadImages
                editable={!presetState.saving && !presetState.pending}
                onDragActiveChange={setDragging}
                onUploadActiveChange={trackPresetUpload}
              />
            </>
          ) : presetState.status === 'loading' ? (
            <Text variant="caption">유저 프로필 불러오는 중…</Text>
          ) : (
            <View style={styles.centered}>
              <Text variant="error">
                {presetState.status === 'unavailable'
                  ? '유저 프로필 정보를 받지 못해 편집할 수 없어요.'
                  : `유저 프로필을 불러오지 못했어요. (${messageOf(presetState.query.error)})`}
              </Text>
              <Button label="다시 시도" variant="secondary" onPress={() => void presetState.query.refetch()} />
            </View>
          )
        ) : (
          <Notice message={`${TABS[tab]} 탭은 아직 연결되지 않았어요.`} />
        )}
      </ScrollView>
      {isProfileTab && presetState.status === 'ready' ? (
        <SafeAreaView
          edges={['bottom']}
          style={[styles.footer, { borderTopColor: c.border, backgroundColor: c.background }]}
        >
          <View style={styles.status}>
            {presetState.saving ? (
              <Text variant="caption">유저 프로필 저장 중…</Text>
            ) : presetState.error ? (
              <View style={styles.imageFailure}>
                <Text variant="error">{presetState.error}</Text>
                {!presetState.pending && presetState.error.startsWith('다른 곳에서') ? (
                  <Button label="프로필 다시 불러오기" variant="secondary" onPress={() => void presetState.reload()} />
                ) : null}
              </View>
            ) : presetUploading ? (
              <Text variant="caption">사진을 올리는 중이에요. 끝나면 저장할 수 있어요.</Text>
            ) : (
              <Text variant="caption">
                {presetState.dirty ? '저장하지 않은 프로필 변경이 있어요.' : '저장한 프로필과 같아요.'}
              </Text>
            )}
          </View>
          {presetState.pending ? (
            <Button
              label={presetState.pendingKind === 'save' ? '저장 다시 시도' : '임시 저장 다시 시도'}
              onPress={() => saveProfile(presetState.pendingKind ?? 'temporary')}
              disabled={presetState.saving}
            />
          ) : (
            <>
              <Button
                label="임시 저장"
                variant={presetFinalized ? 'primary' : 'secondary'}
                onPress={() => saveProfile('temporary')}
                disabled={presetSaveBlocked}
              />
              {onOpenCreation ? (
                <Button
                  label="공통 저장 화면 열기"
                  variant="secondary"
                  onPress={() => {
                    if (!presetState.dirty && !presetState.saving && uploadSources.current.size === 0 && !saving) {
                      onOpenCreation();
                    }
                  }}
                  disabled={presetState.dirty || presetState.saving || presetUploading || saving}
                />
              ) : null}
            </>
          )}
        </SafeAreaView>
      ) : null}
      {!isProfileTab ? (
        <SafeAreaView
          edges={['bottom']}
          style={[styles.footer, { borderTopColor: c.border, backgroundColor: c.background }]}
        >
          <View style={styles.status}>
            {saving ? (
              <Text variant="caption">저장 중…</Text>
            ) : save.isError ? (
              <Text variant="error">{saveErrorMessage(save.error)}</Text>
            ) : flow.imageError ? (
              <View style={styles.imageFailure}>
                <Text variant="error">{imageSaveErrorMessage(flow.imageError, imageValues)}</Text>
                <Button label="사진만 다시 저장" variant="secondary" onPress={retryImages} disabled={saving} />
              </View>
            ) : (
              <Text variant="caption">{formatSavedAt(saved.updatedAt)}</Text>
            )}
          </View>
          <Button
            label={save.isError ? '다시 저장' : isDraft ? '임시 저장' : '변경 내용 저장'}
            onPress={doSave}
            disabled={saving}
          />
        </SafeAreaView>
      ) : null}
    </Surface>
  );
}

/** 기본 정보는 저장됐고 사진 단계만 실패했음을 알리는 첫 문장 */
const IMAGE_STEP_FAILED = '기본 정보는 저장됐지만 사진은 반영되지 않았어요.';

/**
 * 이미지 단계 실패 안내. 어느 단계까지 성공했는지 먼저 알린다.
 * 완성 저장된 스토리에서 캐릭터의 마지막 이미지를 지우면 서버가 거절한다(CREATE-US-06-AC08).
 * 이때는 누락된 캐릭터 이름을 알려 준다.
 */
function imageSaveErrorMessage(error: Error, values: StoryImagesValues | null): string {
  if (error instanceof ApiError && error.code === 'CHARACTER_IMAGE_REQUIRED') {
    return `${IMAGE_STEP_FAILED} ${requiredImageMessage(
      values,
      error.issues.map((issue) => issue.value ?? ''),
    )}`;
  }
  const reason = error instanceof ApiError ? error.detail : error.message || '알 수 없는 오류가 발생했습니다.';
  return `${IMAGE_STEP_FAILED} 고른 사진은 그대로예요. (${reason})`;
}

function Centered({ message, onBack, onRetry }: { message: string; onBack: () => void; onRetry?: () => void }) {
  return (
    <Surface style={styles.container}>
      <ScreenHeader title="스토리" onBack={onBack} backLabel="목록으로 돌아가기" />
      <View style={styles.centered}>
        <Text variant="caption">{message}</Text>
        {onRetry ? <Button label="다시 시도" variant="secondary" onPress={onRetry} /> : null}
      </View>
    </Surface>
  );
}

function messageOf(error: Error | null): string {
  return error instanceof ApiError ? error.detail : '알 수 없는 오류가 발생했습니다.';
}

function saveErrorMessage(error: Error): string {
  if (error instanceof ApiError && error.code === 'STORY_INCOMPLETE') {
    return '저장 조건을 충족하지 않아 저장하지 않았어요. 입력한 내용은 그대로예요.';
  }
  return `저장하지 못했어요. 입력한 내용은 그대로예요. (${messageOf(error)})`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { flexGrow: 0, flexShrink: 0 },
  body: { flex: 1 },
  content: { padding: Spacing.four, paddingBottom: Spacing.six },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderTopWidth: 1,
  },
  status: { flex: 1, minWidth: 0 },
  imageFailure: { gap: Spacing.one, alignItems: 'flex-start' },
  centered: { padding: Spacing.four, gap: Spacing.two },
  imagesSection: { marginTop: Spacing.six, gap: Spacing.three },
});
