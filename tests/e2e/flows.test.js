/* End-to-end flows in a phone-sized browser, against the local stand-in for the artifact
   runtime (dev/claude-stub.js). These prove the app's own behaviour; the real database,
   photo storage and recipe reader only exist in the published artifact. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { start } = require('../../dev/server.js');

let srv, browser;
test.before(async () => { srv = await start(0); browser = await chromium.launch(); });
test.after(async () => { await browser.close(); srv.server.close(); });

async function open(t, flags) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  if (flags) await context.addInitScript((f) => localStorage.setItem('lgt-dev-flags', JSON.stringify(f)), flags);
  await page.goto(srv.url + '/');
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], 'the page logged errors');
  });
  return page;
}

/** A plain JPEG made in the page, standing in for a photo. */
async function picture(page, color, w = 1200, h = 900) {
  const dataUrl = await page.evaluate(([c, w, h]) => {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = c; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(w * 0.2, h * 0.3, w * 0.6, h * 0.4);
    return canvas.toDataURL('image/jpeg', 0.8);
  }, [color, w, h]);
  return { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') };
}

const field = (page, label) => page.getByLabel(label, { exact: true });
/** Wait until an image has actually loaded. */
async function loaded(locator) {
  const deadline = Date.now() + 4000;
  const ok = () => locator.evaluate((img) => img.complete && img.naturalWidth > 0);
  let got = await ok();
  while (!got && Date.now() < deadline) { await new Promise((r) => setTimeout(r, 40)); got = await ok(); }
  assert.equal(got, true, 'image loads');
}
/** Wait until a list has exactly n items. */
async function count(locator, n) {
  const deadline = Date.now() + 4000;
  let got = await locator.count();
  while (got !== n && Date.now() < deadline) { await new Promise((r) => setTimeout(r, 40)); got = await locator.count(); }
  assert.equal(got, n);
}
const line = (page, group) => page.locator('.grow', { has: page.locator('> b', { hasText: new RegExp('^' + group + '$') }) });

async function logBread(page, o = {}) {
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill(o.name || 'Milk bread');
  if (o.photo !== false) await field(page, 'Photo').setInputFiles(await picture(page, '#c98a3f'));
  await line(page, 'Flour').getByLabel('Amount').fill('3');
  await line(page, 'Water').getByLabel('Amount').fill(o.water || '1 1/8');
  await line(page, 'Dairy').getByLabel('Amount').fill('1/2');
  await line(page, 'Yeast').getByLabel('Amount').fill('1 1/4');
  await page.getByRole('button', { name: /White/ }).click();
  await page.getByRole('button', { name: '1½ lb' }).click();
  await field(page, 'Added minutes').fill('5');
  await field(page, 'Reason').fill('crust browning');
  await field(page, 'Source').fill('Machine booklet, p. 14');
  await page.getByRole('group', { name: 'Crust' }).getByRole('button', { name: '4 of 5' }).click();
  await page.getByRole('group', { name: 'Crumb' }).getByRole('button', { name: '5 of 5' }).click();
  await page.getByRole('group', { name: 'Taste' }).getByRole('button', { name: '5 of 5' }).click();
  await field(page, 'Comments').fill('Softest one yet.');
  await page.getByRole('button', { name: 'Save' }).last().click();
  await page.locator('.screen').waitFor({ state: 'detached' });
}

test('logs a bread with every field and shows it in the gallery', async (t) => {
  const page = await open(t);
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('Milk bread');
  await page.getByRole('button', { name: /White/ }).click();
  await page.getByRole('button', { name: '1½ lb' }).click();
  assert.equal(await field(page, 'Hours').inputValue(), '3', 'time fills in from the program and loaf size');
  assert.equal(await field(page, 'Minutes').inputValue(), '25');
  await page.getByRole('button', { name: '2 lb' }).click();
  assert.equal(await field(page, 'Minutes').inputValue(), '30');
  await page.getByRole('button', { name: /^8\s*Dough$/ }).click();
  assert.equal(await page.getByText('Loaf size').count(), 0, 'a dough program has no loaf size');
  assert.equal(await page.getByText('Crust color').count(), 0);
  assert.equal(await field(page, 'Oven temperature').count(), 1);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Discard' }).click();

  await logBread(page);
  const tile = page.locator('.gal .tile');
  await assert.doesNotReject(tile.first().waitFor());
  await count(tile, 1);
  assert.match(await tile.innerText(), /Milk bread/);
  assert.match(await tile.innerText(), /4\.7/);
  await loaded(tile.locator('img'));

  await tile.click();
  const card = page.locator('.rcard');
  const text = await page.locator('.screen').innerText();
  for (const want of ['Milk bread', 'Softest one yet.', 'Bread flour', '3 cups', 'Water', '1⅛ cups', 'Milk', '½ cup', '1¼ tsp',
    '1 · White', '1½ lb', '3 h 25 min', '+5 min', 'crust browning', 'Machine booklet, p. 14']) {
    assert.ok(text.includes(want), 'bread page shows "' + want + '"\n' + text);
  }
  await count(card, 1);
});

test('edits made while a photo is still loading are kept', async (t) => {
  const page = await open(t);
  await page.getByRole('button', { name: 'Add bread' }).click();
  await page.evaluate(() => {                      // a slow phone: the photo takes a while to prepare
    const real = window.LGT.util.resizeImage;
    window.LGT.util.resizeImage = (...a) => new Promise((r) => setTimeout(r, 600)).then(() => real(...a));
  });
  await field(page, 'Photo').setInputFiles(await picture(page, '#c98a3f'));
  await field(page, 'Name').fill('Sunday loaf');
  await field(page, 'Date').fill('2026-11-08');
  await field(page, 'Comments').fill('Typed straight after picking the photo.');
  await page.locator('.photo img').waitFor();
  assert.equal(await field(page, 'Name').inputValue(), 'Sunday loaf');
  assert.equal(await field(page, 'Date').inputValue(), '2026-11-08');
  await page.getByRole('button', { name: 'Save' }).last().click();
  await page.locator('.screen').waitFor({ state: 'detached' });
  const tile = page.locator('.gal .tile');
  await count(tile, 1);
  assert.match(await tile.innerText(), /Sunday loaf\s+Nov 8/);
  await loaded(tile.locator('img'));
});

test('a bread logged with only a name makes no recipe card', async (t) => {
  const page = await open(t);
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('Mystery loaf');
  await page.getByRole('button', { name: 'Save' }).last().click();
  await page.locator('.screen').waitFor({ state: 'detached' });
  await count(page.locator('.gal .tile'), 1);
  await page.locator('.gal .tile').click();
  await count(page.locator('.rcard'), 0);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Recipes' }).click();
  await count(page.locator('.rc'), 0);
  await page.getByRole('tab', { name: /To try/ }).click();
  await count(page.locator('.rc'), 0);

  // adding details later gives it a card
  await page.getByRole('button', { name: 'Gallery' }).click();
  await page.locator('.gal .tile').click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await line(page, 'Flour').getByLabel('Amount').fill('3');
  await page.getByRole('button', { name: 'Save' }).last().click();
  await page.getByRole('heading', { name: 'Edit bread' }).waitFor({ state: 'detached' });
  await count(page.locator('.rcard'), 1);
});

test('baking a recipe again unchanged keeps one card; changing it makes another', async (t) => {
  const page = await open(t);
  await logBread(page);
  await page.locator('.gal .tile').click();
  await page.getByRole('button', { name: 'Bake again' }).click();
  assert.equal(await field(page, 'Name').inputValue(), 'Milk bread');
  assert.equal(await line(page, 'Water').getByLabel('Amount').inputValue(), '1 1/8');
  await page.getByRole('button', { name: 'Save' }).last().click();
  await page.getByRole('heading', { name: 'New bread' }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Back' }).click();

  await page.getByRole('button', { name: 'Recipes' }).click();
  await count(page.locator('.rc'), 1);
  assert.match(await page.locator('.rc').innerText(), /Baked 2×/);

  await page.locator('.rc .open').click();
  await page.getByRole('button', { name: 'Bake this' }).click();
  await field(page, 'Name').fill('Milk bread, more water');
  await line(page, 'Water').getByLabel('Amount').fill('1 1/4');
  await page.getByRole('button', { name: 'Save' }).last().click();
  await page.getByRole('heading', { name: 'New bread' }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Back' }).click();
  await count(page.locator('.rc'), 2);
  const names = await page.locator('.rc h3').allInnerTexts();
  assert.deepEqual(names.sort(), ['Milk bread', 'Milk bread, more water']);
});

test('a recipe to try moves to Baked once it is baked', async (t) => {
  const page = await open(t);
  await page.getByRole('button', { name: 'Recipes' }).click();
  await page.getByRole('tab', { name: /To try/ }).click();
  await page.getByRole('button', { name: 'Add recipe' }).click();
  await page.getByRole('button', { name: 'Type it in' }).click();
  await field(page, 'Name').fill('Cinnamon raisin');
  await line(page, 'Flour').getByLabel('Amount').fill('420');
  await line(page, 'Flour').getByLabel('Unit').selectOption('g');
  await page.getByRole('button', { name: 'Other' }).click();
  await line(page, 'Other').getByLabel('Ingredient').fill('Raisins');
  await line(page, 'Other').getByLabel('Amount').fill('80');
  await line(page, 'Other').getByLabel('Unit').selectOption('g');
  await field(page, 'Source').fill('Mom');
  await page.getByRole('button', { name: 'Save' }).last().click();
  await page.locator('.screen').waitFor({ state: 'detached' });

  const card = page.locator('.rc');
  await count(card, 1);
  assert.match(await card.innerText(), /Cinnamon raisin[\s\S]*Mom[\s\S]*Bread flour 420 g[\s\S]*Raisins 80 g/);

  await card.getByRole('button', { name: 'Bake this' }).click();
  assert.equal(await field(page, 'Name').inputValue(), 'Cinnamon raisin');
  await page.getByRole('button', { name: 'Save' }).last().click();
  await page.locator('.screen').waitFor({ state: 'detached' });
  await count(page.locator('.rc'), 0);
  await page.getByRole('tab', { name: /Baked/ }).click();
  assert.match(await page.locator('.rc').innerText(), /Cinnamon raisin[\s\S]*Baked 1×/);
});

test('reads a recipe from a photo, with a choice of sizes', async (t) => {
  const page = await open(t);
  await page.getByRole('button', { name: 'Recipes' }).click();
  await page.getByRole('tab', { name: /To try/ }).click();
  await page.getByRole('button', { name: 'Add recipe' }).click();
  await field(page, 'From photo').setInputFiles(await picture(page, '#eee', 1500, 2000));
  await page.getByRole('heading', { name: 'Check recipe' }).waitFor();

  assert.equal(await field(page, 'Name').inputValue(), 'Everyday white loaf');
  assert.equal(await line(page, 'Flour').getByLabel('Amount').inputValue(), '2 7/8');
  assert.match(await line(page, 'Water').getByLabel('Amount').getAttribute('class'), /unsure/);
  assert.equal(await line(page, 'Other').getByLabel('Ingredient').first().inputValue(), 'Olive oil');
  assert.equal(await page.getByRole('button', { name: /White/ }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('button', { name: 'Medium' }).getAttribute('aria-pressed'), 'true');
  assert.equal(await field(page, 'Hours').inputValue() + ':' + await field(page, 'Minutes').inputValue(), '3:25');
  assert.equal(await field(page, 'Source').inputValue(), 'Sample Cookbook, p. 12');
  assert.equal(await page.locator('.orig').count(), 1, 'the original image is attached');

  assert.equal(await page.getByText('Loaf size').count(), 0, 'one size control while choosing between sizes');
  await page.getByRole('button', { name: '2 lb' }).click();
  assert.equal(await line(page, 'Flour').getByLabel('Amount').inputValue(), '3 3/4');
  assert.equal(await field(page, 'Minutes').inputValue(), '30');
  await page.getByRole('button', { name: 'Save both' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).last().click();
  await page.locator('.screen').waitFor({ state: 'detached' });

  const names = (await page.locator('.rc h3').allInnerTexts()).sort();
  assert.deepEqual(names, ['Everyday white loaf (1½ lb)', 'Everyday white loaf (2 lb)']);
  await page.locator('.rc .open').first().click();
  const text = await page.locator('.screen').innerText();
  assert.ok(text.includes('Sample Cookbook, p. 12'));
  assert.ok(text.includes('or 2'), 'the yeast alternative is kept');
  await loaded(page.locator('.screen .orig img'));

  const sent = await page.evaluate(() => window.__lgtDev.calls[0]);
  assert.ok(sent.images > 1, 'a large image is sent with enlarged parts');
  assert.match(sent.input, /1 White \(also called Basic\)/);
});

test('fills a new bread from a photo and from a saved recipe', async (t) => {
  const page = await open(t);
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'From photo').setInputFiles(await picture(page, '#eee', 900, 1200));
  await field(page, 'Name').waitFor();
  await page.locator('.busy').waitFor({ state: 'detached' });
  assert.equal(await field(page, 'Name').inputValue(), 'Everyday white loaf');
  assert.equal(await line(page, 'Flour').getByLabel('Amount').inputValue(), '2 7/8');
  await page.getByRole('button', { name: 'Save' }).last().click();
  await page.locator('.screen').waitFor({ state: 'detached' });
  await count(page.locator('.gal .tile'), 1);

  await page.getByRole('button', { name: 'Add bread' }).click();
  await page.getByRole('button', { name: 'Use recipe' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Everyday white loaf/ }).click();
  assert.equal(await line(page, 'Flour').getByLabel('Amount').inputValue(), '2 7/8');
  await field(page, 'Name').fill('White loaf, again');
  await page.getByRole('button', { name: 'Save' }).last().click();
  await page.locator('.screen').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Recipes' }).click();
  assert.match(await page.locator('.rc').innerText(), /Baked 2×/);
});

test('edits and deletes a bread; its recipe goes back to To try', async (t) => {
  const page = await open(t);
  await logBread(page, { photo: false });
  await page.locator('.gal .tile').click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await field(page, 'Name').fill('Milk bread, first try');
  await page.getByRole('button', { name: 'Save' }).last().click();
  await page.getByRole('heading', { name: 'Edit bread' }).waitFor({ state: 'detached' });
  assert.match(await page.locator('.screen h2').first().innerText(), /Milk bread, first try/);

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await page.locator('.screen').waitFor({ state: 'detached' });
  await count(page.locator('.gal .tile'), 0);

  await page.getByRole('button', { name: 'Recipes' }).click();
  await count(page.locator('.rc'), 0);
  await page.getByRole('tab', { name: /To try/ }).click();
  await count(page.locator('.rc'), 1);
  await page.locator('.rc .open').click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await page.locator('.screen').waitFor({ state: 'detached' });
  await count(page.locator('.rc'), 0);
});

test('keeps what was saved after a reload', async (t) => {
  const page = await open(t);
  await logBread(page, { photo: false });
  await page.reload();
  assert.match(await page.locator('.gal .tile').innerText(), /Milk bread/);
});

test('says so when storage is not available', async (t) => {
  const page = await open(t, { noDb: true });
  await page.getByText('Unavailable').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Add bread' }).count(), 0);
});

test('hides photo features the runtime does not offer', async (t) => {
  const page = await open(t, { noAssets: true, noSample: true });
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').waitFor();
  assert.equal(await field(page, 'Photo').count(), 0);
  assert.equal(await field(page, 'From photo').count(), 0);
});

test('interface copy follows the owner\'s rules', async (t) => {
  // With nothing saved, every word on screen is ours: labels and buttons 1-3 words, headings under 6.
  const page = await open(t);
  const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
  async function audit(where) {
    const found = await page.evaluate(() => {
      const out = { headings: [], labels: [], other: [] };
      const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      document.querySelectorAll('h1,h2,h3').forEach((el) => { if (visible(el)) out.headings.push(el.textContent.trim()); });
      document.querySelectorAll('button, .label, option, label').forEach((el) => {
        if (visible(el) || el.tagName === 'OPTION') out.labels.push(el.textContent.trim());
      });
      document.querySelectorAll('p, small, .hint, .help, [title]').forEach((el) => { if (visible(el)) out.other.push(el.textContent.trim() || el.getAttribute('title')); });
      document.querySelectorAll('input, textarea').forEach((el) => { if (el.placeholder) out.labels.push(el.placeholder); });
      return out;
    });
    for (const h of found.headings) assert.ok(words(h) < 6, where + ': heading too long: "' + h + '"');
    for (const l of found.labels.filter(Boolean)) assert.ok(words(l) <= 3, where + ': label too long: "' + l + '"');
    assert.deepEqual(found.other.filter(Boolean), [], where + ': explanatory text on screen');
  }
  await audit('gallery');
  await page.getByRole('button', { name: 'Recipes' }).click();
  await audit('recipes, baked');
  await page.getByRole('tab', { name: /To try/ }).click();
  await audit('recipes, to try');
  await page.getByRole('button', { name: 'Add recipe' }).click();
  await audit('add recipe sheet');
  await page.getByRole('button', { name: 'Type it in' }).click();
  await audit('new recipe');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Added minutes').fill('5');
  await page.getByRole('button', { name: /^8\s*Dough$/ }).click();
  await audit('new bread');
});
