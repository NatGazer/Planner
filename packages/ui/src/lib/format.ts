/**
 * Presentation helpers. Every date the API sends is either a business-local
 * calendar date ('YYYY-MM-DD') or an absolute instant, and they are formatted
 * differently on purpose: a due date has no time of day, ever.
 *
 * Language lives here as module state, exactly as the business timezone does,
 * and for the same reason: these are called from render paths, from list
 * builders and from sort comparators, and threading a hook through all of them
 * would buy nothing. `LanguageProvider` sets it before the first paint.
 */

type FormatLang = 'en' | 'pt' | 'fr';

interface Locale {
  months: string[];
  monthsLong: string[];
  days: string[];
  daysLong: string[];
  /** One letter for a chart axis. Portuguese calendars really do use D S T Q Q S S. */
  daysNarrow: string[];
  /** 'Wednesday, 4 March 2026' — the separators differ more than the words do. */
  longDate: (dow: string, d: number, month: string, y: number) => string;
  instantLong: (dow: string, d: number, month: string, y: number, time: string) => string;
  relative: {
    now: string;
    minute: string; minutes: (n: number) => string;
    hour: string; hours: (n: number) => string;
    yesterday: string; days: (n: number) => string;
    lastMonth: string; months: (n: number) => string;
    years: (n: number) => string;
  };
  /** 'every 3 months' — gendered and irregular in both Romance languages. */
  cadence: (value: number, unit: string) => string;
  /** 1024 → '1,4 MB' outside English. */
  decimal: string;
  percent: (n: number) => string;
  empty: string;
}

const EN: Locale = {
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  monthsLong: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  daysLong: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  daysNarrow: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  longDate: (dow, d, month, y) => `${dow}, ${d} ${month} ${y}`,
  instantLong: (dow, d, month, y, time) => `${dow}, ${d} ${month} ${y} at ${time}`,
  relative: {
    now: 'just now',
    minute: 'a minute ago', minutes: (n) => `${n} minutes ago`,
    hour: 'an hour ago', hours: (n) => `${n} hours ago`,
    yesterday: 'yesterday', days: (n) => `${n} days ago`,
    lastMonth: 'last month', months: (n) => `${n} months ago`,
    years: (n) => `${n} year${n === 1 ? '' : 's'} ago`,
  },
  cadence: (value, unit) => (value === 1
    ? `every ${unit.replace(/s$/, '')}`
    : `every ${value} ${unit}`),
  decimal: '.',
  percent: (n) => `${n}%`,
  empty: '—',
};

const PT: Locale = {
  months: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  monthsLong: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  days: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
  daysLong: ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'],
  daysNarrow: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'],
  longDate: (dow, d, month, y) => `${dow}, ${d} de ${month} de ${y}`,
  instantLong: (dow, d, month, y, time) => `${dow}, ${d} de ${month} de ${y} às ${time}`,
  relative: {
    now: 'agora mesmo',
    minute: 'há um minuto', minutes: (n) => `há ${n} minutos`,
    hour: 'há uma hora', hours: (n) => `há ${n} horas`,
    yesterday: 'ontem', days: (n) => `há ${n} dias`,
    lastMonth: 'no mês passado', months: (n) => `há ${n} meses`,
    years: (n) => (n === 1 ? 'há um ano' : `há ${n} anos`),
  },
  cadence: (value, unit) => {
    if (value === 1) {
      return { days: 'todos os dias', weeks: 'todas as semanas', months: 'todos os meses', years: 'todos os anos' }[unit]
        ?? `a cada ${unit}`;
    }
    const noun = { days: 'dias', weeks: 'semanas', months: 'meses', years: 'anos' }[unit] ?? unit;
    return `a cada ${value} ${noun}`;
  },
  decimal: ',',
  percent: (n) => `${n}%`,
  empty: '—',
};

const FR: Locale = {
  months: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  monthsLong: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  days: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
  daysLong: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  daysNarrow: ['D', 'L', 'M', 'M', 'J', 'V', 'S'],
  longDate: (dow, d, month, y) => `${dow} ${d} ${month} ${y}`,
  instantLong: (dow, d, month, y, time) => `${dow} ${d} ${month} ${y} à ${time}`,
  relative: {
    now: 'à l’instant',
    minute: 'il y a une minute', minutes: (n) => `il y a ${n} minutes`,
    hour: 'il y a une heure', hours: (n) => `il y a ${n} heures`,
    yesterday: 'hier', days: (n) => `il y a ${n} jours`,
    lastMonth: 'le mois dernier', months: (n) => `il y a ${n} mois`,
    years: (n) => (n < 2 ? 'il y a un an' : `il y a ${n} ans`),
  },
  cadence: (value, unit) => {
    if (value === 1) {
      return { days: 'tous les jours', weeks: 'toutes les semaines', months: 'tous les mois', years: 'tous les ans' }[unit]
        ?? `tous les ${unit}`;
    }
    const noun = { days: 'jours', weeks: 'semaines', months: 'mois', years: 'ans' }[unit] ?? unit;
    // 'semaines' is feminine; every other unit here is masculine.
    return `${unit === 'weeks' ? 'toutes les' : 'tous les'} ${value} ${noun}`;
  },
  decimal: ',',
  // French typography puts a non-breaking space before the percent sign.
  percent: (n) => `${n} %`,
  empty: '—',
};

const LOCALES: Record<FormatLang, Locale> = { en: EN, pt: PT, fr: FR };

let locale: Locale = EN;
export function setFormatLanguage(lang: string) {
  locale = LOCALES[lang as FormatLang] ?? EN;
}

/**
 * The business timezone, set once from the session. Every absolute instant is
 * rendered in it, not in whatever timezone the reader's laptop happens to be
 * set to — a completion recorded at 16:40 on site must not read as 08:40
 * because somebody opened the history from another country.
 */
let businessZone: string | null = null;
export function setBusinessTimezone(tz: string) { businessZone = tz || null; }

const partsIn = (iso: string) => {
  const dt = new Date(iso);
  if (!businessZone) {
    return {
      day: dt.getDate(), month: dt.getMonth(), year: dt.getFullYear(),
      hour: String(dt.getHours()).padStart(2, '0'), minute: String(dt.getMinutes()).padStart(2, '0'),
      weekday: dt.getDay(),
    };
  }
  // Always parsed with 'en-GB': this reads the *clock*, not words a reader
  // sees, and a fixed parsing locale keeps the field names predictable.
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: businessZone, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(dt);
  const get = (t: string) => f.find((x) => x.type === t)?.value ?? '';
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    day: Number(get('day')), month: Number(get('month')) - 1, year: Number(get('year')),
    hour: get('hour').padStart(2, '0'), minute: get('minute').padStart(2, '0'),
    weekday: Math.max(0, WD.indexOf(get('weekday'))),
  };
};

const parts = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
};

const dayOfWeek = (iso: string): number => {
  const { y, m, d } = parts(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** Day of week for a calendar date, computed without touching the local clock. */
export function weekday(iso: string): string {
  return locale.days[dayOfWeek(iso)];
}

/** One letter for a chart axis, in the reader's language. */
export function weekdayNarrow(iso: string): string {
  return locale.daysNarrow[dayOfWeek(iso)];
}

/** '4 Mar' — or '4 Mar 2027' when the year differs from the reference. */
export function shortDate(iso: string, reference?: string): string {
  if (!iso) return locale.empty;
  const { y, m, d } = parts(iso);
  const sameYear = reference ? reference.slice(0, 4) === String(y) : true;
  return `${d} ${locale.months[m - 1]}${sameYear ? '' : ` ${y}`}`;
}

/** 'Wednesday, 4 March 2026' / 'quarta-feira, 4 de março de 2026' */
export function longDate(iso: string): string {
  if (!iso) return locale.empty;
  const { y, m, d } = parts(iso);
  return locale.longDate(locale.daysLong[dayOfWeek(iso)], d, locale.monthsLong[m - 1], y);
}

/** An absolute instant, in the business timezone: '4 Mar, 14:05'. */
export function instant(iso: string): string {
  if (!iso) return locale.empty;
  const p = partsIn(iso);
  return `${p.day} ${locale.months[p.month]}, ${p.hour}:${p.minute}`;
}

export function instantLong(iso: string): string {
  if (!iso) return locale.empty;
  const p = partsIn(iso);
  return locale.instantLong(locale.daysLong[p.weekday], p.day, locale.monthsLong[p.month], p.year, `${p.hour}:${p.minute}`);
}

/** 'just now', '20 minutes ago', '3 days ago'. */
export function relative(iso: string, now = Date.now()): string {
  if (!iso) return locale.empty;
  const r = locale.relative;
  const diff = Math.round((now - new Date(iso).getTime()) / 1000);
  if (diff < 45) return r.now;
  if (diff < 90) return r.minute;
  const mins = Math.round(diff / 60);
  if (mins < 60) return r.minutes(mins);
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? r.hour : r.hours(hours);
  const days = Math.round(hours / 24);
  if (days < 30) return days === 1 ? r.yesterday : r.days(days);
  const months = Math.round(days / 30);
  if (months < 12) return months === 1 ? r.lastMonth : r.months(months);
  return r.years(Math.round(months / 12));
}

/** 'every 3 months' / 'a cada 3 meses' / 'tous les 3 mois'. */
export function cadence(value: number, unit: string): string {
  return locale.cadence(value, unit);
}

/** Today's calendar date shifted by n days, for date-input defaults. */
export function shiftDate(iso: string, days: number): string {
  // Callers pass `today` straight from a resource that may not have loaded
  // yet. Returning '' keeps an empty date input empty, instead of writing
  // 'NaN-NaN-NaN' into it and leaving it stuck that way.
  if (!iso) return '';
  const { y, m, d } = parts(iso);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return '';
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

/** '55%' — with the space French typography asks for. */
export function percent(n: number): string {
  return locale.percent(n);
}

/** A decimal in the reader's convention: 1.4 MB, or 1,4 MB. */
export function decimal(n: number, places = 1): string {
  return n.toFixed(places).replace('.', locale.decimal);
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} kB`;
  return `${decimal(n / 1048576)} MB`;
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
