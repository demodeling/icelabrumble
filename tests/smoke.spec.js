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
  await page.click('.fighter:nth-child(5)');          // Per
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
  for (let i = 1; i <= 9; i++) {
    await page.click('.fighter:nth-child(' + i + ')');
    await page.click('#btnVideo');
    const src = await page.evaluate(() => document.getElementById('theVideo').getAttribute('src') || '');
    expect(src.length).toBeGreaterThan(0);
    await page.click('#btnVideoClose');
  }
});
