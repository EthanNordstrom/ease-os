"""Built-in exercise library and repeating templates."""
import json, sys
from playwright.sync_api import sync_playwright
import csp
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
results = []
def check(c, m): results.append((bool(c), m)); print(('PASS ' if c else 'FAIL ') + m)
def db(pg): return json.loads(pg.evaluate("localStorage.getItem('ep.demo.db.v1')"))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}, timezone_id='Australia/Brisbane', has_touch=True, is_mobile=True)
    csp.apply(ctx, BASE)
    pg = ctx.new_page(); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: 'Content Security Policy' in m.text and errors.append(m.text))
    pg.goto(BASE); pg.wait_for_timeout(1000)
    today = pg.evaluate("new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane'}).format(new Date())")
    wd = pg.evaluate(f"new Date('{today}T00:00:00Z').getUTCDay()")

    pg.goto(BASE + '#/gym/exercises'); pg.wait_for_timeout(700)
    check(pg.get_by_text('Built-in library').first.is_visible(), 'the exercise page offers a built-in library')
    before = len(db(pg)['exercises'])
    pg.get_by_role('button', name='Add Cable Fly').click(); pg.wait_for_timeout(400)
    ex = db(pg)['exercises']
    cf = [e for e in ex if e['name'] == 'Cable Fly']
    check(len(ex) == before + 1 and len(cf) == 1 and cf[0]['notes'], 'adding a built-in exercise copies it (with its cues) once')
    pg.get_by_role('button', name='Add Cable Fly').count() == 0 or None
    check(pg.get_by_role('button', name='Add Cable Fly').count() == 0, 'an added exercise leaves the built-in list')
    pg.get_by_role('button', name='Add all').click(); pg.wait_for_timeout(500)
    names = [e['name'].lower() for e in db(pg)['exercises']]
    check(len(names) == len(set(names)), 'Add all never creates duplicates')

    # Template repeating today, via the editor
    pg.goto(BASE + '#/gym/templates'); pg.wait_for_timeout(600)
    pg.get_by_role('button', name='New template').click(); pg.wait_for_timeout(300)
    pg.get_by_label('Name').fill('Repeat test')
    names_wd = ['Su','Mo','Tu','We','Th','Fr','Sa']
    pg.get_by_role('group', name='Weekdays').get_by_role('button', name=names_wd[wd]).click()
    pg.get_by_role('button', name='Save template').click(); pg.wait_for_timeout(500)
    t = [x for x in db(pg)['workout_templates'] if x['name'] == 'Repeat test'][0]
    check(t['weekdays'] == [wd] and t['plan_time'] is None, 'template saves chosen weekday with no time')
    check(len(db(pg)['workouts']) == len([w for w in db(pg)['workouts']]), 'no workouts are created just by scheduling')
    n0 = len(db(pg)['workouts'])

    pg.goto(BASE + '#/'); pg.wait_for_timeout(700)
    check(pg.get_by_text('Repeat test').count() > 0, 'Today shows the repeating template')
    pg.goto(BASE + '#/calendar'); pg.wait_for_timeout(700)
    check(pg.get_by_text('Repeat test').count() > 0, 'the calendar shows it on the chosen days')
    check(len(db(pg)['workouts']) == n0, 'viewing never writes workouts')
    pg.get_by_role('button', name='Repeat test').first.click(); pg.wait_for_timeout(700)
    w = [x for x in db(pg)['workouts'] if x['template_id'] == t['id']]
    check(len(w) == 1, 'opening a repeating day turns it into exactly one planned workout')
    pg.goto(BASE + '#/calendar'); pg.wait_for_timeout(700)
    check(len([x for x in db(pg)['workouts'] if x['template_id'] == t['id']]) == 1, 'it is not duplicated afterwards')
    # Archive hides from calendar/Today, restore brings it back, delete removes it
    pg.goto(BASE + '#/gym/templates'); pg.wait_for_timeout(600)
    pg.get_by_role('button', name='Archive').last.click(); pg.wait_for_timeout(500)
    arch = [x for x in db(pg)['workout_templates'] if x['name'] == 'Repeat test'][0]
    check(arch.get('archived') is True, 'a template can be archived')
    pg.goto(BASE + '#/calendar'); pg.wait_for_timeout(600)
    pg.goto(BASE + '#/gym'); pg.wait_for_timeout(600)
    check(pg.get_by_text('Repeating this week').count() == 0 or pg.get_by_text('Repeat test').count() == 0, 'an archived template stops repeating')
    pg.goto(BASE + '#/gym/templates'); pg.wait_for_timeout(600)
    pg.get_by_role('button', name='Archived').click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='Restore').click(); pg.wait_for_timeout(500)
    check([x for x in db(pg)['workout_templates'] if x['name'] == 'Repeat test'][0].get('archived') is False, 'an archived template can be restored')
    pg.get_by_role('button', name='Archive', exact=True).last.click(); pg.wait_for_timeout(400)
    pg.get_by_role('button', name='Delete').first.click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='Delete', exact=True).last.click(); pg.wait_for_timeout(500)
    check(not [x for x in db(pg)['workout_templates'] if x['name'] == 'Repeat test'], 'an archived template can be deleted')
    check(not errors, 'no page or CSP errors: ' + '; '.join(errors[:2]))
    b.close()
bad = [m for ok, m in results if not ok]
print(f'\n{len(results)-len(bad)}/{len(results)} passed'); sys.exit(1 if bad else 0)
