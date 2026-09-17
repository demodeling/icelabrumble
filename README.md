# Swebits Cutout Rumble

An airborne eDNA sampler in Kiruna reported a rhino. One read, 98.7 % match. Somebody has to remove it from the dataset by hand.

A single-page HTML5 canvas fighter: pick one of the nine Swebits crew members, dodge the charge, duck the horn, fill the meter, land your special (Godzilla Smash, Babysitter Mode, Finger Guns…) and watch the false positive explode into DNA. Works in Safari, Chrome, iPhone, iPad and desktop; installable as a home-screen app; keyboard or touch.

## Put it on GitHub Pages (5 minutes)

1. Create a new repository on GitHub (public is simplest for Pages). Do not add a README — this folder has one.
2. In this folder:
   ```sh
   git init
   git add .
   git commit -m "Swebits Cutout Rumble"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. The workflow **Build, test and deploy to GitHub Pages** runs on every push to `main` (test → build → deploy). The game appears at `https://<you>.github.io/<repo>/` after the first run (1–3 minutes). Check the **Actions** tab if it does not.

## Develop locally

```sh
npm install
npx playwright install chromium   # once, for the tests
npm test                          # builds dist/ and runs the smoke tests
npm run serve                     # http://localhost:8000
```

Edit `src/index.html` — everything (CSS, JS, fighters, rhino AI, sound) is in that one file. `CLAUDE.md` has the map and the house rules for working on it with Claude Code: open the folder in Claude Code, describe the change, let it edit/test/commit, push, and Pages redeploys.

## Rounds

Round 1 is the Kiruna snowfield. Beat it and Round 2 opens: the Wasteland, where the reference genome is contaminated — a mutant rhino that feints before charging, leaves radioactive hot spots when it skids, and vents radiation up close. Tick *Start at Round 2* on the fighter screen to jump straight there.

## Controls

Keyboard: ← → / A D move · ↑ / W / space jump · ↓ / S duck · **J** punch · **K** kick · **L** special (meter full). Z / X / C also work. Touch devices get on-screen buttons; ⛶ FULLSCREEN gives a widescreen arena on phones.

## Videos

`assets/videos/<fighter>.mp4` are the 20-second "False positive" clips, one per fighter, rendered by `tools/video/render_all.sh` (Python 3 + Pillow + numpy + ffmpeg; the face sprites come from the game's own drawing code via `export_sprites.js`, which needs Playwright). `assets/trailer/trailer.mp4` is the 20-second trailer.

## High scores

Stored per device (localStorage) for now. `Scores` in `src/index.html` has `load()` and `add(entry)`; point them at a Supabase table (or any tiny endpoint) for a shared leaderboard. See the roadmap for options.

## Credits

Made by the Swebits crew with Claude. The rhino was a false positive. No rhinos were harmed.
