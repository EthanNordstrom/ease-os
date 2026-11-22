"""Press every non-destructive control on every screen (phone + desktop) and report any crash or error."""
import re, sys
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
ROUTES = ['today', 'calendar', 'food', 'food/foods', 'food/plans', 'food/weight', 'shopping', 'goals', 'gym', 'gym/templates',
          'gym/exercises', 'gym/history', 'gym/progress', 'routines', 'review', 'settings']
SKIP = re.compile(r'delete|erase|remove|sign out|clear|reset|discard|finish|trash|undo|dismiss|start|resume|log a set|got |untick|log set', re.I)
problems, clicks = [], 0
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for w, h in [(390, 844), (1440, 900)]:
        pg = b.new_context(viewport={'width': w, 'height': h}, reduced_motion='reduce', timezone_id='Australia/Brisbane', has_touch=w < 800).new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        pg.goto(BASE); pg.wait_for_timeout(1200)
        for r in ROUTES:
            pg.goto(BASE + '#/' + r); pg.wait_for_timeout(400)
            n = pg.locator('main button:visible').count()
            for i in range(n):
                pg.goto(BASE + '#/' + r); pg.wait_for_timeout(120)
                btns = pg.locator('main button:visible')
                if i >= btns.count(): break
                el = btns.nth(i)
                name = (el.get_attribute('aria-label') or el.inner_text() or '').strip()[:40]
                if SKIP.search(name) or el.is_disabled(): continue
                try:
                    el.click(timeout=1500); clicks += 1
                except Exception:
                    continue
                pg.wait_for_timeout(150)
                if pg.locator('#root').inner_html().strip() == '':
                    problems.append(f'blank screen after "{name}" on {r} @{w}')
                for _ in range(3):
                    if pg.locator('[role=dialog]').count() == 0: break
                    pg.keyboard.press('Escape'); pg.wait_for_timeout(80)
                if errs:
                    problems.append(f'error after "{name}" on {r} @{w}: {errs[:1]}'); errs.clear()
            over = pg.evaluate('document.documentElement.scrollWidth - innerWidth')
            if over > 0: problems.append(f'overflow {over}px on {r} @{w}')
        pg.context.close()
    b.close()
print(f'clicked {clicks} controls')
print('\n'.join(problems) or 'no problems found')
