import { pickCurrentRoutine } from '../src/lib/domain';
const r = (name: string, start_time: string | null) => ({ id: name, name, start_time } as any);
const mine = [r('Morning', '06:30'), r('Evening', '21:45')];
const six = [r('Wake', '06:00'), r('Gym', '07:30'), r('Work start', '09:00'), r('Lunch reset', '12:30'), r('Studio', '19:00'), r('Wind down', '22:00')];
const m = (t: string) => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm; };
const cases: [any[], string, string][] = [
  [mine, '02:15', 'Morning'], [mine, '06:00', 'Morning'], [mine, '09:00', 'Morning'], [mine, '11:59', 'Morning'], [mine, '12:00', 'Evening'],
  [mine, '18:00', 'Evening'], [mine, '22:30', 'Evening'], [mine, '23:59', 'Evening'],
  [six, '05:00', 'Wake'], [six, '07:00', 'Wake'], [six, '08:00', 'Gym'], [six, '10:00', 'Work start'], [six, '13:00', 'Lunch reset'],
  [six, '18:30', 'Studio'], [six, '19:30', 'Studio'], [six, '22:15', 'Wind down'],
  [[r('Anytime', null)], '10:00', 'Anytime'],
];
let bad = 0;
for (const [rs, t, want] of cases) { const got = pickCurrentRoutine(rs, m(t))?.name; if (got !== want) { bad++; console.log('FAIL', t, want, got); } }
console.log(bad ? `${bad} failed` : `all ${cases.length} routine-choice cases pass`);
