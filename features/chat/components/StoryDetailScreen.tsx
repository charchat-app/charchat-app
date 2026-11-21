// CHAT-US-01 스토리 상세와 인트로 선택
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Notice, Section, Text, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { ConversationBubbles } from '@/features/chat/components/ConversationBubbles';
import { ConversationFrame, ConversationLoadState } from '@/features/chat/components/ConversationFrame';
import {
  isConversationAccessDenied,
  useConversationStory,
  useStartConversation,
} from '@/features/chat/hooks/useConversation';
import { ApiError } from '@/lib/api-client';
import type { ConversationProfile } from '@/shared/story-types';

const keyForProfile = (profile: ConversationProfile) => `${profile.kind}:${profile.id}`;

export function StoryDetailScreen({
  storyId,
  onBack,
  onOpenSession,
}: {
  storyId: string;
  onBack?: () => void;
  onOpenSession: (id: number) => void;
}) {
  const query = useConversationStory(storyId);
  const accessDenied = isConversationAccessDenied(query.error);
  const story = accessDenied ? undefined : query.data;
  const start = useStartConversation(storyId);
  const submitting = useRef(false);
  const [introId, setIntroId] = useState<number>();
  const [profileKey, setProfileKey] = useState<string>();
  const [playName, setPlayName] = useState('');
  const intro = story?.intros.find((item) => item.id === introId) ?? story?.intros[0];
  const profile = story?.profiles.find((item) => keyForProfile(item) === profileKey);
  const sessionId = story?.existing_session_id;

  const handleStart = () => {
    if (submitting.current || !intro || !profile || sessionId != null) return;
    submitting.current = true;
    start.mutate(
      { intro_id: intro.id, profile_kind: profile.kind, profile_id: profile.id, play_name: playName },
      {
        onSuccess: ({ id }) => onOpenSession(id),
        onError: () => {
          submitting.current = false;
        },
      },
    );
  };

  return (
    <ConversationFrame title="스토리 상세" onBack={onBack}>
      {story ? (
        <>
          <Text variant="heading" accessibilityRole="header">
            {story.title}
          </Text>
          <Text variant="subheading">{story.subtitle}</Text>
          {story.effective_rating !== null ? <Badge label={story.effective_rating} /> : null}
          {story.tags?.length ? (
            <View style={styles.row}>
              {story.tags.map((tag) => (
                <Badge key={tag} label={tag} />
              ))}
            </View>
          ) : null}
          <Section title="세계관" first>
            <Text>{story.world_description}</Text>
          </Section>
          <Section title="등장 캐릭터" first>
            {story.characters.map((character) => (
              <View key={character.id} style={styles.character}>
                <Text variant="subheading">{character.name}</Text>
                <Text>{character.description}</Text>
              </View>
            ))}
          </Section>
          <Section title="인트로" first>
            <View style={styles.row}>
              {story.intros.map((item) => (
                <Button
                  key={item.id}
                  label={item.title}
                  variant={item.id === intro?.id ? 'primary' : 'secondary'}
                  disabled={start.isPending}
                  accessibilityState={{ selected: item.id === intro?.id, disabled: start.isPending }}
                  onPress={() => setIntroId(item.id)}
                />
              ))}
            </View>
            {intro ? (
              <ConversationBubbles messages={intro.messages} />
            ) : (
              <Text variant="caption">등록된 인트로가 없습니다.</Text>
            )}
          </Section>
          {sessionId != null ? (
            <Button label="이어하기" onPress={() => onOpenSession(sessionId)} />
          ) : (
            <>
              <Section title="유저 프로필" description="대화에 사용할 프로필을 선택하세요." first>
                {story.profiles.length === 0 ? (
                  <>
                    <Text variant="caption">
                      대화에 사용할 프로필이 없습니다. 이 화면에서는 프로필을 추가할 수 없습니다.
                    </Text>
                    <Button label="프로필 추가" variant="secondary" disabled />
                  </>
                ) : null}
                {(['preset', 'personal'] as const).map((kind) => {
                  const items = story.profiles.filter((item) => item.kind === kind);
                  if (!items.length) return null;
                  return (
                    <View key={kind} style={styles.group}>
                      <Text variant="subheading">{kind === 'preset' ? '추천 프로필' : '내 프로필'}</Text>
                      {items.map((item) => {
                        const key = keyForProfile(item);
                        const checked = key === profileKey;
                        return (
                          <View key={key} style={styles.character}>
                            <Button
                              label={item.name}
                              accessibilityRole="radio"
                              accessibilityState={{ checked, disabled: start.isPending }}
                              variant={checked ? 'primary' : 'secondary'}
                              disabled={start.isPending}
                              onPress={() => {
                                if (checked) return;
                                setProfileKey(key);
                                setPlayName(item.initial_name ?? '');
                              }}
                            />
                            <Text variant="caption">{item.description}</Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
                {profile ? (
                  <>
                    <Text variant="subheading">플레이 이름</Text>
                    <TextField
                      accessibilityLabel="플레이 이름"
                      value={playName}
                      onChangeText={setPlayName}
                      editable={!start.isPending}
                    />
                  </>
                ) : null}
              </Section>
              {start.error ? (
                <Notice
                  tone="alert"
                  message={
                    start.error instanceof ApiError
                      ? start.error.detail
                      : '대화를 시작하지 못했습니다. 다시 시도해 주세요.'
                  }
                />
              ) : null}
              <Button
                label={start.isPending ? '대화 시작 중…' : '대화 시작'}
                disabled={start.isPending || !intro || !profile}
                onPress={handleStart}
              />
            </>
          )}
        </>
      ) : (
        <ConversationLoadState
          loading={query.isFetching || query.isPending}
          loadingMessage="스토리를 불러오는 중…"
          errorMessage="스토리를 불러오지 못했습니다."
          onRetry={accessDenied ? undefined : () => void query.refetch()}
        />
      )}
    </ConversationFrame>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  character: { gap: Spacing.one },
  group: { gap: Spacing.two },
});
