// Playwright smoke test: the built game loads, a fight starts, a special fires, every round runs, no page errors.
const { test, expect } = require('@playwright/test');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '..', 'dist', 'index.html');

test('game boots and a fight runs', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await expect(page.locator('#btnStart')).toBeVisible();
  await page.click('#btnStart');
  await expect(page.locator('.fighter')).toHaveCount(8);
  await page.click('.fighter:nth-child(2)');          // June (not pre-selected, so one click only selects)
  await page.click('#btnFight');
  await page.waitForTimeout(1500);
  for (let i = 0; i < 20; i++) { await page.keyboard.down('ArrowRight'); await page.waitForTimeout(60); await page.keyboard.up('ArrowRight'); await page.keyboard.press('j'); await page.waitForTimeout(120); }
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('k'); await page.keyboard.press('l');
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('the bench: eight fighters, each with a move of their own and no per-fighter video', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.click('#btnStart');
  await expect(page.locator('.fighter .name')).toHaveText(['Anton', 'June', 'Sarah', 'Aswin', 'Åke', 'Abigail', 'Sasha', 'Suvam']);
  await expect(page.locator('.fighter .move')).toHaveText(['Skate-Jitsu Throw', 'Sky-High Axe Kick', 'Strewth Barrage', 'Black-Tie Boom', 'Claude Mind Spark', 'Fingertip Flood', 'Spine Storm', 'Desert Headlock']);
  await expect(page.locator('#btnVideo')).toHaveCount(0);
  await expect(page.locator('#selMove')).toContainText('Skate-Jitsu Throw');
  await page.click('.fighter:nth-child(3)');
  await expect(page.locator('#selName')).toHaveText('SARAH');
  await expect(page.locator('#selMove')).toContainText('mean Australian');
  expect(errors).toEqual([]);
});

test('all twelve rounds start, each with its own rules switched on', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.click('#btnStart');
  expect(await page.locator('#startLevel option').count()).toBe(12);
  for (const lvl of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']) {
    await page.selectOption('#startLevel', lvl);
    await page.click('#btnFight');
    if (lvl !== '0') { await expect(page.locator('#btnLevelGo')).toBeVisible(); await page.click('#btnLevelGo'); }
    await page.waitForTimeout(1200);
    // a round that silently fell back to the normal rules would still start without an error: check the switch itself
    const mode = await page.evaluate(() => { const g = window.__fight(), lv = window.__levels()[window.__level()];
      return { square: !!g.square, push: !!g.push, buns: !!g.buns, comp: !!g.comp, reruns: lv.reruns || 0, depth: !!lv.depth, island: !!lv.island, paint: !!g.paint, arena: document.body.getAttribute('data-arena') }; });
    expect(mode).toEqual({ square: lvl === '5', push: lvl === '6', buns: lvl === '7', comp: lvl === '4', reruns: lvl === '8' ? 4 : 0, depth: lvl === '9', island: lvl === '10', paint: lvl === '11', arena: lvl === '10' ? 'island' : 'flat' });
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('j');
    if (lvl === '3' || lvl === '4') { for (let i = 0; i < 12; i++) { await page.keyboard.down('ArrowRight'); await page.waitForTimeout(80); await page.keyboard.up('ArrowRight'); } }   // round 4: walk right so the camera scrolls
    await page.waitForTimeout(400);
    // back to the fighter screen for the next round (the in-game overlays are hidden during a fight)
    await page.evaluate(() => { document.getElementById('btnChoose').click(); });
    await expect(page.locator('#select')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('round 5: the shares always sum to one and a hit moves share to the others', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.click('#btnStart');
  await page.selectOption('#startLevel', '4');
  await page.click('#btnFight');
  await expect(page.locator('#btnLevelGo')).toBeVisible(); await page.click('#btnLevelGo');
  await page.waitForTimeout(500);
  const shares = () => page.evaluate(() => { const g = window.__fight(); return { p: g.p.share, r: g.rhinos.map(r => r.share), skin: g.rhinos.map(r => r.skin), sum: g.players.concat(g.rhinos).reduce((a, c) => a + c.share, 0) }; });
  const before = await shares();
  expect(before.skin).toEqual([null, 'zebra']);
  expect(Math.abs(before.sum - 1)).toBeLessThan(1e-9);
  expect(before.p).toBeCloseTo(1 / 3, 6);
  // land a hit on the first rhino from the host side of the code path, then check the pool moved
  await page.evaluate(() => { const g = window.__fight(); window.__hitRhinoTest = g.rhinos[0].share; });
  await page.evaluate(() => { const g = window.__fight(); g.p.x = g.rhinos[0].x - 200; });
  for (let i = 0; i < 6; i++) { await page.keyboard.press('j'); await page.waitForTimeout(260); }
  const after = await shares();
  expect(Math.abs(after.sum - 1)).toBeLessThan(1e-9);
  expect(after.r[0]).toBeLessThan(before.r[0]);
  expect(after.p).toBeGreaterThan(before.p);
  expect(after.r[1]).toBeGreaterThan(before.r[1]);   // the bystander gains too: that is the twist
  expect(errors).toEqual([]);
});

// a local fight without the menus (window.__vsLocal, LOCAL_BUILD only): the fight rules tested on one page, any number of sides
async function vsLocal(page, ids, arena) {
  await page.evaluate(([i, a]) => window.__vsLocal(i, a), [ids, arena || 0]);
  await page.waitForTimeout(400);
}

test('versus (beta): the same-keyboard duel runs, the rhino is playable and nothing reaches the leaderboard', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.click('#btnVersus');
  await expect(page.locator('#versus')).toBeVisible();
  await expect(page.locator('#btnVsJoin')).toBeVisible();                  // online, two to four players
  await expect(page.locator('#versus')).toContainText('two to four players');
  // player 2 defaults to the rhino; the roster plus the rhino are both offered
  expect(await page.locator('#vsP1 option').count()).toBe(await page.locator('#vsP2 option').count());
  await page.selectOption('#vsP1', 'anton');
  await page.selectOption('#vsP2', 'rhino');
  await page.click('#btnVsFight');
  await page.waitForTimeout(600);
  const setup = await page.evaluate(() => { const g = window.__fight(); return { vs: g.vs, sides: g.sides.length, players: g.players.length, rhinos: g.rhinos.length, human: g.rhinos[0].human, hp: g.sides.map(s => s.hp) }; });
  expect(setup).toMatchObject({ vs: true, sides: 2, players: 1, rhinos: 1, human: true });
  // the two keyboard halves drive the two sides
  const before = await page.evaluate(() => { const g = window.__fight(); g.sides[1].x = g.sides[0].x + 150; return g.sides.map(s => s.hp); });
  for (let i = 0; i < 8; i++) { await page.keyboard.press('j'); await page.keyboard.press('f'); await page.waitForTimeout(200); }
  const after = await page.evaluate(() => { const g = window.__fight(); return { hp: g.sides.map(s => s.hp), hits: g.sides.map(s => s.hitsLanded) }; });
  expect(after.hp[1]).toBeLessThan(before[1]);           // the fighter hurt the rhino
  expect(after.hits[0]).toBeGreaterThan(0);
  // KO the rhino and check the result screen keeps clear of the leaderboard
  await page.evaluate(() => { const g = window.__fight(); g.sides[1].hp = 1; });
  for (let i = 0; i < 6 && await page.evaluate(() => !window.__fight().over); i++) { await page.keyboard.press('j'); await page.waitForTimeout(250); }
  await expect(page.locator('#result')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#resBig')).toHaveText('PLAYER 1 WINS');
  await expect(page.locator('#scoreLine')).toBeHidden();
  await expect(page.locator('#nameBox')).toBeHidden();
  await expect(page.locator('#btnNext')).toBeHidden();
  expect(await page.locator('#resReadout').innerText()).toContain('not saved to the leaderboard');
  expect(errors).toEqual([]);
});

test('versus (beta): a player-controlled rhino charges and hurts the other side', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await vsLocal(page, ['rhino', 'anton']);
  // P1 is the rhino on the arrow keys: kick paws the ground and charges
  await page.evaluate(() => { const g = window.__fight(); g.sides[1].x = g.sides[0].x + 260; });
  const hp0 = await page.evaluate(() => window.__fight().sides[1].hp);
  const states = new Set();
  for (let i = 0; i < 24; i++) {
    if (i % 8 === 0) await page.keyboard.press('k');
    states.add(await page.evaluate(() => window.__fight().sides[0].state));
    await page.waitForTimeout(110);
  }
  expect([...states]).toEqual(expect.arrayContaining(['charge']));
  const hp1 = await page.evaluate(() => window.__fight().sides[1].hp);
  expect(hp1).toBeLessThan(hp0);
  expect(errors).toEqual([]);
});

test('the horn sweep covers the whole horn: it connects at the chin and stops at the tip', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const hpAfterSweep = async (d) => {
    await page.goto(URL);
    await page.click('#btnStart');
    await page.click('#btnFight');
    await page.waitForTimeout(400);
    return page.evaluate(async (dd) => {
      const g = window.__fight(), r = g.rhinos[0];
      r.timer = 99999; r.x = 460; g.p.x = 460 + dd; g.p.hp = 100; g.p.inv = 0;
      r.facing = dd > 0 ? 1 : -1; r.state = 'horn'; r.st = 0; r.chargeHit = false;
      await new Promise(res => setTimeout(res, 900));
      return window.__fight().p.hp;
    }, d);
  };
  expect(await hpAfterSweep(60)).toBe(85);     // standing inside the rhino used to be a safe spot
  expect(await hpAfterSweep(-60)).toBe(85);
  expect(await hpAfterSweep(200)).toBe(85);
  expect(await hpAfterSweep(330)).toBe(100);   // and it used to reach far past the drawn horn
  expect(errors).toEqual([]);
});

test('a cornered rhino sweeps instead of charging on the spot', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.click('#btnStart');
  await page.click('#btnFight');
  await page.waitForTimeout(400);
  const seen = await page.evaluate(async () => {
    const g = window.__fight(); g.p.x = 40; g.rhinos[0].x = 120;
    const states = {}; let last = null, cx = 0, zeroTravel = 0;
    await new Promise(res => { let n = 0; const t = setInterval(() => {
      const G = window.__fight(); if (!G) return; const r = G.rhinos[0];
      G.p.x = 40; G.p.hp = 100;                        // pinned in the corner, kept alive
      if (r.state === 'charge' && last !== 'charge') cx = r.x;
      if (last === 'charge' && r.state !== 'charge' && Math.abs(r.x - cx) < 5) zeroTravel++;
      states[r.state] = (states[r.state] || 0) + 1; last = r.state;
      if (++n > 300) { clearInterval(t); res(); }
    }, 16); });
    return { states: Object.keys(states), zeroTravel };
  });
  expect(seen.zeroTravel).toBe(0);
  expect(seen.states).toContain('horn');
  expect(errors).toEqual([]);
});

test('round 4: both rhinos reach the whole field and can run past each other', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.click('#btnStart');
  await page.selectOption('#startLevel', '3');
  await page.click('#btnFight');
  await expect(page.locator('#btnLevelGo')).toBeVisible(); await page.click('#btnLevelGo');
  await page.waitForTimeout(600);
  // lanes used to fence rhino 0 out of the right end of the field and rhino 1 out of the left end,
  // so a player standing there was safe and the rhino pawed at its invisible wall forever
  const chase = (corner, x0, x1, goal) => page.evaluate(async (a) => {
    const g = window.__fight();
    g.rhinos[0].x = a.x0; g.rhinos[1].x = a.x1; g.rhinos.forEach(function(r){ r.timer = 0; });
    const lo = [a.x0, a.x1], hi = [a.x0, a.x1]; let hp = 100;
    await new Promise(res => { let n = 0; const t = setInterval(() => {
      const G = window.__fight(); if (!G) return;
      G.p.x = a.corner; G.p.inv = 0;                    // pinned in the corner, kept alive
      hp = Math.min(hp, G.p.hp); G.p.hp = 100;
      G.rhinos.forEach(function(r, i){ lo[i] = Math.min(lo[i], r.x); hi[i] = Math.max(hi[i], r.x); });
      // stop as soon as the far rhino has crossed the old lane line and taken a swing, so a loaded machine only waits longer
      const done = hp < 100 && (a.goal > 0 ? hi[0] > a.goal : lo[1] < -a.goal);
      if (done || ++n > 900) { clearInterval(t); res(); }
    }, 16); });
    return { lo: lo, hi: hi, hp: hp };
  }, { corner: corner, x0: x0, x1: x1, goal: goal });
  const right = await chase(1860, 600, 1200, 1500);
  expect(right.hi[0]).toBeGreaterThan(1500);     // rhino 0 past the old end of its lane (1460)
  expect(right.hp).toBeLessThan(100);            // and something actually landed
  const left = await chase(60, 1400, 700, -420);       // the same from a crossed start, towards the other corner
  expect(left.lo[1]).toBeLessThan(420);          // rhino 1 past the old start of its lane (460)
  expect(left.hp).toBeLessThan(100);
  // a charge runs clean through the other rhino instead of being fenced off by it
  const past = await page.evaluate(async () => {
    const g = window.__fight(), a = g.rhinos[0], b = g.rhinos[1];
    b.x = 900; b.state = 'idle'; b.timer = 999;
    a.x = 400; a.facing = 1; a.dir = 1; a.cx0 = a.x; a.state = 'charge'; a.st = 0; a.chargeHit = false; a.trampled = {};
    g.p.x = 1800;
    await new Promise(res => setTimeout(res, 1500));
    const G = window.__fight(); G.rhinos.forEach(function(r){ r.state = 'idle'; r.st = 0; r.timer = 999; });
    const crossed = G.rhinos[0].x > G.rhinos[1].x + 100;
    await new Promise(res => setTimeout(res, 700));        // idle: the push apart settles
    return { crossed: crossed, gap: Math.abs(G.rhinos[0].x - G.rhinos[1].x) };
  });
  expect(past.crossed).toBe(true);
  expect(past.gap).toBeGreaterThan(300);         // and they never settle stacked in one silhouette
  expect(errors).toEqual([]);
});

test('NEXT ROUND then BACK keeps the round you unlocked', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/\/rest\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto(URL);
  await page.click('#btnStart');
  await page.click('#btnFight');
  await page.waitForTimeout(400);
  await page.evaluate(() => { const g = window.__fight(); g.rhinos[0].hp = 1; g.rhinos[0].timer = 999; g.p.x = g.rhinos[0].x - 150; });
  for (let i = 0; i < 6 && await page.evaluate(() => !window.__fight().over); i++) { await page.keyboard.press('j'); await page.waitForTimeout(250); }
  await expect(page.locator('#result')).toBeVisible({ timeout: 15000 });
  await page.click('#btnNext');
  await expect(page.locator('#btnLevelGo')).toBeVisible();
  await page.click('#btnLevelBack');
  await expect(page.locator('#startLevel')).toHaveValue('1');
  expect(errors).toEqual([]);
});

test('phone: every round-5 result button is on screen, even with the display fonts at full size', async ({ browser }) => {
  // the webfonts are blocked in CI, so force the display text to its largest clamp value: a worst case
  // at least as tall as Bangers/Nunito on a real phone
  const INFLATE = `.result-big{font-size:56px!important;line-height:1.1!important}
    h2{font-size:26px!important;line-height:1.25!important} .scoreline{font-size:36px!important}
    .btn{font-size:18px!important} .small,.readout{line-height:1.6!important}`;
  for (const size of [{ width: 390, height: 844 }, { width: 375, height: 667 }, { width: 844, height: 390 }]) {
    const ctx = await browser.newContext({ viewport: size, hasTouch: true, isMobile: true });
    await ctx.addInitScript((css) => { window.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }); }, INFLATE);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route(/\/rest\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto(URL);
    await page.click('#btnStart');
    await page.selectOption('#startLevel', '4');
    await page.click('#btnFight');
    await expect(page.locator('#btnLevelGo')).toBeVisible();
    await page.click('#btnLevelGo');
    await page.waitForTimeout(500);
    // win round 5 by pushing each rhino under the detection limit with real punches
    for (let k = 0; k < 2; k++) {
      await page.evaluate(() => { const g = window.__fight();
        const live = g.rhinos.filter(r => r.state !== 'ko' && r.state !== 'gone'); if (!live.length) return;
        const r = live[0]; r.share = 0.07; r.hp = 7; r.state = 'idle'; r.timer = 9999; g.p.x = r.x - 110; });
      for (let i = 0; i < 14; i++) {
        const done = await page.evaluate(() => { const g = window.__fight();
          return !g || g.over || !g.rhinos.some(r => r.state !== 'ko' && r.state !== 'gone'); });
        if (done) break;
        await page.keyboard.press('j'); await page.waitForTimeout(200);
      }
    }
    await expect(page.locator('#result')).toBeVisible({ timeout: 15000 });
    const reach = await page.evaluate(() => {
      const bad = [];
      ['playerName', 'btnSave', 'btnNext', 'btnAgain', 'btnChoose'].forEach(id => {   // round 5 is no longer the last: NEXT ROUND is there too
        const el = document.getElementById(id);
        const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const hit = document.elementFromPoint(cx, cy);
        if (!(cy > 0 && cy < window.innerHeight && hit && (hit === el || el.contains(hit)))) bad.push(id + '@' + Math.round(r.top));
      });
      return bad;
    });
    expect(reach, `unreachable at ${size.width}x${size.height}`).toEqual([]);
    expect(errors).toEqual([]);
    await ctx.close();
  }
});

test('a special costs the whole meter: its own hits never refund it', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  // multi-hit specials (Sarah's five insults, June's three kicks and the axe) used to hand back most of what they cost
  for (const [nth, hits] of [[3, 5], [2, 4]]) {
    await page.click('#btnStart');
    const f = page.locator(`.fighter:nth-child(${nth})`);
    if (!(await f.evaluate(el => el.classList.contains('sel')))) await f.click();
    await page.click('#btnFight');
    await page.waitForTimeout(500);
    const after = await page.evaluate(async () => {
      const g = window.__fight();
      g.p.meter = 100; g.p.x = g.rhinos[0].x - 130; g.rhinos[0].timer = 9999; g.rhinos[0].hp = 9999;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'l' }));
      await new Promise(r => setTimeout(r, 3200));
      return { meter: Math.round(window.__fight().p.meter), hits: window.__fight().p.hitsLanded };
    });
    expect(after.hits).toBeGreaterThan(1);      // it really is a multi-hit special
    expect(after.meter).toBe(0);
    await page.keyboard.press('Escape');
  }
  expect(errors).toEqual([]);
});

test('versus: a duel decided on the clock says TIME and the verdict matches the numbers under it', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await vsLocal(page, ['anton', 'rhino'], 0);
  // the fighter leads on its own bar (61 %) while holding fewer absolute points than the rhino (80 of 150)
  await page.evaluate(() => { const g = window.__fight(); g.sides[0].hp = 61; g.sides[1].hp = 80; g.elapsed = 98.4; });
  await page.waitForTimeout(1200);
  const flagged = await page.evaluate(() => { const g = window.__fight(); return { over: g.over, win: g.vsWin, time: g.vsTime }; });
  expect(flagged).toEqual({ over: true, win: 0, time: true });   // nobody was knocked out
  await expect(page.locator('#result')).toBeVisible({ timeout: 12000 });
  await expect(page.locator('#resTitle')).toHaveText('ANTON LEADS ON HEALTH — 61 % TO 53 %');
  const read = await page.locator('#resReadout').innerText();
  expect(read).toContain('61/100 HP (61 %)');
  expect(read).toContain('80/150 HP (53 %)');
  expect(errors).toEqual([]);
});

test('versus: the five arenas are five different fights', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  const start = async (arena) => { await vsLocal(page, ['anton', 'june'], +arena); };
  const seen = [];
  for (const arena of ['0', '1', '2', '3', '4']) {
    await start(arena);
    seen.push(await page.evaluate(() => {
      const g = window.__fight();
      return { theme: g.comp ? 'comp' : 'plain', comp: !!g.comp,
               width: Math.round(Math.max.apply(null, g.sides.map(s => s.x))), gravity: 0 };
    }));
    await page.keyboard.press('Escape');
  }
  expect(seen[4].comp).toBe(true);                       // arena 5 is the compositional ring
  expect(seen.filter(x => x.comp).length).toBe(1);
  expect(seen[3].width).toBeGreaterThan(seen[0].width);  // arena 4 really is the wide field
  // the compositional ring: sizes sum to one, a hit moves share, a side under the limit ends it
  await start('4');
  const ring = await page.evaluate(async () => {
    const g = window.__fight(); g.sides[1].x = g.sides[0].x + 90; g.sides[1].inv = 0;
    const before = g.sides.map(s => s.share);
    for (let i = 0; i < 3; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'j' }));
      await new Promise(r => setTimeout(r, 340));
      const G = window.__fight(); G.sides[1].inv = 0; G.sides[1].x = G.sides[0].x + 90;
    }
    const g2 = window.__fight();
    return { before, after: g2.sides.map(s => s.share), sum: g2.sides.reduce((a, s) => a + s.share, 0) };
  });
  expect(ring.before).toEqual([0.5, 0.5]);
  expect(ring.after[0]).toBeGreaterThan(ring.before[0]);
  expect(ring.after[1]).toBeLessThan(ring.before[1]);
  expect(Math.abs(ring.sum - 1)).toBeLessThan(1e-9);
  const ended = await page.evaluate(async () => {
    const g = window.__fight(); g.sides[1].share = 0.08; g.sides[0].share = 0.92; g.sides[1].inv = 0; g.sides[1].x = g.sides[0].x + 90;
    for (let i = 0; i < 4 && !window.__fight().over; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'k' }));
      await new Promise(r => setTimeout(r, 400));
      const G = window.__fight(); if (!G.over) { G.sides[1].inv = 0; G.sides[1].x = G.sides[0].x + 90; }
    }
    const G = window.__fight(); return { over: G.over, win: G.vsWin, byClock: G.vsTime };
  });
  expect(ended).toEqual({ over: true, win: 0, byClock: false });   // removed by the detection limit, not the clock
  expect(errors).toEqual([]);
});

test('Esc closes an open video instead of leaving the screen it was opened from', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.click('#btnIntro');
  await expect(page.locator('#videoBox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#videoBox')).toBeHidden();          // the intro clip closes on Esc
  await expect(page.locator('#title')).toBeVisible();            // and the title screen is still there
  expect(errors).toEqual([]);
});

test('versus can never write a score, even if the save button is forced', async ({ page }) => {
  const errors = []; let posts = 0;
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/\/rest\/v1\//, r => { if (r.request().method() === 'POST') posts++; return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); });
  await page.goto(URL);
  await vsLocal(page, ['anton', 'rhino']);
  await page.evaluate(() => { const g = window.__fight(); g.sides[1].hp = 1; g.sides[1].x = g.sides[0].x + 90; g.sides[1].inv = 0; });
  for (let i = 0; i < 6 && await page.evaluate(() => !window.__fight().over); i++) { await page.keyboard.press('j'); await page.waitForTimeout(250); }
  await expect(page.locator('#result')).toBeVisible({ timeout: 12000 });
  await page.evaluate(async () => { const b = document.getElementById('btnSave'); b.disabled = false; b.click(); await new Promise(r => setTimeout(r, 600)); });
  expect(posts).toBe(0);
  expect(errors).toEqual([]);
});

test('round 5 percentages add up to 100 and both directions held stand still', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.click('#btnStart');
  await page.selectOption('#startLevel', '4');
  await page.click('#btnFight');
  await expect(page.locator('#btnLevelGo')).toBeVisible();
  await page.click('#btnLevelGo');
  await page.waitForTimeout(400);
  const sums = await page.evaluate(() => {
    // the HUD's rounding is largest-remainder: every split must print as 100
    const g = window.__fight(), all = g.players.concat(g.rhinos), out = [];
    for (const split of [[1, 1, 1], [0.505, 0.26, 0.235], [0.9, 0.05, 0.05], [0.333, 0.333, 0.334]]) {
      split.forEach((v, i) => { all[i].share = v; });
      out.push(window.__pct100 ? window.__pct100(all.map(c => c.share)).reduce((a, b) => a + b, 0) : null);
    }
    return out;
  });
  expect(sums).toEqual([100, 100, 100, 100]);
  // holding ← and → together is standing still
  await page.evaluate(() => { const g = window.__fight(); g.rhinos.forEach(r => { r.timer = 9999; r.state = 'idle'; r.x = 1300; }); });
  await page.keyboard.down('ArrowLeft'); await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(100);                                   // both are down now; from here nothing may move
  const x0 = await page.evaluate(() => window.__fight().p.x);
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => ({ x: window.__fight().p.x }));
  await page.keyboard.up('ArrowLeft'); await page.keyboard.up('ArrowRight');
  expect(Math.abs(st.x - x0)).toBeLessThan(1);
  expect(errors).toEqual([]);
});

test('phone portrait: the arena sits at the top and no touch pad covers it', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.click('#btnStart');
  await page.click('#btnFight');
  await page.waitForTimeout(800);
  const over = await page.evaluate(() => {
    const c = document.querySelector('canvas').getBoundingClientRect(), sc = Math.min(c.width / 960, c.height / 600);
    const arenaBottom = c.top + 600 * sc;
    return Array.from(document.querySelectorAll('.tb')).filter(el => el.offsetParent !== null && el.getBoundingClientRect().top < arenaBottom).map(el => el.getAttribute('data-k'));
  });
  expect(over).toEqual([]);
  await ctx.close();
});

test('desktop: the whole roster fits in the frame', async ({ browser }) => {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    await page.route(/\/rest\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto(URL);
    await page.click('#btnStart');
    const hidden = await page.evaluate(() => { const st = document.getElementById('stage').getBoundingClientRect();
      return Array.from(document.querySelectorAll('.fighter')).filter(c => c.getBoundingClientRect().bottom > st.bottom + 1).map(c => c.getAttribute('aria-label')); });
    expect(hidden).toEqual([]);
    await ctx.close();
  }
});

test('pacifist ending: outlast the rhino without hitting it', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL + '#pacifist=2');            // debug hook: shortens the 60 s pacifist timer to 2 s
  await page.click('#btnStart');
  await page.click('.fighter:nth-child(2)');
  await page.click('#btnFight');
  // dodge only: never press punch / kick / special
  for (let i = 0; i < 25; i++) { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(160); }
  await expect(page.locator('#result')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#resBig')).toHaveText('PEACE');
  await expect(page.locator('#resReadout')).toContainText(/RECLASSIFIED → (tapir|horse|zebra)/);
  await expect(page.locator('#btnNext')).toBeVisible();
  expect(errors).toEqual([]);
});

// The shared leaderboard talks to Supabase over REST; the tests mock that endpoint so they never need the network.
async function mockSupabase(page, rows) {
  const calls = [];
  await page.route(/\/rest\/v1\//, route => {
    const req = route.request(), url = req.url();
    calls.push(req.method() + ' ' + url.replace(/^.*\/rest\/v1\//, ''));
    if (url.includes('/rpc/report_icelab_score')) { const id = req.postDataJSON().score_id; rows = rows.filter(r => r.id !== id); return route.fulfill({ status: 204, body: '' }); }
    if (req.method() === 'POST') { const row = Object.assign({ id: 100 + rows.length, created_at: new Date().toISOString() }, req.postDataJSON()); rows.push(row); return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([row]) }); }
    const lv = (url.match(/[?&]level=eq\.(\d+)/) || [])[1];
    const sorted = rows.filter(r => !lv || r.level === +lv).sort((a, b) => b.score - a.score || a.time_s - b.time_s);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sorted) });
  });
  return calls;
}
const ROWS = [
  { id: 1, name: 'Björn', fighter: 'Sarah', score: 8420, time_s: 61.2, level: 2, created_at: '2026-09-16T10:00:00Z' },
  { id: 2, name: 'Pelle', fighter: 'June', score: 5120, time_s: 40.0, level: 1, created_at: '2026-09-16T11:00:00Z' },
];

test('shared leaderboard: title best, roster best, report hides an entry', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const calls = await mockSupabase(page, ROWS.map(r => Object.assign({}, r)));
  await page.goto(URL);
  await expect(page.locator('#titleBest')).toContainText('ALL-TIME BEST · 8,420');
  await page.click('#btnScores');
  await expect(page.locator('#scoresMode')).toContainText('Shared leaderboard');
  await expect(page.locator('#scoresTable tbody tr')).toHaveCount(2);
  await expect(page.locator('#scoresTable tbody tr').first()).toContainText('Björn');
  await page.locator('#scoresTable tbody tr').first().locator('button.report').click();
  await expect(page.locator('#scoresTable tbody tr')).toHaveCount(1);
  expect(calls.some(c => c.startsWith('POST rpc/report_icelab_score'))).toBe(true);
  await expect(page.locator('#titleBest')).toContainText('5,120');
  await page.click('#btnScoresBack');
  await page.click('#btnStart');
  await expect(page.locator('.fighter:nth-child(2) .best')).toHaveText('BEST 5,120 · Pelle');
  await expect(page.locator('.fighter:nth-child(1) .best')).toHaveText('');
  expect(errors).toEqual([]);
});

test('saving a score posts it to the table and highlights it', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const calls = await mockSupabase(page, ROWS.map(r => Object.assign({}, r)));
  await page.goto(URL + '#pacifist=2');
  await page.click('#btnStart');
  await page.click('.fighter:nth-child(2)');
  await page.click('#btnFight');
  for (let i = 0; i < 25; i++) { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(160); }
  await expect(page.locator('#result')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#playerName')).toHaveValue('June');                  // defaults to your fighter's name
  await page.fill('#playerName', '  Tester  ');
  await page.click('#btnSave');
  await expect(page.locator('#scores')).toBeVisible();
  await expect(page.locator('#btnSave')).toHaveText('SAVED');
  expect(calls.some(c => c.startsWith('POST icelab_scores'))).toBe(true);
  await expect(page.locator('#scoresRound')).toHaveValue('1');                 // the list is the round just played
  await expect(page.locator('#scoresTable tbody tr')).toHaveCount(2);          // Pelle's round-1 score and the new one
  await expect(page.locator('#scoresTable tbody tr.me')).toHaveCount(1);
  await expect(page.locator('#scoresTable tbody tr.me')).toContainText('Tester');
  expect(errors).toEqual([]);
});

test('falls back to this device when the table is unreachable', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/\/rest\/v1\//, route => route.abort());
  await page.goto(URL);
  await page.click('#btnScores');
  await expect(page.locator('#scoresMode')).toContainText('Stored on this device');
  await expect(page.locator('#scoresTable tbody tr')).toHaveCount(1);   // the "be the first" row
  expect(errors).toEqual([]);
});

test('Esc and the MENU button return to the main menu', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await expect(page.locator('#title h1')).toHaveText(/ICELAB\s*RUMBLE/);
  await expect(page.locator('#menuBtn')).toBeHidden();          // not on the title screen
  await page.click('#btnStart');
  await expect(page.locator('#menuBtn')).toBeVisible();
  await page.click('#menuBtn');
  await expect(page.locator('#title')).toBeVisible();
  await page.click('#btnStart');
  await page.click('.fighter:nth-child(2)');
  await page.click('#btnFight');
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');                          // mid-fight
  await expect(page.locator('#title')).toBeVisible();
  await expect(page.locator('#menuBtn')).toBeHidden();
  await page.waitForTimeout(400);
  expect(errors).toEqual([]);
});

test('the menu has the false-positive clip', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await expect(page.locator('#btnIntro')).toBeVisible();
  await page.click('#btnIntro');
  await expect(page.locator('#videoBox')).toBeVisible();
  const src = await page.evaluate(() => document.getElementById('theVideo').getAttribute('src') || '');
  expect(src).toContain('intro');
  await page.click('#btnVideoClose');
  await expect(page.locator('#title')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the title screen shows the version', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('#verLine')).toHaveText(/^v\d+\.\d+\.\d+ · build \S+$/);
});

// Co-op: two pages joined through a fake room (the real one is Trystero over WebRTC, which needs the network).
// Messages a page sends go through Node to the other page, and we count them by type.
async function wireCoop(page, id, getOther, tally) {
  await page.exposeFunction('__coopOut', async (json) => {
    const m = JSON.parse(json); tally[m.t] = (tally[m.t] || 0) + 1;
    const other = getOther(); if (other) await other.evaluate(([j, from]) => window.__coopIn(j, from), [json, id]).catch(() => {});
  });
  await page.addInitScript(([id]) => {
    window.__coopTransport = { join(code, h) {
      window.__coopIn = (json, from) => h.onData(JSON.parse(json), from);
      window.__coopPeer = (pid) => h.onPeerJoin(pid);
      return { send: m => window.__coopOut(JSON.stringify(m)), selfId: id, leave() {} };
    }, noRelay: true };
  }, [id]);
}
test('co-op: two pages fight the rhino through a room', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } });
  const A = await ctx.newPage(), B = await ctx.newPage();
  const errors = []; [A, B].forEach(p => p.on('pageerror', e => errors.push(e.message)));
  const sentA = {}, sentB = {};
  await wireCoop(A, 'a', () => B, sentA);            // 'a' < 'b', so A hosts
  await wireCoop(B, 'b', () => A, sentB);
  for (const p of [A, B]) {
    await p.route(/\/rest\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await p.goto(URL);
    await p.click('#btnCoop'); await p.fill('#coopCode', 'Kiruna'); await p.click('#btnCoopJoin');
    await expect(p.locator('#select')).toBeVisible();
    await expect(p.locator('#selCoop')).toContainText('waiting for your friend');
  }
  await A.evaluate(() => window.__coopPeer('b')); await B.evaluate(() => window.__coopPeer('a'));
  await expect(A.locator('#selCoop')).toContainText('you are the host');
  await expect(B.locator('#selCoop')).toContainText('the host picks the round');
  await A.click('.fighter:nth-child(2)'); await A.click('#btnFight');      // June, host ready first
  await expect(A.locator('#selCoop')).toContainText('waiting for your friend to press');
  await B.click('.fighter:nth-child(3)'); await B.click('#btnFight');      // Sarah
  await expect(A.locator('#select')).toBeHidden(); await expect(B.locator('#select')).toBeHidden();
  // the guest plays: its inputs travel to the host, snapshots come back
  for (let i = 0; i < 8; i++) { await B.keyboard.down('ArrowRight'); await B.waitForTimeout(60); await B.keyboard.up('ArrowRight'); await B.keyboard.press('j'); await B.waitForTimeout(100); }
  await A.keyboard.press('ArrowUp'); await A.keyboard.press('k');
  await B.waitForTimeout(1200);
  expect(sentB.in).toBeGreaterThan(3);
  expect(sentA.s).toBeGreaterThan(10);
  await B.keyboard.press('Escape');                                        // guest leaves; host keeps playing
  await expect(B.locator('#title')).toBeVisible();
  await A.waitForTimeout(300);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('versus (beta): two pages duel through a room, one of them as the rhino', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } });
  const A = await ctx.newPage(), B = await ctx.newPage();
  const errors = []; [A, B].forEach(p => p.on('pageerror', e => errors.push(e.message)));
  const sentA = {}, sentB = {};
  await wireCoop(A, 'a', () => B, sentA);            // 'a' < 'b', so A hosts
  await wireCoop(B, 'b', () => A, sentB);
  for (const p of [A, B]) {
    await p.route(/\/rest\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await p.goto(URL);
    await p.click('#btnVersus'); await p.fill('#vsCode', 'Duel'); await p.click('#btnVsJoin');
    await expect(p.locator('#select')).toBeVisible();
  }
  await A.evaluate(() => window.__coopPeer('b')); await B.evaluate(() => window.__coopPeer('a'));
  await expect(A.locator('#selCoop')).toContainText('Versus room DUEL');
  // the rhino card only exists in a versus lobby
  await expect(A.locator('.fighter')).toHaveCount(9);
  await A.click('.fighter:nth-child(2)'); await A.click('#btnFight');       // host: June
  await B.click('.fighter:nth-child(9)');                                  // guest: THE RHINO
  await expect(B.locator('#selName')).toHaveText('THE RHINO');
  await B.click('#btnFight');
  await expect(A.locator('#select')).toBeHidden(); await expect(B.locator('#select')).toBeHidden();
  const shape = await A.evaluate(() => { const g = window.__fight(); return { vs: g.vs, players: g.players.length, rhinos: g.rhinos.length, human: !!g.rhinos[0].human }; });
  expect(shape).toEqual({ vs: true, players: 1, rhinos: 1, human: true });
  // the guest drives the rhino from the other page: its inputs reach the host and snapshots come back
  for (let i = 0; i < 10; i++) { await B.keyboard.press('k'); await B.keyboard.down('ArrowLeft'); await B.waitForTimeout(80); await B.keyboard.up('ArrowLeft'); await B.waitForTimeout(90); }
  await A.keyboard.press('j');
  await B.waitForTimeout(800);
  expect(sentB.in).toBeGreaterThan(3);
  expect(sentA.s).toBeGreaterThan(10);
  const guestView = await B.evaluate(() => { const g = window.__fight(); return { vs: g.vs, rhinoState: g.rhinos[0].state, rhinoHp: g.rhinos[0].hp }; });
  expect(guestView.vs).toBe(true);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('a re-pick after READY reaches the other player, in co-op and in a versus room', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } });
  const A = await ctx.newPage(), B = await ctx.newPage();
  const errors = []; [A, B].forEach(p => p.on('pageerror', e => errors.push(e.message)));
  await wireCoop(A, 'a', () => B, {});            // 'a' < 'b', so A hosts
  await wireCoop(B, 'b', () => A, {});
  for (const p of [A, B]) {
    await p.route(/\/rest\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await p.goto(URL);
    await p.click('#btnVersus'); await p.fill('#vsCode', 'duel'); await p.click('#btnVsJoin');
    await expect(p.locator('#select')).toBeVisible();
  }
  await A.evaluate(() => window.__coopPeer('b')); await B.evaluate(() => window.__coopPeer('a'));
  // the guest readies as Sarah, then changes its mind and takes the rhino card before the host starts
  await B.click('.fighter:nth-child(3)'); await B.click('#btnFight');
  await expect(B.locator('#selCoop')).toContainText('you are ready');
  await B.click('.fighter:nth-child(9)');                      // THE RHINO
  await expect(B.locator('#selName')).toHaveText('THE RHINO');
  await A.click('.fighter:nth-child(2)'); await A.click('#btnFight');   // host: June
  await expect(A.locator('#select')).toBeHidden();
  const shape = await A.evaluate(() => { const g = window.__fight(); return { vs: g.vs, players: g.players.map(q => q.def.id), rhinos: g.rhinos.length }; });
  expect(shape).toEqual({ vs: true, players: ['june'], rhinos: 1 });   // the guest got the rhino it asked for
  expect(errors).toEqual([]);
  await ctx.close();
});

test('versus: REMATCH after the opponent leaves goes back to the versus screen, never into the campaign', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } });
  const A = await ctx.newPage(), B = await ctx.newPage();
  const errors = []; [A, B].forEach(p => p.on('pageerror', e => errors.push(e.message)));
  await wireCoop(A, 'a', () => B, {});
  await wireCoop(B, 'b', () => A, {});
  for (const p of [A, B]) {
    await p.route(/\/rest\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await p.goto(URL);
    await p.click('#btnVersus'); await p.fill('#vsCode', 'duel'); await p.click('#btnVsJoin');
    await expect(p.locator('#select')).toBeVisible();
  }
  await A.evaluate(() => window.__coopPeer('b')); await B.evaluate(() => window.__coopPeer('a'));
  await A.click('.fighter:nth-child(2)'); await A.click('#btnFight');
  await B.click('.fighter:nth-child(9)'); await B.click('#btnFight');
  await expect(A.locator('#select')).toBeHidden();
  await B.keyboard.press('Escape');                              // the opponent walks away mid-duel
  await A.waitForTimeout(400);
  await A.evaluate(() => { const g = window.__fight(); g.rhinos[0].hp = 1; g.rhinos[0].share = 0; g.p.x = g.rhinos[0].x - 120; });
  for (let i = 0; i < 8 && await A.evaluate(() => !window.__fight().over); i++) { await A.keyboard.press('j'); await A.waitForTimeout(250); }
  await expect(A.locator('#result')).toBeVisible({ timeout: 15000 });
  await A.click('#btnAgain');
  await expect(A.locator('#versus')).toBeVisible();              // not a campaign round
  await expect(A.locator('#vsStatus')).toContainText('opponent left');
  expect(await A.evaluate(() => window.__fight())).toBeNull();
  expect(errors).toEqual([]);
  await ctx.close();
});

test('the keyboard works the menus: Space presses a button, the arrows work a dropdown, a release always releases', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/\/rest\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto(URL);
  await page.evaluate(() => document.getElementById('btnStart').focus());
  await page.keyboard.press(' ');
  await expect(page.locator('#select')).toBeVisible();
  await page.evaluate(() => document.getElementById('startLevel').focus());
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#startLevel')).not.toHaveValue('0');
  // a key released while the name box has focus must not survive into the next fight
  await page.selectOption('#startLevel', '0');
  await page.click('#btnFight');
  await page.waitForTimeout(400);
  await page.evaluate(() => { const g = window.__fight(); g.rhinos[0].hp = 1; g.rhinos[0].timer = 999; g.p.x = g.rhinos[0].x - 150; });
  for (let i = 0; i < 6 && await page.evaluate(() => !window.__fight().over); i++) { await page.keyboard.press('j'); await page.waitForTimeout(250); }
  await expect(page.locator('#result')).toBeVisible({ timeout: 15000 });
  await page.keyboard.down('ArrowRight');
  await page.click('#playerName');
  await page.keyboard.up('ArrowRight');
  await page.click('#btnAgain');
  await page.waitForTimeout(200);
  const x0 = await page.evaluate(() => window.__fight().p.x);
  await page.waitForTimeout(1000);
  const x1 = await page.evaluate(() => window.__fight().p.x);
  expect(Math.abs(x1 - x0)).toBeLessThan(5);
  expect(errors).toEqual([]);
});

test('round 5: the punch still connects once a rhino has shrunk', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.click('#btnStart');
  await page.selectOption('#startLevel', '4');
  await page.click('#btnFight');
  await expect(page.locator('#btnLevelGo')).toBeVisible();
  await page.click('#btnLevelGo');
  await page.waitForTimeout(400);
  const landed = await page.evaluate(async () => {
    const out = [];
    for (const share of [0.30, 0.20, 0.14, 0.10, 0.07]) {
      const g = window.__fight(), r = g.rhinos[0];
      r.share = share; r.size = 0.35 + 0.65 * share * g.compN; r.hp = share * 100; r.state = 'idle'; r.timer = 9999;
      g.p.x = r.x - 120;
      await new Promise(res => setTimeout(res, 120));
      const before = window.__fight().rhinos[0].share;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'j' }));
      await new Promise(res => setTimeout(res, 350));
      out.push(window.__fight().rhinos[0].share < before - 1e-9);
    }
    return out;
  });
  expect(landed).toEqual([true, true, true, true, true]);
  expect(errors).toEqual([]);
});

test('Anton rides a skateboard: he rolls on after you let go and carves to a stop', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.click('#btnStart'); await page.click('#btnFight');   // Anton is the first card
  await expect.poll(() => page.evaluate(() => window.__fight() ? window.__fight().elapsed : 0), { timeout: 8000 }).toBeGreaterThan(1.7);
  await page.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.r.x = 860; g.p.x = 150; g.p.inv = 99; });
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500); await page.keyboard.up('ArrowRight');
  const released = await page.evaluate(() => ({ x: window.__fight().p.x, vx: window.__fight().p.vx }));
  expect(released.vx).toBeGreaterThan(150);                       // up to speed on the board
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__fight().p.x)).toBeGreaterThan(released.x + 20);   // still rolling, no key held
  await expect.poll(() => page.evaluate(() => window.__fight().p.vx), { timeout: 4000 }).toBe(0);   // …and it stops by itself
  // both directions at once is the brake: rolling at full speed, he stops dead
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(400);
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(100);
  const braked = await page.evaluate(() => window.__fight().p.x);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__fight().p.x)).toBe(braked);
  await page.keyboard.up('ArrowLeft'); await page.keyboard.up('ArrowRight');
  expect(errors).toEqual([]);
});

test('Anton\'s special throws the rhino over his hip to the other side of him', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.click('#btnStart'); await page.click('#btnFight');
  await expect.poll(() => page.evaluate(() => window.__fight() ? window.__fight().elapsed : 0), { timeout: 8000 }).toBeGreaterThan(1.7);
  await page.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.r.x = 640; g.p.x = 300; g.p.facing = 1; g.p.meter = 100; g.p.inv = 99; });
  const hp0 = await page.evaluate(() => window.__fight().r.hp);
  await page.keyboard.press('l');
  await expect.poll(() => page.evaluate(() => window.__fight().r.state), { timeout: 3000 }).toBe('thrown');
  await expect.poll(() => page.evaluate(() => window.__fight().p.state), { timeout: 4000 }).not.toBe('special');
  const after = await page.evaluate(() => { const g = window.__fight(); return { side: Math.sign(g.r.x - g.p.x), hp: g.r.hp, jump: g.r.jump }; });
  expect(after.side).toBe(-1);                                     // it landed behind him
  expect(after.hp).toBeLessThan(hp0 - 30);
  expect(after.jump).toBe(0);
  expect(errors).toEqual([]);
});

// The real Trystero bundle is an ES module, which a file:// page cannot import, so this test serves dist/ over http
// (like the deployed site; the service worker registers too). Relays are unreachable in CI; that must not throw.
test('co-op loads the bundled Trystero module and opens a room', async ({ page }) => {
  const { spawn } = require('child_process');
  const srv = spawn('python3', ['-m', 'http.server', '8765', '-d', path.resolve(__dirname, '..', 'dist')], { stdio: 'ignore' });
  try {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/\/rest\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    for (let i = 0; i < 30; i++) { try { await page.goto('http://127.0.0.1:8765/index.html'); break; } catch (e) { await page.waitForTimeout(250); } }
    await page.click('#btnCoop'); await page.fill('#coopCode', 'kiruna'); await page.click('#btnCoopJoin');
    await expect(page.locator('#select')).toBeVisible({ timeout: 10000 });     // the module imported and joinRoom() ran
    await expect(page.locator('#selCoop')).toContainText('Room KIRUNA');
    await page.waitForTimeout(2000);
    await expect(page.locator('#selCoop')).toContainText(/nostr \d+\/\d+ · relay/);   // live diagnostics: nostr relays + Supabase relay
    expect(errors).toEqual([]);
  } finally { srv.kill(); }
});


// Relay fallback: a fake Supabase Realtime server (Phoenix protocol) shared by two pages, and a P2P transport that
// never connects. The lobby and the whole round must run through the relay.
function mockRealtime(hub, tally) {
  return async page => {
    await page.routeWebSocket(/realtime\/v1\/websocket/, ws => {
      const me = { ws, key: null, joined: false, tracked: false };
      hub.push(me);
      const send = (c, o) => { try { c.ws.send(JSON.stringify(o)); } catch (e) {} };
      const others = () => hub.filter(c => c !== me && c.joined);
      ws.onMessage(raw => {
        const m = JSON.parse(raw);
        if (m.event === 'phx_join') {
          me.key = m.payload.config.presence.key; me.joined = true;
          send(me, { topic: m.topic, event: 'phx_reply', payload: { status: 'ok', response: {} }, ref: m.ref });
          const state = {}; hub.filter(c => c !== me && c.tracked).forEach(c => { state[c.key] = { metas: [{ phx_ref: 'x' }] }; });
          send(me, { topic: m.topic, event: 'presence_state', payload: state, ref: null });
        } else if (m.event === 'presence') {
          me.tracked = true;
          others().forEach(c => send(c, { topic: m.topic, event: 'presence_diff', payload: { joins: { [me.key]: { metas: [{ phx_ref: 'x' }] } }, leaves: {} }, ref: null }));
        } else if (m.event === 'broadcast') {
          const t = m.payload.payload.d.t; tally[t] = (tally[t] || 0) + 1;
          others().forEach(c => send(c, { topic: m.topic, event: 'broadcast', payload: m.payload, ref: null }));
        } else if (m.topic === 'phoenix') {
          send(me, { topic: 'phoenix', event: 'phx_reply', payload: { status: 'ok', response: {} }, ref: m.ref });
        }
      });
      ws.onClose(() => { const i = hub.indexOf(me); if (i >= 0) hub.splice(i, 1); hub.forEach(c => send(c, { topic: 'realtime:swebits-rumble:kiruna', event: 'presence_diff', payload: { joins: {}, leaves: { [me.key]: { metas: [] } } }, ref: null })); });
    });
  };
}
test('co-op falls back to the Supabase relay when P2P never connects', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } });
  const A = await ctx.newPage(), B = await ctx.newPage();
  const errors = []; [A, B].forEach(p => p.on('pageerror', e => errors.push(e.message)));
  const hub = [], tally = {};
  for (const [p, id] of [[A, 'a'], [B, 'b']]) {
    await mockRealtime(hub, tally)(p);
    await p.addInitScript(([id]) => { window.__coopTransport = { join(code, h) { return { send() {}, selfId: id, leave() {} }; } }; }, [id]);   // P2P that never finds anyone
    await p.route(/\/rest\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await p.goto(URL);
    await p.click('#btnCoop'); await p.fill('#coopCode', 'kiruna'); await p.click('#btnCoopJoin');
    await expect(p.locator('#select')).toBeVisible();
  }
  await expect(A.locator('#selCoop')).toContainText('via relay');
  await expect(B.locator('#selCoop')).toContainText('via relay');
  await expect(A.locator('#selCoop')).toContainText('you are the host');
  await A.click('.fighter:nth-child(2)'); await A.click('#btnFight');
  await B.click('.fighter:nth-child(3)'); await B.click('#btnFight');
  await expect(A.locator('#select')).toBeHidden(); await expect(B.locator('#select')).toBeHidden();
  for (let i = 0; i < 8; i++) { await B.keyboard.down('ArrowRight'); await B.waitForTimeout(60); await B.keyboard.up('ArrowRight'); await B.keyboard.press('j'); await B.waitForTimeout(100); }
  await B.waitForTimeout(1200);
  expect(tally.in).toBeGreaterThan(3);          // guest inputs went through the relay
  expect(tally.s).toBeGreaterThan(8);           // host snapshots went through the relay
  await B.keyboard.press('Escape');
  await expect(B.locator('#title')).toBeVisible();
  await A.waitForTimeout(300);
  expect(errors).toEqual([]);
  await ctx.close();
});

// ---------------------------------------------------------------- regressions from the QA sweep
test('leaderboard names never become markup in the roster cards', async ({ page }) => {
  const rows = [{ id: 1, name: '<img src=x onerror=window.__X=1>', fighter: 'June', score: 9999, time_s: 10, level: 1, created_at: '2026-09-17T10:00:00Z' },
                { id: 2, name: '<style>*{zoom:9}', fighter: 'Anton', score: 9998, time_s: 10, level: 1, created_at: '2026-09-17T10:00:00Z' }];
  await page.route(/\/rest\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) }));
  await page.goto(URL);
  await page.click('#btnStart');
  await expect(page.locator('.fighter:nth-child(2) .best')).toContainText('<img src=x');       // shown as text
  expect(await page.evaluate(() => window.__X === 1)).toBe(false);
  expect(await page.evaluate(() => getComputedStyle(document.body).zoom)).not.toBe('9');
  await expect(page.locator('.fighter:nth-child(2) .stats')).toBeVisible();                        // card markup intact
});

test('a finished round\'s timers do not fire into the next fight', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/\/rest\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto(URL + '#pacifist=2');
  await page.click('#btnStart'); await page.click('.fighter:nth-child(2)'); await page.click('#btnFight');
  await page.waitForTimeout(3200);                    // reveal at 2 s; its result screen is armed for 6.2 s
  await page.keyboard.press('Escape');
  await expect(page.locator('#title')).toBeVisible();
  await page.click('#btnStart'); await page.click('.fighter:nth-child(3)'); await page.click('#btnFight');   // a different fighter: tapping the selected one starts at once
  await page.waitForTimeout(3600);                    // the stale timer would have fired by now
  await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('#result')).toBeVisible({ timeout: 8000 });   // this fight's own ending
  await expect(page.locator('#resBig')).toHaveText('PEACE');
  expect(errors).toEqual([]);
});

test('phone portrait: the result screen buttons are reachable without scrolling', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.route(/\/rest\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto(URL + '#pacifist=2');
  await page.tap('#btnStart'); await page.tap('.fighter:nth-child(2)'); await page.tap('#btnFight');
  await expect(page.locator('#result')).toBeVisible({ timeout: 12000 });
  const stage = await page.locator('#stage').boundingBox(), btn = await page.locator('#btnAgain').boundingBox();
  expect(btn.y + btn.height).toBeLessThanOrEqual(stage.y + stage.height + 1);
  await page.tap('#btnAgain');                        // and it works
  await expect(page.locator('#result')).toBeHidden();
  await ctx.close();
});

// several pages on one code: like the real data channel, a targeted send reaches that one page only and an untargeted
// one reaches everybody else. hub.meet(x, y) is the transport noticing each other (both ways).
async function hubRoom(browser, ids, versus) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } });
  const pages = {}, errors = [], sent = {};
  for (const id of ids) { pages[id] = await ctx.newPage(); sent[id] = {}; pages[id].on('pageerror', e => errors.push(id + ': ' + e.message)); }
  for (const [id, p] of Object.entries(pages)) {
    await p.exposeFunction('__coopOut', async (json, target) => {
      const m = JSON.parse(json); sent[id][m.t] = (sent[id][m.t] || 0) + 1;
      for (const [oid, o] of Object.entries(pages)) if (oid !== id && (!target || target === oid)) await o.evaluate(([j, from]) => window.__coopIn && window.__coopIn(j, from), [json, id]).catch(() => {});
    });
    await p.addInitScript(([id]) => {
      window.__coopTransport = { join(code, h) {
        window.__coopIn = (json, from) => h.onData(JSON.parse(json), from);
        window.__coopPeer = pid => h.onPeerJoin(pid); window.__coopPeerLeave = pid => h.onPeerLeave(pid);
        return { send: (m, target) => window.__coopOut(JSON.stringify(m), target || null), selfId: id, leave() {} };
      }, noRelay: true };
    }, [id]);
    await p.route(/\/rest\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await p.goto(URL);
    if (versus) { await p.click('#btnVersus'); await p.fill('#vsCode', 'arena'); await p.click('#btnVsJoin'); }
    else { await p.click('#btnCoop'); await p.fill('#coopCode', 'kiruna'); await p.click('#btnCoopJoin'); }
    await expect(p.locator('#select')).toBeVisible();
  }
  const meet = async (x, y) => { await pages[x].evaluate(pid => window.__coopPeer(pid), y); await pages[y].evaluate(pid => window.__coopPeer(pid), x); };
  return { ctx, pages, errors, sent, meet };
}

test('co-op: four players share one room and fight the rhino together; a fifth is told the room is full', async ({ browser }) => {
  const { ctx, pages, errors, meet } = await hubRoom(browser, ['a', 'b', 'c', 'd', 'e']);
  const { a, b, c, d, e } = pages;
  for (const [x, y] of [['a', 'b'], ['a', 'c'], ['b', 'c'], ['a', 'd'], ['b', 'd'], ['c', 'd']]) await meet(x, y);
  for (const p of [a, b, c, d]) await expect(p.locator('#selCoop')).toContainText('4 players', { timeout: 8000 });
  await expect(a.locator('#selCoop')).toContainText('you are the host');                   // 'a' is the lowest id
  await expect(c.locator('#selCoop')).toContainText('the host picks the round');
  // a fifth page on the same code is refused and never joins the round
  for (const x of ['a', 'b', 'c', 'd']) await meet(x, 'e');
  await expect(e.locator('#selCoop')).toContainText('already has 4 players');
  // everybody picks and presses FIGHT; the round starts once the last one is ready
  const picks = { a: 2, b: 3, c: 4, d: 5 };
  for (const x of ['a', 'b', 'c']) { await pages[x].click(`.fighter:nth-child(${picks[x]})`); await pages[x].click('#btnFight'); }
  await expect(a.locator('#selCoop')).toContainText('waiting for 1 more');
  await expect(a.locator('#select')).toBeVisible();
  await d.click(`.fighter:nth-child(${picks.d})`); await d.click('#btnFight');
  for (const p of [a, b, c, d]) await expect(p.locator('#select')).toBeHidden();
  await e.waitForTimeout(500); await expect(e.locator('#select')).toBeVisible();
  const cast = await a.evaluate(() => window.__fight().players.map(q => q.def.id));
  expect(cast).toEqual(['june', 'sarah', 'aswin', 'ake']);
  expect(await c.evaluate(() => window.__fight().players.length)).toBe(4);
  // the third player's keys drive the third fighter on the host
  const x0 = await a.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.r.x = 900; return g.players[2].x; });
  await c.keyboard.down('ArrowLeft');   // held until the host has walked it (five pages share one machine here)
  await expect.poll(() => a.evaluate(() => window.__fight().players[2].x), { timeout: 8000 }).toBeLessThan(x0 - 40);
  await c.keyboard.up('ArrowLeft');
  // the fourth leaves mid-fight: out of the picture on every page, and the other three play on
  await d.keyboard.press('Escape'); await expect(d.locator('#title')).toBeVisible();
  await expect.poll(() => a.evaluate(() => window.__fight().players[3].gone)).toBe(true);
  await expect.poll(() => b.evaluate(() => window.__fight().players[3].gone)).toBe(true);
  await a.waitForTimeout(300);
  for (const p of [a, b, c]) { await expect(p.locator('#select')).toBeHidden(); await expect(p.locator('#result')).toBeHidden(); }
  expect(errors).toEqual([]);
  await ctx.close();
});

test('co-op: a partner who pressed READY before the pair formed still gets the fighter it picked', async ({ browser }) => {
  const { ctx, pages, errors } = await hubRoom(browser, ['a', 'b']);
  const { a, b } = pages;
  await b.click('.fighter:nth-child(3)'); await b.click('#btnFight');                  // Sarah, ready while still alone
  await expect(b.locator('#selCoop')).toContainText('waiting for your friends');
  // a's hello reaches b first: b pairs and sends its READY before a has counted it in
  await a.evaluate(() => window.__coopPeer('b'));
  await expect(a.locator('#selCoop')).toContainText('your friend is ready as SARAH');
  await a.click('.fighter:nth-child(2)'); await a.click('#btnFight');
  await expect(a.locator('#select')).toBeHidden(); await expect(b.locator('#select')).toBeHidden();
  expect(await a.evaluate(() => window.__fight().players.map(q => q.def.id))).toEqual(['june', 'sarah']);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('co-op: when the host leaves the lobby the next in line takes over, and the ones who are ready start without it', async ({ browser }) => {
  const { ctx, pages, errors, meet } = await hubRoom(browser, ['a', 'b', 'c']);
  const { a, b, c } = pages;
  await meet('a', 'b'); await meet('a', 'c'); await meet('b', 'c');
  for (const p of [a, b, c]) await expect(p.locator('#selCoop')).toContainText('3 players', { timeout: 8000 });
  await b.click('.fighter:nth-child(3)'); await b.click('#btnFight');                  // Sarah
  await c.click('.fighter:nth-child(4)'); await c.click('#btnFight');                  // Aswin
  await expect(a.locator('#select')).toBeVisible();                                     // the host has not pressed FIGHT
  await a.keyboard.press('Escape'); await expect(a.locator('#title')).toBeVisible();   // the host walks away
  // b is next in line: it hosts now, hears c's READY again and starts the two of them
  for (const p of [b, c]) await expect(p.locator('#select')).toBeHidden({ timeout: 10000 });
  expect(await b.evaluate(() => window.__fight().players.map(q => q.def.id))).toEqual(['sarah', 'aswin']);
  expect(await c.evaluate(() => window.__fight().players.length)).toBe(2);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('co-op: two rooms that formed on one code at the same moment merge into one', async ({ browser }) => {
  const { ctx, pages, errors, meet } = await hubRoom(browser, ['a', 'b', 'c', 'd']);
  await meet('a', 'b'); await meet('c', 'd');                     // two pairs, each with its own host
  await expect(pages.a.locator('#selCoop')).toContainText('you are the host');
  await expect(pages.c.locator('#selCoop')).toContainText('you are the host');
  for (const [x, y] of [['a', 'c'], ['a', 'd'], ['b', 'c'], ['b', 'd']]) await meet(x, y);
  // the lower host takes the other room over, members and all (hosts say hello every 3 s)
  for (const p of Object.values(pages)) await expect(p.locator('#selCoop')).toContainText('4 players', { timeout: 10000 });
  await expect(pages.c.locator('#selCoop')).toContainText('the host picks the round');
  expect(errors).toEqual([]);
  await ctx.close();
});

test('versus: three players in one room fight all against all, and the last one standing wins', async ({ browser }) => {
  const { ctx, pages, errors, meet } = await hubRoom(browser, ['a', 'b', 'c'], true);
  const { a, b, c } = pages;
  await meet('a', 'b'); await meet('a', 'c'); await meet('b', 'c');
  for (const p of [a, b, c]) await expect(p.locator('#selCoop')).toContainText('3 players', { timeout: 8000 });
  await b.click('.fighter:nth-child(9)'); await b.click('#btnFight');   // THE RHINO
  await c.click('.fighter:nth-child(3)'); await c.click('#btnFight');   // Sarah
  await a.click('.fighter:nth-child(2)'); await a.click('#btnFight');   // host: June
  for (const p of [a, b, c]) await expect(p.locator('#select')).toBeHidden();
  const shape = await a.evaluate(() => { const g = window.__fight(); return { sides: g.sides.map(s => s.isRhino ? 'rhino' : s.def.id), players: g.players.length, rhinos: g.rhinos.length }; });
  expect(shape).toEqual({ sides: ['june', 'rhino', 'sarah'], players: 2, rhinos: 1 });
  // one side down is not the end while two are standing
  await a.evaluate(() => { const g = window.__fight(); g.sides[1].hp = 1; g.sides[1].x = g.sides[0].x + 150; g.sides[1].facing = -1; g.sides[2].x = g.sides[0].x + 600; g.sides[0].facing = 1; });
  for (let i = 0; i < 8 && await a.evaluate(() => window.__fight().sides[1].state !== 'ko'); i++) { await a.keyboard.press('j'); await a.waitForTimeout(260); await a.evaluate(() => { const g = window.__fight(); if (g.sides[1].state !== 'ko'){ g.sides[1].x = g.sides[0].x + 150; g.sides[1].inv = 0; } }); }
  expect(await a.evaluate(() => { const g = window.__fight(); return [g.sides[1].state, g.over]; })).toEqual(['ko', false]);
  // the rhino's page sees itself out, and the fight goes on
  await expect.poll(() => b.evaluate(() => window.__fight() && window.__fight().sides[1].state)).toBe('ko');
  await a.evaluate(() => { const g = window.__fight(); g.sides[2].hp = 1; g.sides[2].inv = 0; g.sides[2].x = g.sides[0].x + 70; g.sides[0].facing = 1; });
  for (let i = 0; i < 8 && await a.evaluate(() => !window.__fight().over); i++) { await a.keyboard.press('j'); await a.waitForTimeout(260); await a.evaluate(() => { const g = window.__fight(); if (!g.over){ g.sides[2].x = g.sides[0].x + 70; g.sides[2].inv = 0; } }); }
  expect(await a.evaluate(() => { const g = window.__fight(); return [g.over, g.vsWin]; })).toEqual([true, 0]);
  await expect(a.locator('#resBig')).toHaveText('YOU WIN', { timeout: 10000 });
  await expect(c.locator('#resBig')).toHaveText('YOU LOSE', { timeout: 10000 });
  await expect(a.locator('#resTitle')).toContainText('LAST ONE STANDING');
  const read = await a.locator('#resReadout').innerText();
  for (const who of ['JUNE', 'THE RHINO', 'SARAH']) expect(read).toContain(who);
  expect(errors).toEqual([]);
  await ctx.close();
});

// ---------------------------------------------------------------- rounds 6-8
async function startRound(page, lvl, nth) {
  await page.click('#btnStart');
  await page.selectOption('#startLevel', String(lvl));
  if (nth) await page.click(`.fighter:nth-child(${nth})`);   // never the pre-selected first card: a second click starts the fight
  await page.click('#btnFight');
  await expect(page.locator('#btnLevelGo')).toBeVisible();
  await page.click('#btnLevelGo');
  // past the ROUND n / FIGHT! banner, in game time (a loaded machine runs the game slower than the wall clock)
  await expect.poll(() => page.evaluate(() => window.__fight() ? window.__fight().elapsed : 0), { timeout: 8000 }).toBeGreaterThan(1.75);
}

test('round 6: the fight runs round the hall — up the wall, across the seam, and a charge ends once it is past you', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await startRound(page, 5, 2);                              // June
  const setup = await page.evaluate(() => { const g = window.__fight(); return { square: g.square, p: g.p.size, r: g.r.size }; });
  expect(setup).toEqual({ square: true, p: 0.66, r: 0.66 });
  // walk right off the end of the floor: the track turns up the right wall (no wall stops you)
  await page.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.r.x = g.p.x - 700; g.p.inv = 99; });
  // watch every frame (a fast fighter is only on the wall for a moment before walking on to the ceiling)
  await page.evaluate(() => { window.__onWall = false; (function tick(){ const g = window.__fight(); if (g){ const b = window.__sq().base(g.p.x); if (b.x > 900 && b.y < 430) window.__onWall = true; } if (!window.__onWall) requestAnimationFrame(tick); })(); });
  await page.keyboard.down('ArrowRight');
  await expect.poll(() => page.evaluate(() => window.__onWall), { timeout: 6000 }).toBe(true);
  await page.keyboard.up('ArrowRight');
  // a rhino a whole lap (plus a step) ahead is right in front of you: players are re-expressed the short way round
  const P = await page.evaluate(() => window.__sq().P);
  await page.evaluate((P) => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.p.x = 300; g.p.state = 'idle'; g.p.y = 0; g.p.vy = 0; g.r.x = 300 + 150 + P; }, P);
  await page.waitForTimeout(80);
  const near = await page.evaluate(() => { const g = window.__fight(); return { d: g.r.x - g.p.x, hp: g.r.hp }; });
  expect(Math.abs(near.d - 150)).toBeLessThan(40);
  for (let i = 0; i < 4; i++) { await page.keyboard.press('j'); await page.waitForTimeout(380); }
  expect(await page.evaluate(() => window.__fight().r.hp)).toBeLessThan(near.hp);
  // a charge has no arena wall to stop at here: it ends once it has run 200 px past its target, well inside 2.6 s
  await page.evaluate(() => { const g = window.__fight(); g.p.x = g.r.x + 400; g.p.inv = 99; g.r.facing = 1; g.r.state = 'charge'; g.r.st = 0; g.r.dir = 1; g.r.cx0 = g.r.x; g.r.trampled = {}; });
  const t0 = Date.now();
  await expect.poll(() => page.evaluate(() => window.__fight().r.state), { timeout: 4000 }).not.toBe('charge');
  const past = await page.evaluate(() => { const g = window.__fight(); return (g.r.x - g.p.x) * g.r.dir; });
  expect(past).toBeGreaterThan(150);
  expect(Date.now() - t0).toBeLessThan(3200);
  expect(errors).toEqual([]);
});

const ARROW = { A: 'ArrowLeft', T: 'ArrowRight', C: 'ArrowUp', G: 'ArrowDown' };
test('round 7: typing the repeat shoves the rhino back, a finished repeat moves on, and over the edge it goes', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await startRound(page, 6, 2);
  const x0 = await page.evaluate(() => window.__fight().push.x);
  for (const L of 'ATATA') { await page.keyboard.press(ARROW[L]); await page.waitForTimeout(40); }
  await page.keyboard.press('t');                                // the letter key works as well as its arrow
  await page.waitForTimeout(100);
  const u = await page.evaluate(() => { const g = window.__fight(); return { stage: g.p.pu.stage, pos: g.p.pu.pos, slips: g.p.pu.slips, letters: g.p.pu.letters, x: g.push.x }; });
  expect(u).toMatchObject({ stage: 1, pos: 0, slips: 0, letters: 6 });
  expect(u.x).toBeGreaterThan(x0 + 20);
  // the next repeat is AAT: one right letter at the rhino's edge pushes it off
  const edge = await page.evaluate(() => window.__push().win);
  await page.evaluate((e) => { window.__fight().push.x = e - 2; }, edge);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => page.evaluate(() => window.__fight().won)).toBe(true);
  await expect(page.locator('#result')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#resBig')).toHaveText('PUSHED OFF');
  await expect(page.locator('#btnNext')).toBeVisible();
  await expect(page.locator('#btnNext')).toHaveText('NEXT ROUND: CINNAMON BUN DAY');
  expect(errors).toEqual([]);
});

test('round 7: a four-arrow chord is one slip, never a letter, and there is no pacifist ending', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL + '#pacifist=1');                          // the pacifist timer would run out after 1 s
  await startRound(page, 6, 2);
  // all four in one frame, the wrong one first: mashing must never find the right letter by luck
  await page.evaluate(() => { ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown'].forEach(k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))); });
  await page.waitForTimeout(120);
  await page.evaluate(() => { ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown'].forEach(k => window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }))); });
  const u = await page.evaluate(() => { const p = window.__fight().p.pu; return { slips: p.slips, letters: p.letters, pos: p.pos }; });
  expect(u).toEqual({ slips: 1, letters: 0, pos: 0 });
  await page.waitForTimeout(1800);
  const g = await page.evaluate(() => { const g = window.__fight(); return { over: g.over, pacifist: g.pacifist }; });
  expect(g).toEqual({ over: false, pacifist: false });
  // and pushed off your own edge is a loss that says what happened
  const lose = await page.evaluate(() => window.__push().lose);
  await page.evaluate((l) => { window.__fight().push.x = l + 1; }, lose);
  await expect(page.locator('#result')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#resBig')).toHaveText('PUSHED OUT');
  await expect(page.locator('#resReadout')).toContainText('slips');
  expect(errors).toEqual([]);
});

test('round 8: only a bun hurts the rhino, and a tray never refunds its own meter', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await startRound(page, 7, 2);                                  // June: the axe kick would land in any other round
  const freeze = () => page.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.p.inv = 99; });
  await freeze();
  await page.evaluate(() => { const g = window.__fight(); g.r.x = g.p.x + 230; });
  const before = await page.evaluate(() => { const g = window.__fight(); return { hp: g.r.hp, hits: g.p.hitsLanded }; });
  // a fist or a special that somehow started anyway still does nothing (the guard sits in hitRhino itself)
  await page.evaluate(() => { const g = window.__fight(); g.p.state = 'punch'; g.p.st = .05; g.p.attackHit = false; });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const g = window.__fight(); g.p.state = 'special'; g.p.st = 0; g.p.attackHit = false; });
  await page.waitForTimeout(2800);
  await freeze();
  const after = await page.evaluate(() => { const g = window.__fight(); return { hp: g.r.hp, hits: g.p.hitsLanded }; });
  expect(after).toEqual(before);
  // J throws a bun: that one counts
  await page.evaluate(() => { const g = window.__fight(); g.p.state = 'idle'; g.p.scale = 1; g.r.x = g.p.x + 300; });
  await page.keyboard.press('j');
  await expect.poll(() => page.evaluate(() => window.__fight().p.hitsLanded)).toBe(1);
  expect(await page.evaluate(() => window.__fight().r.hp)).toBeLessThan(before.hp);
  // L with a full meter sends the whole tray: the meter is spent and stays spent however many buns land
  await freeze();
  await page.evaluate(() => { const g = window.__fight(); g.p.meter = 100; g.r.x = g.p.x + 320; });
  await page.keyboard.press('l');
  await page.waitForTimeout(900);
  const tray = await page.evaluate(() => { const g = window.__fight(); return { meter: g.p.meter, hits: g.p.hitsLanded, thrown: g.bunStats.thrown }; });
  expect(tray.thrown).toBe(6);
  expect(tray.hits).toBeGreaterThan(2);
  expect(tray.meter).toBe(0);
  expect(errors).toEqual([]);
});

test('round 8: a dropped bun feeds the rhino (never past full) unless you pick it up first, and a late bun cannot flip a loss', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await startRound(page, 7, 2);
  await page.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.p.inv = 99; g.r.x = 700; g.p.x = 200; g.r.facing = -1;
    g.r.hp = g.r.maxhp - 4; g.bunsGround.push({ x: g.r.x - 2.35 * 84, t: 0 }); });
  await page.waitForTimeout(150);
  const fed = await page.evaluate(() => { const g = window.__fight(); return { hp: g.r.hp, max: g.r.maxhp, eaten: g.bunStats.eaten, left: g.bunsGround.length }; });
  expect(fed).toEqual({ hp: fed.max, max: fed.max, eaten: 1, left: 0 });
  // one that lands at your feet fills the tray instead
  await page.evaluate(() => { const g = window.__fight(); g.p.meter = 0; g.bunsGround.push({ x: g.p.x + 5, t: 0 }); });
  await page.waitForTimeout(150);
  const picked = await page.evaluate(() => { const g = window.__fight(); return { meter: g.p.meter, picked: g.bunStats.picked }; });
  expect(picked).toEqual({ meter: 12, picked: 1 });
  // foraging: it walks over to a dropped bun and eats it
  await page.evaluate(() => { const g = window.__fight(); g.r.hp = 100; g.bunsGround.push({ x: 380, t: 0 }); g.r.state = 'forage'; g.r.st = 0; });
  await expect.poll(() => page.evaluate(() => window.__fight().bunStats.eaten), { timeout: 4000 }).toBe(2);
  // the crew is down with a bun still in the air: it lands on nothing, and the loss stays a loss
  await page.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.r.hp = 3; g.r.x = g.p.x + 420; });
  await page.keyboard.press('j');
  await page.waitForTimeout(60);
  await page.evaluate(() => { const g = window.__fight(); g.over = true; g.won = false; });
  await page.waitForTimeout(900);
  const end = await page.evaluate(() => { const g = window.__fight(); return { won: g.won, hp: g.r.hp, state: g.r.state }; });
  expect(end).toEqual({ won: false, hp: 3, state: 'idle' });
  expect(errors).toEqual([]);
});

test('versus online: a duel is always on one of the five duel arenas, whatever the round picker says', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } });
  const A = await ctx.newPage(), B = await ctx.newPage();
  const errors = []; [A, B].forEach(p => p.on('pageerror', e => errors.push(e.message)));
  await wireCoop(A, 'a', () => B, {}); await wireCoop(B, 'b', () => A, {});
  for (const p of [A, B]) {
    await p.route(/\/rest\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await p.goto(URL);
    await p.click('#btnVersus'); await p.fill('#vsCode', 'duel'); await p.click('#btnVsJoin');
    await expect(p.locator('#select')).toBeVisible();
  }
  await A.evaluate(() => window.__coopPeer('b')); await B.evaluate(() => window.__coopPeer('a'));
  // rounds 6-8 are not arenas: the picker will not offer them in a versus room
  expect(await A.evaluate(() => Array.from(document.getElementById('startLevel').options).filter(o => !o.disabled).map(o => o.value))).toEqual(['0', '1', '2', '3', '4']);
  await A.evaluate(() => { document.getElementById('startLevel').value = '7'; });   // forced anyway
  await A.click('.fighter:nth-child(2)'); await A.click('#btnFight');
  await B.click('.fighter:nth-child(3)'); await B.click('#btnFight');
  await expect(A.locator('#select')).toBeHidden(); await expect(B.locator('#select')).toBeHidden();
  for (const p of [A, B]) {
    const s = await p.evaluate(() => { const g = window.__fight(); return { vs: !!g.vs, level: window.__level(), square: !!g.square, push: !!g.push, buns: !!g.buns }; });
    expect(s.vs).toBe(true); expect(s.level).toBeLessThanOrEqual(4); expect(s).toMatchObject({ square: false, push: false, buns: false });
  }
  expect(errors).toEqual([]);
  await ctx.close();
});

test('co-op round 7: the guest\'s letters reach the host in the order they were typed', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } });
  const A = await ctx.newPage(), B = await ctx.newPage();
  const errors = []; [A, B].forEach(p => p.on('pageerror', e => errors.push(e.message)));
  await wireCoop(A, 'a', () => B, {}); await wireCoop(B, 'b', () => A, {});
  for (const p of [A, B]) {
    await p.route(/\/rest\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await p.goto(URL);
    await p.click('#btnCoop'); await p.fill('#coopCode', 'lab'); await p.click('#btnCoopJoin');
    await expect(p.locator('#select')).toBeVisible();
  }
  await A.evaluate(() => window.__coopPeer('b')); await B.evaluate(() => window.__coopPeer('a'));
  await A.selectOption('#startLevel', '6');
  await A.click('.fighter:nth-child(2)'); await A.click('#btnFight');
  await B.click('.fighter:nth-child(3)'); await B.click('#btnFight');
  await expect(A.locator('#select')).toBeHidden(); await expect(B.locator('#select')).toBeHidden();
  // past the banner in game time (a loaded machine runs the game slower than the wall clock), as the guest sees it
  await expect.poll(() => B.evaluate(() => window.__fight().elapsed), { timeout: 8000 }).toBeGreaterThan(1.8);
  // four letters inside one guest frame: a per-frame set would have kept two of them, in no particular order
  await B.evaluate(() => { ['ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight'].forEach(k => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true })); }); });
  await expect.poll(() => A.evaluate(() => { const u = window.__fight().players[1].pu; return [u.letters, u.slips, u.pos]; }), { timeout: 4000 }).toEqual([4, 0, 4]);
  await expect.poll(() => B.evaluate(() => { const g = window.__fight(); return g.push.pred ? g.push.pred.pos : -1; }), { timeout: 4000 }).toBe(4);
  expect(await A.evaluate(() => window.__fight().players[0].pu.letters)).toBe(0);   // and none of them went to the host's own row
  expect(errors).toEqual([]);
  await ctx.close();
});

async function coopPair(browser, level, picks) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } });
  const A = await ctx.newPage(), B = await ctx.newPage();
  const errors = []; [A, B].forEach(p => p.on('pageerror', e => errors.push(e.message)));
  await wireCoop(A, 'a', () => B, {}); await wireCoop(B, 'b', () => A, {});
  for (const p of [A, B]) {
    await p.route(/\/rest\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await p.goto(URL);
    await p.click('#btnCoop'); await p.fill('#coopCode', 'pair'); await p.click('#btnCoopJoin');
    await expect(p.locator('#select')).toBeVisible();
  }
  await A.evaluate(() => window.__coopPeer('b')); await B.evaluate(() => window.__coopPeer('a'));
  await A.selectOption('#startLevel', String(level));
  await A.click(`.fighter:nth-child(${picks[0]})`); await A.click('#btnFight');
  await B.click(`.fighter:nth-child(${picks[1]})`); await B.click('#btnFight');
  await expect(A.locator('#select')).toBeHidden(); await expect(B.locator('#select')).toBeHidden();
  await expect.poll(() => B.evaluate(() => window.__fight().elapsed), { timeout: 8000 }).toBeGreaterThan(1.8);
  return { ctx, A, B, errors };
}

test('co-op round 7: the guest keeps the slip lockout itself, so its row and the host agree after a mistake', async ({ browser }) => {
  const { ctx, A, B, errors } = await coopPair(browser, 6, [2, 3]);
  const key = (k) => B.evaluate((k) => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true })); }, k);
  // a wrong letter with a right one straight after it in the same frame, then a right one while still reeling: all lost
  await B.evaluate(() => { ['ArrowUp', 'ArrowLeft'].forEach(k => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true })); }); });
  await B.waitForTimeout(60); await key('ArrowLeft');
  await B.waitForTimeout(700); await key('ArrowLeft');            // the lockout is over: this one counts
  await expect.poll(() => A.evaluate(() => { const u = window.__fight().players[1].pu; return [u.slips, u.letters, u.pos]; }), { timeout: 4000 }).toEqual([1, 1, 1]);
  await expect.poll(() => B.evaluate(() => window.__fight().push.pred.pos), { timeout: 4000 }).toBe(1);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('co-op: a flash fades on the guest too (it used to stay washed out white after a knockout)', async ({ browser }) => {
  const { ctx, A, B, errors } = await coopPair(browser, 0, [2, 3]);
  await A.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.r.hp = 1; g.r.x = g.p.x + 150; g.r.facing = -1; g.p.facing = 1; });
  await A.keyboard.press('j');
  await expect.poll(() => B.evaluate(() => window.__fight().r.state), { timeout: 6000 }).toBe('gone');   // the burst and its flash happen on the guest's page
  await B.waitForTimeout(1200);
  expect(await B.evaluate(() => window.__flash())).toBeLessThan(0.05);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('June kicks above her own head, and the axe kick comes down after three of them', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.click('#btnStart');
  await page.click('.fighter:nth-child(2)');                    // June
  await page.click('#btnFight');
  await expect.poll(() => page.evaluate(() => window.__fight() ? window.__fight().elapsed : 0), { timeout: 8000 }).toBeGreaterThan(1.7);
  await page.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.r.x = 860; g.p.x = 200; g.p.inv = 99; });
  await page.keyboard.press('k');
  const peak = await page.evaluate(async () => {
    let foot = 1e9, head = 1e9;
    for (let i = 0; i < 25; i++){ const p = window.__fight().p; foot = Math.min(foot, p.footPt[1]); head = Math.min(head, p.headPt[1]); await new Promise(r => setTimeout(r, 16)); }
    return { foot, head };
  });
  expect(peak.foot).toBeLessThan(peak.head - 20);               // the foot goes higher than her head (headPt is its centre)
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.__fight(); g.r.x = g.p.x + 200; g.r.facing = -1; g.p.facing = 1; g.p.meter = 100; g.p.state = 'idle'; });
  const hp0 = await page.evaluate(() => window.__fight().r.hp);
  await page.keyboard.press('l');
  await expect.poll(() => page.evaluate(() => window.__fight().p.state), { timeout: 3000 }).toBe('special');   // the key lands on the next frame
  await expect.poll(() => page.evaluate(() => window.__fight().p.state), { timeout: 4000 }).not.toBe('special');
  const done = await page.evaluate(() => { const g = window.__fight(); return { hits: g.p.hitsLanded, hp: g.r.hp }; });
  expect(done.hits).toBeGreaterThanOrEqual(2);
  expect(done.hp).toBeLessThan(hp0 - 20);
  expect(errors).toEqual([]);
});

test('Sarah\'s insults cost the rhino health from across the arena, but only the way she is facing', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.click('#btnStart');
  await page.click('.fighter:nth-child(3)');                    // Sarah
  await page.click('#btnFight');
  await expect.poll(() => page.evaluate(() => window.__fight() ? window.__fight().elapsed : 0), { timeout: 8000 }).toBeGreaterThan(1.7);
  // 420 px away: far out of fist reach, well within earshot
  await page.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.p.x = 200; g.r.x = 620; g.p.inv = 99; g.p.meter = 100; });
  const hp0 = await page.evaluate(() => window.__fight().r.hp);
  await page.keyboard.press('l');
  await expect.poll(() => page.evaluate(() => window.__fight().p.state), { timeout: 3000 }).toBe('special');
  // one line at a time, and slow enough to read: never two of her bubbles on screen at once
  const bubbles = await page.evaluate(async () => { let most = 0; for (let i = 0; i < 40; i++){ most = Math.max(most, window.__fx().filter(e => e.say).length); await new Promise(r => setTimeout(r, 50)); } return most; });
  expect(bubbles).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__fight().p.state), { timeout: 8000 }).not.toBe('special');
  const out = await page.evaluate(() => { const g = window.__fight(); return { hits: g.p.hitsLanded, hp: g.r.hp }; });
  expect(out.hits).toBe(5);
  expect(out.hp).toBeLessThan(hp0);
  // with the rhino behind her, the same barrage hits nothing
  await page.evaluate(() => { const g = window.__fight(); g.r.x = 620; g.p.x = 900; g.r.timer = 1e9; g.r.state = 'idle'; g.p.meter = 100; g.p.state = 'idle'; });
  await page.waitForTimeout(80);
  await page.evaluate(() => { const g = window.__fight(); g.p.facing = 1; g.p.state = 'special'; g.p.st = 0; g.p.specialHits = 0; g.p.dashDir = 1; });
  await expect.poll(() => page.evaluate(() => window.__fight().p.state), { timeout: 8000 }).not.toBe('special');
  expect(await page.evaluate(() => window.__fight().p.hitsLanded)).toBe(5);
  expect(errors).toEqual([]);
});

test('round 8: a bun under its belly still gets eaten, and a tray interrupted in the wind-up keeps its meter', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await startRound(page, 7, 2);
  // forage used to steer the body onto the bun and flip round every frame without ever eating it
  await page.evaluate(() => { const g = window.__fight(); g.p.inv = 99; g.p.x = 150; g.r.x = 640; g.r.facing = -1; g.r.hp = 200; g.bunsGround.length = 0; g.bunsGround.push({ x: 700, t: 0 }); g.r.state = 'forage'; g.r.st = 0; window.__flips = 0; window.__lastF = g.r.facing; });
  for (let i = 0; i < 30; i++) {
    const s = await page.evaluate(() => { const g = window.__fight(); if (g.r.facing !== window.__lastF){ window.__flips++; window.__lastF = g.r.facing; } return { eaten: g.bunStats.eaten, flips: window.__flips }; });
    if (s.eaten) break;
    await page.waitForTimeout(90);
  }
  const f = await page.evaluate(() => { const g = window.__fight(); return { eaten: g.bunStats.eaten, flips: window.__flips, hp: g.r.hp }; });
  expect(f.eaten).toBe(1); expect(f.hp).toBe(210); expect(f.flips).toBeLessThan(3);
  // a bun just behind it: it turns round for it rather than walking backwards across the field
  await page.evaluate(() => { const g = window.__fight(); g.r.x = 500; g.r.facing = -1; g.bunsGround.push({ x: 650, t: 0 }); g.r.state = 'forage'; g.r.st = 0; window.__x0 = g.r.x; });
  await expect.poll(() => page.evaluate(() => window.__fight().bunStats.eaten), { timeout: 4000 }).toBe(2);
  expect(await page.evaluate(() => Math.abs(window.__fight().r.x - window.__x0))).toBeLessThan(120);
  // pressing TRAY as the charge arrives: knocked out of the wind-up, the meter is still there to try again
  await page.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.r.x = g.p.x + 400; g.p.meter = 100; g.p.state = 'idle'; });
  await page.keyboard.press('l');
  await page.evaluate(() => { const g = window.__fight(); g.p.state = 'hurt'; g.p.st = 0; });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => { const g = window.__fight(); return [g.p.meter, g.bunStats.thrown]; })).toEqual([100, 0]);
  expect(errors).toEqual([]);
});

test('co-op round 8: the guest sees the buns and the same tally as the host', async ({ browser }) => {
  const { ctx, A, B, errors } = await coopPair(browser, 7, [2, 3]);
  await A.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.players.forEach(q => { q.inv = 99; }); g.r.x = g.p2.x + 350; });
  for (let i = 0; i < 3; i++) {   // one throw at a time: wait out each one in game time (a loaded machine runs slower than the wall clock)
    await B.keyboard.press('j');
    await expect.poll(() => A.evaluate(() => window.__fight().bunStats.thrown), { timeout: 5000 }).toBe(i + 1);
    await expect.poll(() => A.evaluate(() => window.__fight().p2.state), { timeout: 5000 }).not.toBe('throw');
  }
  await expect.poll(() => A.evaluate(() => window.__fight().bunStats.thrown), { timeout: 5000 }).toBe(3);
  await expect.poll(() => B.evaluate(() => window.__fight().bunStats.thrown), { timeout: 5000 }).toBe(3);
  expect(await A.evaluate(() => window.__fight().p2.hitsLanded)).toBeGreaterThan(0);   // the thrower is credited
  expect(errors).toEqual([]);
  await ctx.close();
});

test('nothing lands after the bell, and a grown fighter in round 5 can still punch a small rhino', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  // round 5: you at 80 %, the last false positive at 20 % and shrunk — the fist is far above it
  await startRound(page, 4, 2);
  await page.evaluate(() => { const g = window.__fight(); const r = g.rhinos[1]; g.rhinos[0].state = 'ko';
    g.p.share = .8; r.share = .2; g.rhinos[0].share = 0; g.p.size = 1.96; r.size = .69; g.p.hp = 80; r.hp = 20;
    r.state = 'idle'; r.timer = 1e9; g.p.inv = 99; g.p.x = r.x - 1.6 * 84 * .69 - 60; g.p.facing = 1; r.facing = -1; });
  const s0 = await page.evaluate(() => window.__fight().rhinos[1].share);
  for (let i = 0; i < 3; i++) { await page.keyboard.press('j'); await page.waitForTimeout(380); }
  expect(await page.evaluate(() => window.__fight().rhinos[1].share)).toBeLessThan(s0);
  // the fight is over (the bell, a knockout): a punch already on its way does nothing and counts nothing
  await page.evaluate(() => { const g = window.__fight(); g.over = true; g.p.state = 'punch'; g.p.st = .05; g.p.attackHit = false; window.__h0 = [g.p.hitsLanded, g.rhinos[1].share]; });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => { const g = window.__fight(); return [g.p.hitsLanded, g.rhinos[1].share]; })).toEqual(await page.evaluate(() => window.__h0));
  expect(errors).toEqual([]);
});

test('touch pads keep a held press when the thumb drifts, are big enough, and never overlap', async ({ browser }) => {
  for (const vp of [{ width: 844, height: 390 }, { width: 667, height: 375 }, { width: 414, height: 896 }, { width: 390, height: 844 }, { width: 375, height: 667 }, { width: 360, height: 800 }, { width: 340, height: 720 }, { width: 320, height: 568 }]) {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto(URL);
    await page.click('#btnStart'); await page.click('#btnFight');   // pads are laid out in a fight
    const r = await page.evaluate(() => {
      const bs = Array.from(document.querySelectorAll('.tb')).filter(b => b.offsetParent !== null), rs = bs.map(b => b.getBoundingClientRect());   // round 11's pads are hidden until then
      let overlap = 0;
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i], b = rs[j], dx = (a.left + a.width / 2) - (b.left + b.width / 2), dy = (a.top + a.height / 2) - (b.top + b.height / 2);
        if (Math.hypot(dx, dy) < (a.width + b.width) / 2 - 0.5) overlap++;   // they are circles
      }
      return { none: bs.every(b => getComputedStyle(b).touchAction === 'none'), min: Math.min.apply(null, rs.map(q => q.width)), overlap };
    });
    expect(r, `${vp.width}x${vp.height}`).toEqual({ none: true, min: r.min, overlap: 0 });
    expect(r.min, `${vp.width}x${vp.height}`).toBeGreaterThanOrEqual(48);
    await ctx.close();
  }
});

// ---------------------------------------------------------------- rounds 9-11 (IceLab Rumble's own)
// Round 9: every 30 s the classifier reports again. A species that belongs in a Kiruna sample ends the round;
// anything else buys another pass, up to four. #reveal=<kind> forces the species so the two paths are testable.
test('round 9: a species that belongs in the sample ends the round', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL + '#pacifist=2&reveal=reindeer');
  await startRound(page, 8, 2);
  for (let i = 0; i < 25; i++) { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(160); }   // dodge only
  await expect(page.locator('#result')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#resBig')).toHaveText('IDENTIFIED');
  await expect(page.locator('#resReadout')).toContainText('pass 1/4: REINDEER');
  await expect(page.locator('#btnNext')).toHaveText('NEXT ROUND: THE THIRD DIMENSION');
  expect(errors).toEqual([]);
});

test('round 9: a species that does not belong runs the pipeline again, four times', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL + '#pacifist=1&reveal=camel');
  await startRound(page, 8, 2);
  // the first pass reveals a camel and the fight carries on: a second pass starts, no result screen yet
  await expect.poll(() => page.evaluate(() => { const g = window.__fight(); return g ? g.spawns : 0; }), { timeout: 15000 }).toBeGreaterThan(1);
  await expect(page.locator('#result')).toBeHidden();
  expect(await page.evaluate(() => window.__fight().over)).toBe(false);
  // …until the fourth pass, which stands whatever it says
  await expect(page.locator('#result')).toBeVisible({ timeout: 40000 });
  await expect(page.locator('#resBig')).toHaveText('CALL IT');
  await expect(page.locator('#resReadout')).toContainText('pass 4/4: CAMEL');
  expect(errors).toEqual([]);
});

// Round 10 has a z axis: the rhino retreats down the floor grid, where nothing reaches it, and charges the screen.
test('round 10: the rhino goes down the z axis, out of reach, and comes back', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await startRound(page, 9, 2);
  await page.evaluate(() => { const g = window.__fight(); g.p.inv = 1e9; g.r.state = 'zback'; g.r.st = 0; g.r.zTarget = 560; });
  await page.waitForFunction(() => { const g = window.__fight(); return g && g.r.state === 'zaim' && g.r.z > 300; }, null, { timeout: 10000 });
  // punching thin air down the lane does nothing while it is back there, even right in front of it on screen
  const hpBefore = await page.evaluate(() => { const g = window.__fight(); g.p.x = g.r.x - 120; g.p.facing = 1; return g.r.hp; });
  for (let i = 0; i < 4; i++) { await page.keyboard.press('j'); await page.waitForTimeout(90); }
  expect(await page.evaluate(() => window.__fight().r.hp)).toBe(hpBefore);
  // …then it arrives on the front plane, where it can be hit again
  await page.waitForFunction(() => { const g = window.__fight(); return g && g.r.z === 0 && g.r.state !== 'zaim' && g.r.state !== 'zcharge'; }, null, { timeout: 10000 });
  await page.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.p.x = g.r.x - 200; g.p.facing = 1; g.p.state = 'idle'; });
  for (let i = 0; i < 6; i++) { await page.keyboard.press('j'); await page.waitForTimeout(140); }
  expect(await page.evaluate(() => window.__fight().r.hp)).toBeLessThan(hpBefore);
  expect(errors).toEqual([]);
});

// Round 11 is a plane, not a line: both of you move in x and z on an island five times the size of the old arena.
test('round 11: the island is a plane you walk around, and reach depends on depth', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await startRound(page, 10, 2);
  const st = () => page.evaluate(() => { const g = window.__fight(); return { pz: g.p.z, rhp: g.r.hp }; });
  await page.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.p.inv = 1e9; });
  const start = await st();
  // up and down walk into and out of the screen
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(500); await page.keyboard.up('ArrowUp');
  const far = await st();
  expect(far.pz).toBeGreaterThan(start.pz);
  await page.keyboard.down('ArrowDown'); await page.waitForTimeout(400); await page.keyboard.up('ArrowDown');
  expect((await st()).pz).toBeLessThan(far.pz);
  // swinging from another line of the island does nothing, however close in x
  await page.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.p.x = g.r.x - 150; g.p.z = g.r.z + 400; g.p.facing = 1; });
  const hp0 = (await st()).rhp;
  for (let i = 0; i < 4; i++) { await page.keyboard.press('j'); await page.waitForTimeout(110); }
  expect((await st()).rhp).toBe(hp0);
  // step onto its line and the same punch lands
  await page.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.p.x = g.r.x - 150; g.p.z = g.r.z; g.p.facing = 1; });
  for (let i = 0; i < 6; i++) { await page.keyboard.press('j'); await page.waitForTimeout(130); }
  expect((await st()).rhp).toBeLessThan(hp0);
  // space jumps on the island (the arrows are taken)
  await expect.poll(() => page.evaluate(() => window.__fight().p.state), { timeout: 3000 }).toBe('idle');
  await page.keyboard.press(' ');
  await expect.poll(() => page.evaluate(() => window.__fight().p.y), { timeout: 2000 }).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('round 11: the zoom button magnifies the island, and the pads swap for the plane', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await startRound(page, 10, 2);
  await expect(page.locator('#zoomBtn')).toBeVisible();
  const zoom = () => page.evaluate(() => window.__zoom());
  expect(await zoom()).toBe(1);
  await page.click('#zoomBtn');
  expect(await zoom()).toBe(1.7);
  await page.keyboard.press('v');                            // V cycles it too
  expect(await zoom()).toBe(2.6);
  await page.keyboard.press('v');
  expect(await zoom()).toBe(1);
  expect(await page.evaluate(() => document.body.getAttribute('data-arena'))).toBe('island');
  await page.keyboard.press('Escape');
  await expect(page.locator('#zoomBtn')).toBeHidden();
  expect(await page.evaluate(() => document.body.getAttribute('data-arena'))).toBe('flat');
  expect(errors).toEqual([]);
});

test('the credits screen celebrates IceLab and names the bench', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.click('#btnCredits');
  await expect(page.locator('#credits')).toBeVisible();
  await expect(page.locator('#credits')).toContainText('Why IceLab is great');
  await expect(page.locator('#credRoster')).toContainText('Anton, June, Sarah, Aswin, Åke, Abigail, Sasha, Suvam');
  await page.click('#btnCreditsBack');
  await expect(page.locator('#title')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Aswin dresses up and talks so loud the rhino takes damage and runs — whichever side of him it is on', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.click('#btnStart');
  await page.click('.fighter:nth-child(4)');                    // Aswin
  await expect(page.locator('#selMove')).toContainText('very loud');
  await page.click('#btnFight');
  await expect.poll(() => page.evaluate(() => window.__fight() ? window.__fight().elapsed : 0), { timeout: 8000 }).toBeGreaterThan(1.7);
  // the rhino BEHIND him, 350 px off: no contact, and he is not even facing it
  await page.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.p.x = 700; g.r.x = 350; g.p.inv = 1e9; g.p.meter = 100; });
  const hp0 = await page.evaluate(() => window.__fight().r.hp);
  await page.keyboard.press('l');
  await expect.poll(() => page.evaluate(() => window.__fight().p.state), { timeout: 3000 }).toBe('special');
  await expect.poll(() => page.evaluate(() => window.__fight().r.state), { timeout: 4000 }).toBe('scared');
  const x0 = await page.evaluate(() => window.__fight().r.x);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__fight().r.x)).toBeLessThan(x0);   // running away from him
  await expect.poll(() => page.evaluate(() => window.__fight().p.state), { timeout: 8000 }).not.toBe('special');
  const out = await page.evaluate(() => { const g = window.__fight(); return { hits: g.p.hitsLanded, hp: g.r.hp, meter: g.p.meter }; });
  expect(out.hits).toBe(3);
  expect(out.hp).toBeLessThan(hp0);
  expect(out.meter).toBe(0);
  expect(errors).toEqual([]);
});

test('Åke points a Claude spark at the rhino and it is out on the spot, whatever its health', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.click('#btnStart');
  await page.click('.fighter:nth-child(5)');                    // Åke
  await expect(page.locator('#selName')).toHaveText('ÅKE');
  await page.click('#btnFight');
  await expect.poll(() => page.evaluate(() => window.__fight() ? window.__fight().elapsed : 0), { timeout: 8000 }).toBeGreaterThan(1.7);
  // full health, well across the arena: no contact needed
  await page.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.p.x = 150; g.r.x = 820; g.p.inv = 1e9; g.p.meter = 100; });
  expect(await page.evaluate(() => { const g = window.__fight(); return g.r.hp === g.r.maxhp; })).toBe(true);
  await page.keyboard.press('l');
  await expect.poll(() => page.evaluate(() => window.__fight().p.state), { timeout: 3000 }).toBe('special');
  await expect.poll(() => page.evaluate(() => window.__fight().r.state), { timeout: 4000 }).toMatch(/^(ko|gone)$/);
  const g = await page.evaluate(() => { const g = window.__fight(); return { hp: g.r.hp, won: g.won, over: g.over, hits: g.p.hitsLanded, meter: g.p.meter }; });
  expect(g).toEqual({ hp: 0, won: true, over: true, hits: 1, meter: 0 });
  await expect(page.locator('#result')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#resReadout')).toContainText('Claude Mind Spark');
  expect(errors).toEqual([]);
});

test('Abigail\'s fingertip jets soak the rhino from across the arena and wash it back — but only in front of her', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.click('#btnStart');
  await page.click('.fighter:nth-child(6)');                    // Abigail
  await expect(page.locator('#selName')).toHaveText('ABIGAIL');
  await page.click('#btnFight');
  await expect.poll(() => page.evaluate(() => window.__fight() ? window.__fight().elapsed : 0), { timeout: 8000 }).toBeGreaterThan(1.7);
  // well out of fist reach, in front of her
  await page.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.p.x = 150; g.r.x = 620; g.p.inv = 1e9; g.p.meter = 100; });
  const before = await page.evaluate(() => ({ hp: window.__fight().r.hp, x: window.__fight().r.x }));
  await page.keyboard.press('l');
  await expect.poll(() => page.evaluate(() => window.__fight().p.state), { timeout: 3000 }).toBe('special');
  await expect.poll(() => page.evaluate(() => window.__fight().p.state), { timeout: 6000 }).not.toBe('special');
  const after = await page.evaluate(() => { const g = window.__fight(); return { hits: g.p.hitsLanded, hp: g.r.hp, x: g.r.x, meter: g.p.meter }; });
  expect(after.hits).toBe(6);
  expect(after.hp).toBeLessThan(before.hp);
  expect(after.x).toBeGreaterThan(before.x + 60);               // washed back, away from her
  expect(after.meter).toBe(0);
  // the rhino behind her stays dry
  await page.evaluate(() => { const g = window.__fight(); g.r.x = 300; g.p.x = 700; g.r.timer = 1e9; g.r.state = 'idle'; g.p.state = 'idle'; });
  await page.waitForTimeout(80);
  await page.evaluate(() => { const g = window.__fight(); g.p.facing = 1; g.p.state = 'special'; g.p.st = 0; g.p.specialHits = 0; g.p.dashDir = 1; });
  await expect.poll(() => page.evaluate(() => window.__fight().p.state), { timeout: 6000 }).not.toBe('special');
  expect(await page.evaluate(() => window.__fight().p.hitsLanded)).toBe(6);
  expect(errors).toEqual([]);
});

test('Sasha the cactus fires three fans of spines: they fly, prick the rhino, and never refund the meter', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.click('#btnStart');
  await page.click('.fighter:nth-child(7)');                    // Sasha
  await expect(page.locator('#selName')).toHaveText('SASHA');
  await page.click('#btnFight');
  await expect.poll(() => page.evaluate(() => window.__fight() ? window.__fight().elapsed : 0), { timeout: 8000 }).toBeGreaterThan(1.7);
  await page.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.p.x = 200; g.r.x = 700; g.p.inv = 1e9; g.p.meter = 100; });
  const hp0 = await page.evaluate(() => window.__fight().r.hp);
  await page.keyboard.press('l');
  await expect.poll(() => page.evaluate(() => window.__fight().p.state), { timeout: 3000 }).toBe('special');
  await expect.poll(() => page.evaluate(() => window.__spikes().length), { timeout: 3000 }).toBeGreaterThan(0);   // spines in the air
  await expect.poll(() => page.evaluate(() => window.__fight().p.state), { timeout: 5000 }).not.toBe('special');
  await expect.poll(() => page.evaluate(() => window.__spikes().length), { timeout: 3000 }).toBe(0);
  const out = await page.evaluate(() => { const g = window.__fight(); return { hits: g.p.hitsLanded, hp: g.r.hp, meter: g.p.meter }; });
  expect(out.hits).toBeGreaterThanOrEqual(10);                  // most of the fifteen land on a rhino that stands still
  expect(out.hp).toBeLessThan(hp0);
  expect(out.meter).toBe(0);                                    // spines that land after the special ends still refund nothing
  // the rhino behind him is never pricked
  await page.evaluate(() => { const g = window.__fight(); g.r.x = 300; g.p.x = 750; g.r.timer = 1e9; g.r.state = 'idle'; g.p.state = 'idle'; });
  await page.waitForTimeout(80);
  await page.evaluate(() => { const g = window.__fight(); g.p.facing = 1; g.p.state = 'special'; g.p.st = 0; g.p.specialHits = 0; });
  await expect.poll(() => page.evaluate(() => window.__fight().p.state), { timeout: 5000 }).not.toBe('special');
  await expect.poll(() => page.evaluate(() => window.__spikes().length), { timeout: 3000 }).toBe(0);
  expect(await page.evaluate(() => window.__fight().p.hitsLanded)).toBe(out.hits);
  expect(errors).toEqual([]);
});

test('high scores per round: the picker filters the table, and a save shows the round just played', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const calls = await mockSupabase(page, ROWS.map(r => Object.assign({}, r)).concat([{ id: 3, name: 'Ella', fighter: 'Åke', score: 21000, time_s: 30.5, level: 11, created_at: '2026-09-25T10:00:00Z' }]));
  await page.goto(URL);
  await page.click('#btnScores');
  await expect(page.locator('#scoresTable tbody tr')).toHaveCount(3);                    // all rounds
  expect(await page.locator('#scoresRound option').count()).toBe(13);                     // all + twelve rounds
  await page.selectOption('#scoresRound', '11');
  await expect(page.locator('#scoresTable tbody tr')).toHaveCount(1);
  await expect(page.locator('#scoresTable tbody tr').first()).toContainText('Ella');
  expect(calls.some(c => /level=eq\.11/.test(c))).toBe(true);
  await page.selectOption('#scoresRound', '5');
  await expect(page.locator('#scoresTable tbody tr')).toHaveCount(1);
  await expect(page.locator('#scoresTable tbody tr').first()).toContainText('Be the first');
  // the title-screen best is still the best of every round
  await page.click('#btnScoresBack');
  await expect(page.locator('#titleBest')).toContainText('21,000');
  // win round 1 and save: the table opens on round 1, with the new entry in it
  await page.goto(URL + '#pacifist=2'); await page.reload();   // a hash-only goto does not reload, and the debug hook is read at load
  await page.click('#btnStart'); await page.click('.fighter:nth-child(2)'); await page.click('#btnFight');
  await expect.poll(() => page.evaluate(() => !!window.__fight()), { timeout: 5000 }).toBe(true);
  await page.evaluate(() => { window.__fight().p.inv = 1e9; });   // the peace ending needs her standing at the end of it
  await expect(page.locator('#result')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#resBig')).toHaveText('PEACE');
  await page.fill('#playerName', 'Rounder'); await page.click('#btnSave');
  await expect(page.locator('#scores')).toBeVisible();
  await expect(page.locator('#scoresRound')).toHaveValue('1');
  await expect(page.locator('#scoresTable tbody tr.me')).toContainText('Rounder');
  expect(await page.locator('#scoresTable tbody tr').count()).toBe(2);                    // Pelle's round-1 score and the new one
  expect(errors).toEqual([]);
});

test('Suvam brings the Punjab desert, turns up behind the rhino and holds it in a headlock', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.click('#btnStart');
  await page.click('.fighter:nth-child(8)');                    // Suvam
  await expect(page.locator('#selName')).toHaveText('SUVAM');
  await page.click('#btnFight');
  await expect.poll(() => page.evaluate(() => window.__fight() ? window.__fight().elapsed : 0), { timeout: 8000 }).toBeGreaterThan(1.7);
  await page.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.p.x = 150; g.r.x = 720; g.r.facing = -1; g.p.inv = 1e9; g.p.meter = 100; });
  const hp0 = await page.evaluate(() => window.__fight().r.hp);
  await page.keyboard.press('l');
  await expect.poll(() => page.evaluate(() => window.__desert()), { timeout: 3000 }).toBeGreaterThan(0.5);     // the desert blows in
  await expect.poll(() => page.evaluate(() => window.__fight().r.state), { timeout: 3000 }).toBe('choked');
  const hold = await page.evaluate(() => { const g = window.__fight(); return { dx: g.p.x - g.r.x, up: g.p.y }; });
  expect(Math.abs(hold.dx)).toBeLessThan(120);                  // he got over there without walking
  expect(hold.up).toBeGreaterThan(60);                          // on its back
  await expect.poll(() => page.evaluate(() => window.__fight().p.state), { timeout: 5000 }).not.toBe('special');
  const out = await page.evaluate(() => { const g = window.__fight(); return { hits: g.p.hitsLanded, hp: g.r.hp, rs: g.r.state, meter: g.p.meter }; });
  expect(out.hits).toBe(5);
  expect(out.hp).toBeLessThan(hp0);
  expect(out.rs).not.toBe('choked');                            // and he lets go
  expect(out.meter).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__desert()), { timeout: 3000 }).toBe(0);                  // back to Kiruna
  expect(errors).toEqual([]);
});

test('round 12: every hit resprays one panel of the rhino, and the last one shows it was a fawn', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route(/\/rest\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto(URL);
  await startRound(page, 11, 2);                             // June
  const lv = await page.evaluate(() => { const g = window.__fight(); return { paint: g.paint, panels: g.r.paint, hp: g.r.hp, max: g.r.maxhp, theme: window.__levels()[11].theme }; });
  expect(lv).toEqual({ paint: true, panels: 0, hp: 16, max: 16, theme: 'garage' });
  // a punch and a kick: one panel each, however hard, and the bar is the part still unpainted
  const hitOnce = async (key) => {
    const n0 = await page.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.r.x = g.p.x + 250; g.r.facing = -1; g.p.facing = 1; g.p.inv = 99; return g.r.paint; });
    for (let i = 0; i < 6 && await page.evaluate(n => window.__fight().r.paint === n, n0); i++) { await page.keyboard.press(key); await page.waitForTimeout(300); await page.evaluate(() => { const g = window.__fight(); if (!g.over){ g.r.state = 'idle'; g.r.x = g.p.x + 250; } }); }
    return page.evaluate(() => { const g = window.__fight(); return { panels: g.r.paint, hp: g.r.hp }; });
  };
  await page.evaluate(() => { window.__labels = new Set(); (function t(){ window.__fx().forEach(f => { if (f.label) window.__labels.add(f.label); }); requestAnimationFrame(t); })(); });
  expect(await hitOnce('j')).toEqual({ panels: 1, hp: 15 });
  expect(await hitOnce('k')).toEqual({ panels: 2, hp: 14 });
  const labels = await page.evaluate(() => [...window.__labels]);
  expect(labels).toEqual(expect.arrayContaining(['NEW TAIL!', 'BACK LEG!']));   // each hit names the panel it did
  // the sixteenth panel: no DNA burst, it turns into a fawn and the round is won
  await page.evaluate(() => { const g = window.__fight(); g.r.paint = 15; g.r.hp = 1; });
  expect(await hitOnce('j')).toEqual({ panels: 16, hp: 0 });
  const end = await page.evaluate(() => { const g = window.__fight(); return { over: g.over, won: g.won, morph: g.r.morph, state: g.r.state, pacifist: g.pacifist }; });
  expect(end).toEqual({ over: true, won: true, morph: 'fawn', state: 'morph', pacifist: false });
  await expect(page.locator('#result')).toBeVisible({ timeout: 12000 });
  await expect(page.locator('#resTitle')).toHaveText('IT WAS A FAWN ALL ALONG');
  await expect(page.locator('#resReadout')).toContainText('panels resprayed: 16/16');
  await expect(page.locator('#btnNext')).toBeHidden();       // the last round
  expect(errors).toEqual([]);
});

test('round 12: Åke\'s spark resprays the whole rhino at once', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await startRound(page, 11, 5);                             // Åke
  await page.evaluate(() => { const g = window.__fight(); g.r.state = 'idle'; g.r.timer = 1e9; g.r.x = g.p.x + 400; g.p.facing = 1; g.p.inv = 99; g.p.meter = 100; });
  await page.keyboard.press('l');
  await expect.poll(() => page.evaluate(() => window.__fight().r.morph), { timeout: 6000 }).toBe('fawn');
  expect(await page.evaluate(() => { const g = window.__fight(); return [g.r.paint, g.won, g.r.state === 'gone']; })).toEqual([16, true, false]);
  expect(errors).toEqual([]);
});
