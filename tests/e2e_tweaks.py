"""Hide autopay bills, per-routine calendar switch, recipe to shopping list."""
import json, sys
from playwright.sync_api import sync_playwright
import csp
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
results = []
def check(c, m): results.append((bool(c), m)); print(('PASS ' if c else 'FAIL ') + m)
def db(pg): return json.loads(pg.evaluate("localStorage.getItem('ep.demo.db.v1')"))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(reduced_motion='reduce', viewport={'width': 1280, 'height': 900}, timezone_id='Australia/Brisbane')
    csp.apply(ctx, BASE)
    pg = ctx.new_page(); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: 'Content Security Policy' in m.text and errors.append(m.text))
    pg.goto(BASE); pg.wait_for_timeout(1000)
    today = pg.evaluate("new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane'}).format(new Date())")

    # --- autopay bill
    pg.goto(BASE + '#/money/bills'); pg.wait_for_timeout(600)
    pg.get_by_role('button', name='Add bill').click(); pg.wait_for_timeout(300)
    pg.get_by_label('Name').fill('Netflix'); pg.get_by_label('Amount').fill('20')
    pg.get_by_label('Next due date').fill(today)
    pg.get_by_role('switch', name='Paid automatically (direct debit)').click()
    pg.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_timeout(500)
    pg.goto(BASE + '#/calendar'); pg.wait_for_timeout(800)
    pg.get_by_role('radio', name='Agenda').click(); pg.wait_for_timeout(500)
    check(pg.get_by_text('Netflix').count() > 0, 'an autopay bill is on the calendar by default')
    pg.goto(BASE + '#/settings'); pg.wait_for_timeout(600)
    pg.get_by_role('switch', name='Hide autopay bills').click(); pg.wait_for_timeout(500)
    check(db(pg)['settings'][0]['ui'].get('hideAutoBills') is True, 'the setting is saved')
    pg.goto(BASE + '#/calendar'); pg.wait_for_timeout(800)
    check(pg.get_by_text('Netflix').count() == 0, 'autopay bills disappear from the calendar when hidden')
    check(len(db(pg)['bills']) == 1, 'the bill itself is untouched')

    # --- routine on calendar switch
    pg.goto(BASE + '#/calendar'); pg.wait_for_timeout(500)
    check(pg.get_by_text('Morning routine').count() > 0, 'routines show on the calendar by default')
    pg.goto(BASE + '#/routines'); pg.wait_for_timeout(600)
    pg.get_by_role('button', name='Edit').first.click(); pg.wait_for_timeout(400)
    pg.get_by_role('switch', name='Show on calendar').click()
    pg.get_by_role('button', name='Save routine').click(); pg.wait_for_timeout(500)
    check(db(pg)['routines'][0].get('show_on_calendar') is False, 'the routine remembers it is off the calendar')
    pg.goto(BASE + '#/calendar'); pg.wait_for_timeout(800)
    check(pg.get_by_text('Morning routine').count() == 0, 'the routine is gone from the calendar')
    pg.goto(BASE + '#/'); pg.wait_for_timeout(700)
    check(pg.get_by_text('Morning routine').count() > 0, 'it still appears on Today')

    # --- recipe -> shopping
    pg.goto(BASE + '#/food/foods'); pg.wait_for_timeout(600)
    pg.get_by_role('button', name='Create your first').click() if pg.get_by_role('button', name='Create your first').count() else pg.get_by_role('button', name='New').first.click()
    pg.wait_for_timeout(400)
    pg.get_by_role('radio', name='Recipe').click()
    pg.get_by_label('Name').first.fill('Taco pasta'); pg.get_by_label('Calories').fill('650')
    for n, a in (('Pasta', '500 g'), ('Beef mince', '500 g'), ('Taco seasoning', '1 packet')):
        pg.get_by_label('New ingredient').fill(n); pg.get_by_label('Amount', exact=True).fill(a); pg.get_by_label('Amount', exact=True).press('Enter'); pg.wait_for_timeout(150)
    pg.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_timeout(600)
    rec = [f for f in db(pg)['foods'] if f['name'] == 'Taco pasta']
    check(len(rec) == 1 and len(rec[0]['ingredients']) == 3, 'a recipe with ingredients is saved')
    pg.get_by_role('button', name='Add Taco pasta to shopping list').click(); pg.wait_for_timeout(400)
    pg.get_by_role('button', name='More batches').click()
    pg.get_by_role('button', name='Add 3 items').click(); pg.wait_for_timeout(500)
    items = {i['name']: i['amount'] for i in db(pg)['shopping_items']}
    check(items.get('Pasta') == '1000 g' and 'Beef mince' in items, 'the recipe row adds all ingredients, scaled by batches')
    pg.goto(BASE + '#/shopping'); pg.wait_for_timeout(600)
    pg.get_by_role('button', name='Add a saved recipe').click(); pg.wait_for_timeout(400)
    pg.get_by_role('dialog').get_by_role('button', name='Taco pasta').click(); pg.wait_for_timeout(400)
    pg.get_by_role('button', name='Add 3 items').click(); pg.wait_for_timeout(500)
    check(len([i for i in db(pg)['shopping_items'] if i['name'] == 'Pasta']) == 1, 'adding the recipe again merges instead of duplicating')
    check(not errors, 'no page or CSP errors: ' + '; '.join(errors[:2]))
    b.close()
bad = [m for ok, m in results if not ok]
print(f'\n{len(results)-len(bad)}/{len(results)} passed'); sys.exit(1 if bad else 0)
