import { addDays, todayISO, weekday } from './dates';
import { DEFAULT_SETTINGS, uid } from './store';
import type { Exercise, WorkoutEntry, WorkoutSet } from './types';

type S = typeof import('./store').store;

const item = (title: string, minutes: number | null = null, notes = '') => ({ id: uid(), title, minutes, notes });

/** First run: settings, the editable morning routine, a starter exercise library, then optional examples. */
export function seedStarter(store: S) {
  store.insert('settings', { ...DEFAULT_SETTINGS, display_name: 'Ethan', timezone: 'Australia/Brisbane', date_locale: 'en-AU', hour12: false });
  store.insert('routines', {
    name: 'Morning routine',
    items: [
      item('Brush teeth', 3),
      item('Shower and deodorant', 10),
      item('Skincare and sunscreen', 5),
      item('Style hair and get dressed', 10),
      item('Breakfast', 15),
      item('Choose today’s main priority', 2),
    ],
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    start_time: '07:00',
    active: true,
    sort: 0,
  });
  const lib: [string, Exercise['kind']][] = [
    ['Barbell back squat', 'weighted'], ['Bench press', 'weighted'], ['Deadlift', 'weighted'], ['Overhead press', 'weighted'],
    ['Barbell row', 'weighted'], ['Lat pulldown', 'weighted'], ['Romanian deadlift', 'weighted'], ['Incline dumbbell press', 'weighted'],
    ['Leg press', 'weighted'], ['Dumbbell curl', 'weighted'], ['Cable triceps pushdown', 'weighted'], ['Walking lunge', 'weighted'],
    ['Push-up', 'bodyweight'], ['Pull-up', 'bodyweight'], ['Dip', 'bodyweight'], ['Hanging knee raise', 'bodyweight'],
    ['Plank', 'timed'], ['Dead hang', 'timed'],
  ];
  lib.forEach(([name, kind]) => store.insert('exercises', { name, kind, notes: '' }));
  loadSamples(store);
}

/** Realistic examples, all flagged is_sample so they can be cleared in one go. */
export function loadSamples(store: S) {
  const tz = store.settings.timezone;
  const today = todayISO(tz);
  const ex = (name: string) => store.state.db.exercises.find((e) => e.name === name)?.id ?? '';
  const sample = { is_sample: true };

  // Goals
  const demo = store.insert('goals', {
    ...sample, title: 'Finish a new DnB demo', description: 'A finished, mixed 4–5 minute demo ready to send out.',
    why: 'Finishing tracks is what moves EASE forward — ideas only count once they leave the studio.',
    category: 'music', stage: 'active', priority: 'high', start_date: addDays(today, -14), target_date: addDays(today, 24),
    progress_method: 'checklist', target_value: null, current_value: 0, unit: '', next_action: '',
    notes: [{ id: uid(), date: addDays(today, -3), text: 'Drop 1 bassline finally sits right. Keep the sub simple.' }], completed_at: null,
  });
  [['Arrangement locked', -4, true], ['Mixdown pass', 8, false], ['Send to three DJs for feedback', 20, false]].forEach(([t, d, done], i) =>
    store.insert('milestones', { ...sample, goal_id: demo.id, title: t as string, due_date: addDays(today, d as number), done: done as boolean, done_at: done ? new Date().toISOString() : null, sort: i }));
  ['Bounce stems for the intro', 'Resample the reese for drop 2', 'Reference against two club tracks'].forEach((t, i) =>
    store.insert('tasks', { ...sample, title: t, goal_id: demo.id, done: false, done_at: null, due_date: null, focus_date: i === 0 ? today : null, sort: i }));

  store.insert('goals', {
    ...sample, title: 'Complete a month of gym sessions', description: 'Three sessions a week for four weeks.',
    why: 'Feeling strong and having energy for long studio nights and gigs.', category: 'health', stage: 'active', priority: 'medium',
    start_date: addDays(today, -9), target_date: addDays(today, 19), progress_method: 'numeric', target_value: 12, current_value: 4,
    unit: 'sessions', next_action: 'Pack gym bag tonight', notes: [], completed_at: null,
  });

  const groom = store.insert('goals', {
    ...sample, title: 'Establish a grooming routine', description: 'A simple routine I actually keep up.',
    why: 'Looking after myself is a form of self-respect.', category: 'appearance', stage: 'active', priority: 'low',
    start_date: addDays(today, -5), target_date: addDays(today, 40), progress_method: 'checklist', target_value: null, current_value: 0,
    unit: '', next_action: '', notes: [], completed_at: null,
  });
  ['Book a regular barber appointment', 'Pick a sunscreen I like wearing', 'Add an evening routine'].forEach((t, i) =>
    store.insert('tasks', { ...sample, title: t, goal_id: groom.id, done: i === 1, done_at: i === 1 ? new Date().toISOString() : null, due_date: i === 0 ? addDays(today, 3) : null, focus_date: i === 0 ? today : null, sort: i }));

  store.insert('goals', {
    ...sample, title: 'Play a set in Melbourne', description: 'Get booked for a night outside Brisbane.', why: '', category: 'music', stage: 'idea',
    priority: 'medium', start_date: null, target_date: null, progress_method: 'checklist', target_value: null, current_value: 0, unit: '',
    next_action: '', notes: [], completed_at: null,
  });
  store.insert('goals', {
    ...sample, title: 'Learn basic sound design in a new synth', description: '', why: '', category: 'career', stage: 'idea',
    priority: 'low', start_date: null, target_date: null, progress_method: 'checklist', target_value: null, current_value: 0, unit: '',
    next_action: '', notes: [], completed_at: null,
  });

  // Events
  store.insert('events', {
    ...sample, title: 'Studio session', category: 'music', date: addDays(today, -7), all_day: false, start_time: '19:00', end_time: '21:30',
    notes: 'Phones away. One track only.', recurrence: { freq: 'weekly', interval: 1, weekdays: [2, 4], until: null }, exceptions: {},
    goal_id: demo.id, workout_id: null,
  });
  store.insert('events', {
    ...sample, title: 'DJ practice — new tunes', category: 'music', date: addDays(today, (6 - weekday(today) + 7) % 7), all_day: false,
    start_time: '15:00', end_time: '16:30', notes: '', recurrence: null, exceptions: {}, goal_id: null, workout_id: null,
  });
  store.insert('events', {
    ...sample, title: 'Dinner with family', category: 'personal', date: addDays(today, 2), all_day: false, start_time: '18:30', end_time: '20:30',
    notes: '', recurrence: null, exceptions: {}, goal_id: null, workout_id: null,
  });
  store.insert('events', {
    ...sample, title: 'Bin night', category: 'personal', date: addDays(today, -2), all_day: true, start_time: null, end_time: null,
    notes: '', recurrence: { freq: 'weekly', interval: 1, weekdays: [weekday(addDays(today, 1))], until: null }, exceptions: {}, goal_id: null, workout_id: null,
  });

  // Gym
  const mk = (name: string, sets: number, reps: number | null, weight: number | null, seconds: number | null = null, rest = 120) =>
    ({ id: uid(), exercise_id: ex(name), sets, reps, weight, seconds, rest_seconds: rest });
  const upper = store.insert('workout_templates', {
    ...sample, name: 'Upper A', notes: 'Push + pull, moderate volume.',
    items: [mk('Bench press', 3, 8, 60), mk('Barbell row', 3, 8, 55), mk('Overhead press', 3, 8, 35), mk('Pull-up', 3, 6, null), mk('Plank', 2, null, null, 45, 60)],
  });
  const lower = store.insert('workout_templates', {
    ...sample, name: 'Lower A', notes: '',
    items: [mk('Barbell back squat', 3, 6, 80, null, 150), mk('Romanian deadlift', 3, 8, 60), mk('Walking lunge', 2, 10, 14), mk('Hanging knee raise', 2, 12, null, null, 60)],
  });

  const fromTemplate = (tplItems: typeof upper.items, bump: number, done: boolean): WorkoutEntry[] =>
    tplItems.map((it) => ({
      id: uid(), exercise_id: it.exercise_id, notes: '', rest_seconds: it.rest_seconds,
      sets: Array.from({ length: it.sets }, (): WorkoutSet => ({
        id: uid(), type: 'working', reps: it.reps, weight: it.weight != null ? it.weight + bump : null, seconds: it.seconds,
        rpe: null, done, done_at: done ? new Date().toISOString() : null,
      })),
    }));
  [[-12, -5], [-7, -2.5], [-2, 0]].forEach(([d, bump]) => {
    const date = addDays(today, d);
    store.insert('workouts', {
      ...sample, name: 'Upper A', template_id: upper.id, planned_date: date, planned_time: '17:30', status: 'completed',
      started_at: `${date}T07:30:00Z`, finished_at: `${date}T08:25:00Z`, notes: '', entries: fromTemplate(upper.items, bump, true),
    });
  });
  store.insert('workouts', {
    ...sample, name: 'Lower A', template_id: lower.id, planned_date: today, planned_time: '17:30', status: 'planned',
    started_at: null, finished_at: null, notes: '', entries: fromTemplate(lower.items, 0, false),
  });
  store.insert('workouts', {
    ...sample, name: 'Upper A', template_id: upper.id, planned_date: addDays(today, 2), planned_time: '17:30', status: 'planned',
    started_at: null, finished_at: null, notes: '', entries: fromTemplate(upper.items, 0, false),
  });
}
