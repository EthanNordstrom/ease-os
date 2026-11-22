"""Money: pay details, bills (calendar + mark paid), purchase goal auto-calculation, auto-log."""
import json, sys
from playwright.sync_api import sync_playwright
import csp

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
results = []
def check(c, m): results.append((bool(c), m)); print(('PASS ' if c else 'FAIL ') + m)
def db(pg): return json.loads(pg.evaluate("localStorage.getItem('ep.demo.db.v1')"))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}, timezone_id='America/Los_Angeles', has_touch=True, is_mobile=True)
    csp.apply(ctx, BASE)
    pg = ctx.new_page(); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: 'Content Security Policy' in m.text and errors.append(m.text))
    pg.goto(BASE); pg.wait_for_timeout(1000)
    today = pg.evaluate("new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane'}).format(new Date())")
    def plus(n): return pg.evaluate(f"(()=>{{const d=new Date('{today}T00:00:00Z');d.setUTCDate(d.getUTCDate()+{n});return d.toISOString().slice(0,10)}})()")

    pg.goto(BASE + '#/money'); pg.wait_for_timeout(700)
    # Pay details
    pg.get_by_role('button', name='Set up pay details').click(); pg.wait_for_timeout(300)
    pg.get_by_role('radio', name='Fortnightly').click()
    pg.get_by_label('Next payday').fill(plus(2))
    pg.get_by_label('Take-home per pay').fill('2000')
    pg.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_timeout(500)
    m = db(pg)['money_settings']
    check(len(m) == 1 and m[0]['pay_frequency'] == 'fortnightly' and m[0]['next_payday'] == plus(2), 'pay details are saved')

    # Bill
    pg.get_by_role('button', name='Bill', exact=True).first.click(); pg.wait_for_timeout(300)
    pg.get_by_label('Name').fill('Rent'); pg.get_by_label('Amount').fill('900')
    pg.get_by_label('Next due date').fill(plus(1))
    pg.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_timeout(500)
    check(len(db(pg)['bills']) == 1, 'a bill can be added')
    check(pg.get_by_text('Rent').first.is_visible(), 'the bill shows under due soon')
    pg.get_by_role('button', name='Paid Rent').click(); pg.wait_for_timeout(400)
    bp = db(pg)['bill_payments']
    check(len(bp) == 1 and bp[0]['due_date'] == plus(1), 'marking paid records that due date only')
    pg.get_by_role('button', name='Paid Rent').click(); pg.wait_for_timeout(400)
    check(len(db(pg)['bill_payments']) == 0, 'marking paid can be undone')

    # Purchase goal with date -> automatic per-pay
    pg.get_by_role('button', name='Goal', exact=True).first.click(); pg.wait_for_timeout(300)
    pg.get_by_label('What are you buying?').fill('Studio monitors'); pg.get_by_label('Price').fill('600')
    pg.get_by_label('Buy by (optional)').fill(plus(2 + 14 * 3))
    check(pg.get_by_role('status').filter(has_text='per pay').is_visible(), 'the live preview shows the automatic per-pay amount')
    pg.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_timeout(500)
    g = db(pg)['savings_goals']
    check(len(g) == 1 and g[0]['kind'] == 'purchase', 'a purchase goal is saved')
    check(pg.get_by_text('Move').first.is_visible(), 'the payday plan totals bills and savings')

    # Calendar
    pg.goto(BASE + '#/calendar'); pg.wait_for_timeout(800)
    check(pg.get_by_text('Rent').count() > 0, 'the bill appears on the calendar')
    check(pg.get_by_role('button', name='Money').count() + pg.get_by_label('Money').count() > 0, 'calendar has a Money filter')

    # Auto-log: turn on, rewind last_auto_payday so a payday has passed
    pg.goto(BASE + '#/money'); pg.wait_for_timeout(500)
    pg.get_by_role('button', name='Pay details').click(); pg.wait_for_timeout(300)
    pg.get_by_role('switch', name='Auto-log savings on payday').click()
    pg.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_timeout(500)
    d = db(pg)
    d['money_settings'][0]['next_payday'] = plus(-1); d['money_settings'][0]['last_auto_payday'] = plus(-5)
    pg.evaluate("v => localStorage.setItem('ep.demo.db.v1', v)", json.dumps(d))
    pg.reload(); pg.wait_for_timeout(1200)
    t = db(pg)['savings_transfers']
    check(len(t) == 1 and t[0]['payday'] == plus(-1), 'auto-log records the missed payday once')
    pg.reload(); pg.wait_for_timeout(1200)
    check(len(db(pg)['savings_transfers']) == 1, 'reloading never logs it twice')

    # Today
    pg.goto(BASE + '#/'); pg.wait_for_timeout(800)
    check(pg.get_by_role('region', name='Money').count() == 1, 'Today shows a Money card once money data exists')
    check(not errors, 'no page or CSP errors: ' + '; '.join(errors[:2]))
    pg.goto(BASE + '#/money'); pg.wait_for_timeout(500)
    pg.screenshot(path='/home/claude/shots/money-390.png', full_page=True)
    w = pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    check(w, 'no horizontal overflow at 390px')
    b.close()
bad = [m for ok, m in results if not ok]
print(f'\n{len(results)-len(bad)}/{len(results)} passed'); sys.exit(1 if bad else 0)
