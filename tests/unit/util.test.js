const test = require('node:test');
const assert = require('node:assert/strict');
require('../../data/machine.js');
require('../../js/util.js');
const U = globalThis.LGT.util;

test('times read the way a baker says them', () => {
  assert.equal(U.fmtMinutes(205), '3 h 25 min');
  assert.equal(U.fmtMinutes(180), '3 h');
  assert.equal(U.fmtMinutes(50), '50 min');
  assert.equal(U.fmtMinutes(null), '');
  assert.deepEqual(U.splitMinutes(205), { h: '3', m: '25' });
  assert.equal(U.joinMinutes('3', '25'), 205);
  assert.equal(U.joinMinutes('', '45'), 45);
  assert.equal(U.joinMinutes('', ''), null);
});

test('amounts show as fractions and parse to numbers', () => {
  assert.equal(U.prettyAmount('1/2'), '½');
  assert.equal(U.prettyAmount('2 7/8'), '2⅞');
  assert.equal(U.prettyAmount('1 1/4'), '1¼');
  assert.equal(U.prettyAmount('400'), '400');
  assert.equal(U.prettyAmount('1 tbsp + 1/2 tsp'), '1 tbsp + ½ tsp');
  assert.equal(U.prettyAmount('1 1/2 tbsp + 1/2 tsp'), '1½ tbsp + ½ tsp');
  assert.equal(U.prettyAmount('5/9'), '5/9', 'a fraction with no glyph is left alone');
  assert.equal(U.parseAmount('2 7/8'), 2.875);
  assert.equal(U.parseAmount('2⅞'), 2.875);
  assert.equal(U.parseAmount('½'), 0.5);
  assert.equal(U.parseAmount('1.5'), 1.5);
  assert.equal(U.parseAmount('1 tbsp + 1 tsp'), null);
  assert.equal(U.parseAmount(''), null);
});

test('ingredients are labelled for the recipe card', () => {
  assert.equal(U.ingredientName({ group: 'flour', type: 'Bread' }), 'Bread flour');
  assert.equal(U.ingredientName({ group: 'flour', type: 'Rye flour' }), 'Rye flour');
  assert.equal(U.ingredientName({ group: 'water', type: '' }), 'Water');
  assert.equal(U.ingredientName({ group: 'dairy', type: 'Butter' }), 'Butter');
  assert.equal(U.ingredientName({ group: 'other', type: 'Honey' }), 'Honey');
  assert.equal(U.ingredientDetail({ group: 'yeast', type: 'SAF instant', note: 'or 2 1/4 tsp bread machine yeast' }),
    'SAF instant, or 2 1/4 tsp bread machine yeast');
  assert.equal(U.amountLabel({ amount: '2 7/8', unit: 'cup' }), '2⅞ cups');
  assert.equal(U.amountLabel({ amount: '1/2', unit: 'cup' }), '½ cup');
  assert.equal(U.amountLabel({ amount: '1', unit: 'cup' }), '1 cup');
  assert.equal(U.amountLabel({ amount: '1', unit: '' }), '1');
  assert.equal(U.amountLabel({ amount: '1 tbsp + 1 tsp', unit: '' }), '1 tbsp + 1 tsp');
});

test('a stored recipe is trimmed, ordered and free of blank rows', () => {
  const r = U.cleanRecipe({
    name: '  Milk bread ',
    ingredients: [
      { group: 'other', type: 'Salt', amount: '1', unit: 'tsp', _k: 'k9', unsure: true },
      { group: 'dairy', type: 'Milk', amount: '', unit: 'cup' },
      { group: 'flour', type: 'Bread', amount: ' 3 ', unit: 'cup' },
      { group: 'other', type: 'Melted butter', amount: '', unit: '' },
      { group: 'nonsense', type: 'Seeds', amount: '2', unit: 'handfuls' }
    ],
    bake: { program: '1', size: '1.5', minutes: '205', added: '' },
    link: 'example.com/recipe'
  });
  assert.equal(r.name, 'Milk bread');
  assert.deepEqual(r.ingredients, [
    { group: 'flour', type: 'Bread', amount: '3', unit: 'cup', note: '' },
    { group: 'other', type: 'Salt', amount: '1', unit: 'tsp', note: '' },
    { group: 'other', type: 'Melted butter', amount: '', unit: '', note: '' },
    { group: 'other', type: 'Seeds', amount: '2', unit: '', note: '' }
  ]);
  assert.deepEqual(r.bake, { program: 1, size: '1.5', crust: '', minutes: 205, added: null, reason: '', ovenTemp: null, ovenMinutes: null });
  assert.equal(r.link, 'https://example.com/recipe');
});

test('links are only ever https', () => {
  assert.equal(U.safeLink('https://a.example/x'), 'https://a.example/x');
  assert.equal(U.safeLink('http://a.example/x'), 'https://a.example/x');
  assert.equal(U.safeLink('a.example/x'), 'https://a.example/x');
  assert.equal(U.safeLink('javascript:alert(1)'), '');
  assert.equal(U.safeLink('my notebook'), '');
  assert.equal(U.safeLink(''), '');
});

test('where a bread\'s recipe is saved', () => {
  const base = Object.assign(U.cleanRecipe({
    name: 'Milk bread',
    ingredients: [{ group: 'flour', type: 'Bread', amount: '3', unit: 'cup' }, { group: 'water', amount: '1', unit: 'cup' }],
    bake: { program: 1, size: '1.5', minutes: 205 }, source: 'Booklet'
  }), { id: 'r1' });
  const same = JSON.parse(JSON.stringify(base));
  const moreWater = JSON.parse(JSON.stringify(base));
  moreWater.ingredients[1].amount = '1 1/4';
  const newSource = Object.assign(JSON.parse(JSON.stringify(base)), { source: 'Booklet, p. 14' });

  assert.deepEqual(U.planRecipeSave(null, same, 0), { action: 'create', basedOn: null }, 'no recipe yet: make one');
  assert.deepEqual(U.planRecipeSave(base, same, 3), { action: 'keep', id: 'r1' }, 'unchanged: the bread joins the card');
  assert.deepEqual(U.planRecipeSave(base, moreWater, 1), { action: 'create', basedOn: 'r1' }, 'changed and shared: a new card');
  assert.deepEqual(U.planRecipeSave(base, moreWater, 0), { action: 'update', id: 'r1' }, 'changed and not shared: edit in place');
  assert.deepEqual(U.planRecipeSave(base, newSource, 3), { action: 'update', id: 'r1' }, 'only the source changed: same card');
});

test('a recipe with nothing entered is recognised as empty', () => {
  assert.equal(U.isEmptyRecipe(U.emptyRecipe()), true, 'the blank form');
  assert.equal(U.isEmptyRecipe({ name: 'Only a name' }), true);
  const withFlour = U.emptyRecipe(); withFlour.ingredients[0].amount = '3';
  assert.equal(U.isEmptyRecipe(withFlour), false);
  assert.equal(U.isEmptyRecipe({ bake: { program: 1 } }), false);
  assert.equal(U.isEmptyRecipe({ source: 'Mom' }), false);
});

test('ratings average only what was rated', () => {
  assert.equal(U.rating({ ratings: { crust: 4, crumb: 5, taste: 5 } }).toFixed(1), '4.7');
  assert.equal(U.rating({ ratings: { crust: 4, crumb: 0, taste: 0 } }), 4);
  assert.equal(U.rating({ ratings: { crust: 0, crumb: 0, taste: 0 } }), null);
  assert.equal(U.rating({}), null);
});

test('the machine data is complete and consistent', () => {
  const m = globalThis.LGT.machine;
  assert.deepEqual(m.programs.map((p) => p.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  for (const p of m.programs) {
    assert.ok(p.name, 'program ' + p.n + ' has a name');
    assert.ok(p.minutes || p.total, 'program ' + p.n + ' has a time');
    for (const size of Object.keys(p.minutes || {})) assert.ok(m.sizes.some((s) => s.id === size));
  }
  // spot checks against the manual's Programs & Timing tables
  assert.equal(U.programMinutes(1, '1.5'), 3 * 60 + 25);
  assert.equal(U.programMinutes(2, '2'), 4 * 60 + 20);
  assert.equal(U.programMinutes(3, '1'), 3 * 60 + 57);
  assert.equal(U.programMinutes(4, '1.5'), 2 * 60 + 3);
  assert.equal(U.programMinutes(4, '2'), null, 'Ultra-Fast has no 2 lb loaf');
  assert.equal(U.programMinutes(6, '1.5'), 2 * 60 + 15);
  assert.equal(U.programMinutes(8), 90);
  assert.equal(U.programMinutes(12), 100);
  assert.deepEqual(U.sizesFor(6).map((s) => s.id), ['1.5']);
  assert.deepEqual(U.sizesFor(8), []);
  assert.equal(U.sizesFor(null).length, 3, 'any size until a program is chosen');
  assert.equal(U.hasCrust(1), true);
  assert.equal(U.hasCrust(2), false);
});

test('baking details stay consistent with the program', () => {
  const start = U.cleanBake({});
  const white = U.withBake(start, { program: 1 });
  assert.equal(white.minutes, null, 'no time until a loaf size is chosen');
  const sized = U.withBake(white, { size: '1.5' });
  assert.equal(sized.minutes, 205);
  assert.equal(U.withBake(sized, { size: '2' }).minutes, 210);

  const custom = U.withBake(sized, { minutes: 190 });
  assert.equal(U.withBake(custom, { size: '2' }).minutes, 190, 'a time she typed is not overwritten');

  const gf = U.withBake(U.withBake(sized, { crust: 'dark' }), { program: 6 });
  assert.deepEqual([gf.size, gf.crust, gf.minutes], ['1.5', 'dark', 135], 'the only size is picked for her');
  const dough = U.withBake(gf, { program: 8 });
  assert.deepEqual([dough.size, dough.crust, dough.minutes], ['', '', 90]);
  const french = U.withBake(U.withBake(sized, { crust: 'dark' }), { program: 2 });
  assert.equal(french.crust, '', 'French has no crust colour');
  const none = U.withBake(sized, { program: null });
  assert.deepEqual([none.size, none.minutes], ['1.5', null]);
});
