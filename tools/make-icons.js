/* Renders icons/icon.svg to the PNG sizes the page and manifest refer to, and to the
   artifact's cover picture (thumb.png). Run after changing the SVG:  node tools/make-icons.js */
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

(async () => {
  const dir = path.resolve(__dirname, '..', 'icons');
  const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
  const browser = await chromium.launch();
  for (const size of [180, 192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent('<style>html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style>' + svg);
    await page.screenshot({ path: path.join(dir, 'icon-' + size + '.png') });
    await page.close();
  }
  // The cover picture Claude shows for the artifact. A page that uses the database gets no
  // automatic screenshot, so without this its card falls back to a stock icon.
  const cover = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await cover.setContent('<style>html,body{margin:0;height:100%;background:#F8E9C4}body{display:grid;place-items:center}svg{width:560px;height:560px}</style>' + svg);
  await cover.screenshot({ path: path.resolve(dir, '..', 'thumb.png') });
  await browser.close();
})();
