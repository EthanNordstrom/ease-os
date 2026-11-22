import { useState } from 'react';
import { store, useDB, useSettings } from '../lib/store';
import { addDays, diffDays, fmtDate, isValidISO, relativeDay, todayISO } from '../lib/dates';
import {
  BILL_CATEGORIES, BILL_FREQ, DEFAULT_MONEY, PAY_FREQ, dueSoon, fmtMoney, isPaid, monthlyBills, moneySettings, nextDue, nextPayday,
  paydayPlan, projectedDate, savedSoFar, savingsPerPeriod,
} from '../lib/money';
import type { Bill, BillCategory, BillFrequency, PayFrequency, SavingsGoal } from '../lib/types';
import { CheckButton, Empty, Field, Icon, Progress, SectionHead, Segmented, Sheet, Toggle, confirmAction, num } from '../components/ui';
import { navigate } from '../lib/router';
import { markBillPaid } from '../lib/moneyActions';

type Tab = 'overview' | 'bills' | 'savings';
const CURRENCIES = ['AUD', 'NZD', 'USD', 'GBP', 'EUR', 'CAD'];

function useMoney() {
  const db = useDB();
  const s = useSettings();
  const m = moneySettings(db);
  const today = todayISO(s.timezone);
  const fm = (n: number, cents = false) => fmtMoney(n, m.currency, s.date_locale, cents);
  return { db, s, m, today, fm };
}

export default function Money({ sub }: { sub?: string }) {
  const tab = (['bills', 'savings'].includes(sub ?? '') ? sub : 'overview') as Tab;
  return (
    <div className="anim-fade">
      <header className="mb-8">
        <p className="label mb-3">Money</p>
        <h1 className="h-display">Calm about money.</h1>
      </header>
      <div className="mb-8 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto no-scrollbar">
        <Segmented label="Money section" value={tab} onChange={(t) => navigate(t === 'overview' ? 'money' : `money/${t}`)}
          options={[{ value: 'overview', label: 'Overview' }, { value: 'bills', label: 'Bills' }, { value: 'savings', label: 'Savings' }]} />
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'bills' && <Bills />}
      {tab === 'savings' && <Savings />}
    </div>
  );
}

/* ---------------- Overview ---------------- */
function Overview() {
  const { db, s, m, today, fm } = useMoney();
  const [payOpen, setPayOpen] = useState(false);
  const [billEdit, setBillEdit] = useState<Bill | 'new' | null>(null);
  const [goalEdit, setGoalEdit] = useState<SavingsGoal | 'new' | null>(null);
  const [transferFor, setTransferFor] = useState<SavingsGoal | null>(null);
  const plan = paydayPlan(db, today);
  const pay = nextPayday(m, today);
  const due = dueSoon(db, today, 14);
  const unpaid = due.filter((d) => !d.paid).length;
  const goals = db.savings_goals.filter((g) => !g.archived && !g.purchased_at);
  const hasSetup = db.money_settings.length > 0;

  if (!hasSetup && !db.bills.length && !db.savings_goals.length) return (
    <div className="max-w-xl">
      <Empty title="Let’s take the stress out of money" body="Tell the app when you get paid, add your bills and what you’re saving for. It works out what to move each payday and reminds you before things are due."
        action={<button className="btn-primary" onClick={() => setPayOpen(true)}>Set up pay details</button>} />
      {payOpen && <PaySheet onClose={() => setPayOpen(false)} />}
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-x-12 xl:gap-x-24 2xl:gap-x-32 gap-y-12">
      <div className="space-y-12 min-w-0">
        <section aria-label="Payday plan">
          <SectionHead label={pay ? `Next payday · ${relativeDay(pay, today, s.date_locale)}${diffDays(pay, today) > 1 ? ` · in ${diffDays(pay, today)} days` : ''}` : m.pay_frequency === 'none' ? 'Each month' : 'Payday'}
            title={plan.total > 0 ? `Move ${fm(plan.total)} each ${plan.unit}` : 'Your payday plan'}
            action={<button className="btn-ghost -mr-3 text-sm whitespace-nowrap" onClick={() => setPayOpen(true)}><Icon name="edit" size={14} />Pay details</button>} />
          {!hasSetup || (!pay && m.pay_frequency !== 'none') ? (
            <p className="text-fg-2 py-3 border-y border-ink-700">Add your next payday so the app can spread bills and savings across each pay. <button className="text-acid underline underline-offset-4" onClick={() => setPayOpen(true)}>Add pay details</button></p>
          ) : (
            <ul className="border-t border-ink-700">
              <li className="row"><span className="flex-1">Bills set-aside<span className="block meta text-fg-3">Spread so every bill is covered when it’s due</span></span><span className="tabular-nums">{fm(plan.bills)}</span></li>
              {plan.savings.map((x) => (
                <li key={x.goal.id} className="row"><span className="flex-1 min-w-0 truncate">{x.goal.name}<span className="block meta text-fg-3">{x.goal.target_date ? `To reach ${fm(Number(x.goal.target))} by ${fmtDate(x.goal.target_date, s.date_locale, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Your chosen amount'}</span></span><span className="tabular-nums">{fm(x.amount)}</span></li>
              ))}
              <li className="row font-medium"><span className="flex-1">Total to move</span><span className="tabular-nums">{fm(plan.total)}</span></li>
              {plan.left !== null && <li className="row"><span className="flex-1 text-fg-2">Left from your pay</span><span className={`tabular-nums ${plan.left < 0 ? 'text-warn' : 'text-acid'}`}>{fm(plan.left)}</span></li>}
            </ul>
          )}
          {plan.left !== null && plan.left < 0 && <p className="text-sm text-warn mt-3">Your plan is more than your pay. Push a savings date back or lower a per-pay amount — no stress, just adjust.</p>}
          {m.auto_log && <p className="meta text-fg-3 mt-3">Auto-log is on: planned savings are recorded on each payday.</p>}
        </section>

        <section aria-label="Due soon">
          <SectionHead label="Next 14 days" title={unpaid ? `${unpaid} ${unpaid === 1 ? 'bill' : 'bills'} to pay` : 'Nothing to pay'}
            action={<button className="btn-ghost -mr-3 text-sm" onClick={() => setBillEdit('new')}><Icon name="plus" size={14} />Bill</button>} />
          {!due.length ? <p className="text-fg-2 py-3 border-y border-ink-700">{db.bills.length ? 'No bills due in the next two weeks.' : 'Add your bills and they’ll show here and on your calendar.'}</p> : (
            <ul className="border-t border-ink-700 stagger">
              {due.map((d) => (
                <li key={d.bill.id + d.due} className="row">
                  {d.bill.autopay ? <span className="w-11 h-11 grid place-items-center shrink-0"><span className="font-mono text-[10px] uppercase tracking-[0.06em] text-fg-3">Auto</span></span>
                    : <CheckButton checked={isPaid(db, d.bill.id, d.due)} onClick={() => markBillPaid(d.bill, d.due, !isPaid(db, d.bill.id, d.due))} label={`Paid ${d.bill.name}`} />}
                  <button className="flex-1 min-w-0 text-left min-h-[44px]" onClick={() => setBillEdit(d.bill)}>
                    <span className={`block truncate ${d.paid ? 'text-fg-3 line-through decoration-ink-500' : ''}`}>{d.bill.name}</span>
                    <span className={`meta ${d.overdue ? 'text-warn' : 'text-fg-3'}`}>{d.overdue ? 'Overdue · ' : ''}{relativeDay(d.due, today, s.date_locale)}{d.bill.autopay ? ' · autopay' : ''}</span>
                  </button>
                  <span className="tabular-nums">{fm(Number(d.bill.amount), true)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="space-y-12 min-w-0">
        <section aria-label="Savings">
          <SectionHead label="Saving for" title={goals.length ? `${goals.length} goal${goals.length > 1 ? 's' : ''}` : 'Savings'}
            action={<button className="btn-ghost -mr-3 text-sm" onClick={() => setGoalEdit('new')}><Icon name="plus" size={14} />Goal</button>} />
          {!goals.length ? <p className="text-fg-2 py-3 border-y border-ink-700">Add something you’re saving for — a holiday, an emergency fund, new gear.</p> : (
            <div className="space-y-3 stagger">{goals.map((g) => <GoalCard key={g.id} g={g} onEdit={() => setGoalEdit(g)} onAdd={() => setTransferFor(g)} />)}</div>
          )}
        </section>
        <section aria-label="Bills summary">
          <SectionHead label="Bills" title={`≈ ${fm(monthlyBills(db))} a month`} action={<button className="btn-ghost -mr-3 text-sm" onClick={() => navigate('money/bills')}>All bills</button>} />
          <p className="text-sm text-fg-3">Repeating bills, converted to a monthly figure. One-off bills are spread over the pays before they’re due.</p>
        </section>
      </div>

      {payOpen && <PaySheet onClose={() => setPayOpen(false)} />}
      {billEdit && <BillSheet bill={billEdit === 'new' ? null : billEdit} onClose={() => setBillEdit(null)} />}
      {goalEdit && <GoalSheet goal={goalEdit === 'new' ? null : goalEdit} onClose={() => setGoalEdit(null)} />}
      {transferFor && <TransferSheet goal={transferFor} onClose={() => setTransferFor(null)} />}
    </div>
  );
}

function GoalCard({ g, onEdit, onAdd }: { g: SavingsGoal; onEdit: () => void; onAdd: () => void }) {
  const { db, s, today, fm } = useMoney();
  const saved = savedSoFar(db, g);
  const per = savingsPerPeriod(db, g, today);
  const proj = projectedDate(db, g, today);
  const reached = saved >= Number(g.target);
  const late = g.target_date && proj && proj > g.target_date;
  return (
    <div className="surface p-4">
      <div className="flex items-start gap-3">
        <button className="flex-1 min-w-0 text-left" onClick={onEdit}>
          <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3">{g.kind === 'purchase' ? 'To buy' : 'Saving'}{g.target_date ? ` · by ${fmtDate(g.target_date, s.date_locale, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</p>
          <p className="text-[17px] truncate mt-0.5">{g.name}</p>
        </button>
        <button className="btn-outline shrink-0" onClick={onAdd}><Icon name="plus" size={14} />Add</button>
      </div>
      <p className="flex justify-between meta mt-3 mb-1.5"><span className="text-fg tabular-nums">{fm(saved)}</span><span>of {fm(Number(g.target))}</span></p>
      <Progress ratio={Math.min(1, Math.max(0, saved / Number(g.target)))} label={`${g.name} progress`} />
      <p className="text-sm mt-3 text-fg-2">
        {reached ? <span className="text-acid">{g.kind === 'purchase' ? 'You can buy it now.' : 'Goal reached.'}</span>
          : per ? <>{fm(per)} per pay{proj ? <> · on track for <span className={late ? 'text-warn' : 'text-fg'}>{fmtDate(proj, s.date_locale, { day: 'numeric', month: 'short', year: 'numeric' })}</span></> : null}</>
          : 'Add a date or an amount per pay and it’ll be planned for you.'}
      </p>
      {reached && g.kind === 'purchase' && !g.purchased_at && (
        <button className="btn-primary mt-3" onClick={() => { store.update('savings_goals', g.id, { purchased_at: new Date().toISOString(), archived: true }); store.toast(`Enjoy your ${g.name}!`, { label: 'Undo', run: () => store.update('savings_goals', g.id, { purchased_at: null, archived: false }) }); }}>
          <Icon name="check" size={14} />Mark as bought</button>
      )}
      {g.link && <a className="inline-flex items-center gap-1 text-sm text-fg-2 hover:text-fg mt-2 underline underline-offset-4" href={g.link} target="_blank" rel="noopener noreferrer nofollow">View item</a>}
    </div>
  );
}

/* ---------------- Bills ---------------- */
function Bills() {
  const { db, s, today, fm } = useMoney();
  const [edit, setEdit] = useState<Bill | 'new' | null>(null);
  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <p className="text-fg-2">≈ <span className="text-fg tabular-nums">{fm(monthlyBills(db))}</span> a month across {db.bills.filter((b) => b.active).length} active bills</p>
        <button className="btn-primary" onClick={() => setEdit('new')}><Icon name="plus" size={16} />Add bill</button>
      </div>
      {!db.bills.length ? <Empty title="No bills yet" body="Add rent, phone, subscriptions, insurance — anything that repeats. They appear on your calendar and in your payday plan." /> : (
        <div className="space-y-8">
          {BILL_CATEGORIES.map((c) => {
            const list = db.bills.filter((b) => b.category === c.key).sort((a, b) => (nextDue(a, today) ?? '9').localeCompare(nextDue(b, today) ?? '9'));
            if (!list.length) return null;
            return (
              <section key={c.key}>
                <p className="label pb-2 border-b border-ink-700">{c.label}</p>
                <ul className="stagger">
                  {list.map((b) => {
                    const nd = nextDue(b, today);
                    return (
                      <li key={b.id}><button className={`row w-full text-left ${b.active ? '' : 'opacity-60'}`} onClick={() => setEdit(b)}>
                        <span className="flex-1 min-w-0"><span className="block truncate">{b.name}</span>
                          <span className="meta text-fg-3">{BILL_FREQ.find((f) => f.key === b.frequency)?.label}{nd ? ` · next ${relativeDay(nd, today, s.date_locale)}` : ' · done'}{b.autopay ? ' · autopay' : ''}{b.active ? '' : ' · paused'}</span></span>
                        <span className="tabular-nums">{fm(Number(b.amount), true)}</span>
                      </button></li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {edit && <BillSheet bill={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

/* ---------------- Savings ---------------- */
function Savings() {
  const { db, s, fm } = useMoney();
  const [edit, setEdit] = useState<SavingsGoal | 'new' | null>(null);
  const [transferFor, setTransferFor] = useState<SavingsGoal | null>(null);
  const active = db.savings_goals.filter((g) => !g.archived && !g.purchased_at);
  const done = db.savings_goals.filter((g) => g.archived || g.purchased_at);
  const history = [...db.savings_transfers].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)).slice(0, 20);
  const name = (id: string) => db.savings_goals.find((g) => g.id === id)?.name ?? 'Deleted goal';
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-x-12 xl:gap-x-24 2xl:gap-x-32 gap-y-12">
      <div className="min-w-0">
        <div className="mb-6"><button className="btn-primary" onClick={() => setEdit('new')}><Icon name="plus" size={16} />New goal or item</button></div>
        {!active.length ? <Empty title="Nothing saved for yet" body="Save towards a thing to buy or a fund. Give it a date and the app works out how much per pay — or pick an amount and it tells you when you’ll get there." /> : (
          <div className="space-y-3 stagger">{active.map((g) => <GoalCard key={g.id} g={g} onEdit={() => setEdit(g)} onAdd={() => setTransferFor(g)} />)}</div>
        )}
        {done.length > 0 && (
          <section className="mt-10">
            <p className="label pb-2 border-b border-ink-700">Bought & finished · {done.length}</p>
            <ul>{done.map((g) => (
              <li key={g.id}><button className="row w-full text-left" onClick={() => setEdit(g)}>
                <span className="flex-1 truncate">{g.name}</span><span className="meta text-fg-3">{g.purchased_at ? 'Bought' : 'Archived'} · {fm(Number(g.target))}</span>
              </button></li>
            ))}</ul>
          </section>
        )}
      </div>
      <section className="min-w-0">
        <SectionHead label="History" title="Recent transfers" />
        {!history.length ? <p className="text-fg-2 py-3 border-y border-ink-700">Transfers you log (or that auto-log records) appear here.</p> : (
          <ul className="border-t border-ink-700">
            {history.map((t) => (
              <li key={t.id} className="row">
                <span className="flex-1 min-w-0"><span className="block truncate">{name(t.goal_id)}</span><span className="meta text-fg-3">{fmtDate(t.date, s.date_locale, { day: 'numeric', month: 'short' })}{t.payday ? ' · auto' : ''}{t.note ? ` · ${t.note}` : ''}</span></span>
                <span className={`tabular-nums ${Number(t.amount) < 0 ? 'text-warn' : ''}`}>{Number(t.amount) > 0 ? '+' : ''}{fm(Number(t.amount), true)}</span>
                <button className="icon-btn hover:text-bad" aria-label="Delete transfer" onClick={() => store.remove('savings_transfers', t.id, { undo: 'Transfer deleted' })}><Icon name="trash" size={16} /></button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {edit && <GoalSheet goal={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {transferFor && <TransferSheet goal={transferFor} onClose={() => setTransferFor(null)} />}
    </div>
  );
}

/* ---------------- Sheets ---------------- */
const Foot = ({ onCancel, onSave, saveLabel = 'Save', disabled, onDelete }: { onCancel: () => void; onSave: () => void; saveLabel?: string; disabled?: boolean; onDelete?: () => void }) => (
  <>
    {onDelete && <button className="btn-danger mr-auto" onClick={onDelete}><Icon name="trash" size={16} />Delete</button>}
    <button className="btn-ghost" onClick={onCancel}>Cancel</button>
    <button className="btn-primary" disabled={disabled} onClick={onSave}>{saveLabel}</button>
  </>
);

function PaySheet({ onClose }: { onClose: () => void }) {
  const { db, today } = useMoney();
  const m = db.money_settings[0];
  const [f, setF] = useState({
    currency: m?.currency ?? DEFAULT_MONEY.currency, pay_frequency: (m?.pay_frequency ?? DEFAULT_MONEY.pay_frequency) as PayFrequency,
    next_payday: m?.next_payday ?? '', take_home: m?.take_home?.toString() ?? '', auto_log: m?.auto_log ?? false,
  });
  const needsDate = f.pay_frequency !== 'none';
  const valid = !needsDate || isValidISO(f.next_payday);
  const save = () => {
    if (!valid) return;
    const data = { currency: f.currency, pay_frequency: f.pay_frequency, next_payday: needsDate ? f.next_payday : null, take_home: num(f.take_home), auto_log: needsDate && f.auto_log,
      // Start auto-logging from now, never backfilling old paydays.
      last_auto_payday: m?.auto_log ? m.last_auto_payday : addDays(today, -1) };
    if (m) store.update('money_settings', m.id, data); else store.insert('money_settings', data);
    store.toast('Pay details saved');
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Pay details" footer={<Foot onCancel={onClose} onSave={save} disabled={!valid} />}>
      <div className="space-y-5">
        <div className="space-y-2"><span className="label block">How often you’re paid</span>
          <Segmented<PayFrequency> label="Pay frequency" value={f.pay_frequency} onChange={(v) => setF({ ...f, pay_frequency: v })} options={PAY_FREQ.map((p) => ({ value: p.key, label: p.key === 'none' ? 'Irregular' : p.label }))} />
        </div>
        {needsDate && <Field label="Next payday"><input type="date" className="input" value={f.next_payday} onChange={(e) => setF({ ...f, next_payday: e.target.value })} /></Field>}
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Take-home per ${f.pay_frequency === 'none' ? 'month' : 'pay'}`} hint="Optional — shows what’s left."><input className="input" type="number" inputMode="decimal" value={f.take_home} onChange={(e) => setF({ ...f, take_home: e.target.value })} /></Field>
          <Field label="Currency"><select className="input" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        </div>
        {needsDate && (
          <div>
            <Toggle checked={f.auto_log} onChange={(v) => setF({ ...f, auto_log: v })} label="Auto-log savings on payday" />
            <p className="text-sm text-fg-3 mt-1">Turn on if your bank moves the money automatically. Each payday the planned savings are recorded for you.</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function BillSheet({ bill, onClose }: { bill: Bill | null; onClose: () => void }) {
  const { today } = useMoney();
  const [f, setF] = useState({
    name: bill?.name ?? '', amount: bill?.amount?.toString() ?? '', frequency: bill?.frequency ?? ('monthly' as BillFrequency),
    due_date: bill?.due_date ?? today, category: bill?.category ?? ('other' as BillCategory), autopay: bill?.autopay ?? false, active: bill?.active ?? true, notes: bill?.notes ?? '',
  });
  const amount = num(f.amount);
  const valid = f.name.trim() && amount !== null && amount >= 0 && isValidISO(f.due_date);
  const save = () => {
    if (!valid) return;
    const data = { ...f, name: f.name.trim(), amount: amount! };
    if (bill) store.update('bills', bill.id, data); else store.insert('bills', data);
    store.toast(bill ? 'Bill saved' : `${data.name} added — it’s on your calendar`);
    onClose();
  };
  const del = async () => {
    if (!bill) return;
    if (await confirmAction({ title: `Delete ${bill.name}?`, body: 'Its paid history is removed too. To keep the history, pause it instead.', confirm: 'Delete', danger: true })) { store.remove('bills', bill.id, { undo: 'Bill deleted' }); onClose(); }
  };
  return (
    <Sheet open onClose={onClose} title={bill ? 'Edit bill' : 'New bill'} footer={<Foot onCancel={onClose} onSave={save} disabled={!valid} onDelete={bill ? del : undefined} />}>
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-4">
          <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Rent, Phone, Spotify" /></Field>
          <Field label="Amount"><input className="input" type="number" inputMode="decimal" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Repeats"><select className="input" value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value as BillFrequency })}>{BILL_FREQ.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select></Field>
          <Field label={f.frequency === 'once' ? 'Due date' : 'Next due date'}><input type="date" className="input" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
        </div>
        <Field label="Category"><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as BillCategory })}>{BILL_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Field>
        <Toggle checked={f.autopay} onChange={(v) => setF({ ...f, autopay: v })} label="Paid automatically (direct debit)" />
        {bill && <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active" />}
        <Field label="Notes"><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Optional — account, BPAY reference…" /></Field>
      </div>
    </Sheet>
  );
}

function GoalSheet({ goal, onClose }: { goal: SavingsGoal | null; onClose: () => void }) {
  const { db, today, fm } = useMoney();
  const [f, setF] = useState({
    kind: goal?.kind ?? ('purchase' as SavingsGoal['kind']), name: goal?.name ?? '', target: goal?.target?.toString() ?? '', start_amount: goal?.start_amount?.toString() ?? '0',
    target_date: goal?.target_date ?? '', per_pay: goal?.per_pay?.toString() ?? '', link: goal?.link ?? '', notes: goal?.notes ?? '',
  });
  const target = num(f.target);
  const linkOk = !f.link.trim() || /^https?:\/\//i.test(f.link.trim());
  const valid = f.name.trim() && target !== null && target >= 1 && linkOk && (!f.target_date || isValidISO(f.target_date));
  // Live preview of the automatic plan
  const draft = { ...(goal ?? {}), id: goal?.id ?? '__draft', name: f.name, target: target ?? 0, start_amount: num(f.start_amount) ?? 0, target_date: f.target_date || null, per_pay: num(f.per_pay), archived: false, purchased_at: null, kind: f.kind } as SavingsGoal;
  const preview = target ? { per: savingsPerPeriod(db, draft, today), date: projectedDate(db, draft, today) } : null;
  const save = () => {
    if (!valid) return;
    const data = { kind: f.kind, name: f.name.trim(), target: target!, start_amount: num(f.start_amount) ?? 0, target_date: f.target_date || null, per_pay: f.target_date ? null : num(f.per_pay), link: f.link.trim(), notes: f.notes };
    if (goal) store.update('savings_goals', goal.id, data); else store.insert('savings_goals', { ...data, archived: false, purchased_at: null });
    store.toast(goal ? 'Saved' : 'Goal added to your payday plan');
    onClose();
  };
  const del = async () => {
    if (!goal) return;
    if (await confirmAction({ title: `Delete ${goal.name}?`, body: 'Its transfer history is removed too.', confirm: 'Delete', danger: true })) { store.remove('savings_goals', goal.id, { undo: 'Goal deleted' }); onClose(); }
  };
  return (
    <Sheet open onClose={onClose} title={goal ? 'Edit goal' : 'New savings goal'} footer={<Foot onCancel={onClose} onSave={save} disabled={!valid} onDelete={goal ? del : undefined} />}>
      <div className="space-y-5">
        <Segmented label="Type" value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ value: 'purchase', label: 'Something to buy' }, { value: 'saving', label: 'A fund' }]} />
        <Field label={f.kind === 'purchase' ? 'What are you buying?' : 'Name'}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={f.kind === 'purchase' ? 'e.g. Studio monitors' : 'e.g. Emergency fund'} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={f.kind === 'purchase' ? 'Price' : 'Target'}><input className="input" type="number" inputMode="decimal" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></Field>
          <Field label="Already saved"><input className="input" type="number" inputMode="decimal" value={f.start_amount} onChange={(e) => setF({ ...f, start_amount: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label={f.kind === 'purchase' ? 'Buy by (optional)' : 'Reach by (optional)'}><input type="date" className="input" value={f.target_date} onChange={(e) => setF({ ...f, target_date: e.target.value })} /></Field>
          {!f.target_date && <Field label="Or put aside per pay"><input className="input" type="number" inputMode="decimal" value={f.per_pay} onChange={(e) => setF({ ...f, per_pay: e.target.value })} placeholder="e.g. 50" /></Field>}
        </div>
        {preview && (preview.per || preview.date) ? (
          <p className="surface px-4 py-3 text-sm" role="status">
            {preview.per ? <><span className="text-acid">{fm(preview.per)}</span> per pay</> : null}
            {preview.date ? <> · you’ll have it by <span className="text-fg">{fmtDate(preview.date, 'en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span></> : null}
          </p>
        ) : <p className="text-sm text-fg-3">Add a date or an amount per pay, and the plan is worked out automatically.</p>}
        {f.kind === 'purchase' && <Field label="Link (optional)">
          <input className="input" type="url" inputMode="url" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://…" />
        </Field>}
        {!linkOk && <p className="text-sm text-bad -mt-3">Links need to start with https://</p>}
      </div>
    </Sheet>
  );
}

function TransferSheet({ goal, onClose }: { goal: SavingsGoal; onClose: () => void }) {
  const { db, today, fm } = useMoney();
  const suggested = savingsPerPeriod(db, goal, today);
  const [f, setF] = useState({ amount: suggested ? String(Math.round(suggested * 100) / 100) : '', date: today, withdraw: false, note: '' });
  const amount = num(f.amount);
  const valid = amount !== null && amount > 0 && isValidISO(f.date);
  const save = () => {
    if (!valid) return;
    store.insert('savings_transfers', { goal_id: goal.id, date: f.date, amount: f.withdraw ? -amount! : amount!, note: f.note.trim(), payday: null });
    store.toast(f.withdraw ? 'Withdrawal recorded' : `${fm(amount!, true)} added to ${goal.name}`);
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={goal.name} footer={<Foot onCancel={onClose} onSave={save} disabled={!valid} saveLabel={f.withdraw ? 'Record withdrawal' : 'Add to savings'} />}>
      <div className="space-y-5">
        <Segmented label="Direction" value={f.withdraw ? 'out' : 'in'} onChange={(v) => setF({ ...f, withdraw: v === 'out' })} options={[{ value: 'in', label: 'Add' }, { value: 'out', label: 'Take out' }]} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount" hint={suggested && !f.withdraw ? `Plan: ${fm(suggested, true)} per pay` : undefined}><input className="input" type="number" inputMode="decimal" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Date"><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        </div>
        <Field label="Note (optional)"><input className="input" maxLength={200} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Sheet>
  );
}
