import type { ISODate } from './types';

// Pure date-string arithmetic in UTC so that a 'YYYY-MM-DD' never moves.
const toUTC = (d: ISODate) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
};
const fromUTC = (dt: Date): ISODate => dt.toISOString().slice(0, 10);

export const addDays = (d: ISODate, n: number): ISODate => {
  const dt = toUTC(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUTC(dt);
};
export const addMonths = (d: ISODate, n: number): ISODate => {
  const dt = toUTC(d);
  const day = dt.getUTCDate();
  dt.setUTCDate(1);
  dt.setUTCMonth(dt.getUTCMonth() + n);
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(day, last));
  return fromUTC(dt);
};
export const diffDays = (a: ISODate, b: ISODate) => Math.round((toUTC(a).getTime() - toUTC(b).getTime()) / 86400000);
export const weekday = (d: ISODate) => toUTC(d).getUTCDay(); // 0 = Sunday
export const startOfWeek = (d: ISODate, weekStart: number) => addDays(d, -((weekday(d) - weekStart + 7) % 7));
export const startOfMonth = (d: ISODate) => d.slice(0, 8) + '01';
export const endOfMonth = (d: ISODate) => addDays(addMonths(startOfMonth(d), 1), -1);
export const isValidISO = (d: unknown): d is ISODate => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

export function rangeDays(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthGrid(anchor: ISODate, weekStart: number): ISODate[] {
  const first = startOfWeek(startOfMonth(anchor), weekStart);
  const last = addDays(startOfWeek(endOfMonth(anchor), weekStart), 6);
  return rangeDays(first, last);
}

// "Now" in the user's timezone.
const safeTZ = (tz: string) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } catch { return 'UTC'; } };
const safeLocale = (l: string) => { try { new Intl.DateTimeFormat(l); return l; } catch { return 'en-AU'; } };

export function nowParts(tz: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTZ(tz), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}` as ISODate, time: `${get('hour')}:${get('minute')}`, hour: Number(get('hour')) };
}
export const todayISO = (tz: string) => nowParts(tz).date;

// Display helpers — formatted as UTC so the calendar date is preserved exactly.
export function fmtDate(d: ISODate, locale: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!isValidISO(d)) return '—';
  return new Intl.DateTimeFormat(safeLocale(locale), { ...opts, timeZone: 'UTC' }).format(toUTC(d));
}
export const fmtShort = (d: ISODate, locale: string) => fmtDate(d, locale, { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtNumeric = (d: ISODate, locale: string) => fmtDate(d, locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
export const fmtMonth = (d: ISODate, locale: string) => fmtDate(d, locale, { month: 'long', year: 'numeric' });
export const weekdayShort = (wd: number, locale: string) => fmtDate(addDays('2023-01-01', wd), locale, { weekday: 'short' }); // 2023-01-01 is a Sunday
export const weekdayNarrow = (wd: number, locale: string) => fmtDate(addDays('2023-01-01', wd), locale, { weekday: 'narrow' });

export function fmtTime(t: string | null | undefined, hour12: boolean) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (!hour12) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}
export const timeToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

export function relativeDay(d: ISODate, today: ISODate, locale: string) {
  const n = diffDays(d, today);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return fmtDate(d, locale, { weekday: 'long' });
  return fmtDate(d, locale, { day: 'numeric', month: 'short' });
}

export function weekdaysLabel(days: number[], locale: string) {
  const s = [...days].sort();
  if (s.length === 7) return 'Every day';
  if (s.join() === '1,2,3,4,5') return 'Weekdays';
  if (s.join() === '0,6') return 'Weekends';
  if (s.length === 0) return 'No days';
  return s.map((d) => weekdayShort(d, locale)).join(' ');
}

export function timezones(): string[] {
  const anyIntl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  try { return anyIntl.supportedValuesOf?.('timeZone') ?? ['Australia/Brisbane', 'Australia/Sydney', 'UTC']; }
  catch { return ['Australia/Brisbane', 'Australia/Sydney', 'UTC']; }
}

export const isoNow = () => new Date().toISOString();
