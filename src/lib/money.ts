import { addDays, addMonths, diffDays } from './dates';
import type { Bill, BillCategory, BillFrequency, DB, ISODate, MoneySettings, PayFrequency, SavingsGoal } from './types';

export const BILL_FREQ: { key: BillFrequency; label: string; perYear: number }[] = [
  { key: 'weekly', label: 'Weekly', perYear: 52 }, { key: 'fortnightly', label: 'Fortnightly', perYear: 26 },
  { key: 'monthly', label: 'Monthly', perYear: 12 }, { key: 'quarterly', label: 'Quarterly', perYear: 4 },
  { key: 'yearly', label: 'Yearly', perYear: 1 }, { key: 'once', label: 'One-off', perYear: 0 },
];
export const PAY_FREQ: { key: PayFrequency; label: string; perYear: number }[] = [
  { key: 'weekly', label: 'Weekly', perYear: 52 }, { key: 'fortnightly', label: 'Fortnightly', perYear: 26 },
  { key: 'monthly', label: 'Monthly', perYear: 12 }, { key: 'none', label: 'No regular pay', perYear: 12 },
];
export const BILL_CATEGORIES: { key: BillCategory; label: string }[] = [
  { key: 'housing', label: 'Housing' }, { key: 'utilities', label: 'Utilities' }, { key: 'phone', label: 'Phone & internet' },
  { key: 'insurance', label: 'Insurance' }, { key: 'subscriptions', label: 'Subscriptions' }, { key: 'transport', label: 'Transport' },
  { key: 'health', label: 'Health' }, { key: 'debt', label: 'Loans & credit' }, { key: 'other', label: 'Other' },
];

export const DEFAULT_MONEY: Pick<MoneySettings, 'currency' | 'pay_frequency' | 'next_payday' | 'take_home' | 'auto_log' | 'last_auto_payday'> = { currency: 'AUD', pay_frequency: 'fortnightly', next_payday: null, take_home: null, auto_log: false, last_auto_payday: null };
export const moneySettings = (db: DB) => db.money_settings[0] ?? (DEFAULT_MONEY as MoneySettings);

export function fmtMoney(n: number, currency: string, locale: string, cents = false) {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }).format(n);
  } catch { return `$${(cents ? n.toFixed(2) : Math.round(n).toString())}`; }
}

/** Dates a repeating thing happens on, between from and to (inclusive), counted from an anchor date. */
export function repeatDates(anchor: ISODate, freq: BillFrequency | PayFrequency, from: ISODate, to: ISODate): ISODate[] {
  if (freq === 'none') return [];
  if (freq === 'once') return anchor >= from && anchor <= to ? [anchor] : [];
  const out: ISODate[] = [];
  if (freq === 'weekly' || freq === 'fortnightly') {
    const step = freq === 'weekly' ? 7 : 14;
    let k = Math.max(0, Math.ceil(diffDays(from, anchor) / step)); // nothing before the first date
    for (let d = addDays(anchor, k * step); d <= to; d = addDays(anchor, ++k * step)) out.push(d);
    return out;
  }
  const months = freq === 'monthly' ? 1 : freq === 'quarterly' ? 3 : 12;
  const approx = Math.floor(((Number(from.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12 + Number(from.slice(5, 7)) - Number(anchor.slice(5, 7))) / months) - 1;
  for (let k = Math.max(0, approx); k < Math.max(0, approx) + 400; k++) {
    const d = addMonths(anchor, k * months); // from the anchor each time, so the 31st doesn't drift
    if (d > to) break;
    if (d >= from) out.push(d);
  }
  return out;
}

/** Next due date on or after a day (null if a one-off is in the past). */
export const nextDue = (b: Bill, from: ISODate) => repeatDates(b.due_date, b.frequency, from, addDays(from, 400))[0] ?? null;
export const nextPayday = (m: MoneySettings, today: ISODate) => (m.next_payday && m.pay_frequency !== 'none' ? repeatDates(m.next_payday, m.pay_frequency, today, addDays(today, 40))[0] ?? null : null);
export const isPaid = (db: DB, billId: string, due: ISODate) => db.bill_payments.some((p) => p.bill_id === billId && p.due_date === due);

export const savedSoFar = (db: DB, g: SavingsGoal) => Number(g.start_amount) + db.savings_transfers.filter((t) => t.goal_id === g.id).reduce((a, t) => a + Number(t.amount), 0);

/** The repeating "set aside" amount for a bill, spread over each pay (or each month with no regular pay). */
export function perPeriod(b: Bill, payFreq: PayFrequency, today: ISODate, m: MoneySettings) {
  const pays = PAY_FREQ.find((p) => p.key === payFreq)!.perYear;
  if (b.frequency === 'once') {
    if (b.due_date < today) return 0;
    const n = periodsUntil(m, today, b.due_date);
    return Number(b.amount) / Math.max(1, n);
  }
  return (Number(b.amount) * BILL_FREQ.find((f) => f.key === b.frequency)!.perYear) / pays;
}

/** How many paydays (or months, with no regular pay) from today up to and including a date. */
export function periodsUntil(m: MoneySettings, today: ISODate, date: ISODate) {
  if (date < today) return 0;
  if (m.pay_frequency !== 'none' && m.next_payday) return repeatDates(m.next_payday, m.pay_frequency, today, date).length;
  return Math.max(1, Math.ceil(diffDays(date, today) / 30.44));
}

/**
 * Amount per pay for a savings goal:
 * with a date → worked out automatically; without a date → the amount you chose; null once reached.
 */
export function savingsPerPeriod(db: DB, g: SavingsGoal, today: ISODate) {
  if (g.archived || g.purchased_at) return null;
  const left = Number(g.target) - savedSoFar(db, g);
  if (left <= 0) return null;
  if (g.target_date) {
    const n = periodsUntil(moneySettings(db), today, g.target_date);
    return n > 0 ? left / n : left;
  }
  return g.per_pay ? Math.min(Number(g.per_pay), left) : null;
}

/** When you'll reach a goal at its current pace (null with no pace). */
export function projectedDate(db: DB, g: SavingsGoal, today: ISODate): ISODate | null {
  const left = Number(g.target) - savedSoFar(db, g);
  if (left <= 0) return today;
  const per = savingsPerPeriod(db, g, today);
  if (!per) return null;
  const n = Math.ceil(left / per - 1e-9);
  const m = moneySettings(db);
  if (m.pay_frequency !== 'none' && m.next_payday) return repeatDates(m.next_payday, m.pay_frequency, today, addDays(today, 365 * 30)).slice(0, n).pop() ?? null;
  return addMonths(today, n);
}

/**
 * Paydays since the last automatic run (at most the last 6) whose planned savings haven't been
 * recorded yet. Each entry is unique per goal + payday, so two devices can't double-count.
 */
export function pendingAutoTransfers(db: DB, today: ISODate) {
  const m = moneySettings(db);
  if (!m.auto_log || !m.next_payday || m.pay_frequency === 'none') return [];
  const since = m.last_auto_payday ? addDays(m.last_auto_payday, 1) : addDays(today, -1);
  const days = repeatDates(m.next_payday, m.pay_frequency, since, today).slice(-6);
  const out: { goal: SavingsGoal; payday: ISODate; amount: number }[] = [];
  for (const d of days) for (const g of db.savings_goals) {
    const amount = savingsPerPeriod(db, g, d);
    if (amount && amount > 0 && !db.savings_transfers.some((t) => t.goal_id === g.id && t.payday === d)) out.push({ goal: g, payday: d, amount: Math.round(amount * 100) / 100 });
  }
  return out;
}

/** The plan for each payday: what to move for bills and each savings goal, and what's left. */
export function paydayPlan(db: DB, today: ISODate) {
  const m = moneySettings(db);
  const bills = db.bills.filter((b) => b.active).reduce((a, b) => a + perPeriod(b, m.pay_frequency, today, m), 0);
  const savings = db.savings_goals.filter((g) => !g.archived).map((g) => ({ goal: g, amount: savingsPerPeriod(db, g, today) })).filter((x) => x.amount !== null) as { goal: SavingsGoal; amount: number }[];
  const savingsTotal = savings.reduce((a, s) => a + s.amount, 0);
  const left = m.take_home !== null && m.take_home !== undefined ? Number(m.take_home) - bills - savingsTotal : null;
  return { m, bills, savings, savingsTotal, total: bills + savingsTotal, left, unit: m.pay_frequency === 'none' ? 'month' : 'pay' };
}

/** Unpaid bill occurrences from the last 30 days up to `days` ahead (autopay bills count as paid once due). */
export function dueSoon(db: DB, today: ISODate, days = 14) {
  const out: { bill: Bill; due: ISODate; paid: boolean; overdue: boolean }[] = [];
  for (const b of db.bills.filter((x) => x.active)) {
    for (const due of repeatDates(b.due_date, b.frequency, addDays(today, -30), addDays(today, days))) {
      const paid = isPaid(db, b.id, due) || (b.autopay && due <= today);
      if (paid && due < today) continue;
      out.push({ bill: b, due, paid, overdue: !paid && due < today });
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

/** Rough monthly cost of all active bills, for the Bills summary. */
export const monthlyBills = (db: DB) => db.bills.filter((b) => b.active && b.frequency !== 'once')
  .reduce((a, b) => a + (Number(b.amount) * BILL_FREQ.find((f) => f.key === b.frequency)!.perYear) / 12, 0);
