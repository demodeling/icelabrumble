# CLAUDE.md — house rules for working on Swebits Rumble

## What this is
A single-page HTML5 canvas fighting game (Swebits crew vs a false-positive rhino), deployed to GitHub Pages by the workflow in `.github/workflows/pages.yml`.

## Layout
- `src/index.html` — the whole game (CSS + JS in one file). The token `__VIDEOS__` is replaced by `tools/build.py`; never hardcode it.
- `src/sw.js`, `src/manifest.webmanifest`, `src/icons/` — installable web-app bits. `__VERSION__` in sw.js is replaced at build time.
- `assets/videos/<fighter>.mp4` — the nine 20 s clips (640x360). Regenerate with `tools/video/render_all.sh`.
- `tools/build.py` — assembles `dist/`. `--inline` embeds the videos as base64 (single-file build for claude.ai artifacts).
- `tests/smoke.spec.js` — Playwright smoke test. Keep it green.

## How to work
1. `npm install && npx playwright install chromium` once.
2. Edit `src/index.html`. Run `npm test` (builds, then tests). Run `npm run serve` and open http://localhost:8000 to play.
3. Commit to `main` and push; the Action tests, builds and deploys. The live site updates in 1–2 minutes.

## Rules of thumb
- Safari first: no optional chaining or `??` in page JS, Web Audio only after a user gesture (`unlockAudio()`), pointer events for touch buttons.
- Keep `dist/` out of git; it is a build product.
- Levels live in the `LEVELS` array (theme, rhino HP, `mutant` behaviours, intro card text); `LEVEL` is the current index. Round 2 = wasteland theme, feints, hot spots, radiation burst, CRT overlay.
- Fighters live in the `ROSTER` array; looks in `LOOK`; specials in `specialUpdate()`; rhino behaviour in `updateRhino()`.
- Adding a fighter: ROSTER entry + LOOK entry + a video (`CHAR=<id> tools/video/render_cutout.py` after adding the sprite via `export_sprites.js`) + the test count in `tests/smoke.spec.js`.
- Scores: `Scores` adapter (`load()` / `add(entry)`) — swap its body to point at a backend; keep the localStorage fallback.
- Never commit photos of people to the repo; the cutout faces are procedural on purpose.
