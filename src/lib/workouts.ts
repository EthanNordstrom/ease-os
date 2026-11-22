import { store } from './store';
import { todayISO } from './dates';
import { navigate } from './router';
import type { Workout } from './types';

export function startWorkout(w: Workout) {
  const other = store.state.db.workouts.find((x) => x.status === 'in_progress' && x.id !== w.id);
  if (other) { store.toast(`Finish “${other.name}” first`, { label: 'Open', run: () => navigate(`gym/session/${other.id}`) }); return; }
  store.update('workouts', w.id, { status: 'in_progress', started_at: new Date().toISOString(), planned_date: w.planned_date ?? todayISO(store.settings.timezone) });
  navigate(`gym/session/${w.id}`);
}
