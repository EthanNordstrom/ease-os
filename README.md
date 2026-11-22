# Ease OS

A calm, private place to run your day: routines, calendar, goals, training, food and shopping, all in one app.
Works on iPhone, Android and desktop. Install it to your home screen, use it in dark or light mode, and your data syncs across every device you sign in on.

---

## Features

**Today**
- Greeting, date and a "get set up" checklist for new accounts
- The routine that fits the time of day (each one shows from its start time for about 5½ hours, otherwise the next one coming up), with your other routines one tap away
- Up to three daily priorities, with one tap to carry over yesterday's unfinished ones
- The next action for each active goal
- Today's food: calories eaten, calories left, protein, carbs and fat
- Today's workout with Start / Resume
- Shopping list preview with quick add
- Upcoming events and deadlines
- A small daily line at the top, with "another", favourites and your own lines

**Routines**
- As many routines as you like: name, ordered steps, notes, minutes, weekdays, start time, on/off
- Reorder with move up/down (or drag on desktop)
- Ticks are saved per day; tap any past day to fix or undo it
- Gentle history view, no streaks or guilt

**Calendar**
- Agenda, week and month views (agenda by default on phones)
- All-day, timed and repeating events (daily, chosen weekdays, monthly)
- Edit one occurrence or the whole series
- Routines, planned workouts, goal deadlines and milestones appear automatically
- Built-in categories plus your own **tags** in 20 colours, with filters
- Drag to reschedule on desktop

**Goals**
- Ideas → Active → Completed / Archived, promote an idea without retyping
- Why it matters, category, priority, start and target dates
- Milestones with dates, tasks, next action, progress notes
- Progress by milestones/tasks done, or a number target (e.g. 12 sessions)
- List view and timeline (vertical timeline on phones)

**Gym**
- Exercise library (weighted, bodyweight, timed) and reusable templates
- Plan workouts on dates; start, resume, finish
- Log sets in a few taps: kg, reps, seconds, RPE, warm-up vs working sets
- Last session's results beside each exercise
- Rest timer that stays accurate when you switch apps
- History you can edit, progress charts and personal bests

**Food**
- Set a daily calorie target (plus optional protein, carbs, fat)
- Log by meal: breakfast, lunch, dinner, snacks
- My foods: save foods, meals and recipes, with favourites for one-tap logging
- Quick add for one-off items
- Recipes with ingredients and method, and one tap to send the ingredients to your shopping list (scaled by batches)
- Day plans: save "my usual day" and log it all in one tap
- Copy the day before
- 7-day chart and average
- Weigh-ins with a 7-day average and week-on-week change

**Shopping list**
- Add items from anywhere; they're sorted into aisles automatically
- Recipes add their ingredients, with combined amounts and no duplicates
- Tick off as you shop, then clear what's in the trolley (with undo)

**Weekly review**
- What went well, what got in the way, what to change, three priorities
- A simple summary of the week, no scores

**Account & settings**
- Sign up, sign in, email link, forgot password, change password, sign out
- Name, timezone, week start, date format, 12/24-hour time, default rest time
- Theme (dark / light / match device) and 21 accent colours — saved to your account, so every device matches (calendar filters too)
- Export all your data (JSON), erase all data, delete account
- Works offline after the first load; changes upload when you're back online
- Edits from two devices never silently overwrite each other — you choose which to keep

**Safety**
- Every account's data is private, enforced by the database itself (Row Level Security)
- Limits on how fast and how much one account can write, to stop spam
- Optional Cloudflare Turnstile bot check on sign-up and sign-in
- Strict browser security headers
- Every text field has a sensible size limit, checked by the database
- Your whole account loads in a single request, and changes from other devices appear when you reopen the app or every couple of minutes

---

## Set it up (about 15 minutes)

You need free accounts on **GitHub**, **Supabase** and **Cloudflare**.

### 1. Database (Supabase)
1. Create a project at supabase.com (pick the region closest to you).
2. Open **SQL Editor → New query**. Run each file in `supabase/migrations` **in order**, one at a time:
   `0001` → `0002` → `0003` → `0004` → `0005` → `0006`. Each should say *Success*.
3. **Authentication → URL Configuration**: set *Site URL* to your app's address (you'll get it in step 3) and add the same address under *Redirect URLs*.
4. **Project Settings → API Keys**: copy the **Project URL** and the **publishable** key.
   Never use the *secret* key anywhere.

### 2. Code (GitHub)
Upload this whole folder to a GitHub repository (Add file → Upload files → Commit).

### 3. Hosting (Cloudflare)
1. **Workers & Pages → Create → Import a repository** and choose your repo.
2. **Settings → Build**:
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
3. **Settings → Build → Variables and secrets** (the *Build* section), add:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your publishable key
   - optional: `VITE_TURNSTILE_SITE_KEY` (see below)
4. Deploy. Your app is at `https://<name>.<you>.workers.dev`. Put that address into step 1.3.

### 4. Before letting other people sign up
- **Sign-in settings** (Authentication → Sign In / Providers → Email): keep *Confirm email* on, set *Minimum password length* to 8, and turn on *Secure email change*.
- **Email**: Supabase's built-in email only reaches your own team. Add your own sender (e.g. Resend) in **Authentication → Emails → SMTP Settings**, and keep **Confirm email** on.
- **Bot protection (optional)**: create a Turnstile widget in Cloudflare, put its *secret* key in Supabase **Authentication → Attack Protection**, and its *site* key in Cloudflare as `VITE_TURNSTILE_SITE_KEY`. Turn it on in Supabase first.
- **Privacy policy**: add a short page saying you store people's email and the data they enter, and that they can export or delete it any time.

### Install on a phone
Open the address in Safari → Share → **Add to Home Screen** (Android/Chrome: Install app).

---

## Updating to a new version
1. Run any **new** files in `supabase/migrations` (only the ones you haven't run yet, in order).
2. Upload the new files to GitHub and commit. Delete any files the release notes say were removed.
3. Cloudflare rebuilds automatically. When it says *Deployed*, hard-refresh (Ctrl + Shift + R) or close and reopen the app on your phone.

## Run it on your own computer
```bash
npm install
npm run dev        # http://localhost:5173
```
Without a `.env` file it runs as a **local demo** that saves in your browser only (clearly labelled, no sync). Copy `.env.example` to `.env` and fill in your Supabase values to connect it.

## Change the name
Edit `src/lib/brand.ts`, the `<title>` in `index.html` and `public/manifest.webmanifest`.

---

## How it's built
- React + TypeScript + Tailwind, built with Vite, hosted as a static site on Cloudflare.
- Supabase for sign-in and the Postgres database. There's no custom server: privacy rules live in the database, so the app only ever holds the public key.
- Dates are stored as plain calendar dates so deadlines never shift between timezones; "today" uses the timezone in Settings.
- Each change is saved instantly on the device and queued for upload, with a version check so a stale edit can't overwrite a newer one.

### Data
`settings`, `routines`, `routine_completions` (one row per step per day), `events`, `tags`, `goals`, `milestones`, `tasks`, `exercises`, `workout_templates`, `workouts`, `quotes`, `reviews`, `nutrition_goals`, `foods`, `food_logs` (snapshots, so editing a saved food never changes past days), `meal_plans`, `shopping_items`, `weigh_ins`.

### Tests
```bash
npm run test:db                                # database: privacy, limits, history, dates
npx tsx scripts/pick-routine.test.ts           # which routine Today shows at different times
node tests/mock-supabase.mjs &                 # local stand-in for Supabase (same migrations)
python3 tests/e2e_demo.py   http://localhost:4173/   # app flows (test build with VITE_TEST_SEED=1)
python3 tests/e2e_cloud.py  http://localhost:4174/   # two devices, conflicts, offline, second user
python3 tests/e2e_fresh.py  http://localhost:4175/   # brand-new account, theme, password, erase, delete
python3 tests/e2e_layout.py http://localhost:4173/   # dialogs, centred pages, accent, startup animation
python3 tests/smoke.py      http://localhost:4173/   # no sideways scrolling at 390 / 768 / 1440 px
python3 tests/crawl.py      http://localhost:4173/   # presses every non-destructive control on every screen
```

## Known limitations
- Other devices pick up changes when the app is opened or refocused, not instantly in the background.
- Conflicts are resolved per item (keep mine / keep theirs), not merged field by field.
- First sign-in needs a connection; after that the app opens offline with your last-synced data.
- The rest timer can't send notifications while the app is closed.
- Food values are what you enter (no barcode scanner or food database yet).
- Free Supabase projects have no downloadable backups — use Settings → Export now and then.
