import { store } from './store';
import { todayISO } from './dates';
import { navigate } from './router';
import type { Exercise, Workout } from './types';
import { EXERCISE_CATALOG, catalogKey, type CatalogExercise } from './exerciseCatalog';

export function startWorkout(w: Workout) {
  const other = store.state.db.workouts.find((x) => x.status === 'in_progress' && x.id !== w.id);
  if (other) { store.toast(`Finish “${other.name}” first`, { label: 'Open', run: () => navigate(`gym/session/${other.id}`) }); return; }
  store.update('workouts', w.id, { status: 'in_progress', started_at: new Date().toISOString(), planned_date: w.planned_date ?? todayISO(store.settings.timezone) });
  navigate(`gym/session/${w.id}`);
}

/** Turn a repeating template day into a real planned workout (once; the day then stops being "virtual"). */
export function materialiseTemplate(templateId: string, date: string): Workout | null {
  const db = store.state.db;
  const t = db.workout_templates.find((x) => x.id === templateId);
  if (!t) return null;
  const existing = db.workouts.find((w) => w.template_id === templateId && w.planned_date === date);
  if (existing) return existing;
  const entries = t.items.map((it) => ({
    id: crypto.randomUUID(), exercise_id: it.exercise_id, notes: '', rest_seconds: it.rest_seconds,
    sets: Array.from({ length: Math.max(1, it.sets) }, () => ({ id: crypto.randomUUID(), type: 'working' as const, reps: it.reps, weight: it.weight, seconds: it.seconds, rpe: null, done: false, done_at: null })),
  }));
  return store.insert('workouts', { name: t.name, template_id: t.id, planned_date: date, planned_time: t.plan_time ?? null, status: 'planned', started_at: null, finished_at: null, notes: '', entries });
}

/** Built-in exercises the person hasn't got in their own library yet. */
export function missingCatalog(existing: Exercise[]): CatalogExercise[] {
  const have = new Set(existing.map((e) => catalogKey(e.name)));
  return EXERCISE_CATALOG.filter((c) => !have.has(catalogKey(c.name)));
}

/** Copy a built-in exercise into the person's library (or return the one they already have). */
export function adoptExercise(c: CatalogExercise): Exercise {
  const found = store.state.db.exercises.find((e) => catalogKey(e.name) === catalogKey(c.name));
  return found ?? store.insert('exercises', { name: c.name, kind: c.kind, notes: c.notes });
}
