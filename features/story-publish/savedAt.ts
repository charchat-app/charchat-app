/** 서버 저장 시각을 "마지막 저장 11월 17일 20:15" 형태로 보여 준다. */
export function formatSavedAt(iso: string | null): string {
  if (!iso) return '저장 기록 없음';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '저장 기록 없음';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `마지막 저장 ${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
