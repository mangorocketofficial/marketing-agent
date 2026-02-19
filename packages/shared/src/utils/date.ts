// KST(한국 표준시)는 UTC+9
const KST_OFFSET_HOURS = 9;

// 현재 시간을 KST 기준 Date 객체로 반환
export function nowKST(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  return new Date(utcMs + KST_OFFSET_HOURS * 3_600_000);
}

// Date 객체를 ISO 8601 문자열로 변환 (예: "2026-02-19T14:30:00")
export function toISOString(date: Date): string {
  return date.toISOString().replace('Z', '');
}

// Date 객체를 "2026-02-19" 형식으로 변환
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Date 객체를 "14:30" 형식으로 변환
export function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// 오늘 KST 기준 특정 시각의 Date 생성 (예: 오늘 14시)
export function todayAt(hour: number): Date {
  const today = nowKST();
  today.setHours(hour, 0, 0, 0);
  return today;
}
