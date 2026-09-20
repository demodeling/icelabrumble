# Swebits Rumble

An airborne eDNA sampler in Kiruna reported a rhino. One read, 98.7 % match. Somebody has to remove it from the dataset by hand.

A single-page HTML5 canvas fighter: pick one of the eleven Swebits crew members, dodge the charge, duck the horn, fill the meter, land your special (Godzilla Smash, Babysitter Mode, Finger Guns…) and watch the false positive explode into DNA. Works in Safari, Chrome, iPhone, iPad and desktop; installable as a home-screen app; keyboard or touch.

## Put it on GitHub Pages

The repository page on github.com only ever shows this README — that is normal. The playable game is served by **GitHub Pages** at a different address:

    https://<your-username>.github.io/<repo-name>/

Two ways to switch it on. Either works; A is automatic, B needs no Actions at all.

**A. GitHub Actions (recommended — rebuilds on every push)**

1. Push this folder to a new repository (`git init`, `git add .`, `git commit -m "Swebits Rumble"`, `git branch -M main`, `git remote add origin …`, `git push -u origin main`).
2. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Open the **Actions** tab. The workflow *Build, test and deploy to GitHub Pages* should be running (or run it with *Run workflow* if it isn't). It takes 2–4 minutes the first time because it installs a browser for the tests.
4. When the job is green, the game is at `https://<your-username>.github.io/<repo-name>/`. The Actions run also prints the URL under the *deploy* job.

**B. Deploy from a branch (no Actions)**

The `docs/` folder in this repo is a pre-built copy of the game.

1. **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main`, Folder: `/docs` → Save**.
2. Wait a minute; the game is at `https://<your-username>.github.io/<repo-name>/`.
3. After changing `src/`, run `python3 tools/build.py --docs` and commit `docs/` again.

If the page shows a 404 for a few minutes after enabling, that is GitHub warming up — reload. If the Actions tab says workflows are disabled for the repository, use option B or enable them under **Settings → Actions → General**.

## Develop locally

```sh
npm install
npx playwright install chromium   # once, for the tests
npm test                          # builds dist/ and runs the smoke tests
npm run serve                     # http://localhost:8000
```

Edit `src/index.html` — everything (CSS, JS, fighters, rhino AI, sound) is in that one file. `CLAUDE.md` has the map and the house rules for working on it with Claude Code: open the folder in Claude Code, describe the change, let it edit/test/commit, push, and Pages redeploys.

## Rounds

Round 1 is the Kiruna snowfield. Beat it and Round 2 opens: the Wasteland, where the reference genome is contaminated — a mutant rhino that feints before charging, leaves radioactive hot spots when it skids, and vents radiation up close. Beat that and Round 3 opens: the Asteroid — low gravity, a helmeted space rhino with a horn laser and a jetpack stomp, drifting into the wrong sample (index hopping). Round 4 is the Duplicates: the same read sequenced twice (a PCR duplicate), so two rhinos on a field twice as wide, with the camera following you. Round 5 is Compositional: a rhino, a zebra and you share one ring and your sizes always add up to one — whoever takes damage shrinks and everyone else grows, and a false positive is gone once its share drops below the detection limit (6 %). Outlast that round for a minute without hitting anything and they turn out to be a brown bear and a moose. Use *Start at* on the fighter screen to jump straight to any round.

**Versus (beta).** *VERSUS* on the title screen puts two humans in one arena, and either side can play **the rhino** — punch is the horn sweep, kick paws the ground and charges, the special is a jet stomp. Same keyboard: player 1 on the arrows plus J/K/L, player 2 on W/A/S/D plus F/G/H. Or type the same room code on two devices and pick on the fighter screen, where a twelfth card appears for the rhino. Five arenas: Kiruna, the Wasteland, the Asteroid (low gravity), the Wide Field (twice as wide, the camera follows) and Compositional, where the two of you share one ring, your sizes always add up to one, every hit moves size from whoever takes it to whoever lands it, and a side below the 6 % detection limit is out. A duel is 99 seconds; if nobody is knocked out, whoever holds the bigger share of their own bar wins. Versus results are never saved to the leaderboard.

## Co-op

**CO-OP** on the title screen: both players type the same room code (say `kiruna`), pick a fighter and press READY. The two browsers connect directly over WebRTC using [Trystero](https://github.com/dmotz/trystero) (bundled in `src/vendor/trystero.js`, loaded only when you use co-op; signalling goes over public Nostr relays, so there is nothing to host). If direct peer-to-peer traffic is blocked (eduroam and many office networks do that), the game falls back to a relay through the project's Supabase Realtime channel, which is a plain WebSocket. The peer with the lower id hosts: it runs the fight for both and streams snapshots 30 times a second (20 over the relay), the guest sends inputs. The rhino goes for whoever is closest; the round is lost only when both are down. The host picks the round and starts rematches.

## Controls

Keyboard: ← → / A D move · ↑ / W / space jump · ↓ / S duck · **J** punch · **K** kick · **L** special (meter full). Z / X / C also work. Touch devices get on-screen buttons; ⛶ FULLSCREEN gives a widescreen arena on phones.

## Videos

`assets/videos/<fighter>.mp4` are the 20-second "False positive" clips, one per fighter, rendered by `tools/video/render_all.sh` (Python 3 + Pillow + numpy + ffmpeg; the face sprites come from the game's own drawing code via `export_sprites.js`, which needs Playwright). `assets/videos/intro.mp4` is the menu clip behind the ▶ FALSE POSITIVE? button (the crew member looks back, walks on, touches the rhino and it turns out to be a zebra), rendered by `tools/video/render_intro.sh`. `assets/trailer/trailer.mp4` is the 20-second trailer.

## High scores

Shared leaderboard in a free Supabase table (`scores`: name, fighter, score, time_s, level, created_at). The page inserts with the project's publishable key and reads the top 25; row-level security allows nothing else, and a **report** button next to each entry hides it for everyone (`report_score()`). The schema is in `supabase/migrations/`; the project URL and key are the `SUPA` constants at the top of the `Scores` adapter in `src/index.html`. If the table cannot be reached the page falls back to this device's localStorage.

## Credits

Made by the Swebits crew with Claude. The rhino was a false positive. No rhinos were harmed.
