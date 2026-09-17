#!/usr/bin/env python3
"""Assemble the deployable site into dist/.

  python3 tools/build.py            -> dist/ with videos served as files (GitHub Pages)
  python3 tools/build.py --inline   -> dist/index.html with the videos embedded as base64 (single-file build, e.g. for a claude.ai artifact)
"""
import base64, json, os, shutil, subprocess, sys, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, DIST, VIDS = os.path.join(ROOT, 'src'), os.path.join(ROOT, 'dist'), os.path.join(ROOT, 'assets', 'videos')
FIGHTERS = ['albertas', 'bjorn', 'bea', 'annamia', 'per', 'marco', 'jose', 'mike', 'daniel']
inline = '--inline' in sys.argv
try:
    version = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT, stderr=subprocess.DEVNULL).decode().strip()
except Exception:
    version = time.strftime('%Y%m%d%H%M%S')
shutil.rmtree(DIST, ignore_errors=True)
shutil.copytree(SRC, DIST)
html = open(os.path.join(SRC, 'index.html'), encoding='utf-8').read()
if inline:
    data = {c: base64.b64encode(open(os.path.join(VIDS, c + '.mp4'), 'rb').read()).decode() for c in FIGHTERS}
    html = html.replace('__VIDEOS__', json.dumps({'mode': 'inline', 'data': data}))
else:
    os.makedirs(os.path.join(DIST, 'assets', 'videos'))
    for c in FIGHTERS:
        shutil.copy(os.path.join(VIDS, c + '.mp4'), os.path.join(DIST, 'assets', 'videos', c + '.mp4'))
    html = html.replace('__VIDEOS__', json.dumps({'mode': 'files', 'base': 'assets/videos/'}))
html = html.replace('__VERSION__', version)
open(os.path.join(DIST, 'index.html'), 'w', encoding='utf-8').write(html)
sw = open(os.path.join(SRC, 'sw.js')).read().replace('__VERSION__', version)
open(os.path.join(DIST, 'sw.js'), 'w').write(sw)
open(os.path.join(DIST, '.nojekyll'), 'w').write('')
print('built dist/ (version %s, %s videos)' % (version, 'inline' if inline else 'files'))
