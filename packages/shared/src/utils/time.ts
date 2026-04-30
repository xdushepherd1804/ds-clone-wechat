const ONE_SECOND = 1000;
const ONE_MINUTE = 60 * ONE_SECOND;
const ONE_HOUR = 60 * ONE_MINUTE;
const ONE_DAY = 24 * ONE_HOUR;

export function formatTime(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatDate(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const y = d.getFullYear();
  const mo = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${y}-${mo}-${dd}`;
}

export function formatDateTime(date: Date | string | number): string {
  return `${formatDate(date)} ${formatTime(date)}`;
}

export function formatRelativeTime(date: Date | string | number, now: Date = new Date()): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const diff = now.getTime() - d.getTime();

  if (diff < ONE_MINUTE) return '刚刚';
  if (diff < ONE_HOUR) return `${Math.floor(diff / ONE_MINUTE)}分钟前`;
  if (diff < ONE_DAY) return `${Math.floor(diff / ONE_HOUR)}小时前`;
  if (diff < 2 * ONE_DAY) return '昨天';

  const nowYear = now.getFullYear();
  const dYear = d.getFullYear();
  if (nowYear === dYear) return formatDate(d).slice(5); // MM-DD
  return formatDate(d); // YYYY-MM-DD
}

export function isToday(date: Date | string | number): boolean {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const today = new Date();
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

export function isYesterday(date: Date | string | number): boolean {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const yesterday = new Date(Date.now() - ONE_DAY);
  return (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  );
}

export function now(): number {
  return Date.now();
}

export function nowISO(): string {
  return new Date().toISOString();
}
