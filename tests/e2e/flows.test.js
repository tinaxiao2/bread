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

async function open(t, o = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  if (o.flags) await context.addInitScript((f) => localStorage.setItem('lgt-dev-flags', JSON.stringify(f)), o.flags);
  if (o.db) {
    await context.addInitScript((d) => { if (!localStorage.getItem('lgt-dev-db')) localStorage.setItem('lgt-dev-db', JSON.stringify(d)); }, o.db);
  }
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
const line = (page, group) => page.locator('.grow', { has: page.locator('> b', { hasText: new RegExp('^' + group + '$') }) });
const program = (page, n, name) => page.getByRole('button', { name: new RegExp('^' + n + '\\s*' + name + '$') });
const chip = (page, name) => page.locator('.addrow').getByRole('button', { name, exact: true });
const save = (page) => page.getByRole('button', { name: 'Save', exact: true }).last().click();
const formGone = (page) => page.locator('.screen .bar').waitFor({ state: 'detached' });

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

/** Log a bread on a fresh name, filling every part of the form. */
async function logBread(page, o = {}) {
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill(o.name || 'Milk bread');
  if (o.photo !== false) await field(page, 'Photo').setInputFiles(await picture(page, '#c98a3f'));
  await line(page, 'Flour').getByLabel('Amount').fill('400');
  await line(page, 'Water').getByLabel('Type').selectOption('Warm');
  await line(page, 'Water').getByLabel('Amount').fill(o.water || '300');
  await line(page, 'Yeast').getByLabel('Amount').fill('7');
  await line(page, 'Salt').getByLabel('Amount').fill('8');
  await chip(page, 'Dairy').click();
  await line(page, 'Dairy').getByLabel('Amount').fill('30');
  await program(page, 1, 'White').click();
  await page.getByRole('button', { name: '1½ lb' }).click();
  await program(page, 12, 'Bake').click();
  await field(page, 'Added minutes').fill('5');
  await field(page, 'Reason').fill('crust browning');
  await field(page, 'Source').fill('Machine booklet, p. 14');
  await page.getByRole('group', { name: 'Crust' }).getByRole('button', { name: '4 of 5' }).click();
  await page.getByRole('group', { name: 'Crumb' }).getByRole('button', { name: '5 of 5' }).click();
  await page.getByRole('group', { name: 'Taste' }).getByRole('button', { name: '5 of 5' }).click();
  await field(page, 'Comments').fill('Softest one yet.');
  await save(page);
  await formGone(page);
}

test('logs a bread with every field and shows it in the gallery', async (t) => {
  const page = await open(t);
  await logBread(page);
  const tile = page.locator('.gal .tile');
  await count(tile, 1);
  assert.match(await tile.innerText(), /Milk bread/);
  assert.match(await tile.innerText(), /4\.7/);
  await loaded(tile.locator('img'));

  await tile.click();
  const text = await page.locator('.screen').innerText();
  for (const want of ['Milk bread', 'Softest one yet.', 'AP flour', '400 g', 'Warm water', '300 g', 'Milk', '30 g', 'Active dry', '7 g',
    'Salt', '8 g', '1 · White', '12 · Bake', '1½ lb', '3 h 25 min', '+5 min', 'crust browning', 'Machine booklet, p. 14']) {
    assert.ok(text.includes(want), 'bread page shows "' + want + '"\n' + text);
  }
  await count(page.locator('.rcard'), 1);
});

test('a new bread starts with flour, water, yeast and salt', async (t) => {
  const page = await open(t);
  await page.getByRole('button', { name: 'Add bread' }).click();
  assert.deepEqual(await page.locator('.grow > b').allInnerTexts(), ['Flour', 'Water', 'Yeast', 'Salt'], 'no dairy row to begin with');
  for (const g of ['Flour', 'Water', 'Yeast', 'Salt']) assert.equal(await line(page, g).getByLabel('Unit').inputValue(), 'g', g + ' starts in grams');
  assert.equal(await line(page, 'Water').getByLabel('Type').inputValue(), '');
  assert.deepEqual(await line(page, 'Water').getByLabel('Type').locator('option').allInnerTexts(), ['Type', 'Lukewarm', 'Warm', 'Hot', 'Other…']);
  assert.equal(await line(page, 'Flour').getByLabel('Type').inputValue(), 'AP');
  assert.equal(await line(page, 'Yeast').getByLabel('Type').inputValue(), 'Active dry');
  assert.deepEqual(await page.locator('.addrow button').allInnerTexts(), ['Flour', 'Dairy', 'Sugar', 'Other']);

  await chip(page, 'Sugar').click();
  assert.equal(await line(page, 'Other').getByLabel('Ingredient').inputValue(), 'Sugar');
  assert.equal(await line(page, 'Other').getByLabel('Unit').inputValue(), 'g');
  assert.equal(await chip(page, 'Sugar').count(), 0, 'once added, it is no longer offered');
  await line(page, 'Salt').locator('.rm').click();
  assert.equal(await chip(page, 'Salt').count(), 1, 'salt can be put back');
  await chip(page, 'Salt').click();
  assert.equal(await line(page, 'Salt').getByLabel('Unit').inputValue(), 'g');
});

test('several programs can be chosen; Bake brings the added time', async (t) => {
  const page = await open(t);
  await page.getByRole('button', { name: 'Add bread' }).click();
  assert.equal(await field(page, 'Added minutes').count(), 0, 'no added time to begin with');
  assert.equal(await field(page, 'Reason').count(), 0);

  await program(page, 1, 'White').click();
  await page.getByRole('button', { name: '1½ lb' }).click();
  assert.equal(await field(page, 'Hours').inputValue() + ':' + await field(page, 'Minutes').inputValue(), '3:25');
  await page.getByRole('button', { name: '2 lb' }).click();
  assert.equal(await field(page, 'Minutes').inputValue(), '30', 'time follows the loaf size');
  assert.equal(await field(page, 'Added minutes').count(), 0);

  await program(page, 12, 'Bake').click();
  assert.equal(await program(page, 1, 'White').getAttribute('aria-pressed'), 'true', 'both stay chosen');
  assert.equal(await program(page, 12, 'Bake').getAttribute('aria-pressed'), 'true');
  assert.equal(await field(page, 'Added minutes').count(), 1);
  assert.equal(await field(page, 'Reason').count(), 1);
  assert.equal(await field(page, 'Hours').inputValue() + ':' + await field(page, 'Minutes').inputValue(), '3:30', 'Bake adds no time of its own');
  await field(page, 'Added minutes').fill('10');
  await field(page, 'Reason').fill('crust was light');

  await program(page, 12, 'Bake').click();
  assert.equal(await field(page, 'Added minutes').count(), 0, 'without Bake the fields go');
  await program(page, 12, 'Bake').click();
  assert.equal(await field(page, 'Added minutes').inputValue(), '', 'and what was typed went with them');

  await program(page, 1, 'White').click();
  await program(page, 8, 'Dough').click();
  assert.equal(await page.getByText('Loaf size').count(), 0, 'a dough program has no loaf size');
  assert.equal(await page.getByText('Crust color').count(), 0);
  assert.equal(await field(page, 'Oven temperature').count(), 1);
  assert.equal(await field(page, 'Hours').inputValue() + ':' + await field(page, 'Minutes').inputValue(), '1:30');
});

test('an entry with no bake recorded is marked Dough in the gallery', async (t) => {
  const page = await open(t);
  async function quick(name, fill) {
    await page.getByRole('button', { name: 'Add bread' }).click();
    await field(page, 'Name').fill(name);
    if (fill) await fill();
    await save(page);
    await formGone(page);
  }
  await quick('Just a name');
  await quick('Dough program', async () => { await program(page, 8, 'Dough').click(); });
  await quick('Dough then bake', async () => { await program(page, 8, 'Dough').click(); await program(page, 12, 'Bake').click(); });
  await quick('White loaf', async () => { await program(page, 1, 'White').click(); await page.getByRole('button', { name: '1½ lb' }).click(); });
  await quick('Dough then oven', async () => { await program(page, 8, 'Dough').click(); await field(page, 'Oven temperature').fill('375'); });
  await count(page.locator('.gal .tile'), 5);
  const flagged = await page.locator('.gal .tile', { has: page.locator('.flag') }).locator('.meta b').allInnerTexts();
  assert.deepEqual(flagged.sort(), ['Dough program', 'Just a name']);
  assert.equal(await page.locator('.gal .tile .flag').first().innerText(), 'Dough');
});

test('the same name is the same recipe; different ingredients become a variation inside it', async (t) => {
  const page = await open(t);
  await logBread(page, { photo: false });

  // typing the name again fills the recipe in, and saving joins it
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('milk  BREAD');
  await field(page, 'Comments').click();
  assert.equal(await line(page, 'Flour').getByLabel('Amount').inputValue(), '400', 'filled from the saved recipe');
  assert.equal(await line(page, 'Water').getByLabel('Amount').inputValue(), '300');
  assert.equal(await program(page, 1, 'White').getAttribute('aria-pressed'), 'true');
  await save(page);
  await formGone(page);
  await page.getByRole('button', { name: 'Recipes' }).click();
  await count(page.locator('.rc'), 1);
  assert.match(await page.locator('.rc').innerText(), /Baked 2×/);
  assert.doesNotMatch(await page.locator('.rc').innerText(), /tweaks/);

  // a third bake with more water: one recipe still, now with two variations
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('Milk bread');
  await field(page, 'Comments').click();
  await line(page, 'Water').getByLabel('Amount').fill('320');
  await save(page);
  await formGone(page);
  await count(page.locator('.rc'), 1);
  assert.match(await page.locator('.rc').innerText(), /Baked 3×[\s\S]*2 tweaks/);

  await page.locator('.rc .open').click();
  assert.deepEqual(await page.locator('.vhead .label').allInnerTexts(), ['TWEAK 2', 'TWEAK 1']);
  const two = page.locator('.variation').first(), one = page.locator('.variation').nth(1);
  assert.match(await two.locator('.vhead').innerText(), /Baked 1×/);
  assert.match(await one.locator('.vhead').innerText(), /Baked 2×/);
  assert.deepEqual(await two.locator('.ings li.diff span').allInnerTexts(), ['Warm water'], 'the line that differs stands out');
  await count(one.locator('.ings li.diff'), 0);
  await count(two.locator('.made .tile'), 1);
  await count(one.locator('.made .tile'), 2);

  // a bread page says which variation it followed
  await two.locator('.made .tile').click();
  assert.match(await page.locator('.screen').last().locator('.rhead').innerText(), /Tweak 2/);
  await page.getByRole('button', { name: 'Back' }).last().click();
  await page.getByRole('button', { name: 'Back' }).click();

  // another name is another recipe
  await logBread(page, { name: 'Sandwich loaf', photo: false });
  await count(page.locator('.rc'), 2);
});

test('a recipe attached to a parent shows as one of its tweaks', async (t) => {
  const page = await open(t);
  await logBread(page, { name: 'french bread', photo: false });

  // a new name, attached to french bread
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('herb french');
  await field(page, 'Comments').click();
  assert.deepEqual(await field(page, 'Parent').locator('option').allInnerTexts(), ['–', 'french bread']);
  await field(page, 'Parent').selectOption('french bread');
  await line(page, 'Flour').getByLabel('Amount').fill('380');
  await chip(page, 'Other').click();
  await line(page, 'Other').getByLabel('Ingredient').fill('Rosemary');
  await line(page, 'Other').getByLabel('Amount').fill('2');
  await save(page);
  await formGone(page);

  await page.getByRole('button', { name: 'Recipes' }).click();
  await count(page.locator('.rc'), 1);
  assert.match(await page.locator('.rc').innerText(), /french bread[\s\S]*Baked 2×[\s\S]*2 tweaks/);
  await page.locator('.rc .open').click();
  assert.deepEqual(await page.locator('.vhead .label').allInnerTexts(), ['TWEAK 2', 'TWEAK 1']);
  assert.deepEqual(await page.locator('.tname').allInnerTexts(), ['herb french'], 'a tweak with its own name shows it');
  await page.getByRole('button', { name: 'Back' }).click();

  // baking it again by name keeps it attached
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('herb french');
  await field(page, 'Comments').click();
  assert.equal(await field(page, 'Parent').inputValue(), 'french bread');
  await save(page);
  await formGone(page);
  await count(page.locator('.rc'), 1);
  assert.match(await page.locator('.rc').innerText(), /Baked 3×[\s\S]*2 tweaks/);

  // renaming the parent keeps the tweak attached
  await page.locator('.rc .open').click();
  await page.getByRole('button', { name: 'Edit tweak 1' }).click();
  await field(page, 'Name').fill('baguette');
  await save(page);
  await page.getByRole('heading', { name: 'Edit recipe' }).waitFor({ state: 'detached' });
  assert.equal(await page.locator('.screen h2').first().innerText(), 'baguette');
  await count(page.locator('.variation'), 2);

  // detaching gives it its own card again
  await page.getByRole('button', { name: 'Edit tweak 2' }).click();
  assert.equal(await field(page, 'Parent').inputValue(), 'baguette');
  await field(page, 'Parent').selectOption('');
  await save(page);
  await page.getByRole('heading', { name: 'Edit recipe' }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Back' }).click();
  await count(page.locator('.rc'), 2);
});

test('half stars, proofing and several photos', async (t) => {
  const page = await open(t);
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('Overnight loaf');

  // several photos, added in two goes; one removed again
  await field(page, 'Photo').setInputFiles([await picture(page, '#c98a3f'), await picture(page, '#8f5a1e')]);
  await count(page.locator('.photos .photo.has'), 2);
  await field(page, 'Photo').setInputFiles(await picture(page, '#e8a532'));
  await count(page.locator('.photos .photo.has'), 3);
  await page.locator('.photos .photo.has').nth(1).getByRole('button', { name: 'Remove photo' }).click();
  await count(page.locator('.photos .photo.has'), 2);

  // proofing: the machine by default, more than one place allowed
  const place = (n) => page.locator('.field', { hasText: 'Proofing' }).getByRole('button', { name: n, exact: true });
  assert.equal(await place('Bread machine').getAttribute('aria-pressed'), 'true');
  assert.equal(await place('Fridge').getAttribute('aria-pressed'), 'false');
  await place('Fridge').click();
  await field(page, 'Proof hours').fill('12');
  await line(page, 'Flour').getByLabel('Amount').fill('500');

  // half stars: the left half of the fourth star is 3½
  await page.getByRole('group', { name: 'Crust' }).getByRole('button', { name: '3½ of 5' }).click();
  await page.getByRole('group', { name: 'Taste' }).getByRole('button', { name: '4½ of 5' }).click();
  await page.getByRole('group', { name: 'Crumb' }).getByRole('button', { name: '4 of 5' }).click();
  assert.equal(await page.getByRole('group', { name: 'Crust' }).getByRole('button', { name: '3½ of 5' }).getAttribute('aria-pressed'), 'true');
  await save(page);
  await formGone(page);

  const tile = page.locator('.gal .tile');
  await count(tile, 1);
  assert.match(await tile.innerText(), /4\.0/);
  await count(tile.locator('.many'), 1);
  await tile.click();
  await count(page.locator('.hero-row .hero'), 2);
  await count(page.locator('.dots button'), 2);
  await loaded(page.locator('.hero-row .hero img').nth(1));
  assert.deepEqual(await page.locator('.scores .stars').evaluateAll((s) => s.map((x) => x.getAttribute('aria-label'))),
    ['3½ of 5', '4 of 5', '4½ of 5']);
  const text = await page.locator('.rcard').innerText();
  for (const want of ['PROOFING', 'Bread machine', 'Fridge', '12 h']) assert.ok(text.includes(want), want + '\n' + text);

  // editing keeps the photos; removing one deletes only that one
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await count(page.locator('.photos .photo.has'), 2);
  assert.equal(await field(page, 'Proof hours').inputValue(), '12');
  await page.locator('.photos .photo.has').first().getByRole('button', { name: 'Remove photo' }).click();
  await save(page);
  await page.getByRole('heading', { name: 'Edit bread' }).waitFor({ state: 'detached' });
  await count(page.locator('.hero-row .hero'), 1);
  await count(page.locator('.dots'), 0);
  await loaded(page.locator('.hero-row .hero img'));
});

test('photos are put in order by dragging; the + stays at the end', async (t) => {
  const page = await open(t);
  // Which colour is each photo? (red, green or blue pictures)
  const colours = (sel) => page.locator(sel).evaluateAll((imgs) => imgs.map((img) => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 8;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 8, 8);
    const d = x.getImageData(0, 0, 1, 1).data;
    return d[0] > 150 ? 'red' : d[1] > 150 ? 'green' : 'blue';
  }));
  async function settled(sel, n) {
    await count(page.locator(sel), n);
    for (let i = 0; i < n; i++) await loaded(page.locator(sel).nth(i));
  }
  const tiles = page.locator('.photos .photo.has');
  async function mouseDrag(from, to) {
    const a = await tiles.nth(from).boundingBox(), b = await tiles.nth(to).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2, { steps: 3 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
  }
  async function touchDrag(from, to) {
    const cdp = await page.context().newCDPSession(page);
    const a = await tiles.nth(from).boundingBox(), b = await tiles.nth(to).boundingBox();
    const pt = (x, y) => ({ touchPoints: [{ x, y }] });
    await cdp.send('Input.dispatchTouchEvent', Object.assign({ type: 'touchStart' }, pt(a.x + a.width / 2, a.y + a.height / 2)));
    await new Promise((r) => setTimeout(r, 400));                     // hold
    for (let i = 1; i <= 8; i++) {
      const x = a.x + a.width / 2 + (b.x - a.x) * i / 8, y = a.y + a.height / 2 + (b.y - a.y) * i / 8;
      await cdp.send('Input.dispatchTouchEvent', Object.assign({ type: 'touchMove' }, pt(x, y)));
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('Ordered loaf');
  await field(page, 'Photo').setInputFiles([await picture(page, '#e00000'), await picture(page, '#00d000'), await picture(page, '#0000e0')]);
  await settled('.photos .photo.has img', 3);
  assert.deepEqual(await colours('.photos .photo.has img'), ['red', 'green', 'blue']);
  assert.equal(await page.locator('.photos > *').last().getAttribute('class'), 'photo add', 'the + is last');

  await mouseDrag(2, 0);
  assert.deepEqual(await colours('.photos .photo.has img'), ['blue', 'red', 'green'], 'dragged to the front');
  await count(page.locator('.viewer'), 0, 'letting go does not open the photo');

  await touchDrag(1, 2);
  assert.deepEqual(await colours('.photos .photo.has img'), ['blue', 'green', 'red'], 'held and dragged with a finger');

  // a quick swipe across the photos scrolls; it does not move one
  {
    const cdp = await page.context().newCDPSession(page);
    const a = await tiles.nth(0).boundingBox(), b = await tiles.nth(2).boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x + 20, y: a.y + 20 }] });
    for (let i = 1; i <= 6; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + 20 + (b.x - a.x) * i / 6, y: a.y + 20 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.deepEqual(await colours('.photos .photo.has img'), ['blue', 'green', 'red']);
  }

  // a quick tap still opens the photo
  await tiles.first().getByRole('button', { name: 'Photo 1' }).click();
  await page.locator('.viewer').waitFor();
  await page.locator('.viewer').click();

  await save(page);
  await formGone(page);
  await settled('.gal .tile img', 1);
  assert.deepEqual(await colours('.gal .tile img'), ['blue'], 'the first photo is the cover');
  await page.locator('.gal .tile').click();
  await settled('.hero-row .hero img', 3);
  assert.deepEqual(await colours('.hero-row .hero img'), ['blue', 'green', 'red']);

  // reorder saved photos together with a new one
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await field(page, 'Photo').setInputFiles(await picture(page, '#e00000'));
  await settled('.photos .photo.has img', 4);
  await mouseDrag(3, 1);
  assert.deepEqual(await colours('.photos .photo.has img'), ['blue', 'red', 'green', 'red']);
  await save(page);
  await page.getByRole('heading', { name: 'Edit bread' }).waitFor({ state: 'detached' });
  await settled('.hero-row .hero img', 4);
  assert.deepEqual(await colours('.hero-row .hero img'), ['blue', 'red', 'green', 'red']);
});

// Recipes made the way the owner's are: some to try, a family whose parent was renamed away.
const RANKED = (() => {
  const r = (name, n, extra) => Object.assign({ name, ingredients: [], bake: {}, method: '', source: '', link: '', parent: '',
    originals: [], basedOn: null, createdAt: n, updatedAt: n }, extra);
  const withFlour = (name, n, extra) => r(name, n, Object.assign({ ingredients: [{ group: 'flour', type: 'AP', amount: String(400 + n), unit: 'g' }] }, extra));
  const b = (name, recipeId, n, date) => ({ name, date, recipeId, photos: [], photo: null, comments: '', notes: { crust: '', crumb: '', taste: '' },
    ratings: { crust: 4, crumb: 4, taste: 4 }, createdAt: n, updatedAt: n });
  return {
    'recipes/t1': r('Challah', 1), 'recipes/t2': r('Croissants', 2), 'recipes/t3': r('Donuts', 3),
    'recipes/m1': withFlour('Mantou', 10), 'recipes/m2': withFlour('Milk Mantou', 11, { parent: 'Mantou' }),
    'recipes/f1': withFlour('baguette', 20, { parent: 'french bread' }),
    'recipes/f2': withFlour('baguette II', 21, { parent: 'french bread' }),
    'breads/1': b('Mantou', 'm1', 10, '2026-11-20'), 'breads/2': b('Milk Mantou', 'm2', 11, '2026-11-21'),
    'breads/3': b('baguette', 'f1', 20, '2026-11-22'), 'breads/4': b('baguette II', 'f2', 21, '2026-11-23'),
    'breads/5': b('Loose loaf', null, 30, '2026-11-24')
  };
})();

test('recipes to try can be ranked by dragging, and the ranking is kept', async (t) => {
  const page = await open(t, { db: RANKED });
  await page.getByRole('button', { name: 'Recipes' }).click();
  await page.getByRole('tab', { name: /To try/ }).click();
  const names = () => page.locator('.list.ranked .rc h3').allInnerTexts();
  await count(page.locator('.list.ranked .rc'), 3);
  const start = await names();
  const rows = page.locator('.list.ranked .rc');
  async function mouseDrag(from, to) {
    const a = await rows.nth(from).boundingBox(), b = await rows.nth(to).boundingBox();
    await page.mouse.move(a.x + 40, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + 40, a.y + a.height / 2 + 10, { steps: 3 });
    await page.mouse.move(b.x + 40, b.y + b.height / 2, { steps: 10 });
    await page.mouse.up();
  }
  await mouseDrag(2, 0);
  const ranked = [start[2], start[0], start[1]];
  assert.deepEqual(await names(), ranked);
  await count(page.locator('.screen'), 0, 'letting go does not open the recipe');

  // with a finger: hold, then drag
  const cdp = await page.context().newCDPSession(page);
  const a = await rows.nth(0).boundingBox(), b = await rows.nth(2).boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x + 40, y: a.y + a.height / 2 }] });
  await new Promise((r) => setTimeout(r, 400));
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + 40, y: a.y + a.height / 2 + (b.y - a.y) * i / 10 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const after = [ranked[1], ranked[2], ranked[0]];
  assert.deepEqual(await names(), after);

  // kept after a reload, and a new recipe to try joins at the end
  await page.reload();
  await page.getByRole('button', { name: 'Recipes' }).click();
  await page.getByRole('tab', { name: /To try/ }).click();
  assert.deepEqual(await names(), after);
  await page.getByRole('button', { name: 'Add recipe' }).click();
  await page.getByRole('button', { name: 'Type it in' }).click();
  await field(page, 'Name').fill('Pizza');
  await save(page);
  await formGone(page);
  assert.deepEqual(await names(), after.concat(['Pizza']));

  // a tap still opens a recipe
  await rows.first().locator('.open').click();
  await page.locator('.screen h2').waitFor();
  assert.equal(await page.locator('.screen h2').innerText(), after[0]);
});

test('the gallery shows every entry, or one tile per parent recipe', async (t) => {
  const page = await open(t, { db: RANKED });
  const tiles = page.locator('.gal .tile');
  assert.equal(await page.getByRole('tab', { name: 'All' }).getAttribute('aria-selected'), 'true');
  await count(tiles, 5);
  await page.getByRole('tab', { name: 'Recipes' }).click();
  await count(tiles, 2);
  assert.deepEqual((await tiles.locator('.meta b').allInnerTexts()).sort(), ['Mantou', 'french bread'],
    'tweaks sit under their parent, even one whose own recipe was renamed away; to-try and recipe-less entries are not shown');
  assert.match(await tiles.filter({ hasText: 'Mantou' }).innerText(), /2×/);
  await tiles.filter({ hasText: 'french bread' }).click();
  await count(page.locator('.variation'), 2);
  await page.getByRole('button', { name: 'Back' }).click();

  await page.reload();
  assert.equal(await page.getByRole('tab', { name: 'Recipes' }).getAttribute('aria-selected'), 'true', 'the choice is remembered');
  await page.getByRole('tab', { name: 'All' }).click();
  await count(tiles, 5);
});

test('the Parent list only offers recipes with no parent, never the recipe itself', async (t) => {
  const page = await open(t, { db: RANKED });
  const options = () => field(page, 'Parent').locator('option').allInnerTexts();

  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('Rolls');
  await field(page, 'Comments').click();
  const offered = await options();
  assert.ok(offered.includes('Mantou') && offered.includes('french bread') && offered.includes('Challah'), offered.join(', '));
  for (const child of ['Milk Mantou', 'baguette', 'baguette II']) assert.ok(!offered.includes(child), child + ' has a parent, so it is not offered');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Discard' }).click();

  // editing a tweak: neither its own name nor its group is offered, even while renaming it
  await page.getByRole('button', { name: 'Recipes' }).click();
  await page.locator('.rc .open', { hasText: 'Mantou' }).click();
  await page.getByRole('button', { name: 'Edit tweak 2' }).click();
  assert.equal(await field(page, 'Parent').inputValue(), 'Mantou');
  await field(page, 'Name').fill('Sweet Mantou');
  assert.ok(!(await options()).includes('Milk Mantou'));
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Discard' }).click();

  // once it is detached it can be a parent again
  await page.getByRole('button', { name: 'Edit tweak 2' }).click();
  await field(page, 'Parent').selectOption('');
  await save(page);
  await page.getByRole('heading', { name: 'Edit recipe' }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('Rolls');
  await field(page, 'Comments').click();
  assert.ok((await options()).includes('Milk Mantou'));
});

test('the Stats tab adds up flour, loaves, the favourite and time', async (t) => {
  const r = (name, n, flour, bake) => ({ name, ingredients: [{ group: 'flour', type: 'AP', amount: flour[0], unit: flour[1] },
    { group: 'water', type: '', amount: '300', unit: 'g' }], bake, method: '', source: '', link: '', parent: '', originals: [],
    basedOn: null, createdAt: n, updatedAt: n });
  const b = (name, recipeId, n, extra) => Object.assign({ name, date: '2026-11-2' + n, recipeId, photos: [], photo: null, comments: '',
    notes: { crust: '', crumb: '', taste: '' }, ratings: { crust: 4, crumb: 4, taste: 4 }, createdAt: n, updatedAt: n }, extra);
  const page = await open(t, { db: {
    'recipes/a': r('Mantou', 1, ['500', 'g'], { programs: [8], minutes: 90, proofMinutes: 30 }),
    'recipes/b': r('sandwich bread', 2, ['3', 'cup'], { program: 1, size: '1.5', minutes: 205 }),
    'breads/1': b('Mantou', 'a', 1), 'breads/2': b('Mantou', 'a', 2),
    'breads/3': b('Mantou', 'a', 3, { splitFrom: '2' }),            // same dough as entry 2
    'breads/4': b('sandwich bread', 'b', 4), 'breads/5': b('Mystery', null, 5)
  } });
  await page.getByRole('button', { name: 'Stats' }).click();
  const stat = (label) => page.locator('.stat', { has: page.locator('.label', { hasText: new RegExp('^' + label + '$', 'i') }) });
  // flour: 500 g twice (the split copy shares entry 2's dough) + 3 cups at 120 g
  assert.equal(await stat('Flour used').locator('b').innerText(), '1.4 kg');
  assert.equal(await stat('Loaves').locator('b').innerText(), '5');
  assert.equal(await stat('Favorite').locator('b').innerText(), 'Mantou');
  assert.equal(await stat('Favorite').locator('small').innerText(), '3×');
  // time: (90 + 30) twice, nothing more for the split copy, plus 205
  assert.equal(await stat('Time spent').locator('b').innerText(), '7 h 25 min');

  // a new bread changes the numbers straight away
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('sandwich bread');
  await field(page, 'Comments').click();
  await save(page);
  await formGone(page);
  assert.equal(await stat('Loaves').locator('b').innerText(), '6');
  assert.equal(await stat('Flour used').locator('b').innerText(), '1.7 kg', '1,720 g');
});

test('Split marks the copy, so its dough is not counted twice', async (t) => {
  const page = await open(t);
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('Two ways');
  await line(page, 'Flour').getByLabel('Amount').fill('500');
  await program(page, 8, 'Dough').click();
  await save(page);
  await formGone(page);
  await page.locator('.gal .tile').click();
  await page.getByRole('button', { name: 'Split' }).click();
  await program(page, 12, 'Bake').click();
  await field(page, 'Added minutes').fill('40');
  await save(page);
  await page.getByRole('heading', { name: 'Split bread' }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Stats' }).click();
  const stat = (label) => page.locator('.stat', { has: page.locator('.label', { hasText: new RegExp('^' + label + '$', 'i') }) });
  assert.equal(await stat('Loaves').locator('b').innerText(), '2');
  assert.equal(await stat('Flour used').locator('b').innerText(), '500 g');
  assert.equal(await stat('Time spent').locator('b').innerText(), '2 h 10 min', '90 min of dough once, plus 40 min of Bake');
});

test('typing part of a name offers the saved recipe', async (t) => {
  const page = await open(t);
  await logBread(page, { photo: false });
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('mil');
  await page.locator('.suggest').getByRole('button', { name: 'Milk bread' }).click();
  assert.equal(await field(page, 'Name').inputValue(), 'Milk bread');
  assert.equal(await line(page, 'Flour').getByLabel('Amount').inputValue(), '400');
  assert.equal(await page.locator('.suggest').count(), 0);

  // changing to a name with no recipe clears what was filled in, as long as she has not edited it
  await field(page, 'Name').fill('Something new');
  await field(page, 'Comments').click();
  assert.equal(await line(page, 'Flour').getByLabel('Amount').inputValue(), '');
  assert.equal(await program(page, 1, 'White').getAttribute('aria-pressed'), 'false');
});

test('ingredients added once are offered next time', async (t) => {
  const page = await open(t);
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('Honey loaf');
  await line(page, 'Flour').getByLabel('Amount').fill('3');
  await line(page, 'Yeast').getByLabel('Amount').fill('1/2');
  await line(page, 'Yeast').getByLabel('Unit').selectOption('tbsp');
  await chip(page, 'Other').click();
  await line(page, 'Other').getByLabel('Ingredient').fill('Honey');
  await line(page, 'Other').getByLabel('Amount').fill('2');
  await line(page, 'Other').getByLabel('Unit').selectOption('tsp');
  await save(page);
  await formGone(page);

  await page.getByRole('button', { name: 'Add bread' }).click();
  assert.deepEqual(await page.locator('.addrow button').allInnerTexts(), ['Flour', 'Dairy', 'Sugar', 'Honey', 'Other']);
  assert.equal(await line(page, 'Yeast').getByLabel('Unit').inputValue(), 'g', 'units always start in grams');
  await chip(page, 'Honey').click();
  assert.equal(await line(page, 'Other').getByLabel('Ingredient').inputValue(), 'Honey');
  assert.equal(await line(page, 'Other').getByLabel('Unit').inputValue(), 'g');
  assert.deepEqual(await page.locator('#lgt-ingredient-names option').evaluateAll((o) => o.map((x) => x.value)), ['Sugar', 'Honey']);
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
  await save(page);
  await formGone(page);
  const tile = page.locator('.gal .tile');
  await count(tile, 1);
  assert.match(await tile.innerText(), /Sunday loaf\s+Nov 8/);
  await loaded(tile.locator('img'));
});

test('a bread logged with only a name makes no recipe card', async (t) => {
  const page = await open(t);
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('Mystery loaf');
  await save(page);
  await formGone(page);
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
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await line(page, 'Flour').getByLabel('Amount').fill('3');
  await save(page);
  await page.getByRole('heading', { name: 'Edit bread' }).waitFor({ state: 'detached' });
  await count(page.locator('.rcard'), 1);
});

test('Bake again from a bread keeps it on the same variation', async (t) => {
  const page = await open(t);
  await logBread(page, { photo: false });
  await page.locator('.gal .tile').click();
  await page.getByRole('button', { name: 'Bake again' }).click();
  assert.equal(await field(page, 'Name').inputValue(), 'Milk bread');
  assert.equal(await line(page, 'Water').getByLabel('Amount').inputValue(), '300');
  assert.equal(await field(page, 'Added minutes').inputValue(), '5');
  await save(page);
  await page.getByRole('heading', { name: 'New bread' }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Recipes' }).click();
  await count(page.locator('.rc'), 1);
  assert.match(await page.locator('.rc').innerText(), /Baked 2×/);
  assert.doesNotMatch(await page.locator('.rc').innerText(), /tweaks/);
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
  await chip(page, 'Other').click();
  await line(page, 'Other').getByLabel('Ingredient').fill('Raisins');
  await line(page, 'Other').getByLabel('Amount').fill('80');
  await field(page, 'Source').fill('Mom');
  await save(page);
  await formGone(page);

  const card = page.locator('.rc');
  await count(card, 1);
  assert.match(await card.innerText(), /Cinnamon raisin[\s\S]*Mom[\s\S]*AP flour 420 g[\s\S]*Raisins 80 g/);
  assert.doesNotMatch(await card.innerText(), /Salt/, 'the salt row left empty was not saved');

  await card.getByRole('button', { name: 'Bake this' }).click();
  assert.equal(await field(page, 'Name').inputValue(), 'Cinnamon raisin');
  await save(page);
  await formGone(page);
  await count(page.locator('.rc'), 0);
  await page.getByRole('tab', { name: /Baked/ }).click();
  assert.match(await page.locator('.rc').innerText(), /Cinnamon raisin[\s\S]*Baked 1×/);
});

test('reads a recipe from a photo; both sizes are saved as variations of one recipe', async (t) => {
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
  assert.equal(await program(page, 1, 'White').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('button', { name: 'Medium' }).getAttribute('aria-pressed'), 'true');
  assert.equal(await field(page, 'Hours').inputValue() + ':' + await field(page, 'Minutes').inputValue(), '3:25');
  assert.equal(await field(page, 'Source').inputValue(), 'Sample Cookbook, p. 12');
  await count(page.locator('.orig'), 1);

  assert.equal(await page.getByText('Loaf size').count(), 0, 'one size control while choosing between sizes');
  await page.getByRole('button', { name: '2 lb' }).click();
  assert.equal(await line(page, 'Flour').getByLabel('Amount').inputValue(), '3 3/4');
  assert.equal(await field(page, 'Minutes').inputValue(), '30');
  await page.getByRole('button', { name: 'Save both' }).click();
  await save(page);
  await formGone(page);

  await count(page.locator('.rc'), 1);
  assert.match(await page.locator('.rc').innerText(), /Everyday white loaf[\s\S]*2 tweaks/);
  await page.locator('.rc').getByRole('button', { name: 'Bake this' }).click();     // two variations: choose on its page
  await count(page.locator('.variation'), 2);
  const text = await page.locator('.screen').innerText();
  assert.ok(text.includes('Sample Cookbook, p. 12'));
  assert.ok(text.includes('or 2'), 'the yeast alternative is kept');
  assert.ok(text.includes('1½ lb') && text.includes('2 lb'));
  await loaded(page.locator('.screen .orig img').first());

  const sent = await page.evaluate(() => window.__lgtDev.calls[0]);
  assert.ok(sent.images > 1, 'a large image is sent with enlarged parts');
  assert.match(sent.input, /1 White \(also called Basic\)/);
});

test('fills a new bread from a photo, and from a saved recipe', async (t) => {
  const page = await open(t);
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'From photo').setInputFiles(await picture(page, '#eee', 900, 1200));
  await page.locator('.busy').waitFor({ state: 'detached' });
  assert.equal(await field(page, 'Name').inputValue(), 'Everyday white loaf');
  assert.equal(await line(page, 'Flour').getByLabel('Amount').inputValue(), '2 7/8');
  await save(page);
  await formGone(page);
  await count(page.locator('.gal .tile'), 1);

  await page.getByRole('button', { name: 'Add bread' }).click();
  await page.getByRole('button', { name: 'Use recipe' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Everyday white loaf/ }).click();
  assert.equal(await field(page, 'Name').inputValue(), 'Everyday white loaf');
  assert.equal(await line(page, 'Flour').getByLabel('Amount').inputValue(), '2 7/8');
  await save(page);
  await formGone(page);
  await page.getByRole('button', { name: 'Recipes' }).click();
  await count(page.locator('.rc'), 1);
  assert.match(await page.locator('.rc').innerText(), /Baked 2×/);
});

test('edits and deletes a bread; its recipe goes back to To try', async (t) => {
  const page = await open(t);
  await logBread(page, { photo: false });
  await page.locator('.gal .tile').click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  assert.equal(await program(page, 12, 'Bake').getAttribute('aria-pressed'), 'true');
  assert.equal(await field(page, 'Reason').inputValue(), 'crust browning');
  await field(page, 'Name').fill('Milk bread, first try');
  await save(page);
  await page.getByRole('heading', { name: 'Edit bread' }).waitFor({ state: 'detached' });
  assert.match(await page.locator('.screen h2').first().innerText(), /Milk bread, first try/);
  assert.match(await page.locator('.rhead h3').innerText(), /Milk bread, first try/, 'its recipe took the new name with it');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await page.locator('.screen').waitFor({ state: 'detached' });
  await count(page.locator('.gal .tile'), 0);

  await page.getByRole('button', { name: 'Recipes' }).click();
  await count(page.locator('.rc'), 0);
  await page.getByRole('tab', { name: /To try/ }).click();
  await count(page.locator('.rc'), 1);
  await page.locator('.rc .open').click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await page.locator('.screen').waitFor({ state: 'detached' });
  await count(page.locator('.rc'), 0);
});

test('renaming a recipe renames every variation and the breads baked from it', async (t) => {
  const page = await open(t);
  await logBread(page, { photo: false });
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('Milk bread');
  await field(page, 'Comments').click();
  await line(page, 'Water').getByLabel('Amount').fill('320');
  await save(page);
  await formGone(page);

  await page.getByRole('button', { name: 'Recipes' }).click();
  await page.locator('.rc .open').click();
  await page.getByRole('button', { name: 'Edit tweak 1' }).click();
  await field(page, 'Name').fill('Soft milk loaf');
  await save(page);
  await page.getByRole('heading', { name: 'Edit recipe' }).waitFor({ state: 'detached' });
  assert.equal(await page.locator('.screen h2').first().innerText(), 'Soft milk loaf');
  await count(page.locator('.variation'), 2);
  await page.getByRole('button', { name: 'Back' }).click();
  await count(page.locator('.rc'), 1);
  await page.getByRole('button', { name: 'Gallery' }).click();
  assert.deepEqual(await page.locator('.gal .tile .meta b').allInnerTexts(), ['Soft milk loaf', 'Soft milk loaf']);
});

test('Split copies an entry so each half can be baked its own way', async (t) => {
  const page = await open(t);
  // dough made in the machine
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('Country dough');
  await field(page, 'Photo').setInputFiles(await picture(page, '#c98a3f'));
  await field(page, 'Date').fill('2026-11-20');
  await line(page, 'Flour').getByLabel('Amount').fill('3');
  await program(page, 8, 'Dough').click();
  await field(page, 'Comments').fill('Sticky.');
  await save(page);
  await formGone(page);
  await count(page.locator('.gal .tile .flag'), 1);

  // backing out of a split leaves nothing behind
  await page.locator('.gal .tile').click();
  await page.getByRole('button', { name: 'Split' }).click();
  await page.getByRole('heading', { name: 'Split bread' }).waitFor();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('heading', { name: 'Split bread' }).waitFor({ state: 'detached' });

  // the copy opens with everything the entry had
  await page.getByRole('button', { name: 'Split' }).click();
  assert.equal(await field(page, 'Name').inputValue(), 'Country dough');
  assert.equal(await field(page, 'Date').inputValue(), '2026-11-20');
  assert.equal(await line(page, 'Flour').getByLabel('Amount').inputValue(), '3');
  assert.equal(await program(page, 8, 'Dough').getAttribute('aria-pressed'), 'true');
  assert.equal(await field(page, 'Comments').inputValue(), 'Sticky.');
  await loaded(page.locator('.photo img'));
  assert.equal(await page.getByRole('button', { name: 'Use recipe' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Delete' }).count(), 0, 'it is a new entry, not the old one');

  // this half goes on to the Bake program
  await program(page, 12, 'Bake').click();
  await field(page, 'Added minutes').fill('40');
  await save(page);
  await page.getByRole('heading', { name: 'Split bread' }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Back' }).click();

  const tiles = page.locator('.gal .tile');
  await count(tiles, 2);
  await count(page.locator('.gal .tile .flag'), 1);          // the other half is still dough
  assert.deepEqual(await tiles.locator('.meta').allInnerTexts(), ['Country dough\nNov 20', 'Country dough\nNov 20']);
  await loaded(tiles.nth(0).locator('img'));
  await loaded(tiles.nth(1).locator('img'));

  // one recipe, two ways of baking it
  await page.getByRole('button', { name: 'Recipes' }).click();
  await count(page.locator('.rc'), 1);
  assert.match(await page.locator('.rc').innerText(), /Country dough[\s\S]*Baked 2×[\s\S]*2 tweaks/);

  // the halves share the photo they started with: deleting one must not take it from the other
  await page.getByRole('button', { name: 'Gallery' }).click();
  await page.locator('.gal .tile', { hasNot: page.locator('.flag') }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await page.locator('.screen').waitFor({ state: 'detached' });
  await count(tiles, 1);
  await page.reload();
  await count(tiles, 1);
  await loaded(tiles.locator('img'));
});

// Entries shaped the way the first version saved them: one `program` per bake, time added
// without a Bake program, a reason left behind, and the same recipe saved as separate cards.
const R = (name, flour, water, bake, extra) => Object.assign({
  name, ingredients: [
    { group: 'flour', type: flour[0], amount: flour[1], unit: 'cup', note: '' },
    { group: 'water', type: '', amount: water, unit: 'cup', note: '' },
    { group: 'yeast', type: 'Active dry', amount: '1/2', unit: 'tbsp', note: '' },
    { group: 'other', type: 'Salt', amount: '1/2', unit: 'tbsp', note: '' }],
  bake: Object.assign({ size: '', crust: '', added: null, reason: '', ovenMinutes: null, ovenTemp: null }, bake),
  method: '', source: 'Booklet', link: '', originals: [], basedOn: null
}, extra);
const B = (name, date, recipeId, n, ratings) => ({
  name, date, recipeId, photo: null, comments: '', notes: { crust: '', crumb: '', taste: '' },
  ratings: ratings || { crust: 0, crumb: 0, taste: 0 }, createdAt: n, updatedAt: n
});
const EARLIER = {
  'recipes/r1': R('country loaf', ['Bread', '3.25'], '1.5', { program: 2, size: '1.5', minutes: 255, added: 10, reason: 'Too pale' }, { createdAt: 1000, updatedAt: 1000 }),
  'recipes/r2': R('country loaf', ['AP', '3'], '1.25', { program: 8, minutes: 90, reason: 'Too pale' }, { basedOn: 'r1', createdAt: 2000, updatedAt: 2000 }),
  'recipes/r3': R('country loaf', ['AP', '3.75'], '1.75', { program: 8, minutes: 90, reason: 'Too pale' }, { basedOn: 'r1', createdAt: 3000, updatedAt: 3000 }),
  'breads/b1': B('country loaf', '2026-11-20', 'r1', 1000, { crust: 4, crumb: 4, taste: 4 }),
  'breads/b2': B('country loaf', '2026-11-21', 'r2', 2000),
  'breads/b3': B('country loaf', '2026-11-22', 'r3', 3000),
  'breads/b4': B('Morning rolls', '2026-11-22', null, 4000)
};

test('entries saved by the first version read correctly', async (t) => {
  const page = await open(t, { db: EARLIER });
  await count(page.locator('.gal .tile'), 4);
  await count(page.locator('.gal .tile .flag'), 3);
  const baked = page.locator('.gal .tile', { hasNot: page.locator('.flag') });
  assert.match(await baked.innerText(), /country loaf\s+Nov 20/, 'only the French bake is not dough');

  await page.getByRole('button', { name: 'Recipes' }).click();
  await count(page.locator('.rc'), 1);
  assert.match(await page.locator('.rc').innerText(), /country loaf[\s\S]*Baked 3×[\s\S]*3 tweaks/);
  await page.locator('.rc .open').click();
  assert.deepEqual(await page.locator('.vhead .label').allInnerTexts(), ['TWEAK 3', 'TWEAK 2', 'TWEAK 1']);
  const first = page.locator('.variation').nth(2);
  const text = await first.innerText();
  for (const want of ['2 · French', '12 · Bake', '4 h 15 min', '+10 min', 'Too pale']) assert.ok(text.includes(want), want + '\n' + text);
  assert.doesNotMatch(await page.locator('.variation').first().innerText(), /Too pale/, 'a reason with no added time is not shown');

  // the earlier bake opens with Bake chosen and its added time in place
  await first.locator('.made .tile').click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  assert.equal(await program(page, 2, 'French').getAttribute('aria-pressed'), 'true');
  assert.equal(await program(page, 12, 'Bake').getAttribute('aria-pressed'), 'true');
  assert.equal(await field(page, 'Added minutes').inputValue(), '10');
  assert.equal(await field(page, 'Reason').inputValue(), 'Too pale');
  // saving it unchanged leaves it on the same variation
  await field(page, 'Comments').fill('Looked at again.');
  await save(page);
  await page.getByRole('heading', { name: 'Edit bread' }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Back' }).last().click();
  await count(page.locator('.variation'), 3);

  // one of the dough entries: add the Bake program and it is no longer dough
  await page.locator('.variation').first().locator('.made .tile').click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  assert.equal(await field(page, 'Added minutes').count(), 0);
  await program(page, 12, 'Bake').click();
  await field(page, 'Added minutes').fill('40');
  await save(page);
  await page.getByRole('heading', { name: 'Edit bread' }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Back' }).last().click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Gallery' }).click();
  await count(page.locator('.gal .tile .flag'), 2);

  // what was used before is offered in a new bread
  await page.getByRole('button', { name: 'Add bread' }).click();
  assert.equal(await line(page, 'Yeast').getByLabel('Unit').inputValue(), 'g');
  assert.equal(await line(page, 'Salt').getByLabel('Unit').inputValue(), 'g');
});

test('keeps what was saved after a reload', async (t) => {
  const page = await open(t);
  await logBread(page, { photo: false });
  await page.reload();
  assert.match(await page.locator('.gal .tile').innerText(), /Milk bread/);
});

test('says so when storage is not available', async (t) => {
  const page = await open(t, { flags: { noDb: true } });
  await page.getByText('Unavailable').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Add bread' }).count(), 0);
});

test('hides photo features the runtime does not offer', async (t) => {
  const page = await open(t, { flags: { noAssets: true, noSample: true } });
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').waitFor();
  assert.equal(await field(page, 'Photo').count(), 0);
  assert.equal(await field(page, 'From photo').count(), 0);
});

test('interface copy follows the owner\'s rules', async (t) => {
  // Every word on these screens is ours or a name from the seeded data: labels and buttons
  // are 1-3 words, headings under 6, and there is no explanatory text.
  const page = await open(t, { db: EARLIER });
  const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
  async function audit(where) {
    const found = await page.evaluate(() => {
      const out = { headings: [], labels: [], other: [] };
      const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const ours = (el) => !el.closest('.tile, .rc .open, .rc .body, .opt, .suggest, .ings, .src, .method, .comments, .notes, .tname, #f-parent');
      document.querySelectorAll('h1,h2,h3').forEach((el) => { if (visible(el)) out.headings.push(el.textContent.trim()); });
      document.querySelectorAll('button, .label, .pill, .flag, option, label').forEach((el) => {
        if ((visible(el) || el.tagName === 'OPTION') && ours(el)) out.labels.push(el.textContent.trim());
      });
      document.querySelectorAll('p, small, .hint, .help, [title]').forEach((el) => {
        if (visible(el) && ours(el) && !el.closest('.bake')) out.other.push(el.textContent.trim() || el.getAttribute('title'));
      });
      document.querySelectorAll('input, textarea').forEach((el) => { if (el.placeholder) out.labels.push(el.placeholder); });
      return out;
    });
    for (const h of found.headings) assert.ok(words(h) < 6, where + ': heading too long: "' + h + '"');
    for (const l of found.labels.filter(Boolean)) assert.ok(words(l) <= 3, where + ': label too long: "' + l + '"');
    assert.deepEqual(found.other.filter((x) => x && !/^\d+×?$/.test(x)), [], where + ': explanatory text on screen');
  }
  await audit('gallery');
  await page.getByRole('button', { name: 'Stats' }).click();
  await audit('stats');
  await page.getByRole('button', { name: 'Gallery' }).click();
  await page.locator('.gal .tile').first().click();
  await audit('bread page');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Recipes' }).click();
  await audit('recipes, baked');
  await page.locator('.rc .open').click();
  await audit('recipe page');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('tab', { name: /To try/ }).click();
  await audit('recipes, to try');
  await page.getByRole('button', { name: 'Add recipe' }).click();
  await audit('add recipe sheet');
  await page.getByRole('button', { name: 'Type it in' }).click();
  await audit('new recipe');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Add bread' }).click();
  await program(page, 8, 'Dough').click();
  await program(page, 12, 'Bake').click();
  await field(page, 'Added minutes').fill('5');
  await audit('new bread');
});
