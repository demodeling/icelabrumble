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
  await expect(page.locator('.fighter')).toHaveCount(9);
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
  await expect(fighters).toHaveCount(9);
  for (let i = 0; i < 9; i++) {
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
