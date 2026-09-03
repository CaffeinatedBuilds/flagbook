#!/bin/sh
# Bundle the app into one self-contained HTML file (dist/flagbook.html) that can be
# AirDropped / emailed and opened directly in Safari, no server needed.
set -e
cd "$(dirname "$0")/.."
mkdir -p dist
python3 - <<'PY'
import re, base64, pathlib
root = pathlib.Path('.')
html = (root / 'index.html').read_text()
css = (root / 'css/app.css').read_text()
html = re.sub(r'<link rel="stylesheet" href="css/app.css">', lambda m: '<style>\n' + css + '\n</style>', html)
def inline_js(m):
    src = m.group(1)
    return '<script>\n' + (root / src).read_text() + '\n</script>'
html = re.sub(r'<script src="([^"]+)"></script>', inline_js, html)
icon = base64.b64encode((root / 'icons/apple-touch-icon.png').read_bytes()).decode()
html = html.replace('href="icons/apple-touch-icon.png"', f'href="data:image/png;base64,{icon}"')
html = html.replace('href="icons/icon-192.png"', f'href="data:image/png;base64,{icon}"')
html = re.sub(r'<link rel="manifest"[^>]*>\n?', '', html)
(root / 'dist/flagbook.html').write_text(html)
print('wrote dist/flagbook.html', len(html), 'bytes')
PY
