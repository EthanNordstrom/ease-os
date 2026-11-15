"""Quick visual smoke run: screenshots of each page in demo mode at three widths."""
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
OUT = '/home/claude/shots'
import os; os.makedirs(OUT, exist_ok=True)
pages = ['today', 'calendar', 'goals', 'gym', 'routines', 'review', 'settings']
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    errors = []
    for w, h in [(390, 844), (768, 1024), (1440, 900)]:
        ctx = b.new_context(viewport={'width': w, 'height': h}, timezone_id='America/Los_Angeles', device_scale_factor=1, has_touch=w < 800)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        pg.goto(BASE); pg.wait_for_timeout(800)
        for name in pages:
            pg.goto(BASE + '#/' + name); pg.wait_for_timeout(400)
            over = pg.evaluate('document.documentElement.scrollWidth - window.innerWidth')
            if over > 0: errors.append(f'overflow {over}px on {name} @ {w}')
            pg.screenshot(path=f'{OUT}/{name}-{w}.png', full_page=True)
        ctx.close()
    b.close()
    print('\n'.join(errors) or 'no errors')
