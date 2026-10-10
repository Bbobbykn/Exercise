// Planning helpers: which exercises are scheduled on which day.
// A plan item can have weekdays (0 = Sunday), a start date and an end date.

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// Local date as YYYY-MM-DD (not UTC, so "today" matches the phone's clock).
export function ymd(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(date, n) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function isScheduled(item, date) {
  const day = ymd(date);
  const days = item.days?.length ? item.days : ALL_DAYS;
  if (!days.includes(new Date(date).getDay())) return false;
  if (item.startDate && day < item.startDate) return false;
  if (item.endDate && day > item.endDate) return false;
  return true;
}

export const itemsOn = (program, date) => (program ?? []).filter((it) => isScheduled(it, date));

// Short description of when an item happens, e.g. "Mon, Wed, Fri · from 14 Oct".
export function scheduleText(item) {
  const days = item.days?.length ? item.days : ALL_DAYS;
  const names = days.length === 7 ? 'Every day'
    : days.slice().sort().map((d) => new Date(2024, 0, 7 + d).toLocaleDateString(undefined, { weekday: 'short' })).join(', ');
  const fmt = (s) => new Date(s + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const parts = [names];
  if (item.startDate && item.startDate > ymd()) parts.push(`from ${fmt(item.startDate)}`);
  if (item.endDate) parts.push(`until ${fmt(item.endDate)}`);
  return parts.join(' · ');
}
