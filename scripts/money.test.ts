// Checks the money maths: repeating dates, paydays and per-pay amounts.
import { pendingAutoTransfers, projectedDate, paydayPlan, perPeriod, periodsUntil, repeatDates, savingsPerPeriod, dueSoon } from '../src/lib/money';
let bad = 0; const eq = (a: unknown, b: unknown, msg: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { bad++; console.log('FAIL', msg, JSON.stringify(a), '≠', JSON.stringify(b)); } };
const near = (a: number, b: number, msg: string) => { if (Math.abs(a - b) > 0.01) { bad++; console.log('FAIL', msg, a, '≠', b); } };

eq(repeatDates('2026-01-31', 'monthly', '2026-02-01', '2026-05-31'), ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'], 'monthly on the 31st clamps, then returns to the 31st');
eq(repeatDates('2026-11-24', 'weekly', '2026-11-01', '2026-12-10'), ['2026-11-24', '2026-12-01', '2026-12-08'], 'weekly never starts before its first date');
eq(repeatDates('2026-11-27', 'fortnightly', '2026-12-01', '2027-01-10'), ['2026-12-11', '2026-12-25', '2027-01-08'], 'fortnightly paydays');
eq(repeatDates('2026-03-15', 'quarterly', '2026-01-01', '2026-12-31'), ['2026-03-15', '2026-06-15', '2026-09-15', '2026-12-15'], 'quarterly');
eq(repeatDates('2024-02-29', 'yearly', '2026-01-01', '2028-12-31'), ['2026-02-28', '2027-02-28', '2028-02-29'], 'yearly leap day');
eq(repeatDates('2026-12-20', 'once', '2026-12-01', '2026-12-31'), ['2026-12-20'], 'one-off');

const m: any = { currency: 'AUD', pay_frequency: 'fortnightly', next_payday: '2026-11-27', take_home: 2400 };
const bill = (amount: number, frequency: any, due = '2026-12-01'): any => ({ id: 'b' + amount, amount, frequency, due_date: due, active: true, autopay: false });
near(perPeriod(bill(450, 'weekly'), 'fortnightly', '2026-11-23', m), 900, 'weekly $450 = $900 per fortnight');
near(perPeriod(bill(1300, 'monthly'), 'fortnightly', '2026-11-23', m), 600, 'monthly $1300 = $600 per fortnight (×12 ÷ 26)');
near(perPeriod(bill(520, 'yearly'), 'fortnightly', '2026-11-23', m), 20, 'yearly $520 = $20 per fortnight');
eq(periodsUntil(m, '2026-11-23', '2027-01-08'), 4, '4 paydays until 8 Jan (27 Nov, 11 Dec, 25 Dec, 8 Jan)');
near(perPeriod(bill(400, 'once', '2027-01-08'), 'fortnightly', '2026-11-23', m), 100, 'one-off $400 in 4 pays = $100 per pay');

const db: any = { money_settings: [m], bills: [bill(450, 'weekly', '2026-11-24'), bill(1300, 'monthly', '2026-11-20')], bill_payments: [],
  savings_goals: [{ id: 'g', name: 'Holiday', target: 3000, start_amount: 600, target_date: '2027-01-08', archived: false }],
  savings_transfers: [{ goal_id: 'g', amount: 400 }] };
near(savingsPerPeriod(db, db.savings_goals[0], '2026-11-23')!, 500, 'savings: $2000 left over 4 pays = $500 per pay');
const plan = paydayPlan(db, '2026-11-23');
near(plan.bills, 1500, 'payday plan: bills $1500'); near(plan.total, 2000, 'payday plan: total to move $2000'); near(plan.left!, 400, 'payday plan: $400 left');
const due = dueSoon(db, '2026-11-23', 14);
eq(due.map((d) => [d.due, d.overdue]), [['2026-11-20', true], ['2026-11-24', false], ['2026-12-01', false]], 'due soon lists the unpaid overdue rent bill and the next two weekly bills');
// Purchases without a date: chosen amount per pay → projected date
const db2: any = { ...db, savings_goals: [{ id: 'p', name: 'New headphones', kind: 'purchase', target: 450, start_amount: 0, target_date: null, per_pay: 100, archived: false, purchased_at: null }], savings_transfers: [{ goal_id: 'p', amount: 50 }] };
near(savingsPerPeriod(db2, db2.savings_goals[0], '2026-11-23')!, 100, 'purchase without a date uses the chosen $100 per pay');
eq(projectedDate(db2, db2.savings_goals[0], '2026-11-23'), '2027-01-08', '$400 left at $100 per pay → 4th payday, 8 Jan');
// Auto-logging on payday
const db3: any = { ...db2, money_settings: [{ ...m, auto_log: true, last_auto_payday: '2026-11-13' }] };
eq(pendingAutoTransfers(db3, '2026-11-28').map((x: any) => [x.payday, x.amount]), [['2026-11-27', 100]], 'auto-log records the 27 Nov payday transfer once');
const db4: any = { ...db3, savings_transfers: [...db3.savings_transfers, { goal_id: 'p', amount: 100, payday: '2026-11-27' }] };
eq(pendingAutoTransfers(db4, '2026-11-28').length, 0, 'auto-log never records the same payday twice');
eq(pendingAutoTransfers({ ...db3, money_settings: [{ ...m, auto_log: false }] }, '2026-11-28').length, 0, 'nothing is recorded when auto-log is off');
console.log(bad ? `${bad} failed` : 'all money checks pass');
process.exit(bad ? 1 : 0);
