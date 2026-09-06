/**
 * Presentation helpers. Every date the API sends is either a business-local
 * calendar date ('YYYY-MM-DD') or an absolute instant, and they are formatted
 * differently on purpose: a due date has no time of day, ever.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const parts = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
};

/** Day of week for a calendar date, computed without touching the local clock. */
export function weekday(iso: string): string {
  const { y, m, d } = parts(iso);
  return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** '4 Mar' — or '4 Mar 2027' when the year differs from the reference. */
export function shortDate(iso: string, reference?: string): string {
  if (!iso) return '—';
  const { y, m, d } = parts(iso);
  const sameYear = reference ? reference.slice(0, 4) === String(y) : true;
  return `${d} ${MONTHS[m - 1]}${sameYear ? '' : ` ${y}`}`;
}

/** 'Wednesday, 4 March 2026' */
export function longDate(iso: string): string {
  if (!iso) return '—';
  const { y, m, d } = parts(iso);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow]}, ${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

/** An absolute instant, in the reader's own timezone: '4 Mar, 14:05'. */
export function instant(iso: string): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]}, ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

export function instantLong(iso: string): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  return `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dt.getDay()]}, ${dt.getDate()} ${MONTHS_LONG[dt.getMonth()]} ${dt.getFullYear()} at ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

/** 'just now', '20 minutes ago', '3 days ago'. */
export function relative(iso: string, now = Date.now()): string {
  if (!iso) return '—';
  const diff = Math.round((now - new Date(iso).getTime()) / 1000);
  if (diff < 45) return 'just now';
  if (diff < 90) return 'a minute ago';
  const mins = Math.round(diff / 60);
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return days === 1 ? 'yesterday' : `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return months === 1 ? 'last month' : `${months} months ago`;
  return `${Math.round(months / 12)} year${months >= 24 ? 's' : ''} ago`;
}

/** 'every 3 months' / 'every day' — the way a person says it. */
export function cadence(value: number, unit: string): string {
  const singular = unit.replace(/s$/, '');
  if (value === 1) return `every ${singular}`;
  return `every ${value} ${unit}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Today's calendar date shifted by n days, for date-input defaults. */
export function shiftDate(iso: string, days: number): string {
  const { y, m, d } = parts(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function daysBetween(from: string, to: string): number {
  const a = parts(from); const b = parts(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

/** Initials for an avatar chip: 'Ana Ribeiro' -> 'AR'. */
export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

/**
 * Calendar arithmetic mirroring server/domain/time.js, so a form can preview
 * the exact date the server will store. Months and years clamp to the
 * destination month's last valid day.
 */
export function addInterval(iso: string, value: number, unit: string): string {
  const { y, m, d } = parts(iso);
  if (unit === 'days' || unit === 'weeks') return shiftDate(iso, value * (unit === 'weeks' ? 7 : 1));
  const months = unit === 'years' ? value * 12 : value;
  const zero = y * 12 + (m - 1) + months;
  const destYear = Math.floor(zero / 12);
  const destMonth = ((zero % 12) + 12) % 12 + 1;
  const lastDay = new Date(Date.UTC(destYear, destMonth, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${String(destYear).padStart(4, '0')}-${String(destMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
