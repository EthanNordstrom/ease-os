import type { DB, TableName } from './types';

// Mirrors the ON DELETE rules in supabase/migrations so local state matches the server.
export function applyCascade(db: DB, table: TableName, id: string): DB {
  const next: DB = { ...db, [table]: (db[table] as any[]).filter((r) => r.id !== id) } as DB;
  if (table === 'goals') {
    next.milestones = next.milestones.filter((m) => m.goal_id !== id);
    next.tasks = next.tasks.filter((t) => t.goal_id !== id);
    next.events = next.events.map((e) => (e.goal_id === id ? { ...e, goal_id: null } : e));
  }
  if (table === 'routines') next.routine_completions = next.routine_completions.filter((c) => c.routine_id !== id);
  if (table === 'workouts') next.events = next.events.map((e) => (e.workout_id === id ? { ...e, workout_id: null } : e));
  if (table === 'workout_templates') next.workouts = next.workouts.map((w) => (w.template_id === id ? { ...w, template_id: null } : w));
  return next;
}

export function cascadeChildren(db: DB, table: TableName, id: string): { table: TableName; rows: any[] }[] {
  if (table === 'goals') return [
    { table: 'milestones', rows: db.milestones.filter((m) => m.goal_id === id) },
    { table: 'tasks', rows: db.tasks.filter((t) => t.goal_id === id) },
  ];
  if (table === 'routines') return [{ table: 'routine_completions', rows: db.routine_completions.filter((c) => c.routine_id === id) }];
  return [];
}
