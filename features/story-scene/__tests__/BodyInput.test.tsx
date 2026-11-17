import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { BodyInput, MessageBody, parseFormatted } from '../components/BodyInput';
import { Colors } from '@/constants/theme';

it('신규·기존 입력의 원문과 공백을 유지하며 치환 표기를 보라색으로 표시한다', async () => {
  const original = '  **{{user}}**\n*서술*  ';
  const onChange = jest.fn();
  const view = await render(<BodyInput value={original} onChange={onChange} label="본문" />);
  const input = screen.getByLabelText('본문');
  expect(input.props.value).toBe(original);
  const mirror = screen.getByTestId('본문 원문 표시', { includeHiddenElements: true });
  expect(within(mirror).getByText('{{user}}', { includeHiddenElements: true })).toHaveStyle({
    color: Colors.light.userToken,
  });
  expect(input.props.scrollEnabled).toBe(false);
  expect(onChange).not.toHaveBeenCalled();
  await view.rerender(<BodyInput value={original} onChange={onChange} label="본문" inline autoFocus />);
  expect(screen.getByLabelText('본문').props.autoFocus).toBe(true);
  expect(screen.getByLabelText('본문').props.value).toBe(original);
});

it('선택 영역에 원문 도구를 삽입하고 다음 삽입은 새 커서 위치를 사용하며 일반 입력 선택은 강제하지 않는다', async () => {
  const changed = jest.fn();
  function Editor() {
    const [value, setValue] = useState('앞뒤끝');
    return (
      <BodyInput
        value={value}
        label="본문"
        onChange={(next) => {
          changed(next);
          setValue(next);
        }}
      />
    );
  }
  await render(<Editor />);
  await fireEvent(screen.getByLabelText('본문'), 'selectionChange', {
    nativeEvent: { selection: { start: 1, end: 2 } },
  });
  await fireEvent.press(screen.getByRole('button', { name: '{{user}} 삽입' }));
  expect(screen.getByLabelText('본문').props.value).toBe('앞{{user}}끝');
  expect(screen.getByLabelText('본문').props.selection).toEqual({ start: 9, end: 9 });
  await fireEvent(screen.getByLabelText('본문'), 'selectionChange', {
    nativeEvent: { selection: { start: 9, end: 9 } },
  });
  expect(screen.getByLabelText('본문').props.selection).toBeUndefined();
  await fireEvent.press(screen.getByRole('button', { name: '* 삽입' }));
  expect(screen.getByLabelText('본문').props.value).toBe('앞{{user}}*끝');
  expect(changed).toHaveBeenCalledTimes(2);
  await fireEvent.changeText(screen.getByLabelText('본문'), '한글 조합 중');
  expect(screen.getByLabelText('본문').props.selection).toBeUndefined();
  expect(screen.getByLabelText('본문').props.value).toBe('한글 조합 중');
});

describe('parseFormatted', () => {
  const plain = (text: string) => ({ text, bold: false, italic: false });
  it('기울임 안의 굵게를 굵은 기울임으로 표시한다', () => {
    expect(parseFormatted('*그는 **크게** 웃었다*')).toEqual([
      { text: '그는 ', bold: false, italic: true },
      { text: '크게', bold: true, italic: true },
      { text: ' 웃었다', bold: false, italic: true },
    ]);
  });
  it('굵게 안의 기울임도 표시한다', () => {
    expect(parseFormatted('**아주 *조용히* 말했다**')).toEqual([
      { text: '아주 ', bold: true, italic: false },
      { text: '조용히', bold: true, italic: true },
      { text: ' 말했다', bold: true, italic: false },
    ]);
  });
  it('공백으로 둘러싸인 별표와 짝 없는 기호는 원문 그대로 둔다', () => {
    expect(parseFormatted('3 * 4 * 5')).toEqual([plain('3 * 4 * 5')]);
    expect(parseFormatted('별표 하나* 와 **열린 채')).toEqual([plain('별표 하나* 와 **열린 채')]);
  });
  it('기존 단순 서식과 줄바꿈은 그대로 유지한다', () => {
    expect(parseFormatted('대사\n*서술* **강조**')).toEqual([
      plain('대사\n'),
      { text: '서술', bold: false, italic: true },
      plain(' '),
      { text: '강조', bold: true, italic: false },
    ]);
  });
});

it('겹친 서식을 화면에서 굵은 기울임으로 보여주고 별표를 드러내지 않는다', async () => {
  await render(<MessageBody body={'*그는 **크게** 웃었다*'} />);
  // 원문 조각 바로 위의 서식 Text가 굵게·기울임을 함께 가진다.
  expect(screen.getByText('크게').parent).toHaveStyle({ fontWeight: '700', fontStyle: 'italic' });
  expect(screen.getByText('그는').parent).not.toHaveStyle({ fontWeight: '700' });
  expect(screen.queryByText(/\*/)).toBeNull();
});

it('읽기용 굵게·기울임 안의 치환 표기도 원문으로 구분한다', async () => {
  await render(<MessageBody body={'**{{user}}**와 *서술*'} />);
  expect(screen.getByText('{{user}}')).toHaveStyle({ color: Colors.light.userToken });
  expect(screen.queryByText('**{{user}}**')).toBeNull();
  expect(screen.getByText('서술')).toBeTruthy();
});
