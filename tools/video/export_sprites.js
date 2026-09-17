const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const page = await browser.newPage();
  await page.setContent('<canvas id="c" width="700" height="760"></canvas>');
  await page.evaluate(fs.readFileSync('cutout_face.js', 'utf8'));
  const names = process.argv.slice(2).length ? process.argv.slice(2) : ['martin-rosvall'];   // roster ids, e.g. node export_sprites.js ake-brannstrom
  for (const n of names) for (const mouth of ['flat', 'open', 'smile']) {
    const data = await page.evaluate(([n, m]) => {
      const cv = document.getElementById('c'); const c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height);
      drawCutoutFace(c, 350, 400, 480, lookFor(n), 1, {mouth: m});
      return cv.toDataURL('image/png');
    }, [n, mouth]);
    fs.writeFileSync('sprites/sprite_' + n + '_' + mouth + '.png', Buffer.from(data.split(',')[1], 'base64'));
  }
  await browser.close();
})();
