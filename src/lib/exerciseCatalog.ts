import type { ExerciseKind } from './types';

/** Built-in exercises. They live in the app, and are copied into a person's own library the first time they use one. */
export interface CatalogExercise { name: string; kind: ExerciseKind; notes: string; group: string }

export const EXERCISE_CATALOG: CatalogExercise[] = [
  // Chest
  { group: 'Chest', name: 'Incline Dumbbell Press', kind: 'weighted', notes: 'Set the bench to a low incline. Keep your feet planted and wrists stacked over your elbows.' },
  { group: 'Chest', name: 'Flat Machine Chest Press', kind: 'weighted', notes: 'Adjust the seat so the handles sit around mid-chest. Keep your upper back against the pad as you press.' },
  { group: 'Chest', name: 'Flat Barbell Bench Press', kind: 'weighted', notes: 'Plant your feet and set your upper back firmly on the bench. Lower the bar under control to a consistent touch point.' },
  { group: 'Chest', name: 'Cable Fly', kind: 'weighted', notes: 'Keep a slight bend in your elbows. Bring your arms together in a wide arc and control the stretch on the way back.' },
  { group: 'Chest', name: 'Push-Up', kind: 'bodyweight', notes: 'Hands under shoulders, body in one line. Lower your chest to the floor and press back up.' },
  { group: 'Chest', name: 'Dips', kind: 'bodyweight', notes: 'Lean slightly forward, lower until your shoulders are just below your elbows, then press up without shrugging.' },
  // Back
  { group: 'Back', name: 'Chest-Supported Row', kind: 'weighted', notes: 'Keep your chest on the pad. Let your arms reach forward, then drive your elbows back without lifting your chest.' },
  { group: 'Back', name: 'Neutral-Grip Lat Pulldown', kind: 'weighted', notes: 'Use the palms-facing handles. Keep your torso steady and pull your elbows down towards your ribs.' },
  { group: 'Back', name: 'Pull-Up', kind: 'bodyweight', notes: 'Start from a controlled hang. Pull until your chin clears the bar without kicking, then lower under control.' },
  { group: 'Back', name: 'Barbell Row', kind: 'weighted', notes: 'Hinge forward with a flat back. Pull the bar to your lower ribs and lower it under control.' },
  { group: 'Back', name: 'Seated Cable Row', kind: 'weighted', notes: 'Sit tall, pull the handle to your stomach and squeeze your shoulder blades together before returning slowly.' },
  { group: 'Back', name: 'Deadlift', kind: 'weighted', notes: 'Bar over mid-foot, back flat. Push the floor away and stand tall, then lower the bar along your legs.' },
  // Shoulders
  { group: 'Shoulders', name: 'Single-Arm Cable Lateral Raise', kind: 'weighted', notes: 'Stand side-on to the low pulley. Keep a slight bend in your elbow and raise your arm out to the side without swinging.' },
  { group: 'Shoulders', name: 'Reverse Pec Deck', kind: 'weighted', notes: 'Face the pad and set the handles around shoulder height. Sweep your arms out wide while keeping your chest on the pad.' },
  { group: 'Shoulders', name: 'Dumbbell Shoulder Press', kind: 'weighted', notes: 'Press from shoulder height to just short of lockout. Keep your ribs down and avoid arching your back.' },
  { group: 'Shoulders', name: 'Face Pull', kind: 'weighted', notes: 'Set the rope at face height. Pull towards your forehead with elbows high, then control the return.' },
  // Arms
  { group: 'Arms', name: 'Cable Curl', kind: 'weighted', notes: 'Face the low pulley with elbows by your sides. Keep your torso still as you curl and lower.' },
  { group: 'Arms', name: 'Preacher Curl', kind: 'weighted', notes: 'Keep your upper arms on the pad throughout. Lower smoothly and keep your shoulders still as you curl.' },
  { group: 'Arms', name: 'Dumbbell Hammer Curl', kind: 'weighted', notes: 'Keep your palms facing each other and elbows close to your sides. Use the same range on both arms.' },
  { group: 'Arms', name: 'Rope Triceps Pushdown', kind: 'weighted', notes: 'Use a high pulley. Keep upper arms by your sides and straighten your elbows until the rope reaches your thighs.' },
  { group: 'Arms', name: 'Overhead Cable Triceps Extension', kind: 'weighted', notes: 'Face away from the pulley with the rope behind your head. Keep your ribs down and upper arms steady as you straighten your elbows.' },
  // Legs
  { group: 'Legs', name: 'Hack Squat', kind: 'weighted', notes: 'Keep your back against the pad and heels planted. Use a depth you can repeat comfortably on every rep.' },
  { group: 'Legs', name: 'Leg Press', kind: 'weighted', notes: 'Keep your whole foot on the platform. Lower until just before your hips start to roll off the pad.' },
  { group: 'Legs', name: 'Dumbbell Bulgarian Split Squat', kind: 'weighted', notes: 'Rest your rear foot on the bench and keep your front foot planted. Start with your weaker leg and match its reps on the other side.' },
  { group: 'Legs', name: 'Barbell Romanian Deadlift', kind: 'weighted', notes: 'Soften your knees and push your hips back. Keep the bar close to your legs and stop when you can’t hinge farther without rounding your back.' },
  { group: 'Legs', name: 'Leg Extension', kind: 'weighted', notes: 'Line your knees up with the machine pivot and set the roller just above your ankles. Keep your hips down as you straighten your legs.' },
  { group: 'Legs', name: 'Seated Leg Curl', kind: 'weighted', notes: 'Set the thigh pad snugly. Keep your hips against the seat as you pull your heels underneath you.' },
  { group: 'Legs', name: 'Standing Calf Raise', kind: 'weighted', notes: 'Lower your heels into a comfortable stretch. Pause briefly, then rise as high as you can without bouncing.' },
  { group: 'Legs', name: 'Barbell Back Squat', kind: 'weighted', notes: 'Bar across your upper back, feet about shoulder width. Sit down between your hips and drive back up.' },
  { group: 'Legs', name: 'Walking Lunge', kind: 'weighted', notes: 'Take a long step, lower your back knee towards the floor, and drive through your front foot into the next step.' },
  { group: 'Legs', name: 'Hip Thrust', kind: 'weighted', notes: 'Upper back on the bench, chin tucked. Drive your hips up until your torso is level and squeeze at the top.' },
  // Core
  { group: 'Core', name: 'Kneeling Cable Crunch', kind: 'weighted', notes: 'Hold the rope beside your head. Keep your hips still and bring your ribs towards your pelvis.' },
  { group: 'Core', name: 'Hanging Knee Raise', kind: 'bodyweight', notes: 'Hang with shoulders active. Lift your knees towards your chest without swinging, then lower slowly.' },
  { group: 'Core', name: 'Plank', kind: 'timed', notes: 'Forearms down, body in one line from head to heels. Squeeze your glutes and breathe steadily.' },
  { group: 'Core', name: 'Side Plank', kind: 'timed', notes: 'Stack your feet, lift your hips so your body is straight, and hold. Repeat on both sides.' },
];

export const catalogKey = (n: string) => n.trim().toLowerCase();
