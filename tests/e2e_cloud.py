"""Cross-device sync, conflict handling, offline queue and user isolation, using the
real supabase-js client against tests/mock-supabase.mjs (real migration + RLS)."""
import json, sys, time, urllib.request
from playwright.sync_api import sync_playwright
import csp

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4174/'
API = 'http://127.0.0.1:54321'
results = []
def check(cond, msg):
    results.append((bool(cond), msg)); print(('PASS ' if cond else 'FAIL ') + msg)

def status(pg): return pg.locator('[role=status]').first.inner_text()
def wait_saved(pg, t=15):
    end = time.time() + t
    while time.time() < end:
        if status(pg).strip().lower() == 'saved': return True
        pg.wait_for_timeout(250)
    return False
def sync(pg):
    pg.wait_for_timeout(5200)  # app throttles focus-refreshes to one per 5 s
    pg.evaluate("document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus'))")
    pg.wait_for_timeout(1500)
def sign_in(pg, email, pw, create=False):
    pg.goto(BASE); pg.wait_for_timeout(600)
    if create: pg.get_by_role('tab', name='Create account').click()
    pg.get_by_label('Email').fill(email); pg.get_by_label('Password', exact=True).fill(pw)
    if create: pg.get_by_label('Confirm password').fill(pw)
    pg.get_by_role('button', name='Create account' if create else 'Sign in', exact=True).click()
    pg.wait_for_timeout(1500)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests'])
    ctxs = [b.new_context(viewport={'width': 390, 'height': 844}, timezone_id='Australia/Brisbane', has_touch=True, is_mobile=True),
            b.new_context(viewport={'width': 1440, 'height': 900}, timezone_id='Australia/Brisbane'), b.new_context(viewport={'width': 1440, 'height': 900})]
    for c in ctxs: csp.apply(c, BASE)
    phone, laptop, other = [c.new_page() for c in ctxs]
    errors = []
    for pg in (phone, laptop, other):
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: 'Content Security Policy' in m.text and errors.append(m.text))

    sign_in(phone, 'ethan@example.com', 'password123', create=True)
    check((phone.locator('h1').first.wait_for() or True) and ', ' in phone.locator('h1').first.inner_text(), 'phone: account created and Today loads')
    check(wait_saved(phone, 30), 'phone: first-run data reaches the database (status shows Saved)')

    sign_in(laptop, 'ethan@example.com', 'password123')
    laptop.wait_for_timeout(1500)
    check(laptop.get_by_role('heading', name='Morning routine').count() == 1, 'laptop: same morning routine appears after signing in (not seeded twice)')
    check(laptop.get_by_text('Finish a new DnB demo').count() >= 1, 'laptop: goals created on the phone are visible')

    # Routine check-off syncs, per date
    phone.get_by_role('button', name='Brush teeth', exact=True).click()
    check(wait_saved(phone), 'phone: check-off saved')
    sync(laptop)
    check(laptop.get_by_role('button', name='Brush teeth', exact=True).get_attribute('aria-pressed') == 'true', 'laptop: phone’s check-off appears after sync')

    # Stale-edit protection
    goal_url = None
    laptop.goto(BASE + '#/goals'); laptop.wait_for_timeout(500)
    laptop.locator('main').get_by_role('button', name='Finish a new DnB demo').first.click(); laptop.wait_for_timeout(500)
    goal_hash = laptop.evaluate('location.hash')
    phone.goto(BASE + goal_hash); phone.wait_for_timeout(600)
    laptop.get_by_label('Next action').fill('Laptop: print the arrangement'); laptop.get_by_label('Next action').press('Enter')
    check(wait_saved(laptop), 'laptop: edit saved')
    # Phone still holds the old version and edits the same field
    phone.get_by_label('Next action').fill('Phone: bounce the intro'); phone.get_by_label('Next action').press('Enter')
    phone.wait_for_timeout(2000)
    check('decision' in status(phone).lower() and phone.get_by_text('was changed on another device').is_visible(), 'phone: stale edit is NOT applied silently — a conflict is shown')
    phone.screenshot(path='/home/claude/shots/conflict-390.png')
    phone.get_by_role('button', name='Keep my version').click()
    check(wait_saved(phone), 'phone: chosen version saved')
    sync(laptop)
    check(laptop.get_by_label('Next action').input_value() == 'Phone: bounce the intro', 'laptop: sees the version kept on the phone')

    # Offline queue
    urllib.request.urlopen(API + '/__offline?v=1')
    phone.goto(BASE + '#/today'); phone.wait_for_timeout(500)
    phone.get_by_label('Add a priority').fill('Offline priority')
    phone.get_by_role('button', name='Add', exact=True).click()
    phone.wait_for_timeout(2500)
    check('offline' in status(phone).lower(), f'phone: shows offline with waiting changes ({status(phone)!r})')
    phone.reload(); phone.wait_for_timeout(2500)
    check(phone.get_by_text('Offline priority').is_visible(), 'phone: offline edit survives a reload while offline')
    urllib.request.urlopen(API + '/__offline?v=0')
    phone.evaluate("window.dispatchEvent(new Event('online'))")
    check(wait_saved(phone, 20), 'phone: queued change uploads when back online')
    sync(laptop)
    laptop.goto(BASE + '#/today'); laptop.wait_for_timeout(800)
    check(laptop.get_by_text('Offline priority').is_visible(), 'laptop: sees the change made offline on the phone')

    # A different user sees none of it
    sign_in(other, 'someone@example.com', 'password456', create=True)
    wait_saved(other, 30)
    other.locator('h1').first.wait_for()
    check(other.get_by_text('Offline priority').count() == 0, 'second user cannot see Ethan’s priorities')
    tok = json.loads([v for k, v in other.evaluate('Object.entries(localStorage)') if k.startswith('sb-')][0])['access_token']
    gid = goal_hash.split('/')[-1]
    req = urllib.request.Request(f'{API}/rest/v1/goals?select=*&id=eq.{gid}', headers={'Authorization': 'Bearer ' + tok, 'apikey': 'x'})
    check(json.loads(urllib.request.urlopen(req).read()) == [], 'second user’s token gets nothing when requesting Ethan’s goal directly')
    req = urllib.request.Request(f'{API}/rest/v1/goals?id=eq.{gid}', method='PATCH', data=json.dumps({'title': 'hijacked'}).encode(),
                                 headers={'Authorization': 'Bearer ' + tok, 'apikey': 'x', 'Content-Type': 'application/json'})
    check(json.loads(urllib.request.urlopen(req).read()) == [], 'second user cannot modify Ethan’s goal through the API')

    # Export
    with laptop.expect_download() as dl:
        laptop.goto(BASE + '#/settings'); laptop.wait_for_timeout(400)
        laptop.get_by_role('button', name='Export JSON').click()
    data = json.loads(open(dl.value.path()).read())
    check(len(data['data']['goals']) >= 3 and 'routine_completions' in data['data'], 'export downloads a JSON file with all tables')

    check(not errors, f'no page errors {errors[:3]}')
    b.close()

failed = [m for ok, m in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} passed')
sys.exit(1 if failed else 0)
