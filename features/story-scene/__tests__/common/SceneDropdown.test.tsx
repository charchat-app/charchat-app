import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { useState } from 'react';
import { SceneDropdown, type SceneDropdownOption } from '../../components/initial-state/SceneDropdown';

// 이름표가 겹치는 두 값(서로 다른 key)과 고를 수 없는 값
const OPTIONS: SceneDropdownOption<string>[] = [
  { key: 'a', label: '골목' },
  { key: 'b', label: '골목' },
  { key: 'c', label: '옥상', disabled: true, note: '반대쪽에서 선택됨' },
];

function Harness({ initial, onChange }: { initial: string | null; onChange: (key: string) => void }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <SceneDropdown
      label="편집할 인트로"
      options={OPTIONS}
      value={value}
      onChange={(key) => {
        onChange(key);
        setValue(key);
      }}
    />
  );
}
const combobox = () => screen.getByRole('combobox', { name: '편집할 인트로' });
const menu = () => within(screen.getByLabelText('편집할 인트로 목록'));
/** 접힌 칸의 펼침 상태. 호스트 요소의 accessibilityState prop으로 확인한다. */
const expanded = () => combobox().props.accessibilityState?.expanded;

it('CREATE-US-12: 접힌 상태에서는 고른 값 하나만 보이고, 펼치면 메뉴에서 고른 뒤 다시 접힌다', async () => {
  const onChange = jest.fn();
  await render(<Harness initial="a" onChange={onChange} />);
  expect(combobox()).toHaveAccessibilityValue({ text: '골목' });
  expect(expanded()).toBe(false);
  expect(screen.queryByLabelText('편집할 인트로 목록')).toBeNull();
  expect(screen.queryAllByRole('menuitem')).toHaveLength(0);

  await fireEvent.press(combobox());
  expect(expanded()).toBe(true);
  const items = menu().getAllByRole('menuitem');
  expect(items).toHaveLength(3);
  expect(items[0]).toBeSelected();
  expect(items[1]).not.toBeSelected();
  // 이름표가 같아도 key로 고른다(두 번째 「골목」).
  await fireEvent.press(items[1]);
  expect(onChange).toHaveBeenCalledWith('b');
  expect(screen.queryByLabelText('편집할 인트로 목록')).toBeNull();
  expect(expanded()).toBe(false);

  await fireEvent.press(combobox());
  expect(menu().getAllByRole('menuitem')[1]).toBeSelected();
  expect(menu().getAllByRole('menuitem')[0]).not.toBeSelected();
});

it('CREATE-US-12: 고를 수 없는 값은 이유와 함께 보이지만 눌러도 바뀌지 않는다', async () => {
  const onChange = jest.fn();
  await render(<Harness initial="a" onChange={onChange} />);
  await fireEvent.press(combobox());
  const blocked = menu().getByRole('menuitem', { name: '옥상' });
  expect(blocked).toBeDisabled();
  expect(menu().getByText('옥상 · 반대쪽에서 선택됨')).toBeTruthy();
  await fireEvent.press(blocked);
  expect(onChange).not.toHaveBeenCalled();
  expect(combobox()).toHaveAccessibilityValue({ text: '골목' });
});

it('CREATE-US-12: 목록에 없는 값(삭제된 인물 등)은 고른 값으로 보이지 않고 안내 문구를 보여 준다', async () => {
  await render(<Harness initial="gone" onChange={jest.fn()} />);
  expect(combobox()).toHaveAccessibilityValue({ text: '선택해 주세요' });
  await fireEvent.press(combobox());
  for (const item of menu().getAllByRole('menuitem')) expect(item).not.toBeSelected();
});

it('CREATE-US-12: 메뉴는 스크롤 막대를 숨긴다', async () => {
  await render(<Harness initial="a" onChange={jest.fn()} />);
  await fireEvent.press(combobox());
  const scroll = screen.getByTestId('scene-dropdown-menu');
  expect(scroll.props.showsVerticalScrollIndicator).toBe(false);
  expect(scroll.props.showsHorizontalScrollIndicator).toBe(false);
});
