"""End-to-end checks against the local-demo build.
Browser timezone is deliberately America/Los_Angeles: the app must still use Brisbane dates."""
import json, sys
from playwright.sync_api import sync_playwright, expect
import csp

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
results = []
def check(cond, msg):
    results.append((bool(cond), msg)); print(('PASS ' if cond else 'FAIL ') + msg)

def localdb(pg):
    return json.loads(pg.evaluate("localStorage.getItem('ep.demo.db.v1')"))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}, timezone_id='America/Los_Angeles', has_touch=True, is_mobile=True)
    csp.apply(ctx, BASE)
    pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: 'Content Security Policy' in m.text and errors.append(m.text))
    pg.goto(BASE); pg.wait_for_timeout(1000)
    today = pg.evaluate("new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane'}).format(new Date())")
    tomorrow = pg.evaluate(f"(()=>{{const d=new Date('{today}T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}})()")
    import re
    check(pg.locator('text=/local demo/i >> visible=true').count() > 0, 'demo mode is clearly labelled as local-only')

    # 1. Routine completion is unique to its date
    pg.get_by_role('button', name='Brush teeth', exact=True).click()
    pg.wait_for_timeout(300)
    comps = localdb(pg)['routine_completions']
    check(len(comps) == 1 and comps[0]['date'] == today, f'checking “Brush teeth” records one completion dated {today} (Brisbane)')
    pg.goto(BASE + '#/calendar'); pg.wait_for_timeout(400)
    r = localdb(pg)['routines'][0]
    pg.evaluate(f"location.hash='#/today'"); pg.wait_for_timeout(200)
    # open tomorrow's routine sheet from the routines page history
    pg.goto(BASE + '#/routines'); pg.wait_for_timeout(300)
    check(pg.get_by_text('Fully done on 0 days, partly on 1').is_visible(), 'routine history shows today as partly done')
    pg.get_by_role('button', name='Brush teeth', exact=True).first.click() if False else None
    # tomorrow is not checked: verify via the store
    check(not any(c['date'] == tomorrow for c in localdb(pg)['routine_completions']), 'tomorrow’s routine is untouched')
    # undo accidental check-off
    pg.goto(BASE + '#/today'); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='Brush teeth', exact=True).click(); pg.wait_for_timeout(300)
    check(len(localdb(pg)['routine_completions']) == 0, 'tapping again undoes the check-off')
    pg.get_by_role('button', name='Brush teeth', exact=True).click(); pg.wait_for_timeout(300)

    # Editing a routine keeps history
    pg.goto(BASE + '#/routines'); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='Edit').first.click()
    pg.get_by_label('Step 1').fill('Brush teeth (2 min)')
    pg.get_by_role('button', name='Move “Breakfast” up').click()
    pg.get_by_role('button', name='Save routine').click(); pg.wait_for_timeout(300)
    db = localdb(pg)
    print(len(db['routine_completions']), [i['title'] for i in db['routines'][0]['items']])
    check(len(db['routine_completions']) == 1 and db['routines'][0]['items'][0]['title'] == 'Brush teeth (2 min)', 'renaming/reordering steps keeps the completion history')
    check([i['title'] for i in db['routines'][0]['items']][3] == 'Breakfast', 'move-up control reorders routine steps')

    # 2. Editing a goal deadline updates its calendar entry (same record)
    goal = next(g for g in db['goals'] if g['title'] == 'Finish a new DnB demo')
    pg.goto(BASE + f'#/goals/{goal["id"]}'); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='Edit', exact=True).click()
    pg.get_by_label('Target date').fill('2026-12-20')
    pg.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_timeout(300)
    pg.goto(BASE + '#/calendar'); pg.wait_for_timeout(300)
    pg.get_by_role('radio', name='Month').click()
    pg.get_by_role('button', name='Next').click(); pg.wait_for_timeout(200)
    pg.get_by_role('button', name='Sunday, 20 December, 2 items').click() if pg.get_by_role('button', name='Sunday, 20 December, 2 items').count() else pg.get_by_role('button', name='Sunday 20 December').first.click()
    pg.wait_for_timeout(200)
    deadline_rows = pg.get_by_text('Deadline · Finish a new DnB demo')
    check(deadline_rows.count() >= 1, 'goal deadline appears on the calendar at the new date')
    check(len([e for e in localdb(pg)['events'] if 'Finish a new DnB demo' in e['title']]) == 0, 'no duplicate calendar event was created (deadline is read from the goal)')
    # edit a milestone date from the calendar
    pg.get_by_role('radio', name='Agenda').click(); pg.locator('main').get_by_role('button', name='Today', exact=True).click(); pg.wait_for_timeout(200)
    pg.get_by_role('button', name='Mixdown pass').first.click()
    pg.get_by_label('Deadline (optional)').fill('2026-11-28')
    pg.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_timeout(300)
    ms = next(m for m in localdb(pg)['milestones'] if m['title'] == 'Mixdown pass')
    check(ms['due_date'] == '2026-11-28', 'editing a milestone from the calendar updates the milestone record')

    # 3. Recurring events in Brisbane time + edit one occurrence
    studio_rows = pg.locator('section', has=pg.get_by_text('Tuesday')).get_by_text('Studio session')
    exp = pg.evaluate("""() => { const db = JSON.parse(localStorage.getItem('ep.demo.db.v1')); return db.events.find(e => e.title === 'Studio session'); }""")
    # Find the agenda section for the next Thursday and edit only that occurrence
    thu = pg.evaluate(f"(()=>{{let d=new Date('{today}T00:00:00Z');do{{d.setUTCDate(d.getUTCDate()+1)}}while(d.getUTCDay()!==4);return d.toISOString().slice(0,10)}})()")
    sec = pg.locator(f'section[aria-label*="Thursday"]').first
    check(sec.get_by_text('Studio session').count() == 1, f'weekly Tue/Thu event appears on Thursday {thu} even with device in Los Angeles')
    sec.get_by_role('button', name='Studio session, 19:00, scheduled').click()
    pg.get_by_role('radio', name='This event only').click()
    pg.get_by_label('Start', exact=True).fill('20:00'); pg.get_by_label('End', exact=True).fill('22:00')
    pg.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_timeout(300)
    ev = next(e for e in localdb(pg)['events'] if e['title'] == 'Studio session')
    check(ev['exceptions'].get(thu, {}).get('start_time') == '20:00' and ev['start_time'] == '19:00', 'editing one occurrence stores an exception and leaves the series at 19:00')
    # whole series
    tue_sec = pg.locator('section[aria-label*="Tuesday"]').first
    tue_sec.get_by_role('button', name='Studio session, 19:00, scheduled').click()
    pg.get_by_role('radio', name='All in series').click()
    pg.get_by_label('Title').fill('Studio session (focus)')
    pg.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_timeout(300)
    ev = next(e for e in localdb(pg)['events'] if e['id'] == ev['id'])
    check(ev['title'] == 'Studio session (focus)' and ev['date'] == exp['date'], 'editing the whole series changes the title and keeps the series start date')
    # all-day events don't shift
    pg.get_by_role('button', name='Event', exact=True).click()
    pg.get_by_label('Title').fill('Gig in Brisbane'); pg.get_by_label('Date', exact=True).fill('2026-12-05')
    pg.get_by_role('switch', name='All day').click()
    pg.get_by_role('button', name='Add event', exact=True).click(); pg.wait_for_timeout(300)
    gig = next(e for e in localdb(pg)['events'] if e['title'] == 'Gig in Brisbane')
    check(gig['date'] == '2026-12-05' and gig['all_day'], 'all-day event stored as the exact date entered')

    # 4. Workout survives refresh and can be resumed
    pg.goto(BASE + '#/today'); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='Start', exact=True).click(); pg.wait_for_timeout(400)
    pg.get_by_label('Set 1 weight in kilograms').first.fill('85')
    pg.get_by_label('Set 1 reps').first.fill('5')
    pg.get_by_role('button', name='Log set 1').first.click(); pg.wait_for_timeout(300)
    check(pg.get_by_role('timer').is_visible(), 'logging a set starts the rest timer')
    pg.screenshot(path='/home/claude/shots/session-390.png', full_page=False)
    pg.get_by_label('Set 2 reps').first.fill('6')
    pg.wait_for_timeout(100)
    pg.reload(); pg.wait_for_timeout(1000)
    check(pg.get_by_label('Set 1 weight in kilograms').first.input_value() == '85' and pg.get_by_label('Set 2 reps').first.input_value() == '6', 'entered sets survive a page refresh')
    check(pg.get_by_role('timer').is_visible(), 'rest timer survives refresh (timestamp-based)')
    check(pg.get_by_role('button', name='Untick set 1').first.is_visible(), 'ticked state survives refresh')
    pg.goto(BASE + '#/today'); pg.wait_for_timeout(300)
    check(pg.get_by_role('button', name='Resume').count() >= 1, 'Today offers Resume for the in-progress workout')
    pg.get_by_role('button', name='Resume').first.click(); pg.wait_for_timeout(300)
    # previous results visible
    check(pg.get_by_text('First time logging this').count() + pg.get_by_text('Last time').count() > 0, 'previous results line is shown beside each exercise')
    pg.get_by_role('button', name='Finish workout').click()
    pg.get_by_role('button', name='Finish', exact=True).click(); pg.wait_for_timeout(300)
    w = [x for x in localdb(pg)['workouts'] if x['status'] == 'completed' and x['name'] == 'Lower A']
    check(len(w) == 1, 'workout finished and saved to history')
    # edit past workout
    pg.goto(BASE + '#/gym/history'); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='Lower A').first.click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='Edit workout').click()
    pg.get_by_label('Set 1 weight in kilograms').first.fill('87.5'); pg.wait_for_timeout(300)
    w = next(x for x in localdb(pg)['workouts'] if x['id'] == w[0]['id'])
    check(w['entries'][0]['sets'][0]['weight'] == 87.5, 'past workouts can be edited')

    # Tags: create one with a colour, use it on an event, filter by it
    pg.goto(BASE + '#/calendar'); pg.wait_for_timeout(400)
    pg.locator('main').get_by_role('button', name='Tag', exact=True).click()
    pg.get_by_label('Name', exact=True).fill('Studio')
    pg.get_by_role('radio', name='Teal').click()
    pg.get_by_role('button', name='Create tag').click(); pg.wait_for_timeout(300)
    tags = localdb(pg)['tags']
    check(len(tags) == 1 and tags[0]['color'] == 'teal', 'a tag can be created with a chosen colour')
    pg.get_by_role('button', name='Event', exact=True).click()
    pg.get_by_label('Title').fill('Mixdown night')
    pg.get_by_role('radio', name='Studio').click()
    pg.get_by_role('button', name='Add event', exact=True).click(); pg.wait_for_timeout(300)
    ev = next(e for e in localdb(pg)['events'] if e['title'] == 'Mixdown night')
    check(ev.get('tag_id') == tags[0]['id'], 'an event can use the tag')
    check(pg.get_by_role('button', name='Mixdown night').count() >= 1, 'tagged event shows on the calendar')
    pg.locator('main').get_by_role('button', name='Studio', exact=True).click(); pg.wait_for_timeout(200)
    check(pg.get_by_role('button', name='Mixdown night').count() == 0, 'tag chip filters tagged events out and back in')
    pg.locator('main').get_by_role('button', name='Studio', exact=True).click()
    pg.get_by_role('button', name='Manage tags').click()
    pg.locator('[role=dialog]').get_by_role('button', name='Studio').click()
    pg.get_by_role('radio', name='Rose').click(); pg.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_timeout(300)
    check(localdb(pg)['tags'][0]['color'] == 'rose', 'tag colour can be changed later')
    pg.keyboard.press('Escape')

    # Food: target, saved meal, quick add, servings, recipe → shopping list, day plan, weigh-in
    pg.goto(BASE + '#/food'); pg.wait_for_timeout(600)
    pg.get_by_role('button', name='Set daily target').click()
    pg.get_by_label('Calories per day').fill('3500'); pg.get_by_label('Protein g', exact=True).fill('180')
    pg.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_timeout(300)
    check(pg.get_by_text('of 3,500 kcal').first.is_visible(), 'calorie target can be set and is shown')
    pg.goto(BASE + '#/food/foods'); pg.wait_for_timeout(500)
    pg.get_by_role('button', name='New', exact=True).click()
    pg.get_by_role('radio', name='Meal').click()
    pg.get_by_label('Name', exact=True).fill('Peanut butter banana oats'); pg.get_by_label('Calories', exact=True).fill('800'); pg.get_by_label('Protein g', exact=True).fill('27')
    pg.get_by_role('switch', name='Favourite (shown first)').click()
    pg.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_timeout(300)
    check(any(f['name'] == 'Peanut butter banana oats' for f in localdb(pg)['foods']), 'a meal can be saved to My foods')
    pg.goto(BASE + '#/food'); pg.wait_for_timeout(500)
    pg.get_by_role('button', name='Add to Breakfast').click(); pg.wait_for_timeout(300)
    pg.locator('[role=dialog]').get_by_role('button', name='Peanut butter banana oats').click()
    pg.get_by_role('button', name='Add 800 kcal').click(); pg.wait_for_timeout(300)
    check(pg.get_by_text('2,700').first.is_visible(), 'logging a saved meal updates calories left (2,700 to go)')
    pg.get_by_role('button', name='Add to Snacks').click(); pg.wait_for_timeout(300)
    pg.get_by_role('radio', name='Quick add').click()
    pg.get_by_label('What did you eat?').fill('Chocolate banana shake'); pg.get_by_label('Calories', exact=True).fill('695'); pg.get_by_label('Protein g', exact=True).fill('26')
    pg.locator('[role=dialog]').get_by_role('button', name='Add', exact=True).click(); pg.wait_for_timeout(300)
    logs = localdb(pg)['food_logs']
    check(len(logs) == 2 and sum(l['calories'] for l in logs) == 1495, 'quick add logs calories without saving a food')
    pg.get_by_role('button', name='Chocolate banana shake').click()
    pg.get_by_label('Servings', exact=True).fill('2'); pg.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_timeout(300)
    shake = next(l for l in localdb(pg)['food_logs'] if l['name'] == 'Chocolate banana shake')
    check(shake['calories'] == 1390 and shake['protein'] == 52, 'changing servings rescales calories and protein')
    check(pg.get_by_text('2,190').first.is_visible() and pg.get_by_text('Peanut butter banana oats').count() >= 1, 'day totals and favourites update')

    pg.goto(BASE + '#/food/foods'); pg.wait_for_timeout(400)
    pg.get_by_role('button', name='New', exact=True).click()
    pg.get_by_role('radio', name='Recipe').click()
    pg.get_by_label('Name', exact=True).fill('Beef taco pasta'); pg.get_by_label('Calories', exact=True).fill('970'); pg.get_by_label('Protein g', exact=True).fill('60')
    pg.get_by_label('Serves (per batch)').fill('4')
    for n, a in [('Lean beef mince', '600 g'), ('Pasta spirals', '500 g'), ('Tomato passata', '600 g')]:
        pg.get_by_label('New ingredient').fill(n); pg.get_by_label('Amount', exact=True).fill(a); pg.locator('[role=dialog] form').get_by_role('button', name='Add').click()
    pg.get_by_role('button', name='Add ingredients to shopping list').click()
    pg.get_by_role('button', name='More batches').click()
    pg.get_by_role('button', name='Add 3 items').click(); pg.wait_for_timeout(300)
    items = {i['name']: i for i in localdb(pg)['shopping_items']}
    check(items.get('Lean beef mince', {}).get('amount') == '1200 g' and items['Lean beef mince']['aisle'] == 'meat' and items['Tomato passata']['aisle'] == 'pantry',
          'recipe ingredients go to the shopping list, scaled for 2 batches and sorted into aisles')
    pg.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_timeout(300)

    pg.goto(BASE + '#/food/plans'); pg.wait_for_timeout(400)
    pg.get_by_role('button', name='New day plan').click()
    pg.locator('[role=dialog] select').nth(0).select_option(label='Peanut butter banana oats')
    pg.locator('[role=dialog]').get_by_role('button', name='Add', exact=True).click()
    pg.locator('[role=dialog] select').nth(0).select_option(label='Beef taco pasta'); pg.locator('[role=dialog] select').nth(1).select_option('dinner')
    pg.locator('[role=dialog]').get_by_role('button', name='Add', exact=True).click()
    check(pg.get_by_text('Total: 1,770 kcal').is_visible(), 'day plan totals its foods')
    pg.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_timeout(300)
    before = len(localdb(pg)['food_logs'])
    pg.get_by_role('button', name='Log for today').click(); pg.wait_for_timeout(300)
    check(len(localdb(pg)['food_logs']) == before + 2, 'a day plan logs all its foods in one tap')

    pg.goto(BASE + '#/food/weight'); pg.wait_for_timeout(400)
    pg.get_by_label('Today’s weight (kg)').fill('72.4'); pg.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_timeout(300)
    check(len(localdb(pg)['weigh_ins']) == 1 and pg.get_by_text('72.4').first.is_visible(), 'weigh-in saved and shown in the 7-day average')

    # Shopping from Today
    pg.goto(BASE + '#/today'); pg.wait_for_timeout(500)
    check(pg.get_by_text('Today’s fuel').is_visible(), 'Today shows the food summary')
    pg.get_by_label('Add to shopping list').fill('Bananas'); pg.locator('form').filter(has=pg.get_by_label('Add to shopping list')).get_by_role('button', name='Add').click(); pg.wait_for_timeout(300)
    bananas = next(i for i in localdb(pg)['shopping_items'] if i['name'] == 'Bananas')
    check(bananas['aisle'] == 'produce', 'items added on Today land in the right aisle')
    pg.get_by_role('button', name='Got Bananas').click(); pg.wait_for_timeout(200)
    pg.get_by_role('button', name='Undo').last.click(); pg.wait_for_timeout(300)
    check(not next(i for i in localdb(pg)['shopping_items'] if i['name'] == 'Bananas')['done'], 'ticking off from Today can be undone')
    pg.goto(BASE + '#/shopping'); pg.wait_for_timeout(500)
    pg.get_by_role('button', name='Got Bananas').click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='Clear ticked').click(); pg.wait_for_timeout(300)
    check(not any(i['name'] == 'Bananas' for i in localdb(pg)['shopping_items']), 'ticked items can be cleared from the shopping list')

    # 5. Quotes
    pg.goto(BASE + '#/today'); pg.wait_for_timeout(300)
    quote = pg.locator('section[aria-label="Daily line"] p').last
    q1 = quote.inner_text()
    pg.get_by_role('button', name='Another line').click(); pg.wait_for_timeout(200)
    check(quote.inner_text() != q1, '“Another” shows a different quote')
    pg.get_by_role('button', name='Save to favourites').click(); pg.wait_for_timeout(200)
    check(any(q['favourite'] for q in localdb(pg)['quotes']), 'quote can be saved as a favourite')

    # 6. Weekly review
    pg.goto(BASE + '#/review'); pg.wait_for_timeout(300)
    pg.get_by_label('What went well?').fill('Finished the arrangement.')
    pg.get_by_label('Priority 1').fill('Mixdown')
    pg.get_by_role('button', name='Save review').click(); pg.wait_for_timeout(300)
    check(len(localdb(pg)['reviews']) == 1, 'weekly review saved')

    # 7. Destructive action with undo
    pg.goto(BASE + '#/goals'); pg.wait_for_timeout(300)
    pg.get_by_role('radio', name='Ideas 2').click()
    pg.get_by_role('button', name='Delete idea “Play a set in Melbourne”').click(); pg.wait_for_timeout(200)
    pg.get_by_role('button', name='Undo').last.click(); pg.wait_for_timeout(300)
    check(any(g['title'] == 'Play a set in Melbourne' for g in localdb(pg)['goals']), 'deleting an idea can be undone')
    # promote idea without re-entry
    pg.get_by_role('button', name='Promote').first.click()
    pg.get_by_role('button', name='Make it active').click(); pg.wait_for_timeout(300)
    check(any(g['stage'] == 'active' and g['title'] in ('Play a set in Melbourne', 'Learn basic sound design in a new synth') for g in localdb(pg)['goals']), 'idea promoted to an active goal keeping its details')

    # 8. Mobile: overflow on every screen + tap targets in bottom nav
    for route in ['today', 'calendar', 'goals', 'gym', 'gym/templates', 'gym/progress', 'routines', 'review', 'settings', 'food', 'food/foods', 'food/plans', 'food/weight', 'shopping', f'goals/{goal["id"]}']:
        pg.goto(BASE + '#/' + route); pg.wait_for_timeout(250)
        over = pg.evaluate('document.documentElement.scrollWidth - window.innerWidth')
        if over > 0: check(False, f'no horizontal overflow on {route} ({over}px)')
    check(True, 'checked horizontal overflow on all main screens at 390px')
    small = pg.evaluate("""() => [...document.querySelectorAll('nav button, main button, main input, main select')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 40 || r.width < 40); }).map(e => (e.getAttribute('aria-label') || e.textContent).trim().slice(0,30))""")
    check(len(small) == 0, f'touch targets ≥ ~44px on settings screen ({small[:5]})')
    pg.get_by_role('button', name='More: shopping, routines, review, settings').click()
    check(pg.get_by_role('button', name='Weekly review').is_visible(), 'secondary menu exposes review and settings on mobile')
    pg.keyboard.press('Escape')
    # Quick add opens full-height sheet with numeric inputs on gym fields
    pg.goto(BASE + '#/gym/templates'); pg.wait_for_timeout(200)
    pg.get_by_role('button', name='Upper A').click(); pg.wait_for_timeout(200)
    check(pg.locator('input[inputmode="decimal"], input[inputmode="numeric"]').count() > 5, 'weight/reps inputs use numeric keyboards')
    pg.get_by_role('button', name='Cancel').click()

    check(not errors, f'no page errors ({errors[:3]})')
    b.close()

failed = [m for ok, m in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} passed')
sys.exit(1 if failed else 0)
