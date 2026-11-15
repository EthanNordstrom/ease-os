// Original, unattributed lines written for this app. No quotes are attributed to real people.
export const BUILTIN_QUOTES: { id: string; text: string }[] = [
  'Small, steady sessions add up to finished work.',
  'You don’t need a perfect day. You need the next honest step.',
  'Show up gently. Showing up still counts.',
  'Finish the loop. Then make the next one better.',
  'Rest is part of the routine, not a break from it.',
  'Protect the hours where the ideas live.',
  'Consistency is just kindness repeated.',
  'Make it simple enough to start.',
  'A rough bounce today beats a perfect idea someday.',
  'Treat your body like the instrument it is.',
  'Progress is quiet. Keep listening for it.',
  'Clear the desk, open the project, play one sound.',
  'Do the next small thing well.',
  'You can begin again at any point in the day.',
  'Self-respect looks like keeping small promises to yourself.',
  'Momentum is built, not found.',
  'Let today be a good day, not a perfect one.',
  'Taste is trained by finishing things.',
  'One focused hour is worth a busy afternoon.',
  'Look after the basics and the basics look after you.',
  'The track gets better every time you return to it.',
  'Choose the one thing that makes everything else easier.',
  'Energy follows attention. Point it somewhere good.',
  'Missing a day is information, not a verdict.',
  'Keep the bar low enough to step over every day.',
  'Make room for the work that feels like you.',
  'Patience is a skill. Practise it like one.',
  'Stay curious about what your sound wants to become.',
  'Strong body, clear head, open ears.',
  'Write it down, then let it go for now.',
].map((text, i) => ({ id: `b${i + 1}`, text }));

export function hashDate(d: string) {
  let h = 0;
  for (const c of d) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
