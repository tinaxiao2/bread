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

/** Add a photo in the open bread form, so the entry counts as baked. */
async function snap(page) {
  const before = await page.locator('.photos .photo.has').count();
  await field(page, 'Photo').setInputFiles(await picture(page, '#c98a3f'));
  await page.locator('.photos .photo.has').nth(before).waitFor();
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
  assert.equal(await line(page, 'Water').getByLabel('Type').inputValue(), 'Room temp');
  assert.deepEqual(await line(page, 'Water').getByLabel('Type').locator('option').allInnerTexts(), ['Type', 'Room temp', 'Lukewarm', 'Warm', 'Hot', 'Other…']);
  assert.deepEqual(await line(page, 'Yeast').getByLabel('Type').locator('option').allInnerTexts(), ['Type', 'Active dry', 'Instant', 'Other…']);
  assert.equal(await line(page, 'Flour').getByLabel('Type').inputValue(), 'AP');
  assert.equal(await line(page, 'Yeast').getByLabel('Type').inputValue(), 'Active dry');
  assert.deepEqual(await page.locator('.addrow button').allInnerTexts(), ['Flour', 'Dairy', 'Sugar', 'Other']);

  // sweeteners have their own row, like dairy, and more than one can be added
  await chip(page, 'Sugar').click();
  assert.equal(await line(page, 'Sugar').getByLabel('Type').inputValue(), 'Sugar');
  assert.deepEqual(await line(page, 'Sugar').getByLabel('Type').locator('option').allInnerTexts(), ['Type', 'Sugar', 'Brown sugar', 'Honey', 'Molasses', 'Other…']);
  assert.equal(await line(page, 'Sugar').getByLabel('Unit').inputValue(), 'g');
  assert.equal(await chip(page, 'Sugar').count(), 1);

  // an egg is counted: 1, no unit
  await chip(page, 'Other').click();
  await line(page, 'Other').getByLabel('Ingredient').fill('Egg');
  assert.equal(await line(page, 'Other').getByLabel('Amount').inputValue(), '1');
  assert.equal(await line(page, 'Other').getByLabel('Unit').inputValue(), '');
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
  assert.equal(await field(page, 'Hours').inputValue() + ':' + await field(page, 'Minutes').inputValue(), '0:25', 'Dough is its kneading; the rise is the proof');
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

test('baking a recipe again lands on its tweak or adds the next, numbered I, II', async (t) => {
  const page = await open(t);
  await logBread(page);

  // Bake again with more water: a new tweak, and the name follows it
  await page.locator('.gal .tile').click();
  await page.getByRole('button', { name: 'Bake again' }).click();
  assert.equal(await field(page, 'Name').inputValue(), 'Milk bread');
  await line(page, 'Water').getByLabel('Amount').fill('320');
  assert.equal(await field(page, 'Name').inputValue(), 'Milk bread II');
  await snap(page);
  await save(page);
  await page.getByRole('heading', { name: 'New bread' }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Back' }).click();
  assert.deepEqual(await page.locator('.gal .tile .meta b').allInnerTexts(), ['Milk bread II', 'Milk bread']);

  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await count(page.locator('.rc'), 1);
  assert.match(await page.locator('.rc').innerText(), /Baked 2×/);
  await page.locator('.rc .open').click();
  assert.deepEqual(await page.locator('.vhead .label').allInnerTexts(), ['I', 'II']);
  const one = page.locator('.variation').first(), two = page.locator('.variation').nth(1);
  assert.deepEqual(await two.locator('.ings li.diff span').allInnerTexts(), ['Warm water'], 'the line that differs stands out');
  await count(one.locator('.ings li.diff'), 0);

  // the first tweak again, under a name of her own
  await one.getByRole('button', { name: 'Bake this' }).click();
  assert.equal(await field(page, 'Name').inputValue(), 'Milk bread');
  await field(page, 'Name').fill('Milk bread, rainy day');
  await snap(page);
  await save(page);
  await page.getByRole('heading', { name: 'New bread' }).waitFor({ state: 'detached' });
  await count(one.locator('.made .tile'), 2);
  await count(two.locator('.made .tile'), 1);
  assert.match(await one.locator('.vhead').innerText(), /Baked 2×/);

  // a bread page says which tweak it followed
  await two.locator('.made .tile').click();
  assert.equal(await page.locator('.screen').last().locator('.rhead .pill').innerText(), 'II');
  assert.equal(await page.locator('.screen').last().locator('.rhead h3').innerText(), 'Milk bread');
  await page.getByRole('button', { name: 'Back' }).last().click();
  await page.getByRole('button', { name: 'Back' }).click();

  // typing the same name is not enough to join it: that is a recipe of its own
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('Milk bread');
  await line(page, 'Flour').getByLabel('Amount').fill('400');
  await snap(page);
  await save(page);
  await formGone(page);
  await count(page.locator('.rc'), 2);
});

test('a label gathers recipes; arrows step between them', async (t) => {
  const page = await open(t, { db: RANKED });
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  const titled = (name) => page.locator('.rc', { has: page.locator('h3', { hasText: new RegExp('^[^A-Za-z]*' + name + '$') }) });
  assert.match(await titled('Mantou').innerText(), /2 recipes/);
  await titled('Mantou').locator('.open').click();
  assert.equal(await page.locator('.screen h2').innerText(), 'Mantou');
  assert.equal(await page.locator('.pager h3').innerText(), 'Milk Mantou', 'opens on the one baked last');
  assert.equal(await page.getByRole('button', { name: 'Next recipe' }).isDisabled(), true);
  await page.getByRole('button', { name: 'Previous recipe' }).click();
  assert.equal(await page.locator('.pager h3').innerText(), 'Mantou');
  assert.equal(await page.getByRole('button', { name: 'Previous recipe' }).isDisabled(), true);
  await page.getByRole('button', { name: 'Back' }).click();

  // filing two new recipes under a new label
  async function bread(name, parent) {
    await page.getByRole('button', { name: 'Add bread' }).click();
    await field(page, 'Name').fill(name);
    if (parent) await parent();
    await line(page, 'Flour').getByLabel('Amount').fill('500');
    await snap(page);
    await save(page);
    await formGone(page);
  }
  await bread('Country White Bread', async () => {
    assert.deepEqual(await field(page, 'Parent').locator('option').allInnerTexts(),
      ['–', 'baguette', 'Challah', 'Croissants', 'Donuts', 'french bread', 'Mantou', 'Milk Mantou', 'New…'], 'labels and recipes, A to Z');
    await field(page, 'Parent').selectOption('__new');
    await field(page, 'Parent').fill('White bread');
    // a label can have its own flag
    await field(page, 'Parent flag').selectOption('US');
  });
  await bread('Classic White Sandwich Bread', async () => {
    await field(page, 'Parent').selectOption('White bread');
    assert.equal(await field(page, 'Parent flag').inputValue(), 'US');
  });
  // a recipe named like the label is not under it unless it is filed there
  await bread('White bread');
  await count(titled('White bread'), 2);
  const label = titled('White bread').filter({ has: page.locator('.count') });
  await count(label, 1);
  assert.equal(await label.locator('h3 .fl').innerText(), '\u{1F1FA}\u{1F1F8}', 'the label shows its own flag');
  await count(titled('White bread').filter({ hasNot: page.locator('.count') }).locator('h3 .fl'), 0);
  assert.match(await label.innerText(), /Baked 2×[\s\S]*2 recipes/);

  // taking a recipe out of a label gives it its own card
  await label.locator('.open').click();
  assert.equal(await page.locator('.pager h3').innerText(), 'Classic White Sandwich Bread');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await field(page, 'Parent').selectOption('');
  await save(page);
  await page.getByRole('heading', { name: 'Edit recipe' }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Back' }).click();
  await count(titled('Classic White Sandwich Bread'), 1);
  await count(page.locator('.rc .count'), 1);
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
  const b = (name, recipeId, n, date) => ({ name, date, recipeId, photos: [{ full: 'seed' + n, thumb: 'seed' + n }], photo: null, comments: '', notes: { crust: '', crumb: '', taste: '' },
    ratings: { crust: 4, crumb: 4, taste: 4 }, createdAt: n, updatedAt: n });
  return {
    'recipes/t1': r('Challah', 1), 'recipes/t2': r('Croissants', 2), 'recipes/t3': r('Donuts', 3),
    'recipes/m1': withFlour('Mantou', 10, { parent: 'Mantou', line: 'm1', tweak: 1 }),
    'recipes/m2': withFlour('Milk Mantou', 11, { parent: 'Mantou', line: 'm2', tweak: 1 }),
    'recipes/f1': withFlour('baguette', 20, { parent: 'french bread', line: 'f1', tweak: 1 }),
    'recipes/f2': withFlour('baguette', 21, { parent: 'french bread', line: 'f1', tweak: 2 }),
    'breads/1': b('Mantou', 'm1', 10, '2026-11-20'), 'breads/2': b('Milk Mantou', 'm2', 11, '2026-11-21'),
    'breads/3': b('baguette', 'f1', 20, '2026-11-22'), 'breads/4': b('baguette II', 'f2', 21, '2026-11-23'),
    'breads/5': b('Loose loaf', null, 30, '2026-11-24')
  };
})();

test('recipes to try can be ranked by dragging, and the ranking is kept', async (t) => {
  const page = await open(t, { db: RANKED });
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
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
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
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
    'one tile per label; to-try and recipe-less entries are not shown');
  const mantou = page.locator('.stack', { hasText: 'Mantou' });
  assert.equal(await mantou.locator('.badge').innerText(), '2', 'the count in a bubble');
  await count(mantou.locator('.layer'), 1, 'one card stacked behind for one extra entry');
  await count(page.locator('.stack', { hasText: 'french bread' }).locator('.layer'), 1);
  await tiles.filter({ hasText: 'french bread' }).click();
  await count(page.locator('.variation'), 2);
  await count(page.locator('.pager'), 0, 'one recipe under the label: no arrows');
  assert.equal(await page.locator('.pname').innerText(), 'baguette');
  await page.getByRole('button', { name: 'Back' }).click();

  await page.reload();
  assert.equal(await page.getByRole('tab', { name: 'Recipes' }).getAttribute('aria-selected'), 'true', 'the choice is remembered');
  await page.getByRole('tab', { name: 'All' }).click();
  await count(tiles, 5);
});


test('the Stats tab adds up flour, loaves, the favourite and time', async (t) => {
  const r = (name, n, flour, bake) => ({ name, ingredients: [{ group: 'flour', type: 'AP', amount: flour[0], unit: flour[1] },
    { group: 'water', type: '', amount: '300', unit: 'g' }], bake, method: '', source: '', link: '', parent: '', originals: [],
    basedOn: null, createdAt: n, updatedAt: n });
  const b = (name, recipeId, n, extra) => Object.assign({ name, date: '2026-11-2' + n, recipeId, photos: [{ full: 'seed' + n, thumb: 'seed' + n }], photo: null, comments: '',
    notes: { crust: '', crumb: '', taste: '' }, ratings: { crust: 4, crumb: 4, taste: 4 }, createdAt: n, updatedAt: n }, extra);
  const page = await open(t, { db: {
    'recipes/a': r('Mantou', 1, ['500', 'g'], { programs: [8], minutes: 90, proofMinutes: 30 }),
    'recipes/b': r('sandwich bread', 2, ['3', 'cup'], { program: 1, size: '1.5', minutes: 205 }),
    'breads/1': b('Mantou', 'a', 1), 'breads/2': b('Mantou', 'a', 2),
    'breads/3': b('Mantou', 'a', 3, { splitFrom: '2' }),            // same dough as entry 2
    'breads/4': b('sandwich bread', 'b', 4, { ratings: { crust: 5, crumb: 4.5, taste: 4 } }), 'breads/5': b('Mystery', null, 5)
  } });
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  const stat = (label) => page.locator('.stat', { has: page.locator('.label', { hasText: new RegExp('^' + label + '$', 'i') }) });
  // flour: 500 g twice (the split copy shares entry 2's dough) + 3 cups at 120 g
  assert.equal(await stat('Flour used').locator('b').innerText(), '1.4 kg');
  assert.equal(await stat('Loaves').locator('b').innerText(), '5');
  assert.equal(await stat('Favorite').locator('b').innerText(), 'Mantou');
  assert.equal(await stat('Favorite').locator('small').innerText(), '3×');
  // time: (90 + 30) twice, nothing more for the split copy, plus 205
  assert.equal(await stat('Time spent').locator('b').innerText(), '7 h 25 min');
  assert.equal(await stat('Highest rated').locator('b').innerText(), 'sandwich bread');
  assert.equal(await stat('Highest rated').locator('.score').innerText(), '4.5');
  for (const label of ['Favorite', 'Highest rated']) {
    const box = await stat(label).locator('.pick').boundingBox();
    assert.ok(box.height < 40, label + ' fits on one line');
  }

  // tapping a name opens its recipe
  await stat('Highest rated').locator('.pick').click();
  assert.equal(await page.locator('.screen h2').innerText(), 'sandwich bread');
  await page.getByRole('button', { name: 'Back' }).click();
  await stat('Favorite').locator('.pick').click();
  assert.equal(await page.locator('.screen h2').innerText(), 'Mantou');
  await page.getByRole('button', { name: 'Back' }).click();

  // an undated entry adds its flour straight away, but is a loaf only once it has a date
  await page.getByRole('button', { name: 'Add bread' }).click();
  await page.getByRole('button', { name: 'Use recipe' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /sandwich bread/ }).click();
  await page.getByRole('button', { name: 'No date' }).click();
  await save(page);
  await formGone(page);
  assert.equal(await stat('Loaves').locator('b').innerText(), '5');
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await page.locator('.gal .tile').last().click();                    // undated entries come last
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await field(page, 'Date').fill('2026-11-27');
  await save(page);
  await page.getByRole('heading', { name: 'Edit bread' }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  assert.equal(await stat('Loaves').locator('b').innerText(), '6');
  assert.equal(await stat('Flour used').locator('b').innerText(), '1.7 kg', '1,720 g');
});

test('Split marks the copy, so its dough is not counted twice', async (t) => {
  const page = await open(t);
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('Two ways');
  await line(page, 'Flour').getByLabel('Amount').fill('500');
  await program(page, 8, 'Dough').click();
  await snap(page);
  await save(page);
  await formGone(page);
  await page.locator('.gal .tile').click();
  await page.getByRole('button', { name: 'Split' }).click();
  await program(page, 12, 'Bake').click();
  await field(page, 'Added minutes').fill('40');
  await snap(page);
  await save(page);
  await page.getByRole('heading', { name: 'Split bread' }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  const stat = (label) => page.locator('.stat', { has: page.locator('.label', { hasText: new RegExp('^' + label + '$', 'i') }) });
  assert.equal(await stat('Loaves').locator('b').innerText(), '2');
  assert.equal(await stat('Flour used').locator('b').innerText(), '500 g');
  assert.equal(await stat('Time spent').locator('b').innerText(), '2 h 10 min', '25 min of kneading and 65 in the machine once, plus 40 min of Bake');
});

test('a flag chosen for a recipe shows before its name everywhere', async (t) => {
  const page = await open(t);
  const FR = '\u{1F1EB}\u{1F1F7}', CN = '\u{1F1E8}\u{1F1F3}';
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Flag').selectOption('FR');
  await field(page, 'Name').fill('baguette');
  await line(page, 'Flour').getByLabel('Amount').fill('500');
  await snap(page);
  await save(page);
  await formGone(page);
  assert.equal(await page.locator('.gal .tile .fl').innerText(), FR);

  // baking it again brings the flag along, on every tweak
  await page.locator('.gal .tile').click();
  await page.getByRole('button', { name: 'Bake again' }).click();
  assert.equal(await field(page, 'Flag').inputValue(), 'FR');
  await line(page, 'Flour').getByLabel('Amount').fill('480');
  await snap(page);
  await save(page);
  await page.getByRole('heading', { name: 'New bread' }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Back' }).click();
  assert.deepEqual(await page.locator('.gal .tile .fl').allInnerTexts(), [FR, FR]);

  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('Mantou');
  assert.equal(await field(page, 'Flag').inputValue(), '');
  await field(page, 'Flag').selectOption('CN');
  await line(page, 'Flour').getByLabel('Amount').fill('500');
  await snap(page);
  await save(page);
  await formGone(page);
  assert.equal(await page.locator('.gal .tile', { hasText: 'Mantou' }).locator('.fl').innerText(), CN);

  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  const cards = page.locator('.rc');
  await count(cards, 2);
  assert.equal(await cards.filter({ hasText: 'baguette' }).locator('h3 .fl').innerText(), FR);
  await cards.filter({ hasText: 'baguette' }).locator('.open').click();
  assert.equal(await page.locator('.screen h2 .fl').innerText(), FR);

  // changing the flag on one tweak changes it on the whole recipe
  await page.getByRole('button', { name: 'Edit I', exact: true }).click();
  await field(page, 'Flag').selectOption('');
  await save(page);
  await page.getByRole('heading', { name: 'Edit recipe' }).waitFor({ state: 'detached' });
  await count(page.locator('.screen h2 .fl'), 0);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await count(page.locator('.gal .tile .fl'), 1);

  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  assert.equal(await page.locator('.stat .fl').count(), 0);
});

test('an entry dated "–" is a plan; giving it a date makes it baked', async (t) => {
  const page = await open(t);
  // a bread with baking steps, dated "–"
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('Everyday white loaf');
  await line(page, 'Flour').getByLabel('Amount').fill('400');
  await program(page, 1, 'White').click();
  await page.getByRole('button', { name: 'No date' }).click();
  assert.equal(await field(page, 'Date').inputValue(), '');
  assert.equal(await page.getByRole('button', { name: 'No date' }).getAttribute('aria-pressed'), 'true');
  await snap(page);                                                   // a photo alone does not make it baked
  await save(page);
  await formGone(page);
  assert.match(await page.locator('.gal .tile .meta small').innerText(), /^–$/);

  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await count(page.locator('.rc'), 0, 'not under Baked');
  await page.getByRole('tab', { name: /To try/ }).click();
  await count(page.locator('.rc'), 1);
  assert.doesNotMatch(await page.locator('.rc').innerText(), /Baked/);
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await page.getByRole('tab', { name: 'Recipes' }).click();
  await count(page.locator('.gal .tile'), 0);
  await page.getByRole('tab', { name: 'All' }).click();

  // giving it a date makes it baked
  await page.locator('.gal .tile').click();
  assert.equal(await page.locator('.screen .date').innerText(), '–');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await field(page, 'Date').fill('2026-11-27');
  assert.equal(await page.getByRole('button', { name: 'No date' }).getAttribute('aria-pressed'), 'false');
  await save(page);
  await page.getByRole('heading', { name: 'Edit bread' }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await page.getByRole('tab', { name: /Baked/ }).click();
  assert.match(await page.locator('.rc').innerText(), /Baked 1×/);

  // and "–" takes it back
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await page.locator('.gal .tile').click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'No date' }).click();
  assert.equal(await field(page, 'Date').inputValue(), '');
  await save(page);
  await page.getByRole('heading', { name: 'Edit bread' }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await count(page.locator('.rc'), 0);
});

test('the gallery can be sorted by most recent, most baked, rating, name or country', async (t) => {
  const r = (name, n) => ({ name, ingredients: [{ group: 'flour', type: 'AP', amount: '500', unit: 'g' }], bake: { programs: [1], size: '1.5', minutes: 205 },
    method: '', source: '', link: '', parent: '', originals: [], basedOn: null, createdAt: n, updatedAt: n });
  const b = (name, rid, n, date, stars) => ({ name, date, recipeId: rid, photos: [{ full: 'seed' + n, thumb: 'seed' + n }], comments: '',
    notes: { crust: '', crumb: '', taste: '' }, ratings: { crust: stars, crumb: stars, taste: stars }, createdAt: n, updatedAt: n });
  const page = await open(t, { db: {
    'recipes/a': r('apple loaf', 1), 'recipes/z': Object.assign(r('Zopf', 2), { flag: 'CH' }), 'recipes/m': Object.assign(r('Mantou', 3), { flag: 'CN' }),
    'breads/1': b('Mantou', 'm', 1, '2026-11-10', 3), 'breads/2': b('Mantou', 'm', 2, '2026-11-12', 2),
    'breads/3': b('Zopf', 'z', 3, '2026-11-20', 5), 'breads/4': b('apple loaf', 'a', 4, '2026-11-15', 0)
  } });
  const names = () => page.locator('.gal .tile .meta b').evaluateAll((els) => els.map((el) => {
    const c = el.cloneNode(true); c.querySelectorAll('.fl').forEach((f) => f.remove()); return c.textContent.trim();
  }));
  const sortBy = async (v) => { await field(page, 'Filter by').selectOption(v); };

  assert.equal(await page.locator('.sortby span').innerText(), 'Most recent');
  assert.deepEqual(await names(), ['Zopf', 'apple loaf', 'Mantou', 'Mantou']);
  await sortBy('baked');
  assert.equal(await page.locator('.sortby span').innerText(), 'Most baked');
  assert.deepEqual(await names(), ['Mantou', 'Mantou', 'Zopf', 'apple loaf']);
  await sortBy('rating');
  assert.deepEqual(await names(), ['Zopf', 'Mantou', 'Mantou', 'apple loaf'], 'unrated last');
  await sortBy('az');
  assert.deepEqual(await names(), ['apple loaf', 'Mantou', 'Mantou', 'Zopf'], 'capitals do not matter');

  await page.getByRole('tab', { name: 'Recipes' }).click();
  assert.deepEqual(await names(), ['apple loaf', 'Mantou', 'Zopf']);
  await sortBy('baked');
  assert.deepEqual(await names(), ['Mantou', 'Zopf', 'apple loaf']);
  await sortBy('rating');
  assert.deepEqual(await names(), ['Zopf', 'Mantou', 'apple loaf']);

  await sortBy('country');
  assert.deepEqual(await names(), ['Mantou', 'Zopf', 'apple loaf'], 'China, Switzerland, then no flag');
  await page.getByRole('tab', { name: 'All' }).click();
  assert.deepEqual(await names(), ['Mantou', 'Mantou', 'Zopf', 'apple loaf']);
  await page.getByRole('tab', { name: 'Recipes' }).click();
  await sortBy('rating');

  await page.reload();
  assert.equal(await page.locator('.sortby span').innerText(), 'Rating', 'the choice is remembered');
  assert.deepEqual(await names(), ['Zopf', 'Mantou', 'apple loaf']);
});

test('ties in Most baked and Rating go to the better rated, the more baked, then the most recent with a photo', async (t) => {
  const r = (name, n) => ({ name, ingredients: [{ group: 'flour', type: 'AP', amount: '500', unit: 'g' }], bake: { programs: [1], size: '1.5', minutes: 205 },
    method: '', source: '', link: '', parent: '', originals: [], basedOn: null, createdAt: n, updatedAt: n });
  const b = (name, rid, n, date, stars, photo = true) => ({ name, date, recipeId: rid, photos: photo ? [{ full: 'seed' + n, thumb: 'seed' + n }] : [], comments: '',
    notes: { crust: '', crumb: '', taste: '' }, ratings: { crust: stars, crumb: stars, taste: stars }, createdAt: n, updatedAt: n });
  const db = {};
  'abcdefg'.split('').forEach((k, i) => { db['recipes/' + k] = r(k.toUpperCase(), i + 1); });
  Object.assign(db, {
    'breads/1': b('A1', 'a', 1, '2026-11-02', 4), 'breads/2': b('A2', 'a', 2, '2026-11-03', 3),
    'breads/3': b('B1', 'b', 3, '2026-11-04', 5), 'breads/4': b('B2', 'b', 4, '2026-11-05', 0),
    'breads/5': b('C', 'c', 5, '2026-11-20', 4), 'breads/6': b('D', 'd', 6, '2026-11-22', 4),
    'breads/7': b('E', 'e', 7, '2026-11-25', 4, false),
    'breads/8': b('F', 'f', 8, '2026-11-01', 0), 'breads/9': b('G', 'g', 9, '2026-11-30', 0, false)
  });
  const page = await open(t, { db });
  const names = () => page.locator('.gal .tile .meta b').allInnerTexts();
  const sortBy = (v) => field(page, 'Filter by').selectOption(v);
  await count(page.locator('.gal .tile'), 9);
  await sortBy('baked');
  assert.deepEqual(await names(), ['B1', 'A1', 'A2', 'B2', 'D', 'C', 'E', 'F', 'G']);
  await sortBy('rating');
  assert.deepEqual(await names(), ['B1', 'A1', 'D', 'C', 'E', 'A2', 'B2', 'F', 'G']);
  await page.getByRole('tab', { name: 'Recipes' }).click();
  assert.deepEqual(await names(), ['B', 'A', 'D', 'C', 'E', 'F', 'G']);
  await sortBy('baked');
  assert.deepEqual(await names(), ['B', 'A', 'D', 'C', 'E', 'F', 'G']);
});

test('a second proof is added with +', async (t) => {
  const page = await open(t);
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('Overnight rolls');
  await line(page, 'Flour').getByLabel('Amount').fill('500');
  await program(page, 8, 'Dough').click();
  assert.equal(await field(page, 'Hours').inputValue() + ':' + await field(page, 'Minutes').inputValue(), '0:25', 'kneading');
  assert.equal(await field(page, 'Proof hours').inputValue() + ':' + await field(page, 'Proof minutes').inputValue(), '1:5', 'the rise in the machine');
  // proofed in the fridge instead
  await page.locator('.field', { has: page.locator('> .label', { hasText: /^Proofing$/ }) }).getByRole('button', { name: 'Fridge' }).click();
  await page.locator('.field', { has: page.locator('> .label', { hasText: /^Proofing$/ }) }).getByRole('button', { name: 'Bread machine' }).click();
  assert.equal(await field(page, 'Hours').inputValue() + ':' + await field(page, 'Minutes').inputValue(), '0:25');
  assert.equal(await field(page, 'Proof minutes').inputValue(), '');
  await field(page, 'Proof hours').fill('10');

  await page.getByRole('button', { name: 'Add proof' }).click();
  assert.equal(await field(page, 'Proof 2 minutes').inputValue(), '5');
  await page.locator('.field', { has: page.locator('> .label', { hasText: /^2nd proof$/ }) }).getByRole('button', { name: 'Bread machine' }).click();
  await page.locator('.field', { has: page.locator('> .label', { hasText: /^2nd proof$/ }) }).getByRole('button', { name: 'Air fryer' }).click();
  await field(page, 'Proof 2 hours').fill('0');
  await field(page, 'Proof 2 minutes').fill('45');
  await page.getByRole('button', { name: 'Add proof' }).click();
  await page.getByRole('button', { name: 'Remove 3rd proof' }).click();
  await count(page.locator('.field > .label', { hasText: /^3rd proof$/ }), 0);
  await save(page);
  await formGone(page);
  await page.locator('.gal .tile').click();
  const card = await page.locator('.bake').innerText();
  assert.match(card, /PROOFING\s+Fridge\s+10 h/i);
  assert.match(card, /2ND PROOF\s+Air fryer\s+45 min/i);
});

test('typing part of a name offers the saved recipe', async (t) => {
  const page = await open(t);
  await logBread(page);
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('mil');
  await page.locator('.suggest').getByRole('button', { name: 'Milk bread' }).click();
  assert.equal(await field(page, 'Name').inputValue(), 'Milk bread');
  assert.equal(await line(page, 'Flour').getByLabel('Amount').inputValue(), '400');
  assert.equal(await page.locator('.suggest', { hasText: 'Milk bread' }).count(), 0);
  await snap(page);
  await save(page);
  await formGone(page);
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await count(page.locator('.rc'), 1);
  assert.match(await page.locator('.rc').innerText(), /Baked 2×/);
});

test('ingredients added once are offered next time', async (t) => {
  const page = await open(t);
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'Name').fill('Honey loaf');
  await line(page, 'Flour').getByLabel('Amount').fill('3');
  await line(page, 'Yeast').getByLabel('Amount').fill('1/2');
  await line(page, 'Yeast').getByLabel('Unit').selectOption('tbsp');
  await chip(page, 'Other').click();
  await line(page, 'Other').getByLabel('Ingredient').fill('Eggs');
  await chip(page, 'Other').click();
  await line(page, 'Other').getByLabel('Ingredient').nth(1).fill('Canola oil');
  await line(page, 'Other').getByLabel('Amount').nth(1).fill('2');
  await line(page, 'Other').getByLabel('Unit').nth(1).selectOption('tsp');
  await chip(page, 'Other').click();
  await line(page, 'Other').getByLabel('Ingredient').nth(2).fill('Honey');
  await line(page, 'Other').getByLabel('Amount').nth(2).fill('2');
  await save(page);
  await formGone(page);

  // honey went under Sugar, canola oil is just Oil; what was named before is one tap away
  await page.locator('.gal .tile').click();
  assert.match(await page.locator('.ings').innerText(), /Honey\s+2 g[\s\S]*Eggs\s+1[\s\S]*Oil\s+2 tsp/);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Add bread' }).click();
  assert.deepEqual(await page.locator('.addrow button').allInnerTexts(), ['Flour', 'Dairy', 'Sugar', 'Eggs', 'Oil', 'Other']);
  assert.equal(await line(page, 'Yeast').getByLabel('Unit').inputValue(), 'g', 'units always start in grams');
  await chip(page, 'Eggs').click();
  assert.equal(await line(page, 'Other').getByLabel('Amount').inputValue(), '1');
  assert.equal(await line(page, 'Other').getByLabel('Unit').inputValue(), '');
  await chip(page, 'Oil').click();
  assert.equal(await line(page, 'Other').getByLabel('Unit').nth(1).inputValue(), 'g');
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
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await count(page.locator('.rc'), 0);
  await page.getByRole('tab', { name: /To try/ }).click();
  await count(page.locator('.rc'), 0);

  // adding details later gives it a card
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await page.locator('.gal .tile').click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await line(page, 'Flour').getByLabel('Amount').fill('3');
  await save(page);
  await page.getByRole('heading', { name: 'Edit bread' }).waitFor({ state: 'detached' });
  await count(page.locator('.rcard'), 1);
});

test('Bake again from a bread keeps it on the same variation', async (t) => {
  const page = await open(t);
  await logBread(page);
  await page.locator('.gal .tile').click();
  await page.getByRole('button', { name: 'Bake again' }).click();
  assert.equal(await field(page, 'Name').inputValue(), 'Milk bread');
  assert.equal(await line(page, 'Water').getByLabel('Amount').inputValue(), '300');
  assert.equal(await field(page, 'Added minutes').inputValue(), '5');
  await snap(page);
  await save(page);
  await page.getByRole('heading', { name: 'New bread' }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await count(page.locator('.rc'), 1);
  assert.match(await page.locator('.rc').innerText(), /Baked 2×/);
  assert.doesNotMatch(await page.locator('.rc').innerText(), /tweaks/);
});

test('a recipe to try moves to Baked once it is baked', async (t) => {
  const page = await open(t);
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
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
  await snap(page);
  await save(page);
  await formGone(page);
  await count(page.locator('.rc'), 0);
  await page.getByRole('tab', { name: /Baked/ }).click();
  assert.match(await page.locator('.rc').innerText(), /Cinnamon raisin[\s\S]*Baked 1×/);
});

test('reads a recipe from a photo; both sizes are saved as variations of one recipe', async (t) => {
  const page = await open(t);
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
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

test('From photo on New bread saves a recipe to try, not a bread; Use recipe fills a bread', async (t) => {
  const page = await open(t);
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'From photo').setInputFiles(await picture(page, '#eee', 900, 1200));
  await page.getByRole('heading', { name: 'Check recipe' }).waitFor();
  const check = page.locator('.screen').last();
  assert.equal(await check.getByLabel('Name', { exact: true }).inputValue(), 'Everyday white loaf');
  assert.equal(await check.locator('.grow').first().getByLabel('Amount').inputValue(), '2 7/8', 'flour');
  await save(page);
  await page.locator('.screen').first().waitFor({ state: 'detached' });    // both forms close
  await count(page.locator('.screen'), 0);
  await count(page.locator('.gal .tile'), 0, 'no bread entry');
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await page.getByRole('tab', { name: /To try/ }).click();
  await count(page.locator('.rc'), 1);
  assert.match(await page.locator('.rc').innerText(), /Everyday white loaf/);

  // cancelling the check goes back to the bread form
  await page.getByRole('button', { name: 'Add bread' }).click();
  await field(page, 'From photo').setInputFiles(await picture(page, '#eee', 900, 1200));
  await page.getByRole('heading', { name: 'Check recipe' }).waitFor();
  await page.locator('.screen').last().getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Discard' }).click();
  await page.getByRole('heading', { name: 'Check recipe' }).waitFor({ state: 'detached' });
  await page.getByRole('heading', { name: 'New bread' }).waitFor();

  // baking it: Use recipe fills the bread form, and the bread is saved
  await page.getByRole('button', { name: 'Use recipe' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Everyday white loaf/ }).click();
  assert.equal(await field(page, 'Name').inputValue(), 'Everyday white loaf');
  assert.equal(await line(page, 'Flour').getByLabel('Amount').inputValue(), '2 7/8');
  await save(page);
  await formGone(page);
  await count(page.locator('.rc'), 0, 'baked now, so no longer to try');
  await page.getByRole('tab', { name: /Baked/ }).click();
  assert.match(await page.locator('.rc').innerText(), /Baked 1×/);
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await count(page.locator('.gal .tile'), 1);
});

test('edits and deletes a bread; its recipe goes back to To try', async (t) => {
  const page = await open(t);
  await logBread(page);
  await page.locator('.gal .tile').click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  assert.equal(await program(page, 12, 'Bake').getAttribute('aria-pressed'), 'true');
  assert.equal(await field(page, 'Reason').inputValue(), 'crust browning');
  await field(page, 'Name').fill('Milk bread, first try');
  await save(page);
  await page.getByRole('heading', { name: 'Edit bread' }).waitFor({ state: 'detached' });
  assert.match(await page.locator('.screen h2').first().innerText(), /Milk bread, first try/);
  assert.equal(await page.locator('.rhead h3').innerText(), 'Milk bread', 'the bread has a name of its own');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await page.locator('.screen').waitFor({ state: 'detached' });
  await count(page.locator('.gal .tile'), 0);

  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
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

test('renaming a recipe renames every tweak and the breads baked from it', async (t) => {
  const page = await open(t);
  await logBread(page);
  await page.locator('.gal .tile').click();
  await page.getByRole('button', { name: 'Bake again' }).click();
  await line(page, 'Water').getByLabel('Amount').fill('320');
  await save(page);
  await page.getByRole('heading', { name: 'New bread' }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Back' }).click();

  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await page.locator('.rc .open').click();
  await page.getByRole('button', { name: 'Edit II', exact: true }).click();
  await field(page, 'Name').fill('Soft milk loaf');
  await save(page);
  await page.getByRole('heading', { name: 'Edit recipe' }).waitFor({ state: 'detached' });
  assert.equal(await page.locator('.screen h2').first().innerText(), 'Soft milk loaf');
  await count(page.locator('.variation'), 2);
  await page.getByRole('button', { name: 'Back' }).click();
  await count(page.locator('.rc'), 1);
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  assert.deepEqual(await page.locator('.gal .tile .meta b').allInnerTexts(), ['Soft milk loaf II', 'Soft milk loaf']);
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
  assert.equal(await field(page, 'Name').inputValue(), 'Country dough II');
  await save(page);
  await page.getByRole('heading', { name: 'Split bread' }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Back' }).click();

  const tiles = page.locator('.gal .tile');
  await count(tiles, 2);
  await count(page.locator('.gal .tile .flag'), 1);          // the other half is still dough
  assert.deepEqual(await tiles.locator('.meta').allInnerTexts(), ['Country dough II\nNov 20', 'Country dough\nNov 20']);
  await loaded(tiles.nth(0).locator('img'));
  await loaded(tiles.nth(1).locator('img'));

  // one recipe, two ways of baking it
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await count(page.locator('.rc'), 1);
  assert.match(await page.locator('.rc').innerText(), /Country dough[\s\S]*Baked 2×/);
  await page.locator('.rc .open').click();
  assert.deepEqual(await page.locator('.vhead .label').allInnerTexts(), ['I', 'II']);
  await page.getByRole('button', { name: 'Back' }).click();

  // the halves share the photo they started with: deleting one must not take it from the other
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
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
  name, date, recipeId, photo: { full: 'seed' + n, thumb: 'seed' + n }, comments: '', notes: { crust: '', crumb: '', taste: '' },
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

  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await count(page.locator('.rc'), 1);
  assert.match(await page.locator('.rc').innerText(), /country loaf[\s\S]*Baked 3×/);
  await page.locator('.rc .open').click();
  assert.deepEqual(await page.locator('.vhead .label').allInnerTexts(), ['I', 'II', 'III'], 'one recipe per name, numbered in the order made');
  const first = page.locator('.variation').first();
  const text = await first.innerText();
  for (const want of ['2 · French', '12 · Bake', '4 h 15 min', '+10 min', 'Too pale']) assert.ok(text.includes(want), want + '\n' + text);
  assert.doesNotMatch(await page.locator('.variation').last().innerText(), /Too pale/, 'a reason with no added time is not shown');

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
  await page.locator('.variation').last().locator('.made .tile').click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  assert.equal(await field(page, 'Added minutes').count(), 0);
  await program(page, 12, 'Bake').click();
  await field(page, 'Added minutes').fill('40');
  await save(page);
  await page.getByRole('heading', { name: 'Edit bread' }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Back' }).last().click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await count(page.locator('.gal .tile .flag'), 2);

  // what was used before is offered in a new bread
  await page.getByRole('button', { name: 'Add bread' }).click();
  assert.equal(await line(page, 'Yeast').getByLabel('Unit').inputValue(), 'g');
  assert.equal(await line(page, 'Salt').getByLabel('Unit').inputValue(), 'g');
});

test('keeps what was saved after a reload', async (t) => {
  const page = await open(t);
  await logBread(page);
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
      const ours = (el) => !el.closest('.tile, .rc .open, .rc .body, .opt, .suggest, .ings, .src, .method, .comments, .notes, .tname, #f-parent, #f-flag, #f-sort');
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
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  await audit('stats');
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await page.locator('.gal .tile').first().click();
  await audit('bread page');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
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
