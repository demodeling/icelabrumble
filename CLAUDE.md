# CLAUDE.md — house rules for working on Swebits Rumble

## What this is
A single-page HTML5 canvas fighting game (Swebits crew vs a false-positive rhino), deployed to GitHub Pages by the workflow in `.github/workflows/pages.yml`.

## Layout
- `src/index.html` — the whole game (CSS + JS in one file). The tokens `__VIDEOS__`, `__APPVER__` (package.json version, shown on the title screen) and `__VERSION__` (git hash) are replaced by `tools/build.py`; never hardcode them. Bump `"version"` in `package.json` when releasing.
- `src/vendor/trystero.js` — Trystero (WebRTC + Nostr signalling) bundled as one ES module for co-op; regenerate with `npm run vendor`. Imported on demand by `netTransport()`.
- `src/sw.js`, `src/manifest.webmanifest`, `src/icons/` — installable web-app bits. `__VERSION__` in sw.js is replaced at build time. The page, scripts and manifest are network-first (cache = offline fallback); videos/icons cache-first. The page reloads itself once when a new worker takes over while on the title screen.
- `assets/videos/<fighter>.mp4` — the eleven 20 s clips (640x360). Regenerate with `tools/video/render_all.sh`. `assets/videos/intro.mp4` is the menu clip ("False positive: a real sequence, the wrong label", rhino turns into a zebra) from `tools/video/render_intro.sh`; `tools/build.py` copies `CLIPS` = fighters + intro.
- `tools/build.py` — assembles `dist/`. `--inline` embeds the videos as base64 (single-file build for claude.ai artifacts).
- `tests/smoke.spec.js` — Playwright smoke test. Keep it green.

## How to work
1. `npm install && npx playwright install chromium` once.
2. Edit `src/index.html`. Run `npm test` (builds, then tests). Run `npm run serve` and open http://localhost:8000 to play.
3. Commit to `main` and push; the Action tests, builds and deploys. The live site updates in 1–2 minutes.

## Rules of thumb
- Safari first: no optional chaining or `??` in page JS, Web Audio only after a user gesture (`unlockAudio()`), pointer events for touch buttons.
- Keep `dist/` out of git; it is a build product. `docs/` IS committed: it is the pre-built copy for branch-based GitHub Pages — rebuild it with `python3 tools/build.py --docs` when you change `src/`.
- Levels live in the `LEVELS` array (theme, rhino HP, `mutant` behaviours, intro card text); `LEVEL` is the current index. Round 2 = wasteland theme, feints, hot spots, radiation burst, CRT overlay. Round 3 = space theme (`gravity: .5`), horn laser bolts (`bolts`), jet-stomp with landing ring, helmets.
- Hidden pacifist ending: survive `pacifistTime()` (60 s in round 1, +30 s per round) with zero hits landed and `rhinoReveal()` turns the rhino into a tapir/horse/zebra (`ANIMALS`, states `morph` → `graze` → `trot`). `#pacifist=<seconds>` in the URL shortens the timer for testing.
- Fighters live in the `ROSTER` array; looks in `LOOK`; specials in `specialUpdate()`; rhino behaviour in `updateRhino()`.
- Adding a fighter: ROSTER entry + LOOK entry + a video (`CHAR=<id> tools/video/render_cutout.py` after adding the sprite via `export_sprites.js`) + the test count in `tests/smoke.spec.js`.
- Co-op: `Net` + `coopJoin()` / `netData()` (host = lower peer id). The host runs `hostTick()` → `update()` with `G.players` = [host, guest] (guest inputs arrive as `{t:'in'}`), and `sendSnap()` every 2nd frame; the guest runs `guestTick()` and `applySnap()`. Sounds are relayed through `Net.sfxQ`. Trystero is imported from `TRYSTERO_URL` (`./vendor/trystero.js`) on demand with `relayConfig.redundancy` 10 and `TURN_SERVERS` (public open relay) for NAT traversal; the fighter-screen status line shows connected relays and join errors; tests inject `window.__coopTransport` instead. Anything that hits or targets a player must loop over `G.players` (see `rhinoTarget()`, `hitPlayer(p, …)`).
- Scores: `Scores` adapter (`load()` / `add(entry)` / `report(entry)`) talks to the Supabase `scores` table via REST (`SUPA` constants; schema in `supabase/migrations/`, insert-only under RLS, `report_score()` hides an entry). localStorage is the fallback when the table is unreachable. `board` caches the last list for the title-screen best and the roster cards.
- Never commit photos of people to the repo; the cutout faces are procedural on purpose.
