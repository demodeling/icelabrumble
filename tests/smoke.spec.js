// Playwright smoke test: the built game loads, a fight starts, a special fires, the video button works, no page errors.
const { test, expect } = require('@playwright/test');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '..', 'dist', 'index.html');

test('game boots and a fight runs', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await expect(page.locator('#btnStart')).toBeVisible();
  await page.click('#btnStart');
  await expect(page.locator('.fighter')).toHaveCount(11);
  await page.click('.fighter:nth-child(5)');          // Per (not pre-selected, so one click only selects)
  await page.click('#btnFight');
  await page.waitForTimeout(1500);
  for (let i = 0; i < 20; i++) { await page.keyboard.down('ArrowRight'); await page.waitForTimeout(60); await page.keyboard.up('ArrowRight'); await page.keyboard.press('j'); await page.waitForTimeout(120); }
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('k'); await page.keyboard.press('l');
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('every fighter has a video', async ({ page }) => {
  await page.goto(URL);
  await page.click('#btnStart');
  const fighters = page.locator('.fighter');
  await expect(fighters).toHaveCount(11);
  for (let i = 0; i < 11; i++) {
    const f = fighters.nth(i);
    // clicking an already-selected fighter starts the fight, so only click when it is not selected yet
    if (!(await f.evaluate(el => el.classList.contains('sel')))) await f.click();
    await expect(page.locator('#btnVideo')).toBeVisible();
    await page.click('#btnVideo');
    const src = await page.evaluate(() => document.getElementById('theVideo').getAttribute('src') || '');
    expect(src.length).toBeGreaterThan(0);
    await page.click('#btnVideoClose');
    await expect(page.locator('#select')).toBeVisible();
  }
});

test('all three rounds start', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.click('#btnStart');
  for (const lvl of ['0', '1', '2']) {
    await page.selectOption('#startLevel', lvl);
    await page.click('#btnFight');
    if (lvl !== '0') { await expect(page.locator('#btnLevelGo')).toBeVisible(); await page.click('#btnLevelGo'); }
    await page.waitForTimeout(1200);
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('j');
    await page.waitForTimeout(400);
    // back to the fighter screen for the next round (the in-game overlays are hidden during a fight)
    await page.evaluate(() => { document.getElementById('btnChoose').click(); });
    await expect(page.locator('#select')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('pacifist ending: outlast the rhino without hitting it', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL + '#pacifist=2');            // debug hook: shortens the 60 s pacifist timer to 2 s
  await page.click('#btnStart');
  await page.click('.fighter:nth-child(5)');
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
    if (url.includes('/rpc/report_score')) { const id = req.postDataJSON().score_id; rows = rows.filter(r => r.id !== id); return route.fulfill({ status: 204, body: '' }); }
    if (req.method() === 'POST') { const row = Object.assign({ id: 100 + rows.length, created_at: new Date().toISOString() }, req.postDataJSON()); rows.push(row); return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([row]) }); }
    const sorted = rows.slice().sort((a, b) => b.score - a.score || a.time_s - b.time_s);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sorted) });
  });
  return calls;
}
const ROWS = [
  { id: 1, name: 'Björn', fighter: 'Björn', score: 8420, time_s: 61.2, level: 2, created_at: '2026-09-16T10:00:00Z' },
  { id: 2, name: 'Pelle', fighter: 'Per', score: 5120, time_s: 40.0, level: 1, created_at: '2026-09-16T11:00:00Z' },
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
  expect(calls.some(c => c.startsWith('POST rpc/report_score'))).toBe(true);
  await expect(page.locator('#titleBest')).toContainText('5,120');
  await page.click('#btnScoresBack');
  await page.click('#btnStart');
  await expect(page.locator('.fighter:nth-child(5) .best')).toHaveText('BEST 5,120 · Pelle');
  await expect(page.locator('.fighter:nth-child(1) .best')).toHaveText('');
  expect(errors).toEqual([]);
});

test('saving a score posts it to the table and highlights it', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const calls = await mockSupabase(page, ROWS.map(r => Object.assign({}, r)));
  await page.goto(URL + '#pacifist=2');
  await page.click('#btnStart');
  await page.click('.fighter:nth-child(5)');
  await page.click('#btnFight');
  for (let i = 0; i < 25; i++) { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(160); }
  await expect(page.locator('#result')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#playerName')).toHaveValue('Per');                  // defaults to your fighter's name
  await page.fill('#playerName', '  Tester  ');
  await page.click('#btnSave');
  await expect(page.locator('#scores')).toBeVisible();
  await expect(page.locator('#btnSave')).toHaveText('SAVED');
  expect(calls.some(c => c.startsWith('POST scores'))).toBe(true);
  await expect(page.locator('#scoresTable tbody tr')).toHaveCount(3);
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
  await expect(page.locator('#title h1')).toHaveText(/SWEBITS\s*RUMBLE/);
  await expect(page.locator('#menuBtn')).toBeHidden();          // not on the title screen
  await page.click('#btnStart');
  await expect(page.locator('#menuBtn')).toBeVisible();
  await page.click('#menuBtn');
  await expect(page.locator('#title')).toBeVisible();
  await page.click('#btnStart');
  await page.click('.fighter:nth-child(5)');
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
  await A.click('.fighter:nth-child(5)'); await A.click('#btnFight');      // Per, host ready first
  await expect(A.locator('#selCoop')).toContainText('waiting for your friend to press');
  await B.click('.fighter:nth-child(2)'); await B.click('#btnFight');      // Björn
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
  await A.click('.fighter:nth-child(5)'); await A.click('#btnFight');
  await B.click('.fighter:nth-child(2)'); await B.click('#btnFight');
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
