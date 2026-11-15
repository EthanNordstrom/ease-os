"""Desktop layout checks: dialogs centred with a full-screen backdrop, centred pages, accent colour."""
import sys
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
results = []
def check(c, m): results.append((bool(c), m)); print(('PASS ' if c else 'FAIL ') + m)

def dialog_ok(pg, label):
    pg.wait_for_timeout(500)
    d = pg.locator('[role=dialog]').last.bounding_box()
    back = pg.locator('[role=dialog]').last.locator('xpath=preceding-sibling::div[1]').bounding_box()
    vw, vh = 1440, 900
    centred = abs((d['y'] + d['height'] / 2) - vh / 2) < 40 and abs((d['x'] + d['width'] / 2) - vw / 2) < 40
    full = back['x'] <= 0 and back['y'] <= 0 and back['width'] >= vw and back['height'] >= vh
    check(centred and full, f'{label}: centred pop-up over a full-screen backdrop')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_context(viewport={'width': 1440, 'height': 900}, timezone_id='Australia/Brisbane').new_page()
    pg.goto(BASE); pg.wait_for_timeout(900)
    pg.screenshot(path='/home/claude/shots/intro-1440.png')
    check(pg.locator('[role=presentation]').count() == 1, 'startup animation plays when the app opens')
    pg.wait_for_timeout(1900)
    check(pg.locator('[role=presentation]').count() == 0, 'startup animation clears itself after about 2 seconds')
    pg.reload(); pg.wait_for_timeout(500)
    check(pg.locator('[role=presentation]').count() == 0, 'it does not replay on every refresh in the same session')

    pg.goto(BASE + '#/routines/new'); dialog_ok(pg, 'New routine')
    pg.screenshot(path='/home/claude/shots/dialog-routine-1440.png'); pg.keyboard.press('Escape')
    pg.goto(BASE + '#/gym/exercises'); pg.wait_for_timeout(500)
    pg.get_by_role('button', name='New exercise').click(); dialog_ok(pg, 'New exercise'); pg.keyboard.press('Escape')
    pg.goto(BASE + '#/gym/templates'); pg.wait_for_timeout(500)
    pg.get_by_role('button', name='New template').click(); dialog_ok(pg, 'New template')
    pg.get_by_role('button', name='Add exercise').click(); dialog_ok(pg, 'Add exercise (inside template)'); pg.keyboard.press('Escape'); pg.keyboard.press('Escape')
    pg.goto(BASE + '#/today'); pg.wait_for_timeout(500)
    pg.get_by_role('button', name='Start', exact=True).click(); pg.wait_for_timeout(600)
    pg.get_by_role('button', name='Add exercise').click(); dialog_ok(pg, 'Add exercise (during workout)')
    pg.screenshot(path='/home/claude/shots/dialog-exercise-1440.png'); pg.keyboard.press('Escape')
    pg.get_by_role('button', name='Log set 1').first.click(); pg.wait_for_timeout(400)
    t = pg.get_by_role('timer').bounding_box()
    check(t and t['y'] + t['height'] >= 899, 'rest timer is pinned to the bottom of the screen')

    for route, name in [('review', 'Weekly review'), ('settings', 'Settings')]:
        pg.goto(BASE + '#/' + route); pg.wait_for_timeout(600)
        main = pg.locator('main').bounding_box()
        box = pg.locator('main .max-w-3xl').first.bounding_box()
        left, right = box['x'] - main['x'], (main['x'] + main['width']) - (box['x'] + box['width'])
        check(abs(left - right) < 4, f'{name} is centred ({left:.0f}px / {right:.0f}px)')

    # Accent colour
    pg.goto(BASE + '#/settings'); pg.wait_for_timeout(500)
    pg.get_by_role('radio', name='Teal').click(); pg.wait_for_timeout(300)
    acid = pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--acid').trim()")
    check(acid and acid != '185 219 110', f'choosing an accent changes the colour ({acid})')
    pg.reload(); pg.wait_for_timeout(100)
    early = pg.evaluate("document.documentElement.style.getPropertyValue('--acid').trim()")
    check(early == acid, 'accent is applied immediately on reload (no flash)')
    pg.wait_for_timeout(800)
    pg.screenshot(path='/home/claude/shots/accent-teal-settings-1440.png')
    pg.get_by_role('radio', name='Light').click(); pg.wait_for_timeout(300)
    lacid = pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--acid').trim()")
    r, g, bl = [int(x) for x in lacid.split()]
    def L(c):
        c /= 255; return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    lum = 0.2126 * L(r) + 0.7152 * L(g) + 0.0722 * L(bl)
    check(1.05 / (lum + 0.05) >= 4.5, f'accent in light mode stays readable on white (contrast {1.05 / (lum + 0.05):.1f}:1)')
    pg.screenshot(path='/home/claude/shots/accent-teal-light-1440.png')
    pg.get_by_role('radio', name='Acid (default)').click(); pg.get_by_role('radio', name='Dark').click(); pg.wait_for_timeout(200)
    check(pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--acid').trim()") == '185 219 110', 'default accent can be restored')
    b.close()
failed = [m for ok, m in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} passed'); sys.exit(1 if failed else 0)
