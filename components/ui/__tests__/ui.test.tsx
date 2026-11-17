import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { TextArea } from '@/components/ui/TextArea';
import { TopTabs } from '@/components/ui/TopTabs';

describe('Button', () => {
  it('누르면 onPress를 호출한다', async () => {
    const onPress = jest.fn();
    await render(<Button label="저장" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: '저장' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('비활성이면 누를 수 없다', async () => {
    const onPress = jest.fn();
    await render(<Button label="저장" disabled onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: '저장' }));

    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('ChipGroup', () => {
  function MultiHarness({ onLimit }: { onLimit: () => void }) {
    const [value, setValue] = useState<string[]>([]);
    return (
      <ChipGroup
        mode="multi"
        options={['하나', '둘', '셋']}
        value={value}
        max={2}
        onChange={setValue}
        onLimitReached={onLimit}
      />
    );
  }

  function SingleHarness() {
    const [value, setValue] = useState<string[]>([]);
    return <ChipGroup options={['과거형', '현재형']} value={value} onChange={setValue} />;
  }

  it('최대 개수를 넘으면 선택하지 않고 알린다', async () => {
    const onLimit = jest.fn();
    await render(<MultiHarness onLimit={onLimit} />);

    await fireEvent.press(screen.getByRole('checkbox', { name: '하나' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: '둘' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: '셋' }));

    expect(screen.getByRole('checkbox', { name: '셋' })).not.toBeChecked();
    expect(onLimit).toHaveBeenCalledTimes(1);
  });

  it('단일 선택은 하나만 유지한다', async () => {
    await render(<SingleHarness />);

    await fireEvent.press(screen.getByRole('radio', { name: '과거형' }));
    await fireEvent.press(screen.getByRole('radio', { name: '현재형' }));

    expect(screen.getByRole('radio', { name: '현재형' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '과거형' })).not.toBeChecked();
  });
});

describe('TextArea', () => {
  it('글자 수와 한도를 표시한다', async () => {
    await render(<TextArea value="abc" maxLength={1000} onChangeText={() => {}} />);

    expect(screen.getByText('3 / 1,000자')).toBeTruthy();
  });
});

describe('TopTabs', () => {
  function TabsHarness() {
    const [active, setActive] = useState(0);
    return <TopTabs tabs={['표현', '저장']} activeIndex={active} onChange={setActive} />;
  }
  it('현재 탭과 이전 탭의 선택 의미를 전환한다', async () => {
    await render(<TabsHarness />);
    expect(screen.getByRole('tab', { name: '표현', selected: true })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '저장', selected: false })).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: '저장' }));
    expect(screen.getByRole('tab', { name: '저장', selected: true })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '표현', selected: false })).toBeTruthy();
  });
});
