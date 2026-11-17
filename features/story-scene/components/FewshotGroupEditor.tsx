import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Notice, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  moveByKey,
  newFewshotKey,
  type FewshotCharacter,
  type FewshotGroup,
  type FewshotMessage,
} from '@/shared/story-types';
import { BodyInput, MessageBody } from './BodyInput';
import { ReorderList } from './ReorderList';
import { countRawText } from '@/lib/rawText';

type Speaker = Pick<FewshotMessage, 'speakerKind' | 'characterId'>;
export type PendingInput = { active: boolean; lengthDelta: number };
/** 말풍선 묶음 편집기. 2번 대화 예시와 3번 인트로가 함께 쓴다(제목 등 다른 필드는 그대로 둔다). */
export function FewshotGroupEditor<G extends FewshotGroup>({
  group,
  characters,
  onChange,
  onClose,
  onDragging,
  onPending,
  heading = '대화 예시 편집',
  backLabel = '예시 목록으로',
}: {
  group: G;
  characters: FewshotCharacter[];
  onChange: (value: G) => void;
  onClose: () => void;
  onDragging: (value: boolean) => void;
  onPending: (value: PendingInput) => void;
  heading?: string;
  backLabel?: string;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [edited, setEdited] = useState('');
  const [body, setBody] = useState('');
  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  const [showSpeakers, setShowSpeakers] = useState(false);
  const [trigger, setTrigger] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const pending = editingKey !== null || body.length > 0;
  const previous = group.messages.find((message) => message.clientKey === editingKey);
  useEffect(() => {
    if (editingKey !== null && !previous) {
      setEditingKey(null);
      setEdited('');
    }
    if (speaker?.speakerKind === 'character' && !characters.some((person) => person.id === speaker.characterId)) {
      // 아직 추가하지 않은 원문은 남기고 새 발화자를 고르게 한다.
      setSpeaker(null);
      setShowSpeakers(true);
    }
  }, [characters, editingKey, previous, speaker]);
  // 새 입력은 아직 messages에 없고, 기존 본문 수정은 저장된 길이의 차이만 더한다.
  const lengthDelta =
    countRawText(body) + (editingKey === null ? 0 : countRawText(edited) - countRawText(previous?.body ?? ''));
  useEffect(() => {
    onPending({ active: pending, lengthDelta });
  }, [onPending, pending, lengthDelta]);
  const move = (from: string, to: string) => onChange({ ...group, messages: moveByKey(group.messages, from, to) });
  const speakerName = (value: Speaker) =>
    value.speakerKind === 'narrator'
      ? '나레이터'
      : value.speakerKind === 'user'
        ? '유저'
        : characters.find((person) => person.id === value.characterId)?.name || '이름 없는 캐릭터';
  const changeNewBody = (next: string) => {
    let index = 0;
    while (index < body.length && body[index] === next[index]) index++;
    if (next.length === body.length + 1 && next[index] === '@') {
      setTrigger(index);
      setShowSpeakers(true);
    } else if (trigger !== null && next[trigger] !== '@') setTrigger(null);
    setBody(next);
  };
  const choose = (value: Speaker) => {
    setSpeaker(value);
    setShowSpeakers(false);
    if (trigger !== null && body[trigger] === '@') setBody(body.slice(0, trigger) + body.slice(trigger + 1));
    setTrigger(null);
  };
  return (
    <View style={styles.content}>
      <Text variant="heading">{heading}</Text>
      <Button label={backLabel} variant="secondary" disabled={pending || dragging} onPress={onClose} />
      {pending ? (
        <Text variant="caption">작성한 내용을 추가하거나 수정 완료·취소한 뒤 이동·저장할 수 있습니다.</Text>
      ) : null}
      <ReorderList
        items={group.messages}
        label="말풍선"
        onMove={move}
        disabled={editingKey !== null}
        onActive={(active) => {
          setDragging(active);
          onDragging(active);
        }}
        renderItem={(message, index) => (
          <View style={styles.message}>
            {message.speakerKind !== 'user' ? <Text variant="caption">{speakerName(message)}</Text> : null}
            {editingKey === message.clientKey ? (
              <>
                <BodyInput label="말풍선 본문 수정" value={edited} onChange={setEdited} inline autoFocus />
                <View style={styles.actions}>
                  <Button label="수정 취소" variant="secondary" onPress={() => setEditingKey(null)} />
                  <Button
                    label="수정 완료"
                    onPress={() => {
                      onChange({
                        ...group,
                        messages: group.messages.map((item) =>
                          item.clientKey === message.clientKey
                            ? { ...item, body: message.body === null && edited === '' ? null : edited }
                            : item,
                        ),
                      });
                      setEditingKey(null);
                    }}
                  />
                </View>
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${index + 1}번 본문 수정`}
                disabled={dragging || editingKey !== null}
                onPress={() => {
                  setEditingKey(message.clientKey);
                  setEdited(message.body ?? '');
                }}
              >
                <MessageBody body={message.body} />
              </Pressable>
            )}
            <Button
              label={`${index + 1}번 말풍선 삭제`}
              variant="danger"
              disabled={dragging || editingKey !== null}
              onPress={() =>
                onChange({ ...group, messages: group.messages.filter((item) => item.clientKey !== message.clientKey) })
              }
            />
          </View>
        )}
      />
      {group.messages.length === 0 ? <Text variant="caption">아직 말풍선이 없습니다.</Text> : null}
      <Text variant="subheading">새 말풍선</Text>
      <Button
        label={speaker ? `@ 발화자: ${speakerName(speaker)}` : '@ 발화자 선택'}
        variant="secondary"
        disabled={editingKey !== null || dragging}
        onPress={() => {
          setTrigger(null);
          setShowSpeakers((value) => !value);
        }}
      />
      {showSpeakers ? (
        <View style={styles.actions}>
          <Button
            label="유저 선택"
            variant="secondary"
            onPress={() => choose({ speakerKind: 'user', characterId: null })}
          />
          <Button
            label="나레이터 선택"
            variant="secondary"
            onPress={() => choose({ speakerKind: 'narrator', characterId: null })}
          />
          {characters.map((person, index) => (
            <Button
              key={person.id}
              label={`캐릭터 ${index + 1}: ${person.name || '이름 없음'} 선택`}
              variant="secondary"
              onPress={() => choose({ speakerKind: 'character', characterId: person.id })}
            />
          ))}
        </View>
      ) : null}
      {editingKey === null ? <BodyInput label="새 말풍선 본문" value={body} onChange={changeNewBody} /> : null}
      <View style={styles.actions}>
        <Button
          label="말풍선 추가"
          disabled={!speaker || editingKey !== null || dragging}
          onPress={() => {
            if (!speaker) return;
            onChange({
              ...group,
              messages: [...group.messages, { id: null, clientKey: newFewshotKey('message'), ...speaker, body }],
            });
            setBody('');
            setTrigger(null);
            setShowSpeakers(false);
          }}
        />
        <Button
          label="새 입력 취소"
          variant="secondary"
          disabled={dragging}
          onPress={() => {
            setBody('');
            setSpeaker(null);
            setShowSpeakers(false);
            setTrigger(null);
          }}
        />
      </View>
      <Notice message="같은 발화자의 연속 말풍선도 각각 저장합니다. 본문 수정은 발화자나 다른 본문을 바꾸지 않습니다." />
    </View>
  );
}
const styles = StyleSheet.create({
  content: { gap: Spacing.three },
  message: { gap: Spacing.two },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
