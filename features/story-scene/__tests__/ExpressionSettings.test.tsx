import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from '@/components/ui';
import { defaultExpression } from '@/shared/story-types';
import { ExpressionSettings } from '../components/ExpressionSettings';

function Harness() {
  const [value, setValue] = useState(defaultExpression());
  return (
    <>
      <ExpressionSettings value={value} onChange={setValue} />
      <Text testID="settings">{JSON.stringify(value)}</Text>
    </>
  );
}
it('CREATE-US-12: 목업 v15처럼 필수 항목은 「표현 설정」 카드, 문체는 선택 표시가 있는 「문체 스타일」 구역에 둔다', async () => {
  await render(<Harness />);
  const card = screen.getByLabelText('표현 설정');
  expect(within(card).getByRole('header', { name: '표현 설정' })).toBeTruthy();
  expect(within(card).getByText('대화의 기본 톤')).toBeTruthy();
  for (const name of ['1인칭', '과거형', '대사 중심', '짧게'])
    expect(within(card).getByRole('radio', { name })).toBeTruthy();
  for (const label of ['시점', '시제', '대화 구성', '응답 길이']) expect(within(card).getByText(label)).toBeTruthy();
  // 응답 길이는 목표 분량 보조 글자를 칸마다 보여 주고, 이름은 그대로 「짧게·보통·길게」다.
  expect(within(card).getByText('목표 분량')).toBeTruthy();
  for (const sub of ['300–500자', '500–1000자', '1000–2000자']) expect(within(card).getByText(sub)).toBeTruthy();
  expect(screen.getByRole('radio', { name: '보통' })).toBeTruthy();

  const style = screen.getByLabelText('문체 스타일');
  expect(within(style).getByText('선택')).toBeTruthy();
  // 미선택(문체 없음으로 되돌리기)은 그대로 둔다.
  expect(within(style).getByRole('radio', { name: '미선택' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('radio', { name: '기본 문체' }));
  expect(within(style).getByText('0 / 2개')).toBeTruthy();
  await fireEvent.press(screen.getByRole('checkbox', { name: '설레는' }));
  expect(within(style).getByText('1 / 2개')).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: '설레는' })).toBeChecked();
  expect(within(style).getByText('✓ 설레는')).toBeTruthy();
  expect(within(style).getByText('+ 포근한')).toBeTruthy();
  // 다시 누르면 해제된다.
  await fireEvent.press(screen.getByRole('checkbox', { name: '설레는' }));
  expect(screen.getByRole('checkbox', { name: '설레는' })).not.toBeChecked();
});
it('필수 단일 선택은 다시 눌러도 해제되지 않는다', async () => {
  await render(<Harness />);
  await fireEvent.press(screen.getByRole('radio', { name: '3인칭' }));
  expect(screen.getByRole('radio', { name: '3인칭' })).toBeChecked();
  await fireEvent.press(screen.getByRole('radio', { name: '대사 중심' }));
  expect(screen.getByTestId('settings').props.children).toContain('"composition":"dialogue"');
});
it('세 번째 문체를 막고 커스텀으로 전환하면 기존 문체를 동시에 적용하지 않는다', async () => {
  await render(<Harness />);
  await fireEvent.press(screen.getByRole('radio', { name: '기본 문체' }));
  for (const name of ['서정적인', '설레는', '담백한']) await fireEvent.press(screen.getByRole('checkbox', { name }));
  expect(screen.getByRole('checkbox', { name: '담백한' })).not.toBeChecked();
  expect(screen.getByText('문체는 최대 2개까지 선택할 수 있습니다.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('radio', { name: '직접 작성' }));
  await fireEvent.press(screen.getByRole('button', { name: '지우고 바꾸기' }));
  await fireEvent.changeText(screen.getByLabelText('커스텀 문체'), '가'.repeat(1001));
  const value = JSON.parse(screen.getByTestId('settings').props.children);
  expect(value.style).toEqual({ mode: 'custom', text: '가'.repeat(1001) });
});
it('작성한 커스텀 문체가 있으면 방식 전환 전에 확인하고, 취소하면 원문을 지키며 비어 있으면 바로 바꾼다', async () => {
  await render(<Harness />);
  const read = () => JSON.parse(screen.getByTestId('settings').props.children).style;
  await fireEvent.press(screen.getByRole('radio', { name: '직접 작성' }));
  expect(screen.queryByRole('button', { name: '지우고 바꾸기' })).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('커스텀 문체'), '  나만의\n문체 *원문*');
  await fireEvent.press(screen.getByRole('radio', { name: '기본 문체' }));
  expect(screen.getByText(/작성한 커스텀 문체가 지워져요/)).toBeTruthy();
  expect(read()).toEqual({ mode: 'custom', text: '  나만의\n문체 *원문*' });
  await fireEvent.press(screen.getByRole('button', { name: '문체 바꾸지 않기' }));
  expect(read()).toEqual({ mode: 'custom', text: '  나만의\n문체 *원문*' });
  expect(screen.getByLabelText('커스텀 문체').props.value).toBe('  나만의\n문체 *원문*');
  await fireEvent.press(screen.getByRole('radio', { name: '미선택' }));
  await fireEvent.press(screen.getByRole('button', { name: '지우고 바꾸기' }));
  expect(read()).toEqual({ mode: 'none' });
  expect(screen.queryByRole('button', { name: '지우고 바꾸기' })).toBeNull();
});
