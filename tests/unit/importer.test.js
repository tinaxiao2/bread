const test = require('node:test');
const assert = require('node:assert/strict');
require('../../data/machine.js');
require('../../js/util.js');
require('../../js/platform.js');
require('../../js/importer.js');
const { importer, machine, util: U } = globalThis.LGT;

const READING = {
  name: ' Everyday white loaf ',
  variants: [
    { label: '1½-pound loaf', size: '1.5', ingredients: [
      { group: 'water', type: '', amount: '½', unit: 'cup', note: '', unsure: true },
      { group: 'flour', type: 'Bread', amount: '2⅞', unit: 'cups', note: '' },
      { group: 'other', type: 'Gluten', amount: '1', unit: 'Tablespoon', note: '' },
      { group: 'other', type: 'Egg', amount: '1', unit: '', note: '' },
      { group: 'other', type: 'Butter', amount: '1', unit: 'stick', note: 'softened' },
      { group: 'yeast', type: 'Instant', amount: '1 3/4', unit: 'tsp', note: 'or 2 1/4 tsp active dry yeast' },
      { group: 'mystery', type: '', amount: '', unit: '' }
    ] },
    { label: '2-pound loaf', size: '2', ingredients: [{ group: 'flour', type: 'Bread', amount: '3 3/4', unit: 'cup' }] },
    { label: 'empty', size: '3', ingredients: [] }
  ],
  programs: [1], crust: 'Medium', ovenTemp: null, ovenMinutes: null,
  method: '  Step one.  \n\n Step   two. ', source: ' Sample Cookbook, p. 12 '
};

test('a reading is tidied before it reaches the form', () => {
  const r = importer.normalize(READING, machine);
  assert.equal(r.name, 'Everyday white loaf');
  assert.equal(r.variants.length, 2, 'a list with no ingredients is dropped');
  assert.deepEqual(r.variants[0].ingredients, [
    { group: 'water', type: '', amount: '1/2', unit: 'cup', note: '', unsure: true },
    { group: 'flour', type: 'Bread', amount: '2 7/8', unit: 'cup', note: '', unsure: true },
    { group: 'other', type: 'Gluten', amount: '1', unit: 'tbsp', note: '', unsure: false },
    { group: 'other', type: 'Egg', amount: '1', unit: '', note: '', unsure: false },
    { group: 'other', type: 'Butter', amount: '1 stick', unit: '', note: 'softened', unsure: false },
    { group: 'yeast', type: 'Instant', amount: '1 3/4', unit: 'tsp', note: 'or 2 1/4 tsp active dry yeast', unsure: false }
  ]);
  assert.deepEqual(r.programs, [1]);
  assert.equal(r.crust, 'medium');
  assert.equal(r.method, 'Step one.\nStep two.');
  assert.equal(r.source, 'Sample Cookbook, p. 12');
});

test('programs come through as a list, in either shape', () => {
  const one = { variants: [{ ingredients: [{ group: 'flour', type: 'Bread', amount: '3', unit: 'cup' }] }] };
  assert.deepEqual(importer.normalize(Object.assign({ programs: [8, 12] }, one), machine).programs, [8, 12]);
  assert.deepEqual(importer.normalize(Object.assign({ program: 1 }, one), machine).programs, [1], 'a single program still works');
  assert.deepEqual(importer.normalize(Object.assign({ programs: [99, 'x'] }, one), machine).programs, []);
  assert.deepEqual(importer.normalize(one, machine).programs, []);
});

test('small-print fractions are marked for a second look', () => {
  const r = importer.normalize({ variants: [{ ingredients: [
    { group: 'water', amount: '2/3', unit: 'cup' }, { group: 'flour', type: 'Bread', amount: '2 7/8', unit: 'cup' },
    { group: 'dairy', type: 'Milk', amount: '1/2', unit: 'cup' }, { group: 'other', type: 'Salt', amount: '1 1/4', unit: 'tsp' }
  ] }] }, machine);
  assert.deepEqual(r.variants[0].ingredients.map((i) => i.unsure), [true, true, false, false]);
});

test('an answer with no recipe in it is refused', () => {
  for (const bad of [null, {}, { variants: [] }, { variants: [{ ingredients: [] }] }, 'text']) {
    assert.throws(() => importer.normalize(bad, machine), (e) => e.code === 'empty');
  }
});

test('nonsense in the answer cannot reach the form', () => {
  const r = importer.normalize({
    name: 42, variants: [{ size: '5', ingredients: [{ group: 'flour', type: 7, amount: 3, unit: 'CUPS.' }] }],
    programs: 'all of them', crust: 'burnt', ovenTemp: 'hot', method: null, source: undefined
  }, machine);
  assert.equal(r.name, '42');
  assert.deepEqual(r.variants[0], { label: '', size: '', ingredients: [{ group: 'flour', type: '7', amount: '3', unit: 'cup', note: '', unsure: false }] });
  assert.deepEqual([r.programs, r.crust, r.ovenTemp, r.method, r.source], [[], '', null, '', '']);
});

test('each size becomes its own draft, with the time from the machine', () => {
  const r = importer.normalize(READING, machine);
  const small = importer.toDraft(r, 0), large = importer.toDraft(r, 1);
  assert.deepEqual([small.bake.programs, small.bake.size, small.bake.crust, small.bake.minutes], [[1], '1.5', 'medium', 205]);
  assert.deepEqual([large.bake.size, large.bake.minutes], ['2', 210]);
  assert.equal(importer.variantLabel(r.variants[0]), '1½ lb');
  assert.equal(small.source, 'Sample Cookbook, p. 12');
  assert.equal(U.cleanRecipe(small).ingredients[0].group, 'flour', 'saved in the card\'s fixed order');
  assert.notEqual(U.recipeKey(small), U.recipeKey(large), 'two sizes are two variations of one recipe');
});

test('an oven-finished recipe keeps its oven step and has no crust colour', () => {
  const r = importer.normalize({
    name: 'Rolls', variants: [{ ingredients: [{ group: 'flour', type: 'Bread', amount: '3 1/4', unit: 'cup' }] }],
    programs: [8], crust: 'medium', ovenTemp: 375, ovenMinutes: 10
  }, machine);
  const d = importer.toDraft(r, 0);
  assert.deepEqual([d.bake.programs, d.bake.size, d.bake.crust, d.bake.minutes, d.bake.ovenTemp, d.bake.ovenMinutes], [[8], '', '', 90, 375, 10]);
  assert.equal(U.isBaked(d.bake), true);
});

test('the request names the machine\'s programs and asks for exact amounts', () => {
  const p = importer.prompt(machine, true);
  assert.match(p, /"programs": number\[\]/);
  assert.match(p, /1 White \(also called Basic\)/);
  assert.match(p, /12 Bake/);
  assert.match(p, /enlarged parts/);
  assert.match(p, /copy amounts exactly/i);
  assert.doesNotMatch(importer.prompt(machine, false), /enlarged parts/);
});

test('large images are sent with enlarged parts, small ones as they are', () => {
  const img = (w, h) => ({ naturalWidth: w, naturalHeight: h });
  assert.equal(importer.tiles(img(640, 816), 4).length, 0, 'already small');
  assert.equal(importer.tiles(img(1170, 2532), 4).length, 2, 'a phone screenshot: top and bottom');
  assert.equal(importer.tiles(img(3024, 4032), 4).length, 4, 'a camera photo: four quarters');
  assert.equal(importer.tiles(img(3024, 4032), 2).length, 2, 'fewer when the reader takes fewer images');
  assert.equal(importer.tiles(img(3024, 4032), 0).length, 0);
  for (const t of importer.tiles(img(3024, 4032), 4)) {
    assert.ok(t.x >= 0 && t.y >= 0 && t.x + t.w <= 3024 + 1e-6 && t.y + t.h <= 4032 + 1e-6, 'parts stay inside the image');
  }
});
