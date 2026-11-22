import { addDays } from './dates';
import type { Aisle, DB, FoodLog, ISODate, Slot } from './types';

export const SLOTS: { key: Slot; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' }, { key: 'lunch', label: 'Lunch' }, { key: 'dinner', label: 'Dinner' }, { key: 'snacks', label: 'Snacks' },
];

/** Suggest a meal slot from the time of day. */
export const slotForHour = (h: number): Slot => (h < 10 ? 'breakfast' : h < 14 ? 'lunch' : h >= 17 && h < 21 ? 'dinner' : 'snacks');

export interface Totals { calories: number; protein: number; carbs: number; fat: number }
export const zero = (): Totals => ({ calories: 0, protein: 0, carbs: 0, fat: 0 });
export function sum(logs: Pick<FoodLog, 'calories' | 'protein' | 'carbs' | 'fat'>[]): Totals {
  return logs.reduce((t, l) => ({ calories: t.calories + Number(l.calories), protein: t.protein + Number(l.protein), carbs: t.carbs + Number(l.carbs), fat: t.fat + Number(l.fat) }), zero());
}
export const dayTotals = (db: DB, date: ISODate) => sum(db.food_logs.filter((l) => l.date === date));

export const r0 = (n: number) => Math.round(n);
export const r1 = (n: number) => Math.round(n * 10) / 10;
export const fmtKcal = (n: number, locale: string) => Math.round(n).toLocaleString(locale);

/** Average of logged days (days with nothing logged are skipped so they don't drag the average down). */
export function weekAverage(db: DB, end: ISODate) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(end, -i));
  const logged = days.map((d) => dayTotals(db, d)).filter((t) => t.calories > 0);
  if (!logged.length) return null;
  return { days: logged.length, calories: logged.reduce((a, t) => a + t.calories, 0) / logged.length, protein: logged.reduce((a, t) => a + t.protein, 0) / logged.length };
}

export const AISLES: { key: Aisle; label: string }[] = [
  { key: 'produce', label: 'Fruit & veg' }, { key: 'meat', label: 'Meat & seafood' }, { key: 'dairy', label: 'Dairy & eggs' },
  { key: 'bakery', label: 'Bakery' }, { key: 'pantry', label: 'Pantry' }, { key: 'frozen', label: 'Frozen' },
  { key: 'drinks', label: 'Drinks' }, { key: 'household', label: 'Household' }, { key: 'other', label: 'Other' },
];

const AISLE_WORDS: [Aisle, RegExp][] = [
  ['produce', /banana|apple|berr|lettuce|spinach|tomato(?!.*(passata|paste|sauce))|onion|garlic|potato|carrot|avocado|lemon|lime|capsicum|cucumber|broccoli|herb|fruit|veg|salad|mushroom|zucchini|kale|ginger|chilli/i],
  ['meat', /beef|mince|chicken|chook|pork|lamb|steak|bacon|ham|sausage|fish|salmon|tuna(?!.*tin)|prawn|turkey|meat/i],
  ['dairy', /milk|cheese|yoghurt|yogurt|butter|cream|egg|feta|mozzarella|parmesan/i],
  ['bakery', /bread|wrap|tortilla|roll|bagel|bun|pita|croissant/i],
  ['frozen', /frozen|ice cream|peas|chips/i],
  ['drinks', /juice|soda|coffee|tea\b|water|cola|kombucha|drinking chocolate/i],
  ['household', /paper|soap|detergent|toilet|foil|cling|bin bag|sponge|shampoo|toothpaste/i],
  ['pantry', /oat|pasta|rice|bean|lentil|passata|sauce|seasoning|spice|oil|flour|sugar|honey|peanut butter|granola|cereal|tin|can|stock|salt|pepper|nut|seed|mayo|protein powder/i],
];
export const guessAisle = (name: string): Aisle => AISLE_WORDS.find(([, re]) => re.test(name))?.[0] ?? 'other';
