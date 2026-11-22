import { store } from './store';
import type { Bill } from './types';

export function markBillPaid(bill: Bill, due: string, paid: boolean) {
  const existing = store.state.db.bill_payments.find((p) => p.bill_id === bill.id && p.due_date === due);
  if (paid && !existing) store.insert('bill_payments', { bill_id: bill.id, due_date: due, amount: Number(bill.amount), paid_at: new Date().toISOString() });
  if (!paid && existing) store.remove('bill_payments', existing.id);
}
