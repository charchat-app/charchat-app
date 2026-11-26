import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Avatar, Button, CreationIcon, Notice, Text } from '@/components/ui';
import { MinTouchSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { newFewshotKey, type FewshotCharacter, type FewshotGroup, type FewshotMessage } from '@/shared/story-types';
import { BodyInput, MessageBody, type BodyInputHandle } from './BodyInput';
import { IconButton } from './SceneParts';
import { countRawText } from '@/lib/rawText';

type Speaker = Pick<FewshotMessage, 'speakerKind' | 'characterId'>;
export type PendingInput = { active: boolean; lengthDelta: number };
/**
 * 대화형 표시(chatLayout)에서 호스트가 배치할 두 부분.
 * composer는 평소엔 새 말풍선 작성 줄이고, 말풍선 수정 중에는 목업 bubbleEditToolbar(취소·삽입·적용)로 바뀐다.
 */
export type ChatLayoutParts = { messages: ReactNode; composer: ReactNode };

const NARRATOR: Speaker = { speakerKind: 'narrator', characterId: null };
const USER: Speaker = { speakerKind: 'user', characterId: null };
/** 목업 v15 .avatar 34px · .speaker-option .avatar 26px · .send-example·.edit-circle 44px 원형 */
const Dim = {
  avatar: 34,
  speakerAvatar: 26,
  speakerIcon: 20,
  sendIcon: 22,
  stripHeight: 62,
  circleGlyph: 26,
  insertGlyph: 22,
  chevron: 14,
  // 발화자 목록은 4줄까지 보이고 그 이상은 목록 안에서 스크롤한다.
  menuMaxHeight: MinTouchSize * 4,
} as const;

/**
 * 말풍선 묶음 편집기. 2번 대화 예시와 3번 인트로가 함께 쓴다(제목 등 다른 필드는 그대로 둔다).
 *
 * chatLayout을 주면 CREATE-US-12 목업 renderExample의 대화형 표시로 그린다. 상태·검증·추가·수정·삭제 처리는
 * 기본 표시와 같은 함수를 쓰고, 말풍선 목록과 작성 줄을 따로 넘겨 호스트가 작성 줄을 스크롤 밖 아래에 고정하게 한다.
 */
export function FewshotGroupEditor<G extends FewshotGroup>({
  group,
  characters,
  onChange,
  onClose,
  onPending,
  heading = '대화 예시 편집',
  backLabel = '예시 목록으로',
  chatLayout,
}: {
  group: G;
  characters: FewshotCharacter[];
  onChange: (value: G) => void;
  onClose: () => void;
  onPending: (value: PendingInput) => void;
  heading?: string;
  backLabel?: string;
  chatLayout?: (parts: ChatLayoutParts) => ReactNode;
}) {
  const c = useTheme();
  const chat = chatLayout !== undefined;
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [edited, setEdited] = useState('');
  const [body, setBody] = useState('');
  // 목업 openIntroEditor: 대화형 작성 줄은 나레이터가 선택된 채로 연다.
  const [speaker, setSpeaker] = useState<Speaker | null>(chat ? NARRATOR : null);
  const [showSpeakers, setShowSpeakers] = useState(false);
  // 대화형 작성 줄의 캐릭터 드롭다운 목록. @·발화자 목록과 동시에 열지 않는다.
  const [showCharacters, setShowCharacters] = useState(false);
  const [trigger, setTrigger] = useState<number | null>(null);
  // 하단 고정 수정 도구의 삽입 버튼이 말풍선 안 입력의 커서 위치에 넣도록 연결한다.
  const editHandle = useRef<BodyInputHandle>(null);
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
      setShowCharacters(false);
      setShowSpeakers(true);
    }
  }, [characters, editingKey, previous, speaker]);
  // 새 입력은 아직 messages에 없고, 기존 본문 수정은 저장된 길이의 차이만 더한다.
  const lengthDelta =
    countRawText(body) + (editingKey === null ? 0 : countRawText(edited) - countRawText(previous?.body ?? ''));
  useEffect(() => {
    onPending({ active: pending, lengthDelta });
  }, [onPending, pending, lengthDelta]);
  const speakerName = (value: Speaker) =>
    value.speakerKind === 'narrator'
      ? '나레이터'
      : value.speakerKind === 'user'
        ? '유저'
        : characters.find((person) => person.id === value.characterId)?.name || '이름 없는 캐릭터';
  const characterLabel = (person: FewshotCharacter, index: number) =>
    `캐릭터 ${index + 1}: ${person.name || '이름 없음'} 선택`;
  const changeNewBody = (next: string) => {
    let index = 0;
    while (index < body.length && body[index] === next[index]) index++;
    if (next.length === body.length + 1 && next[index] === '@') {
      setTrigger(index);
      setShowCharacters(false);
      setShowSpeakers(true);
    } else if (trigger !== null && next[trigger] !== '@') setTrigger(null);
    setBody(next);
  };
  const choose = (value: Speaker) => {
    setSpeaker(value);
    setShowSpeakers(false);
    setShowCharacters(false);
    if (trigger !== null && body[trigger] === '@') setBody(body.slice(0, trigger) + body.slice(trigger + 1));
    setTrigger(null);
  };
  const startEdit = (message: FewshotMessage) => {
    setEditingKey(message.clientKey);
    setEdited(message.body ?? '');
  };
  const commitEdit = (message: FewshotMessage) => {
    onChange({
      ...group,
      messages: group.messages.map((item) =>
        item.clientKey === message.clientKey
          ? { ...item, body: message.body === null && edited === '' ? null : edited }
          : item,
      ),
    });
    setEditingKey(null);
  };
  const remove = (key: string) =>
    onChange({ ...group, messages: group.messages.filter((item) => item.clientKey !== key) });
  const add = () => {
    if (!speaker) return;
    onChange({
      ...group,
      messages: [...group.messages, { id: null, clientKey: newFewshotKey('message'), ...speaker, body }],
    });
    setBody('');
    setTrigger(null);
    setShowSpeakers(false);
    setShowCharacters(false);
  };
  // CREATE-US-12: 말풍선 순서 변경(드래그·이동 버튼)은 두지 않는다. 받은 순서대로 그리고 새 말풍선은 끝에 붙인다.
  const locked = editingKey !== null;
  const editForm = (message: FewshotMessage) => (
    <>
      <BodyInput label="말풍선 본문 수정" value={edited} onChange={setEdited} inline autoFocus />
      <View style={styles.actions}>
        <Button label="수정 취소" variant="secondary" onPress={() => setEditingKey(null)} />
        <Button label="수정 완료" onPress={() => commitEdit(message)} />
      </View>
    </>
  );
  const bodyButton = (message: FewshotMessage, index: number, children: ReactNode, style?: StyleProp<ViewStyle>) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${index + 1}번 본문 수정`}
      disabled={locked}
      onPress={() => startEdit(message)}
      style={style}
    >
      {children}
    </Pressable>
  );

  if (chatLayout) {
    // 목업 .chat-line: 나레이터는 상자 없는 기울임, 유저는 오른쪽 파란 말풍선, 캐릭터는 왼쪽 아바타·이름과 회청색 말풍선.
    // 삭제 아이콘은 말풍선 옆(.chat-tools)에 둔다.
    const renderBubble = (message: FewshotMessage, index: number) => {
      const kind = message.speakerKind;
      if (editingKey === message.clientKey) {
        // 목업 inlineMessageEditor: 말풍선 자리·모양 그대로 원문을 고친다. 삭제 도구는 수정 중에 숨기고,
        // 취소·삽입·적용은 하단 고정 수정 도구(composer 자리)에 둔다.
        const field = (
          <BodyInput
            variant="bubble-edit"
            tone={kind}
            handle={editHandle}
            label="말풍선 본문 수정"
            value={edited}
            onChange={setEdited}
            autoFocus
          />
        );
        if (kind === 'user') {
          return (
            <View testID="chat-line-user" style={[styles.line, styles.mine]}>
              <View style={styles.editMine}>{field}</View>
            </View>
          );
        }
        return (
          <View testID={`chat-line-${kind}`} style={styles.line}>
            {kind === 'character' ? <Avatar name={speakerName(message)} size={Dim.avatar} /> : null}
            <View style={styles.editMain}>{field}</View>
          </View>
        );
      }
      const bubbleStyle = kind === 'narrator' ? [styles.bubble, styles.fill] : styles.bubble;
      const bubble = bodyButton(message, index, <MessageBody body={message.body} tone={kind} />, bubbleStyle);
      const trash = (
        <IconButton
          icon="trash"
          label={`${index + 1}번 말풍선 삭제`}
          disabled={locked}
          onPress={() => remove(message.clientKey)}
        />
      );
      if (kind === 'user') {
        return (
          <View testID="chat-line-user" style={[styles.line, styles.mine]}>
            {trash}
            {bubble}
          </View>
        );
      }
      return (
        <View testID={`chat-line-${kind}`} style={styles.line}>
          {kind === 'character' ? <Avatar name={speakerName(message)} size={Dim.avatar} /> : null}
          <View style={styles.main}>
            {bubble}
            {trash}
          </View>
        </View>
      );
    };
    // 목업 .chat-line 한 줄: 이름표(유저 제외) 아래 말풍선. 받은 순서대로 그리고 순서 변경 조작은 두지 않는다.
    const renderLine = (message: FewshotMessage, index: number) => (
      <View key={message.clientKey} style={styles.chatRow}>
        {message.speakerKind === 'user' ? null : (
          <Text
            variant="caption"
            style={message.speakerKind === 'character' ? styles.characterName : styles.narratorName}
          >
            {speakerName(message)}
          </Text>
        )}
        {renderBubble(message, index)}
      </View>
    );
    const messages = (
      <View testID="chat-messages">
        <View style={styles.chatList}>{group.messages.map(renderLine)}</View>
        {group.messages.length === 0 ? (
          <View style={styles.empty}>
            <Text variant="subheading" style={styles.centered}>
              첫 말풍선을 작성해 주세요
            </Text>
            <Text variant="caption" style={styles.centered}>
              {'아래에서 발화자를 고르고\n대사나 상황 서술을 입력해 보세요.'}
            </Text>
          </View>
        ) : null}
      </View>
    );
    type Option = { key: string; value: Speaker; name: string; label: string; icon: ReactNode };
    const fixed: Option[] = [
      {
        key: 'narrator',
        value: NARRATOR,
        name: '나레이터',
        label: '나레이터 선택',
        icon: <CreationIcon name="chat" size={Dim.speakerIcon} color={c.textSecondary} />,
      },
      {
        key: 'user',
        value: USER,
        name: '유저',
        label: '유저 선택',
        icon: <CreationIcon name="user" size={Dim.speakerIcon} color={c.textSecondary} />,
      },
    ];
    const people: Option[] = characters.map((person, index) => ({
      key: person.id,
      value: { speakerKind: 'character' as const, characterId: person.id },
      name: person.name || '이름 없음',
      label: characterLabel(person, index),
      icon: <Avatar name={person.name || '?'} size={Dim.speakerAvatar} />,
    }));
    const isSelected = (value: Speaker) =>
      speaker?.speakerKind === value.speakerKind && speaker.characterId === value.characterId;
    // 나레이터·유저는 항상 탭 줄에 고정하고, 캐릭터는 수와 관계없이 드롭다운 하나로 고른다.
    const chosenCharacter = people.find((option) => isSelected(option.value)) ?? null;
    const closeMenu = () => {
      // 목업 openSpeakerPicker 취소: 입력한 @는 본문에 남기고 목록만 닫는다.
      setShowSpeakers(false);
      setTrigger(null);
    };
    const toggleCharacters = () => {
      if (showCharacters) {
        setShowCharacters(false);
        return;
      }
      // 캐릭터 목록을 열면 @·발화자 목록은 닫는다(입력한 @는 본문에 남는다).
      closeMenu();
      setShowCharacters(true);
    };
    // 대화형 작성 줄은 공백만 있는 말풍선을 추가하지 않는다(기본 표시의 기존 동작은 그대로 둔다).
    const canAdd = !!speaker && !locked && body.trim().length > 0;
    // @ 입력, 발화자 캐릭터가 삭제됐을 때 여는 간단한 발화자 목록. 나레이터·유저·모든 캐릭터를 담는다(목업 openSpeakerPicker).
    // 탭 줄 버튼과 이름이 겹치지 않도록 「발화자 목록에서 …」로 부른다.
    const menu = showSpeakers ? (
      <View
        testID="speaker-menu"
        accessibilityLabel="발화자 목록"
        style={[styles.menu, { backgroundColor: c.inputSurface, borderColor: c.actionBorder }]}
      >
        <ScrollView style={styles.menuList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {[...fixed, ...people].map((option) => {
            const selected = isSelected(option.value);
            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityLabel={`발화자 목록에서 ${option.label}`}
                accessibilityState={{ selected }}
                onPress={() => choose(option.value)}
                style={[styles.menuRow, selected && { backgroundColor: c.actionFill }]}
              >
                {option.icon}
                <Text
                  variant="caption"
                  numberOfLines={1}
                  style={[styles.menuText, selected && styles.chosen, { color: selected ? c.actionText : c.tabText }]}
                >
                  {option.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="발화자 목록 닫기"
          onPress={closeMenu}
          style={[styles.menuClose, { borderTopColor: c.footerBorder }]}
        >
          <Text variant="caption" style={{ color: c.secondaryText }}>
            닫기
          </Text>
        </Pressable>
      </View>
    ) : showCharacters && people.length > 0 ? (
      // 탭 줄 캐릭터 드롭다운의 목록. 캐릭터만 담는다.
      <View
        testID="character-menu"
        accessibilityRole="menu"
        accessibilityLabel="캐릭터 발화자 목록"
        style={[styles.menu, { backgroundColor: c.inputSurface, borderColor: c.actionBorder }]}
      >
        <ScrollView
          style={styles.menuList}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {people.map((option) => {
            const selected = isSelected(option.value);
            return (
              <Pressable
                key={option.key}
                accessibilityRole="menuitem"
                accessibilityLabel={option.label}
                accessibilityState={{ selected }}
                onPress={() => choose(option.value)}
                style={[styles.menuRow, selected && { backgroundColor: c.actionFill }]}
              >
                {option.icon}
                <Text
                  variant="caption"
                  numberOfLines={1}
                  style={[styles.menuText, selected && styles.chosen, { color: selected ? c.actionText : c.tabText }]}
                >
                  {option.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    ) : null;
    // 목업 bubbleEditToolbar: 하단 고정 줄에 × 취소 · {{user}}|* 삽입 · ✓ 적용. 원문 검증은 기존 수정 완료와 같다.
    const editBar =
      editingKey !== null && previous ? (
        <View
          testID="bubble-edit-bar"
          accessibilityLabel="말풍선 수정 도구"
          style={[styles.editBar, { backgroundColor: c.footer, borderTopColor: c.footerBorder }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="수정 취소"
            onPress={() => setEditingKey(null)}
            style={[styles.circle, { backgroundColor: c.chipSurface }]}
          >
            <NativeText style={[styles.circleGlyph, { color: c.chipText }]}>×</NativeText>
          </Pressable>
          <View style={[styles.insertTools, { backgroundColor: c.actionFill, borderColor: c.actionBorder }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="{{user}} 삽입"
              onPress={() => editHandle.current?.insert('{{user}}')}
              style={[styles.insertTool, styles.insertUser, { borderRightColor: c.actionBorder }]}
            >
              <NativeText style={[styles.insertUserText, { color: c.userToken }]}>{'{{user}}'}</NativeText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="* 삽입"
              onPress={() => editHandle.current?.insert('*')}
              style={styles.insertTool}
            >
              <NativeText style={[styles.insertGlyph, { color: c.badgeText }]}>*</NativeText>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="수정 완료"
            onPress={() => commitEdit(previous)}
            style={[styles.circle, { backgroundColor: c.chipSurface }]}
          >
            <NativeText style={[styles.circleGlyph, { color: c.chipText }]}>✓</NativeText>
          </Pressable>
        </View>
      ) : null;
    // 목업 .composer: 발화자 탭 줄 · 입력칸(안쪽 오른쪽 보내기) · 삽입 도구와 @ 도움말.
    // 말풍선 수정 중에는 목업처럼 작성 줄 대신 하단 수정 도구를 둔다. 새 입력 초안은 상태로 남아 돌아오면 그대로 보인다.
    const newComposer =
      editingKey !== null ? null : (
        <View
          testID="chat-composer"
          style={[styles.composer, { backgroundColor: c.footer, borderColor: c.footerBorder }]}
        >
          {menu}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            accessibilityLabel="발화자 선택"
            style={[styles.strip, { borderBottomColor: c.footerBorder }]}
            contentContainerStyle={styles.stripContent}
          >
            {fixed.map((option) => {
              const selected = isSelected(option.value);
              const tone = selected ? c.accentText : c.tabText;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected }}
                  onPress={() => choose(option.value)}
                  style={[styles.option, { borderBottomColor: selected ? c.accent : 'transparent' }]}
                >
                  {option.icon}
                  <Text variant="caption" style={[styles.optionText, selected && styles.chosen, { color: tone }]}>
                    {option.name}
                  </Text>
                </Pressable>
              );
            })}
            {people.length > 0 ? (
              // 캐릭터 드롭다운: 고른 캐릭터(없으면 「캐릭터」)만 보이고, 누르면 위에 캐릭터 목록이 열린다.
              <Pressable
                accessibilityRole="combobox"
                accessibilityLabel="캐릭터 발화자"
                accessibilityValue={{ text: chosenCharacter?.name ?? '선택 안 함' }}
                accessibilityState={{ expanded: showCharacters, selected: !!chosenCharacter }}
                onPress={toggleCharacters}
                style={[styles.option, { borderBottomColor: chosenCharacter ? c.accent : 'transparent' }]}
              >
                {chosenCharacter?.icon ?? <CreationIcon name="user" size={Dim.speakerIcon} color={c.textSecondary} />}
                <Text
                  variant="caption"
                  numberOfLines={1}
                  style={[
                    styles.optionText,
                    chosenCharacter && styles.chosen,
                    { color: chosenCharacter ? c.accentText : c.tabText },
                  ]}
                >
                  {chosenCharacter?.name ?? '캐릭터'}
                </Text>
                <View style={showCharacters ? styles.chevronOpen : styles.chevronClosed}>
                  <CreationIcon name="back" size={Dim.chevron} color={c.headerIcon} />
                </View>
              </Pressable>
            ) : null}
          </ScrollView>
          <BodyInput
            variant="composer"
            label="새 말풍선 본문"
            value={body}
            onChange={changeNewBody}
            placeholder={speaker ? `${speakerName(speaker)}의 메시지 입력` : '위에서 발화자를 골라 주세요'}
            hint="@로 발화자 선택"
            accessory={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="말풍선 추가"
                accessibilityState={{ disabled: !canAdd }}
                disabled={!canAdd}
                onPress={add}
                style={[styles.send, { backgroundColor: c.accent, borderColor: c.accent }, !canAdd && styles.dim]}
              >
                <CreationIcon name="send" size={Dim.sendIcon} color={c.onAccent} />
              </Pressable>
            }
          />
        </View>
      );
    return <>{chatLayout({ messages, composer: editBar ?? newComposer })}</>;
  }

  return (
    <View style={styles.content}>
      <Text variant="heading">{heading}</Text>
      <Button label={backLabel} variant="secondary" disabled={pending} onPress={onClose} />
      {pending ? (
        <Text variant="caption">작성한 내용을 추가하거나 수정 완료·취소한 뒤 이동·저장할 수 있습니다.</Text>
      ) : null}
      <View style={styles.list}>
        {group.messages.map((message, index) => (
          <View
            key={message.clientKey}
            style={[styles.message, styles.card, { backgroundColor: c.surface, borderColor: c.surfaceBorder }]}
          >
            {message.speakerKind !== 'user' ? <Text variant="caption">{speakerName(message)}</Text> : null}
            {editingKey === message.clientKey
              ? editForm(message)
              : bodyButton(message, index, <MessageBody body={message.body} />)}
            <Button
              label={`${index + 1}번 말풍선 삭제`}
              variant="danger"
              disabled={locked}
              onPress={() => remove(message.clientKey)}
            />
          </View>
        ))}
      </View>
      {group.messages.length === 0 ? <Text variant="caption">아직 말풍선이 없습니다.</Text> : null}
      <Text variant="subheading">새 말풍선</Text>
      <Button
        label={speaker ? `@ 발화자: ${speakerName(speaker)}` : '@ 발화자 선택'}
        variant="secondary"
        disabled={locked}
        onPress={() => {
          setTrigger(null);
          setShowSpeakers((value) => !value);
        }}
      />
      {showSpeakers ? (
        <View style={styles.actions}>
          <Button label="유저 선택" variant="secondary" onPress={() => choose(USER)} />
          <Button label="나레이터 선택" variant="secondary" onPress={() => choose(NARRATOR)} />
          {characters.map((person, index) => (
            <Button
              key={person.id}
              label={characterLabel(person, index)}
              variant="secondary"
              onPress={() => choose({ speakerKind: 'character', characterId: person.id })}
            />
          ))}
        </View>
      ) : null}
      {editingKey === null ? <BodyInput label="새 말풍선 본문" value={body} onChange={changeNewBody} /> : null}
      <View style={styles.actions}>
        <Button label="말풍선 추가" disabled={!speaker || locked} onPress={add} />
        <Button
          label="새 입력 취소"
          variant="secondary"
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
  list: { gap: Spacing.two },
  message: { gap: Spacing.two },
  // 목업 .item: 라운드 12 카드(기존 목록 행 모양)
  card: { borderWidth: 1, borderRadius: Radius.item, padding: Spacing.two },
  // 목업 .chat-line: 줄 사이 20px, 이름표와 말풍선 사이 4px
  chatList: { gap: Spacing.four },
  chatRow: { gap: Spacing.one },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  // 목업 .chat-line: 아바타와 본문 gap 8, 위 정렬
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, minWidth: 0 },
  // 목업 .mine: 오른쪽 정렬, 삭제 아이콘이 말풍선 왼쪽
  mine: { justifyContent: 'flex-end', alignItems: 'center', gap: Spacing.one + 2 },
  // 목업 .chat-main grid: 말풍선 | 44px 도구 열(gap 6)
  main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2 },
  bubble: { flexShrink: 1, minWidth: 0 },
  fill: { flex: 1 },
  // 목업 .editing-chat .chat-main: 캐릭터는 아바타 옆 남은 폭, 유저는 85%까지(최소 130), 나레이터는 전체 폭
  editMain: { flex: 1, minWidth: 0 },
  editMine: { flexShrink: 1, maxWidth: '85%' },
  // 목업 .bubble-edit-bar: 하단 고정 줄, padding 10px 16px, gap 10, 위 구분선
  editBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two + 2,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderTopWidth: 1,
  },
  // 목업 .edit-circle: 44px 원형, 28px 기호
  circle: {
    width: MinTouchSize,
    height: MinTouchSize,
    borderRadius: MinTouchSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleGlyph: { fontSize: Dim.circleGlyph, lineHeight: Dim.circleGlyph + 4 },
  // 목업 .edit-insert-tools: ✓ 바로 왼쪽에 붙는 둥근 알약, padding 0 8px
  insertTools: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: MinTouchSize / 2,
    paddingHorizontal: Spacing.two,
  },
  insertTool: { minWidth: MinTouchSize, height: MinTouchSize, alignItems: 'center', justifyContent: 'center' },
  // 첫 버튼({{user}})은 16px 글자, 오른쪽 구분선, padding 0 12px
  insertUser: { borderRightWidth: 1, paddingHorizontal: Spacing.three - Spacing.one },
  insertUserText: { fontSize: 16 },
  insertGlyph: { fontSize: Dim.insertGlyph, lineHeight: Dim.insertGlyph + 4 },
  // 발화자 목록: 작성 줄 위에 붙는 간단한 드롭다운. 4줄 넘으면 안에서 스크롤한다.
  menu: { borderWidth: 1, borderRadius: Radius.md, marginTop: Spacing.two, overflow: 'hidden' },
  menuList: { maxHeight: Dim.menuMaxHeight },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: MinTouchSize,
    paddingHorizontal: Spacing.three - Spacing.one,
  },
  menuText: { flexShrink: 1, fontSize: 14 },
  menuClose: { minHeight: MinTouchSize, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1 },
  // .chat-name: 캐릭터 이름은 아바타(34)+간격(8) 오른쪽, 나레이터는 padding-left 12
  characterName: { paddingLeft: Dim.avatar + Spacing.two },
  narratorName: { paddingLeft: Spacing.three - Spacing.one },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.six },
  centered: { textAlign: 'center' },
  // 목업 .composer: 위쪽 모서리 둥근 하단 고정 판, padding 0 16px 12px
  composer: {
    borderWidth: 1,
    borderBottomWidth: 0,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three - Spacing.one,
    gap: Spacing.two + 2,
  },
  // 목업 .speaker-strip: 가로 스크롤, gap 18, min-height 62, 아래 구분선
  strip: { flexGrow: 0, borderBottomWidth: 1 },
  stripContent: { gap: Spacing.three + 2, minHeight: Dim.stripHeight, alignItems: 'stretch' },
  // 목업 .speaker-option: 아이콘·이름 gap 6, 선택 시 아래 2px 강조선
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingVertical: Spacing.two,
    borderBottomWidth: 2,
    minHeight: MinTouchSize,
  },
  optionText: { fontSize: 14 },
  // 캐릭터 드롭다운의 펼침 표시(SceneDropdown과 같은 뒤로 아이콘 회전)
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  chevronClosed: { transform: [{ rotate: '-90deg' }] },
  chosen: { fontWeight: '700' },
  // 목업 .send-example: 44px 원형 파란 버튼
  send: {
    width: MinTouchSize,
    height: MinTouchSize,
    borderRadius: MinTouchSize / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.45 },
});
