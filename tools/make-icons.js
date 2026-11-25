/* Renders icons/icon.svg to the PNG sizes the page and manifest refer to.
   Run after changing the SVG:  node tools/make-icons.js */
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
  await browser.close();
})();
