import { people } from '../components/initial-state/people';

it('캐릭터 이름이 유저나 다른 이름표와 겹쳐도 이름표를 모두 다르게 만든다', () => {
  const labels = people([
    { id: '1', name: '유저', position: 0 },
    { id: '2', name: '유저 (1)', position: 1 },
    { id: '3', name: '하린', position: 2 },
    { id: '4', name: '하린', position: 3 },
  ]).map((person) => person.label);
  expect(new Set(labels).size).toBe(labels.length);
  expect(labels[0]).toBe('유저');
});
