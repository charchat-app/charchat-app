/**
 * 서버 저장 시각을 "마지막 저장 11월 17일 20:15" 형태로 보여 준다.
 * label로 앞말을 바꾼다(예: 임시 저장 시각 workingCopySavedAt은 "임시 저장").
 */
export function formatSavedAt(iso: string | null, label = '마지막 저장'): string {
  if (!iso) return '저장 기록 없음';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '저장 기록 없음';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${label} ${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
