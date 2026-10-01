// Date helpers. All engine maths works on integer "day numbers" (days since
// 1970-01-01, UTC) so there are no timezone or DST surprises. ISO strings
// (YYYY-MM-DD) are the storage and API format.

const MS_PER_DAY = 86400000;

export function toDay(iso) {
  if (iso === null || iso === undefined || iso === '') return null;
  if (typeof iso === 'number') return iso;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromDay(day) {
  if (day === null || day === undefined || Number.isNaN(day)) return null;
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  return fromDay(toDay(iso) + n);
}

/** Day of week for a day number: 0 = Sunday ... 6 = Saturday. */
export function dow(day) {
  return (((day + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

/** Monday of the week containing the given day number. */
export function weekStartDay(day) {
  const d = dow(day);
  return day - ((d + 6) % 7);
}

export function weekStart(iso) {
  return fromDay(weekStartDay(toDay(iso)));
}

/** ISO-8601 week number label, e.g. "2026-W40". */
export function isoWeekLabel(iso) {
  const day = toDay(iso);
  const thursday = weekStartDay(day) + 3;
  const year = new Date(thursday * MS_PER_DAY).getUTCFullYear();
  const jan1 = toDay(`${year}-01-01`);
  const week = Math.floor((thursday - jan1) / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function diffDays(a, b) {
  return toDay(b) - toDay(a);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "05-Oct-26" — the compact format planners are used to from P6. */
export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${MONTHS[Number(m) - 1]}-${y.slice(2)}`;
}

export function monthLabel(day) {
  const dt = new Date(day * MS_PER_DAY);
  return `${MONTHS[dt.getUTCMonth()]} ${String(dt.getUTCFullYear()).slice(2)}`;
}

export function isValidIso(iso) {
  return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && fromDay(toDay(iso)) === iso;
}
