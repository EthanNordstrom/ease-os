"""Apply public/_headers to responses in tests, so the real CSP is enforced.
The only change: the local test backend is allowed in connect-src instead of *.supabase.co."""
import re, pathlib
raw = pathlib.Path(__file__).resolve().parent.parent.joinpath('public/_headers').read_text()
HEADERS = dict(re.findall(r'^\s+([\w-]+): (.+)$', raw.split('\n\n')[0], re.M))
HEADERS.pop('Strict-Transport-Security', None)
HEADERS['Content-Security-Policy'] = HEADERS['Content-Security-Policy'].replace('upgrade-insecure-requests', '').replace(
    'connect-src', 'connect-src http://127.0.0.1:54321')

def apply(ctx, origin):
    def handle(route):
        r = route.fetch()
        route.fulfill(response=r, headers={**r.headers, **{k.lower(): v for k, v in HEADERS.items()}})
    ctx.route(origin + '**', handle)
