'use strict';
/**
 * Calendar arithmetic for the maintenance schedule.
 *
 * Every scheduling decision in this system happens on *calendar dates* in one
 * configured business timezone. Dates are carried as plain 'YYYY-MM-DD'
 * strings so that no wall-clock or DST question can ever perturb a due date.
 * Only completion instants are stored as absolute UTC timestamps.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UNITS = new Set(['days', 'weeks', 'months', 'years']);

/** Split 'YYYY-MM-DD' into civil parts. Throws on anything malformed. */
function parseDate(iso) {
  const m = DATE_RE.exec(String(iso ?? ''));
  if (!m) throw new TypeError(`Not a calendar date: ${JSON.stringify(iso)}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) throw new RangeError(`Month out of range in ${iso}`);
  if (day < 1 || day > daysInMonth(year, month)) throw new RangeError(`Day out of range in ${iso}`);
  return { year, month, day };
}

function isValidDate(iso) {
  try { parseDate(iso); return true; } catch { return false; }
}

function formatDate({ year, month, day }) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  switch (month) {
    case 1: case 3: case 5: case 7: case 8: case 10: case 12: return 31;
    case 4: case 6: case 9: case 11: return 30;
    case 2: return isLeapYear(year) ? 29 : 28;
    default: throw new RangeError(`No such month: ${month}`);
  }
}

/** Days since the epoch for a civil date — the basis for all day arithmetic. */
function toEpochDay(iso) {
  const { year, month, day } = parseDate(iso);
  return Math.round(Date.UTC(year, month - 1, day) / 86400000);
}

function fromEpochDay(epochDay) {
  const d = new Date(epochDay * 86400000);
  return formatDate({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

function addDays(iso, days) {
  if (!Number.isInteger(days)) throw new TypeError('addDays expects an integer');
  return fromEpochDay(toEpochDay(iso) + days);
}

/**
 * Add whole calendar months, clamping to the destination month's last valid
 * day. 2025-01-31 + 1 month is 2025-02-28; + 1 month again is 2025-03-28.
 * (Clamping is applied per hop, never accumulated back out — the same rule
 * every calendar app uses.)
 */
function addMonths(iso, months) {
  if (!Number.isInteger(months)) throw new TypeError('addMonths expects an integer');
  const { year, month, day } = parseDate(iso);
  const zeroBased = year * 12 + (month - 1) + months;
  const destYear = Math.floor(zeroBased / 12);
  const destMonth = (zeroBased % 12 + 12) % 12 + 1;
  const destDay = Math.min(day, daysInMonth(destYear, destMonth));
  return formatDate({ year: destYear, month: destMonth, day: destDay });
}

/** Add whole calendar years. 2024-02-29 + 1 year clamps to 2025-02-28. */
function addYears(iso, years) {
  return addMonths(iso, years * 12);
}

/**
 * Advance a calendar date by one maintenance interval.
 * @param {string} iso   'YYYY-MM-DD'
 * @param {number} value positive integer
 * @param {'days'|'weeks'|'months'|'years'} unit
 */
function addInterval(iso, value, unit) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`Interval value must be a positive integer, got ${value}`);
  }
  if (!UNITS.has(unit)) throw new RangeError(`Unknown interval unit: ${unit}`);
  switch (unit) {
    case 'days': return addDays(iso, value);
    case 'weeks': return addDays(iso, value * 7);
    case 'months': return addMonths(iso, value);
    case 'years': return addYears(iso, value);
  }
}

/** -1, 0 or 1. Lexicographic order on 'YYYY-MM-DD' is chronological order. */
function compareDates(a, b) {
  const x = String(a), y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Signed whole days from `from` to `to`. */
function daysBetween(from, to) {
  return toEpochDay(to) - toEpochDay(from);
}

/** A task is overdue when its due date is strictly before today. */
function isOverdue(dueDate, today) {
  return compareDates(dueDate, today) < 0;
}

/**
 * Today's calendar date in the business timezone.
 * `at` is an absolute instant (Date or ms); defaults to now.
 */
function businessToday(timeZone, at = new Date()) {
  const instant = at instanceof Date ? at : new Date(at);
  // 'en-CA' formats as YYYY-MM-DD, which is exactly the shape we carry.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Absolute instant, ISO-8601 UTC with milliseconds. */
function nowInstant(at = new Date()) {
  return (at instanceof Date ? at : new Date(at)).toISOString();
}

/** The business-local calendar date on which an absolute instant falls. */
function instantToBusinessDate(instantISO, timeZone) {
  return businessToday(timeZone, new Date(instantISO));
}

/** Human phrasing for a due date relative to today, used by both apps. */
function describeDue(dueDate, today) {
  const delta = daysBetween(today, dueDate);
  if (delta < 0) {
    const n = -delta;
    return { bucket: 'overdue', days: delta, label: n === 1 ? '1 day overdue' : `${n} days overdue` };
  }
  if (delta === 0) return { bucket: 'today', days: 0, label: 'Due today' };
  if (delta === 1) return { bucket: 'soon', days: 1, label: 'Due tomorrow' };
  if (delta <= 7) return { bucket: 'soon', days: delta, label: `Due in ${delta} days` };
  return { bucket: 'later', days: delta, label: `Due in ${delta} days` };
}

module.exports = {
  DATE_RE,
  UNITS,
  parseDate,
  isValidDate,
  formatDate,
  isLeapYear,
  daysInMonth,
  toEpochDay,
  fromEpochDay,
  addDays,
  addMonths,
  addYears,
  addInterval,
  compareDates,
  daysBetween,
  isOverdue,
  businessToday,
  nowInstant,
  instantToBusinessDate,
  describeDue,
};
