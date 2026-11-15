"""A brand-new person on the production build: empty account, first-run setup,
theme toggle, password reset/change, erase data and delete account."""
import sys, time
from playwright.sync_api import sync_playwright
import csp

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4175/'
results = []
def check(c, m): results.append((bool(c), m)); print(('PASS ' if c else 'FAIL ') + m)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests'])
    ctx = b.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}, timezone_id='Europe/London', locale='en-GB', has_touch=True, is_mobile=True)
    csp.apply(ctx, BASE)
    pg = ctx.new_page(); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: 'Content Security Policy' in m.text and errors.append(m.text))

    pg.goto(BASE); pg.wait_for_timeout(1200)
    check(pg.get_by_text('Ease').first.is_visible() and pg.get_by_text('Ethan').count() == 0, 'sign-in screen shows neutral branding (no personal name)')
    # Forgot password flow
    pg.screenshot(path='/home/claude/shots/auth-390.png', full_page=True)
    pg.get_by_role('tab', name='Create account').click(); pg.wait_for_timeout(300)
    pg.get_by_label('Password', exact=True).fill('abc')
    check(pg.get_by_text('to go').is_visible(), 'sign-up shows a live password-length hint')
    pg.get_by_label('Password', exact=True).fill('')
    check(pg.get_by_role('button', name='Create account', exact=True).is_disabled(), 'sign-up button stays disabled until the form is valid')
    pg.get_by_role('tab', name='Sign in').click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='Forgot password?').click()
    pg.get_by_label('Email').fill('new@example.com'); pg.get_by_role('button', name='Send reset link').click(); pg.wait_for_timeout(800)
    check(pg.get_by_text('reset link is on its way').is_visible(), 'forgot-password sends a reset link (without revealing whether the email exists)')
    pg.get_by_role('button', name='Back to sign in').click()
    # Sign up
    pg.get_by_role('tab', name='Create account').click()
    pg.get_by_label('Email').fill('new@example.com'); pg.get_by_label('Password', exact=True).fill('firstpass123'); pg.get_by_label('Confirm password').fill('firstpass123')
    pg.get_by_role('button', name='Create account', exact=True).click(); pg.wait_for_timeout(2000)
    check(pg.get_by_role('heading', name='Welcome.').is_visible(), 'a new account starts at the welcome / setup screen')
    check(pg.get_by_label('Timezone').input_value() == 'Europe/London', 'timezone is pre-filled from the person’s device (not Brisbane)')
    pg.screenshot(path='/home/claude/shots/welcome-dark-390.png')
    pg.get_by_label('What should we call you?').fill('Sam')
    pg.get_by_role('button', name='Get started').click(); pg.wait_for_timeout(1500)
    check('Sam' in pg.locator('h1').first.inner_text(), 'greeting uses the name they chose')
    check(pg.get_by_text('No routine yet').is_visible() and pg.get_by_text('Get set up').is_visible(), 'Today is empty, with a routine prompt and a set-up checklist')
    body = pg.locator('main').inner_text()
    check(not any(x in body for x in ['Brush teeth', 'Morning routine', 'DnB', 'Studio session', 'Upper A']), 'no pre-existing routine, goals, events or workouts')
    pg.goto(BASE + '#/gym/exercises'); pg.wait_for_timeout(500)
    check(pg.locator('main ul li').count() == 0, 'exercise library starts empty')
    pg.goto(BASE + '#/goals'); pg.wait_for_timeout(400)
    check(pg.get_by_text('No active goals').is_visible(), 'goals start empty')

    # Create own routine from Today
    pg.goto(BASE + '#/today'); pg.wait_for_timeout(400)
    pg.get_by_role('button', name='Create a routine').click(); pg.wait_for_timeout(400)
    pg.get_by_label('Name').fill('Wake up')
    for step in ['Water', 'Stretch']:
        pg.get_by_label('New step').fill(step); pg.get_by_role('button', name='Add', exact=True).click()
    pg.get_by_role('button', name='Save routine').click(); pg.wait_for_timeout(500)
    pg.goto(BASE + '#/today'); pg.wait_for_timeout(500)
    check(pg.get_by_role('button', name='Water', exact=True).is_visible(), 'their own routine appears on Today')
    end = time.time() + 15
    while time.time() < end and pg.locator('[role=status]').first.inner_text().strip().lower() != 'saved': pg.wait_for_timeout(250)
    check(pg.locator('[role=status]').first.inner_text().strip().lower() == 'saved', 'routine saved to the database')

    # Theme toggle
    check(pg.evaluate("document.documentElement.dataset.theme") == 'dark', 'dark theme by default')
    pg.get_by_role('button', name='Switch to light mode').click(); pg.wait_for_timeout(300)
    bg = pg.evaluate("getComputedStyle(document.body).backgroundColor")
    check(pg.evaluate("document.documentElement.dataset.theme") == 'light' and bg == 'rgb(247, 247, 243)', f'toggle switches to light mode ({bg})')
    pg.reload(); pg.wait_for_timeout(1200)
    check(pg.evaluate("document.documentElement.dataset.theme") == 'light', 'light mode is remembered after reload')
    pg.screenshot(path='/home/claude/shots/today-light-390.png', full_page=True)
    over = pg.evaluate('document.documentElement.scrollWidth - innerWidth')
    check(over <= 0, 'no horizontal overflow in light mode')

    # Change password, sign out, sign in with new password
    pg.goto(BASE + '#/settings'); pg.wait_for_timeout(500)
    check(pg.get_by_role('radio', name='Light').get_attribute('aria-checked') == 'true', 'Settings shows the current theme')
    pg.get_by_role('button', name='Change password').click()
    pg.get_by_label('New password', exact=True).fill('secondpass456'); pg.get_by_label('Confirm new password').fill('secondpass456')
    pg.get_by_role('button', name='Save password').click(); pg.wait_for_timeout(800)
    pg.get_by_role('button', name='Sign out').click(); pg.wait_for_timeout(1200)
    check(pg.evaluate("Object.keys(localStorage).filter(k => k.startsWith('ep.cache')).length") == 0, 'signing out removes the offline copy of data from the device')
    pg.get_by_label('Email').fill('new@example.com'); pg.get_by_label('Password', exact=True).fill('secondpass456')
    pg.get_by_role('button', name='Sign in', exact=True).click(); pg.wait_for_timeout(2000)
    check(pg.get_by_role('button', name='Water', exact=True).is_visible(), 'changed password works and data is still there')

    # Sign out from the More menu (mobile)
    pg.goto(BASE + '#/today'); pg.wait_for_timeout(400)
    pg.get_by_role('button', name='More: routines, review, settings').click()
    pg.locator('[role=dialog]').get_by_role('button', name='Sign out').click()
    pg.locator('[role=dialog]').get_by_role('button', name='Sign out').last.click(); pg.wait_for_timeout(1500)
    check(pg.get_by_role('heading', name='Welcome back').is_visible(), 'Sign out in the mobile menu works (with a confirmation)')
    pg.get_by_label('Email').fill('new@example.com'); pg.get_by_label('Password', exact=True).fill('secondpass456')
    pg.get_by_role('button', name='Sign in', exact=True).click(); pg.wait_for_timeout(2000)

    # Erase data
    pg.goto(BASE + '#/settings'); pg.wait_for_timeout(500)
    pg.get_by_role('button', name='Erase all data').click()
    pg.get_by_role('button', name='Erase everything').click(); pg.wait_for_timeout(2500)
    check(pg.get_by_role('heading', name='Welcome.').is_visible(), 'erasing data returns to an empty account (welcome screen)')
    pg.get_by_role('button', name='Get started').click(); pg.wait_for_timeout(1200)
    check(pg.get_by_text('No routine yet').is_visible(), 'erased routine is gone')

    # Delete account
    pg.goto(BASE + '#/settings'); pg.wait_for_timeout(500)
    pg.get_by_role('button', name='Delete account', exact=True).click()
    pg.locator('[role=dialog]').get_by_role('button', name='Delete account').click(); pg.wait_for_timeout(2500)
    check(pg.get_by_role('heading', name='Welcome back').is_visible(), 'deleting the account signs out')
    pg.get_by_label('Email').fill('new@example.com'); pg.get_by_label('Password', exact=True).fill('secondpass456')
    pg.get_by_role('button', name='Sign in', exact=True).click(); pg.wait_for_timeout(1200)
    check(pg.get_by_text('Invalid login credentials').is_visible(), 'deleted account can no longer sign in')

    check(not errors, f'no page or security-policy errors {errors[:2]}')
    b.close()
failed = [m for ok, m in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} passed'); sys.exit(1 if failed else 0)
