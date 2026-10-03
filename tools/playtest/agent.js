#!/usr/bin/env node
// One play-test agent: a bot that plays the built game (dist/) in a headless browser and writes down what it saw.
//
//   node tools/playtest/agent.js <0-9> [outDir]
//
// Agents 0-7 are brawlers, one per fighter on the bench, each playing all thirteen rounds (a lost round gets one
// REMATCH; even agents sit out the fast part of round 13, odd ones rush it). Agent 8 never lands a hit and waits for
// the pacifist endings. Agent 9 is the monkey: random keys, random menus, RANDOM LEVEL, resizes. Every agent listens
// for page errors and checks the fight every tick (numbers finite, health inside its bar, round 5 summing to one,
// a result screen after every bell), and writes agent-<n>.json. Nothing reaches the leaderboard: the network is cut,
// so the one score each brawler saves lands in that browser's own storage — which is how the DATE column is checked.
//
// Env: PLAYTEST_SPEED   game seconds per wall second, 1-3 (default 3: every frame is the game's largest step, 50 ms)
//      PLAYTEST_CAP     game seconds a round may take before it is written down as a timeout (default 150)
//      PLAYTEST_ROUNDS  rounds to play, e.g. "1,13" (default: all)
//      PLAYTEST_CHANNEL an installed browser to use instead of Playwright's Chromium, e.g. "chrome"
//      PLAYTEST_MONKEY  wall seconds the monkey runs (default 180)
//      PLAYTEST_TWEAK   JavaScript run in the page at every bell, to try a balance change before it goes into the game,
//                       e.g. "Object.assign(__duel().cfg, {t0: 1.5})"
const { chromium } = require('@playwright/test');
const fs = require('fs'), path = require('path');

const N = parseInt(process.argv[2], 10);
if (!(N >= 0 && N <= 9)) { console.error('usage: node tools/playtest/agent.js <0-9> [outDir]'); process.exit(2); }
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '..', '..', 'test-results', 'playtest'));
const SPEED = Math.max(1, Math.min(3, parseFloat(process.env.PLAYTEST_SPEED || '3')));
const CAP = parseFloat(process.env.PLAYTEST_CAP || '150');
const MONKEY_S = parseFloat(process.env.PLAYTEST_MONKEY || '180');
const POLICY = N < 8 ? 'brawler' : N === 8 ? 'pacifist' : 'monkey';
const FIGHTER = N < 8 ? N : 1;                       // the pacifist and the monkey start as June
const PACIFIST_S = 15;                               // the pacifist agent shortens the wait (a LOCAL_BUILD debug hook)
const URL = 'file://' + path.resolve(__dirname, '..', '..', 'dist', 'index.html') + (POLICY === 'pacifist' ? '#pacifist=' + PACIFIST_S : '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
// a small seeded generator, so a run can be repeated
let seed = 1234567 + N * 7919;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];

const report = { agent: N, policy: POLICY, speed: SPEED, cap: CAP, started: new Date().toISOString(), rounds: [], anomalies: [], errors: [], consoleErrors: [], savedScore: null };
const anomaly = (what, where) => { if (report.anomalies.length < 200) report.anomalies.push({ what, where: where || '' }); };

// ---------------------------------------------------------------- what the bot sees
// one round trip per tick: the fight as plain numbers, plus the invariants checked where the objects are
const SNAP = () => {
  const g = window.__fight(), scene = document.body.getAttribute('data-scene');
  if (!g) return { scene };
  const L = window.__level(), lv = window.__levels()[L], P = g.p, bad = [];
  const all = g.players.concat(g.rhinos);
  all.forEach((e, i) => {
    const who = (e.isRhino ? 'rhino' : e.def.name) + '#' + i;
    ['x', 'hp'].concat(e.isRhino ? ['jump'] : ['y', 'meter']).forEach(k => { if (!isFinite(e[k])) bad.push(who + '.' + k + ' = ' + e[k]); });
    if (e.hp < -0.01 || e.hp > e.maxhp + 0.01) bad.push(who + '.hp ' + e.hp + ' outside 0..' + e.maxhp);
    if (!e.isRhino && (e.meter < 0 || e.meter > 100)) bad.push(who + '.meter ' + e.meter);
  });
  if (g.comp) { const sum = all.reduce((a, c) => a + (c.share || 0), 0); if (Math.abs(sum - 1) > 0.02) bad.push('round-5 shares sum to ' + sum.toFixed(3)); }
  if (!isFinite(g.elapsed) || !isFinite(g.t)) bad.push('clock ' + g.elapsed + ' / ' + g.t);
  const ent = e => ({ x: e.x, y: e.y || 0, z: e.z || 0, hp: e.hp, maxhp: e.maxhp, state: e.state, st: e.st, facing: e.facing, meter: e.meter || 0, size: e.size || 1, rhino: !!e.isRhino });
  return { scene, level: L, over: g.over, won: g.won, pacifist: !!g.pacifist, elapsed: g.elapsed, bad,
    me: ent(P), hits: P.hitsLanded, foes: (g.duel ? [g.sides[1]] : g.rhinos).map(ent), aw: lv.width || 960, tempo: g.duel ? g.sides[1].tempo : null,
    flags: { push: !!g.push, buns: !!g.buns, square: !!g.square, island: !!lv.island, depth: !!lv.depth, duel: !!g.duel },
    push: g.push ? { stage: P.pu.stage, pos: P.pu.pos, lock: P.pu.lock, seq: window.__push().seq(P.pu.stage).seq } : null };
};

// ---------------------------------------------------------------- what the bot does
// keys to hold this tick and keys to tap; `mem` is the bot's own memory for the round
function decide(s, mem, pacifist) {
  const me = s.me, hold = new Set(), tap = [], now = Date.now();
  const live = s.foes.filter(f => f.state !== 'ko' && f.state !== 'gone');
  if (!live.length || me.state === 'ko' || s.over) return { hold, tap };
  if (s.push) {   // round 7: type the repeat, one arrow per letter, never while locked out
    const key = { A: 'ArrowLeft', T: 'ArrowRight', C: 'ArrowUp', G: 'ArrowDown' }[s.push.seq[s.push.pos]], at = s.push.stage + ':' + s.push.pos;
    if (s.push.lock <= 0 && (mem.at !== at || now - mem.typed > 400)) { tap.push(key); mem.at = at; mem.typed = now; }
    return { hold, tap };
  }
  const isle = s.flags.island, dist = f => Math.abs(f.x - me.x) + (isle ? Math.abs(f.z - me.z) : 0);
  const foe = live.reduce((a, b) => (dist(a) <= dist(b) ? a : b));
  const dx = foe.x - me.x, adx = Math.abs(dx), dz = foe.z - me.z, dir = dx >= 0 ? 1 : -1;
  const toward = dir > 0 ? 'ArrowRight' : 'ArrowLeft', away = dir > 0 ? 'ArrowLeft' : 'ArrowRight', jump = isle ? ' ' : 'ArrowUp';
  const facesMe = foe.facing === -dir;
  // how far out a swing still lands: a rhino's body is long (2.55 units to the horn, 1.6 to the tail), a fighter's is not
  const reach = s.flags.buns ? 400 : foe.rhino ? (facesMe ? 2.55 : 1.6) * 84 * foe.size + 62 : 108;
  const hop = () => { if (me.y <= 0 && now - (mem.jumped || 0) > 450) { tap.push(jump); mem.jumped = now; } };
  if ((foe.state === 'charge' && adx < 340) || (foe.state === 'zcharge' && adx < 150 && foe.z < 260)) hop();
  if (pacifist) {
    // never swing: keep clear of it, walk through it when cornered, and on the island stay off its line
    if (isle) { if (Math.abs(dz) < 190) hold.add(dz > 0 ? 'ArrowDown' : 'ArrowUp'); }
    if (mem.cross && now < mem.cross.until) hold.add(mem.cross.key);
    else if (adx < 400) {
      const cornered = !s.flags.square && !isle && (dir > 0 ? me.x < 150 : me.x > s.aw - 150);
      if (cornered) { mem.cross = { key: toward, until: now + 900 }; hold.add(toward); } else hold.add(away);
    }
    return { hold, tap };
  }
  if (s.flags.depth && foe.z > 70) { if (adx < 150) hold.add(away); return { hold, tap }; }   // round 10: out of reach — get out of its lane
  if (s.flags.duel && mem.patient && s.tempo > 1) {   // round 13: let him tire first — keep away, and go past him when the wall is close
    if (mem.cross && now < mem.cross.until) hold.add(mem.cross.key);
    else if (adx < 330) { if (dir > 0 ? me.x < 170 : me.x > s.aw - 170) { mem.cross = { key: toward, until: now + 500 }; hold.add(toward); hop(); } else hold.add(away); }
    return { hold, tap };
  }
  if (isle && Math.abs(dz) > 50) hold.add(dz > 0 ? 'ArrowUp' : 'ArrowDown');
  if (foe.state === 'horn' && facesMe && adx < reach + 70 && !isle) { hold.add('ArrowDown'); return { hold, tap }; }   // duck the sweep
  if (adx > reach) hold.add(toward); else if (!foe.rhino && adx < 60) hold.add(away);
  if (adx <= reach + 20 && (!isle || Math.abs(dz) < 80) && ['idle', 'walk', 'duck'].indexOf(me.state) >= 0)
    tap.push(me.meter >= 100 ? 'l' : (mem.n = (mem.n || 0) + 1) % 3 ? 'j' : 'k');
  return { hold, tap };
}

(async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYTEST_CHANNEL || undefined, args: ['--mute-audio'] });
  const context = await browser.newContext({ viewport: { width: 1100, height: 720 } });
  await context.route(u => ['file:', 'data:', 'blob:'].indexOf(u.protocol) < 0, r => r.abort());   // no leaderboard, no relay, no fonts: the game alone
  const page = await context.newPage();
  page.on('pageerror', e => { if (report.errors.length < 50) report.errors.push(String(e.stack || e.message).slice(0, 600)); });
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text()) && report.consoleErrors.length < 50) report.consoleErrors.push(m.text().slice(0, 300)); });
  // the game clamps a frame to 50 ms; handing it a clock that runs SPEED times faster plays SPEED game seconds a second
  await page.addInitScript(speed => {
    if (speed <= 1) return;
    const raf = window.requestAnimationFrame.bind(window); let vt = performance.now();
    window.requestAnimationFrame = cb => raf(() => { vt += 1000 / 60 * speed; cb(vt); });
  }, SPEED);
  await page.goto(URL);
  report.game = (await page.locator('#verLine').textContent()).trim();
  const scene = () => page.evaluate(() => document.body.getAttribute('data-scene') || 'title');
  const held = new Set();
  const setHeld = async want => {
    for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  };
  const toSelect = async () => {
    await setHeld(new Set());
    for (let i = 0; i < 6; i++) {
      const sc = await scene();
      if (sc === 'select') return;
      if (sc === 'title') await page.click('#btnStart'); else if (sc === 'result') await page.click('#btnChoose'); else await page.keyboard.press('Escape');
      await sleep(150);
    }
    throw new Error('could not reach the fighter screen (scene ' + (await scene()) + ')');
  };

  // one fight, from the bell to the result screen (or the cap)
  async function fight(lvl, attempt) {
    const rec = { round: lvl + 1, attempt, outcome: 'timeout', elapsed: 0 }, mem = { patient: N % 2 === 0 }, seen = new Set();
    let s = null, overAt = 0, last = -1;
    await page.waitForFunction(() => !!window.__fight() && document.body.getAttribute('data-scene') === 'fight', null, { timeout: 8000 });
    if (process.env.PLAYTEST_TWEAK) await page.evaluate(process.env.PLAYTEST_TWEAK);
    for (;;) {
      s = await page.evaluate(SNAP);
      if (s.scene !== 'fight') break;
      (s.bad || []).forEach(b => { if (!seen.has(b)) { seen.add(b); anomaly(b, 'round ' + (lvl + 1) + ' at ' + s.elapsed.toFixed(1) + ' s'); } });
      if (s.elapsed < last - 1e-6) anomaly('the clock ran backwards: ' + last + ' -> ' + s.elapsed, 'round ' + (lvl + 1));
      last = s.elapsed;
      if (s.over) { if (!overAt) overAt = Date.now(); await setHeld(new Set()); if (Date.now() - overAt > 20000) { anomaly('no result screen 20 s after the bell', 'round ' + (lvl + 1)); break; } }
      else if (s.elapsed > CAP) break;
      else { const d = decide(s, mem, POLICY === 'pacifist'); await setHeld(d.hold); for (const k of d.tap) await page.keyboard.press(k); }
      await sleep(45);
    }
    await setHeld(new Set());
    if (s && s.me) Object.assign(rec, { elapsed: +s.elapsed.toFixed(1), hp: Math.round(s.me.hp), hits: s.hits, foeHp: s.foes.map(f => Math.round(f.hp)) });
    if ((await scene()) === 'result') {
      const r = await page.evaluate(() => { const g = window.__fight(), vis = id => !document.getElementById(id).hidden;
        return { won: g.won, pacifist: !!g.pacifist, big: document.getElementById('resBig').textContent, title: document.getElementById('resTitle').textContent,
                 score: vis('scoreLine'), name: vis('nameBox'), next: vis('btnNext'), nextText: document.getElementById('btnNext').textContent, elapsed: g.elapsed, hp: Math.round(g.p.hp), hits: g.p.hitsLanded }; });
      Object.assign(rec, { outcome: r.won ? (r.pacifist ? 'peace' : 'win') : 'loss', big: r.big, title: r.title, elapsed: +r.elapsed.toFixed(1), hp: r.hp, hits: r.hits, next: r.next });
      if (r.score !== r.won || r.name !== r.won) anomaly('score line / name box do not match the verdict (won ' + r.won + ')', 'round ' + (lvl + 1));
      if (r.won && r.next !== (lvl < 12)) anomaly('NEXT ROUND is ' + (r.next ? 'shown' : 'missing') + ' after round ' + (lvl + 1), 'result');
    } else if (rec.outcome === 'timeout') await page.keyboard.press('Escape');   // give up on this one: back to the menu
    report.rounds.push(rec);
    return rec;
  }
  // FIGHT AS … from the fighter screen, through the round's card if it has one
  async function begin(lvl) {
    await toSelect();
    await page.selectOption('#startLevel', String(lvl));
    const card = page.locator('.fighter:nth-child(' + (FIGHTER + 1) + ')');
    if (!(await card.isDisabled()) && !(await card.evaluate(el => el.classList.contains('sel')))) await card.click();
    await page.click('#btnFight');
    await through();
  }
  async function through() {
    await page.waitForFunction(() => ['levelCard', 'fight'].indexOf(document.body.getAttribute('data-scene')) >= 0, null, { timeout: 8000 });
    if ((await scene()) === 'levelCard') await page.click('#btnLevelGo');
  }
  // the first win is saved (into this browser only): the table must open on that round with today's date on the row
  async function saveOnce(lvl) {
    if (report.savedScore) return false;
    await page.fill('#playerName', 'bot-' + N); await page.click('#btnSave');
    await page.waitForFunction(() => document.body.getAttribute('data-scene') === 'scores' && !!document.querySelector('#scoresTable tbody tr.me'), null, { timeout: 8000 });
    const row = await page.evaluate(() => { const d = new Date(), z = n => (n < 10 ? '0' : '') + n, tr = document.querySelector('#scoresTable tbody tr.me');
      return { date: tr.querySelector('td.date') ? tr.querySelector('td.date').textContent : null, today: d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()), round: document.getElementById('scoresRound').value }; });
    report.savedScore = row;
    if (row.date !== row.today) anomaly('saved score shows date "' + row.date + '", expected ' + row.today, 'high scores');
    if (row.round !== String(lvl + 1)) anomaly('high scores opened on round ' + row.round + ' after a round-' + (lvl + 1) + ' save', 'high scores');
    await page.click('#btnScoresBack');
    return true;
  }

  const all = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const asked = process.env.PLAYTEST_ROUNDS ? process.env.PLAYTEST_ROUNDS.split(',').map(x => parseInt(x, 10) - 1).filter(x => all.indexOf(x) >= 0) : all;
  if (POLICY !== 'monkey') {
    // rounds 7 and 13 have no pacifist ending, so the pacifist skips them
    const rounds = asked.filter(l => POLICY !== 'pacifist' || (l !== 6 && l !== 12));
    let viaNext = false;
    for (let i = 0; i < rounds.length; i++) {
      const lvl = rounds[i];
      try {
        if (viaNext) await through(); else await begin(lvl);
        viaNext = false;
        let rec = await fight(lvl, 1);
        if (rec.outcome === 'loss') { await page.click('#btnAgain'); await through(); rec = await fight(lvl, 2); }   // one REMATCH
        if (rec.outcome === 'win' || rec.outcome === 'peace') {
          if (await saveOnce(lvl)) continue;
          // on from a win with NEXT ROUND when the next round in the list is the next round
          if (rec.next && rounds[i + 1] === lvl + 1) { await page.click('#btnNext'); viaNext = true; }
        }
      } catch (e) { anomaly('agent got stuck: ' + String(e.message).split('\n')[0], 'round ' + (lvl + 1)); viaNext = false; await setHeld(new Set()).catch(() => {}); await page.keyboard.press('Escape').catch(() => {}); }
    }
  } else {
    // the monkey: whatever screen it is on, something that screen allows — or a fistful of keys
    const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'j', 'k', 'l', 'v', 'a', 'd', 'w', 's'], SIZES = [[1100, 720], [390, 844], [844, 390], [1600, 900]];
    const click = async sel => { const el = page.locator(sel); if (await el.count() && await el.first().isVisible() && await el.first().isEnabled()) { await el.first().click({ timeout: 2000 }).catch(() => {}); return true; } return false; };
    const end = Date.now() + MONKEY_S * 1000, visited = {}, levels = {};
    let acts = 0;
    while (Date.now() < end) {
      const sc = await scene(); visited[sc] = (visited[sc] || 0) + 1; acts++;
      if (rnd() < 0.04) { const z = pick(SIZES); await page.setViewportSize({ width: z[0], height: z[1] }); }
      if (sc === 'fight') {
        const s = await page.evaluate(SNAP);
        (s.bad || []).forEach(b => anomaly(b, 'monkey, round ' + (s.level + 1)));
        if (s.level != null) levels[s.level + 1] = (levels[s.level + 1] || 0) + 1;
        const u = rnd();
        if (u < 0.04) await page.keyboard.press('Escape');
        else if (u < 0.06) await click('#menuBtn');
        else { const k = pick(KEYS); if (rnd() < 0.5) await page.keyboard.press(k); else { await page.keyboard.down(k); await sleep(60 + rnd() * 500); await page.keyboard.up(k); } }
      }
      else if (sc === 'title') await click(pick(['#btnStart', '#btnStart', '#btnStart', '#btnScores', '#btnCredits', '#btnVersus', '#btnCoop', '#btnIntro']));
      else if (sc === 'select') {
        const u = rnd();
        if (u < 0.3) await click('.fighter:nth-child(' + (1 + Math.floor(rnd() * 8)) + ')');
        else if (u < 0.5) await page.selectOption('#startLevel', String(Math.floor(rnd() * 13)), { timeout: 1500 }).catch(() => {});
        else if (u < 0.8) await click('#btnRandom');
        else if (u < 0.95) await click('#btnFight');
        else await page.keyboard.press('Escape');
      }
      else if (sc === 'levelCard') await click(rnd() < 0.8 ? '#btnLevelGo' : '#btnLevelBack');
      else if (sc === 'result') await click(pick(['#btnNext', '#btnAgain', '#btnChoose'])) || await page.keyboard.press('Escape');
      else if (sc === 'scores') { if (rnd() < 0.5) await page.selectOption('#scoresRound', String(Math.floor(rnd() * 14)), { timeout: 1500 }).catch(() => {}); else await click('#btnScoresBack'); }
      else if (sc === 'credits') await click('#btnCreditsBack');
      else if (sc === 'versus') await click('#btnVsBack');
      else if (sc === 'coop') await click('#btnCoopBack');
      else await page.keyboard.press('Escape');
      if (!(await page.locator('#videoBox').isHidden())) await page.keyboard.press('Escape');   // the menu clip: Esc closes it
      await sleep(40 + rnd() * 120);
    }
    report.monkey = { actions: acts, scenes: visited, roundsSeen: levels };
    if (!visited.fight) anomaly('the monkey never got into a fight', 'monkey');
  }
  report.finished = new Date().toISOString();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'agent-' + N + '.json'), JSON.stringify(report, null, 1));
  await browser.close();
  const bad = report.errors.length + report.anomalies.length + report.consoleErrors.length;
  console.log('agent ' + N + ' (' + POLICY + '): ' + report.rounds.length + ' fights, ' + report.errors.length + ' page errors, ' + report.anomalies.length + ' anomalies');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('agent ' + N + ' crashed: ' + (e.stack || e)); process.exit(3); });
