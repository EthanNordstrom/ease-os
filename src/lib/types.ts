// All dates are stored as 'YYYY-MM-DD' strings (Postgres `date`) and all times as
// 'HH:MM' wall-clock strings in the user's chosen timezone. Nothing date-only is
// ever converted through a JS Date in local time, so deadlines can't shift days.

export type ISODate = string;
export type HHMM = string;

export interface Base {
  id: string;
  user_id?: string;
  version: number;
  created_at: string;
  updated_at: string;
  is_sample: boolean;
}

export interface Settings extends Base {
  display_name: string;
  app_title: string;
  timezone: string;
  week_start: number; // 0 = Sunday, 1 = Monday
  date_locale: string; // e.g. en-AU
  hour12: boolean;
  default_rest_seconds: number;
}

export interface RoutineItem { id: string; title: string; notes?: string; minutes?: number | null }
export interface Routine extends Base {
  name: string;
  items: RoutineItem[];
  weekdays: number[]; // 0..6, Sunday = 0
  start_time: HHMM | null;
  active: boolean;
  sort: number;
}
export interface RoutineCompletion extends Base {
  routine_id: string;
  item_id: string;
  date: ISODate;
  item_title: string; // snapshot so history survives edits
  completed_at: string;
}

export type Category = 'personal' | 'routine' | 'gym' | 'music' | 'goals';
export interface Recurrence { freq: 'daily' | 'weekly' | 'monthly'; interval: number; weekdays: number[]; until: ISODate | null }
export interface OccurrenceOverride { cancelled?: boolean; date?: ISODate; title?: string; start_time?: HHMM | null; end_time?: HHMM | null; all_day?: boolean; notes?: string }
export interface CalEvent extends Base {
  title: string;
  category: Category;
  date: ISODate;
  all_day: boolean;
  start_time: HHMM | null;
  end_time: HHMM | null;
  notes: string;
  recurrence: Recurrence | null;
  exceptions: Record<ISODate, OccurrenceOverride>;
  goal_id: string | null;
  workout_id: string | null;
}

export type GoalStage = 'idea' | 'active' | 'paused' | 'completed' | 'archived';
export type GoalCategory = 'health' | 'appearance' | 'music' | 'career' | 'money' | 'personal';
export interface ProgressNote { id: string; date: ISODate; text: string }
export interface Goal extends Base {
  title: string;
  description: string;
  why: string;
  category: GoalCategory;
  stage: GoalStage;
  priority: 'low' | 'medium' | 'high';
  start_date: ISODate | null;
  target_date: ISODate | null;
  progress_method: 'checklist' | 'numeric';
  target_value: number | null;
  current_value: number;
  unit: string;
  next_action: string;
  notes: ProgressNote[];
  completed_at: string | null;
}
export interface Milestone extends Base { goal_id: string; title: string; due_date: ISODate | null; done: boolean; done_at: string | null; sort: number }
export interface Task extends Base {
  title: string;
  done: boolean;
  done_at: string | null;
  goal_id: string | null;
  due_date: ISODate | null;
  focus_date: ISODate | null; // set = one of that day's (max 3) priorities
  sort: number;
}

export type ExerciseKind = 'weighted' | 'bodyweight' | 'timed';
export interface Exercise extends Base { name: string; kind: ExerciseKind; notes: string }
export interface TemplateItem { id: string; exercise_id: string; sets: number; reps: number | null; weight: number | null; seconds: number | null; rest_seconds: number }
export interface WorkoutTemplate extends Base { name: string; notes: string; items: TemplateItem[] }
export interface WorkoutSet { id: string; type: 'warmup' | 'working'; reps: number | null; weight: number | null; seconds: number | null; rpe: number | null; done: boolean; done_at: string | null }
export interface WorkoutEntry { id: string; exercise_id: string; notes: string; rest_seconds: number; sets: WorkoutSet[] }
export interface Workout extends Base {
  name: string;
  template_id: string | null;
  planned_date: ISODate | null;
  planned_time: HHMM | null;
  status: 'planned' | 'in_progress' | 'completed';
  started_at: string | null;
  finished_at: string | null;
  notes: string;
  entries: WorkoutEntry[];
}

export interface Quote extends Base { text: string; builtin_id: string | null; favourite: boolean; own: boolean }
export interface Review extends Base { week_start: ISODate; went_well: string; got_in_way: string; change_next: string; priorities: string[] }

export interface Tables {
  settings: Settings;
  routines: Routine;
  routine_completions: RoutineCompletion;
  events: CalEvent;
  goals: Goal;
  milestones: Milestone;
  tasks: Task;
  exercises: Exercise;
  workout_templates: WorkoutTemplate;
  workouts: Workout;
  quotes: Quote;
  reviews: Review;
}
export type TableName = keyof Tables;
export const TABLES: TableName[] = [
  'settings', 'routines', 'routine_completions', 'events', 'goals', 'milestones', 'tasks',
  'exercises', 'workout_templates', 'workouts', 'quotes', 'reviews',
];
export type DB = { [K in TableName]: Tables[K][] };
export const emptyDB = (): DB => Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as DB;
