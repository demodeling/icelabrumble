const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<canvas id="c" width="700" height="760"></canvas>');
  await page.evaluate(fs.readFileSync('cutout_face.js', 'utf8'));
  const names = ['albertas','bjorn','bea','annamia','per','marco','jose','mike','daniel'];
  for (const n of names) for (const mouth of ['flat', 'open', 'smile']) {
    const data = await page.evaluate(([n, m]) => {
      const cv = document.getElementById('c'); const c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height);
      drawCutoutFace(c, 350, 400, 480, LOOK[n], 1, {mouth: m});
      return cv.toDataURL('image/png');
    }, [n, mouth]);
    fs.writeFileSync('sprite_' + n + '_' + mouth + '.png', Buffer.from(data.split(',')[1], 'base64'));
  }
  await browser.close();
})();
