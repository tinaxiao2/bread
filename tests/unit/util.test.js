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
  assert.equal(U.prettyAmount('3.25'), '3.25');
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
  assert.equal(U.ingredientDetail({ group: 'yeast', type: 'Instant', note: 'or 2 1/4 tsp active dry yeast' }),
    'Instant, or 2 1/4 tsp active dry yeast');
  assert.equal(U.amountLabel({ amount: '2 7/8', unit: 'cup' }), '2⅞ cups');
  assert.equal(U.amountLabel({ amount: '1/2', unit: 'cup' }), '½ cup');
  assert.equal(U.amountLabel({ amount: '1.5', unit: 'cup' }), '1.5 cups');
  assert.equal(U.amountLabel({ amount: '1', unit: '' }), '1');
  assert.equal(U.amountLabel({ amount: '1 tbsp + 1 tsp', unit: '' }), '1 tbsp + 1 tsp');
});

test('a blank recipe starts with flour, water, yeast and salt, all in grams', () => {
  const rows = U.emptyRecipe().ingredients.map((i) => [i.group, i.type, i.unit]);
  assert.deepEqual(rows, [['flour', 'AP', 'g'], ['water', '', 'g'], ['yeast', 'Active dry', 'g'], ['salt', '', 'g']]);
  assert.deepEqual(U.STAPLES, ['Sugar']);
  assert.equal(U.newIngredient('other', 'Sugar').unit, 'g');
  assert.equal(U.newIngredient('dairy').type, 'Milk');
  assert.equal(U.newIngredient('dairy').unit, 'g');
  assert.deepEqual(U.DEFAULT_TYPES.water, ['Lukewarm', 'Warm', 'Hot']);
  assert.equal(U.UNITS[0], 'g');
});

test('water can be lukewarm, warm or hot', () => {
  assert.equal(U.ingredientName({ group: 'water', type: '' }), 'Water');
  assert.equal(U.ingredientName({ group: 'water', type: 'Lukewarm' }), 'Lukewarm water');
  assert.equal(U.ingredientName({ group: 'water', type: 'Hot water' }), 'Hot water');
  const ing = (type) => ({ ingredients: [{ group: 'water', type, amount: '300', unit: 'g' }] });
  assert.notEqual(U.recipeKey(ing('Warm')), U.recipeKey(ing('Hot')), 'a different temperature is a different tweak');
});

test('salt has its own row, and salt saved as an "other" ingredient moves into it', () => {
  assert.equal(U.ingredientName({ group: 'salt' }), 'Salt');
  assert.deepEqual(U.cleanIngredient({ group: 'other', type: ' salt ', amount: '1/2', unit: 'tbsp' }),
    { group: 'salt', type: '', amount: '1/2', unit: 'tbsp', note: '' });
  assert.deepEqual(U.cleanIngredient({ group: 'other', type: 'Sea salt flakes', amount: '1', unit: 'tsp' }).group, 'other');
  const old = { ingredients: [{ group: 'other', type: 'Salt', amount: '8', unit: 'g' }] };
  const now = { ingredients: [{ group: 'salt', type: '', amount: '8', unit: 'g' }] };
  assert.equal(U.recipeKey(old), U.recipeKey(now), 'old entries still match the same tweak');
});

test('a stored recipe is trimmed, ordered and free of blank rows', () => {
  const r = U.cleanRecipe({
    name: '  Milk bread ',
    ingredients: [
      { group: 'other', type: 'Salt', amount: '1', unit: 'tsp', _k: 'k9', unsure: true },
      { group: 'dairy', type: 'Milk', amount: '', unit: 'cup' },
      { group: 'flour', type: 'Bread', amount: ' 3 ', unit: 'cup' },
      { group: 'other', type: 'Melted butter', amount: '', unit: '' },
      { group: 'other', type: 'Sugar', amount: '', unit: 'g', _auto: true },
      { group: 'nonsense', type: 'Seeds', amount: '2', unit: 'handfuls' }
    ],
    bake: { programs: ['1'], size: '1.5', minutes: '205', added: '' },
    link: 'example.com/recipe', parent: '  french bread '
  });
  assert.equal(r.name, 'Milk bread');
  assert.deepEqual(r.ingredients, [
    { group: 'flour', type: 'Bread', amount: '3', unit: 'cup', note: '' },
    { group: 'salt', type: '', amount: '1', unit: 'tsp', note: '' },
    { group: 'other', type: 'Melted butter', amount: '', unit: '', note: '' },
    { group: 'other', type: 'Seeds', amount: '2', unit: '', note: '' }
  ], 'a row that was only offered (Sugar) and never given an amount is dropped; one she named is kept');
  assert.deepEqual(r.bake, { programs: [1], size: '1.5', crust: '', minutes: 205, added: null, reason: '', proof: ['machine'], proofMinutes: null, ovenTemp: null, ovenMinutes: null });
  assert.equal(r.link, 'https://example.com/recipe');
  assert.equal(r.parent, 'french bread');
});

test('a parent is part of a recipe but not of a tweak', () => {
  const base = { ingredients: [{ group: 'flour', type: 'AP', amount: '400', unit: 'g' }] };
  assert.equal(U.recipeKey(Object.assign({ parent: 'french bread' }, base)), U.recipeKey(base));
  assert.equal(U.isEmptyRecipe({ parent: 'french bread' }), false, 'attaching alone is worth keeping');
  const v1 = Object.assign({ id: 'v1', name: 'herb loaf' }, U.cleanRecipe(base));
  assert.deepEqual(U.planRecipeSave({ draft: Object.assign({ parent: 'french bread' }, base), family: [v1], base: v1, others: 0 }),
    { action: 'update', id: 'v1' }, 'attaching from a form filled from that recipe saves it');
});

test('links are only ever https', () => {
  assert.equal(U.safeLink('https://a.example/x'), 'https://a.example/x');
  assert.equal(U.safeLink('http://a.example/x'), 'https://a.example/x');
  assert.equal(U.safeLink('a.example/x'), 'https://a.example/x');
  assert.equal(U.safeLink('javascript:alert(1)'), '');
  assert.equal(U.safeLink('my notebook'), '');
  assert.equal(U.safeLink(''), '');
});

test('entries saved before programs could be combined still read correctly', () => {
  // one program, with time added by hand: that was the Bake program
  assert.deepEqual(U.cleanBake({ program: 2, size: '1.5', minutes: 255, added: 10, reason: 'too light' }),
    { programs: [2, 12], size: '1.5', crust: '', minutes: 255, added: 10, reason: 'too light', proof: ['machine'], proofMinutes: null, ovenTemp: null, ovenMinutes: null });
  // a reason left behind with no added time is dropped
  assert.deepEqual(U.cleanBake({ program: 8, minutes: 90, added: null, reason: 'too light' }),
    { programs: [8], size: '', crust: '', minutes: 90, added: null, reason: '', proof: ['machine'], proofMinutes: null, ovenTemp: null, ovenMinutes: null });
  assert.deepEqual(U.cleanBake({ program: null }).programs, []);
  assert.deepEqual(U.cleanBake({ programs: [1, 1, 99, '12'] }).programs, [1, 12], 'duplicates and unknown programs go');
  // the same bake reads the same whichever way it was stored
  const ing = [{ group: 'flour', type: 'AP', amount: '3', unit: 'cup' }];
  assert.equal(U.recipeKey({ ingredients: ing, bake: { program: 2, added: 10 } }),
    U.recipeKey({ ingredients: ing, bake: { programs: [2, 12], added: 10 } }));
});

test('a recipe with nothing entered is recognised as empty', () => {
  assert.equal(U.isEmptyRecipe(U.emptyRecipe()), true, 'the blank form, with its starting rows untouched');
  assert.equal(U.isEmptyRecipe({ name: 'Only a name' }), true);
  const withFlour = U.emptyRecipe(); withFlour.ingredients[0].amount = '3';
  assert.equal(U.isEmptyRecipe(withFlour), false);
  assert.equal(U.isEmptyRecipe({ bake: { programs: [1] } }), false);
  assert.equal(U.isEmptyRecipe({ source: 'Mom' }), false);
});

test('names match apart from capitals and spacing', () => {
  assert.equal(U.nameKey('French Bread'), U.nameKey('  french   bread '));
  assert.notEqual(U.nameKey('french bread'), U.nameKey('french breads'));
  assert.equal(U.nameKey(''), '');
});

test('where a bread\'s recipe is saved', () => {
  const make = (id, water, extra) => Object.assign(U.cleanRecipe(Object.assign({
    name: 'french bread',
    ingredients: [{ group: 'flour', type: 'AP', amount: '3', unit: 'cup' }, { group: 'water', amount: water, unit: 'cup' }],
    bake: { programs: [2], size: '1.5', minutes: 255 }, source: 'Booklet'
  }, extra)), { id });
  const v1 = make('v1', '1 1/4'), v2 = make('v2', '1 1/2');
  const copy = (r, patch) => Object.assign(JSON.parse(JSON.stringify(r)), patch);
  const plan = (o) => U.planRecipeSave(Object.assign({ family: [], current: null, base: null, others: 0 }, o));

  assert.deepEqual(plan({ draft: copy(v1) }), { action: 'create', basedOn: null }, 'a new name: a new recipe');
  assert.deepEqual(plan({ draft: U.emptyRecipe() }), { action: 'none' }, 'nothing entered and no such recipe: no card');

  // the same name finds the recipe
  assert.deepEqual(plan({ draft: copy(v1), family: [v2, v1] }), { action: 'keep', id: 'v1' }, 'same ingredients: that variation');
  assert.deepEqual(plan({ draft: make('x', '2'), family: [v2, v1] }), { action: 'create', basedOn: null }, 'different ingredients: a new variation');
  assert.deepEqual(plan({ draft: U.emptyRecipe(), family: [v2, v1] }), { action: 'keep', id: 'v2' }, 'nothing entered: the latest variation');
  assert.deepEqual(plan({ draft: U.emptyRecipe(), family: [v2, v1], base: v1 }), { action: 'keep', id: 'v1' }, 'or the one the form was filled from');

  // typing the same ingredients by hand must not wipe a variation's method or source
  assert.deepEqual(plan({ draft: copy(v1, { source: '', method: '' }), family: [v1] }), { action: 'keep', id: 'v1' });
  // editing them in a form filled from that variation does change them
  assert.deepEqual(plan({ draft: copy(v1, { source: 'Booklet, p. 14' }), family: [v1], base: v1 }), { action: 'update', id: 'v1' });

  // editing a bread
  assert.deepEqual(plan({ draft: make('x', '2'), family: [v1], current: v1, base: v1, others: 0 }),
    { action: 'update', id: 'v1' }, 'the only bread on its variation: edit it in place');
  assert.deepEqual(plan({ draft: make('x', '2'), family: [v1], current: v1, base: v1, others: 2 }),
    { action: 'create', basedOn: 'v1' }, 'others share it: a new variation');
  assert.deepEqual(plan({ draft: copy(v1), family: [], current: v1, base: v1, others: 0 }),
    { action: 'update', id: 'v1' }, 'renamed and alone: the variation moves with it');
  assert.deepEqual(plan({ draft: copy(v1), family: [], current: v1, base: v1, others: 1 }),
    { action: 'create', basedOn: 'v1' }, 'renamed while others share it: a copy under the new name');

  // a different reason for the added time is not a different bake
  const a = make('a', '1', { bake: { programs: [1, 12], size: '1.5', minutes: 205, added: 5, reason: 'crust browning' } });
  const b = copy(a, {}); b.bake.reason = 'pale top';
  assert.equal(U.recipeKey(a), U.recipeKey(b));
});

test('lines that differ between two variations are found', () => {
  const base = { ingredients: [{ group: 'flour', type: 'AP', amount: '3', unit: 'cup' }, { group: 'water', amount: '1.25', unit: 'cup' }] };
  const other = { ingredients: [{ group: 'flour', type: 'AP', amount: '3', unit: 'cup' }, { group: 'water', amount: '1.75', unit: 'cup' },
    { group: 'other', type: 'Honey', amount: '1', unit: 'tbsp' }] };
  assert.deepEqual(U.changedLines(base, other), [false, true, true]);
  assert.deepEqual(U.changedLines(base, base), [false, false]);
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
  assert.equal(m.programs.filter((p) => p.manual).length, 1, 'one program has its time set by hand');
  assert.equal(U.manualProgram().name, 'Bake');
  // spot checks against the manual's Programs & Timing tables
  assert.equal(U.programMinutes(1, '1.5'), 3 * 60 + 25);
  assert.equal(U.programMinutes(2, '2'), 4 * 60 + 20);
  assert.equal(U.programMinutes(3, '1'), 3 * 60 + 57);
  assert.equal(U.programMinutes(4, '1.5'), 2 * 60 + 3);
  assert.equal(U.programMinutes(4, '2'), null, 'Ultra-Fast has no 2 lb loaf');
  assert.equal(U.programMinutes(6, '1.5'), 2 * 60 + 15);
  assert.equal(U.programMinutes(8), 90);
});

test('what the form offers follows the programs chosen', () => {
  assert.equal(U.sizesFor([]).length, 3, 'any size until a program is chosen');
  assert.deepEqual(U.sizesFor([6]).map((s) => s.id), ['1.5']);
  assert.deepEqual(U.sizesFor([8]), []);
  assert.deepEqual(U.sizesFor([8, 12]), []);
  assert.deepEqual(U.sizesFor([1, 12]).map((s) => s.id), ['1', '1.5', '2'], 'Bake does not narrow the sizes');
  assert.deepEqual(U.sizesFor([1, 4]).map((s) => s.id), ['1', '1.5'], 'only sizes every sized program has');
  assert.equal(U.hasCrust([]), true);
  assert.equal(U.hasCrust([2]), false);
  assert.equal(U.hasCrust([2, 1]), true);
  assert.equal(U.hasManual([1]), false);
  assert.equal(U.hasManual([1, 12]), true);
  assert.equal(U.hasDough([8, 12]), true);
  assert.deepEqual(U.programLabels([8, 12]), ['8 · Dough', '12 · Bake']);
  assert.deepEqual(U.toggleProgram([1], 12), [1, 12]);
  assert.deepEqual(U.toggleProgram([1, 12], 1), [12]);
});

test('time adds up across programs; Bake is timed by hand', () => {
  assert.equal(U.totalMinutes([1], '1.5'), 205);
  assert.equal(U.totalMinutes([1, 12], '1.5'), 205, 'Bake adds nothing by itself');
  assert.equal(U.totalMinutes([8, 12], ''), 90);
  assert.equal(U.totalMinutes([7, 8], ''), 305 + 90);
  assert.equal(U.totalMinutes([12], ''), null);
  assert.equal(U.totalMinutes([1], ''), null, 'no time until a loaf size is chosen');
  assert.equal(U.totalMinutes([], ''), null);
});

test('baking details stay consistent as programs are chosen', () => {
  const start = U.cleanBake({});
  const white = U.withBake(start, { programs: [1] });
  assert.equal(white.minutes, null);
  const sized = U.withBake(white, { size: '1.5' });
  assert.equal(sized.minutes, 205);
  assert.equal(U.withBake(sized, { size: '2' }).minutes, 210);

  const custom = U.withBake(sized, { minutes: 190 });
  assert.equal(U.withBake(custom, { size: '2' }).minutes, 190, 'a time she typed is not overwritten');

  const withBake = U.withBake(sized, { programs: [1, 12] });
  assert.equal(withBake.minutes, 205);
  const added = U.withBake(U.withBake(withBake, { added: 10 }), { reason: 'crust was light' });
  assert.deepEqual([added.added, added.reason], [10, 'crust was light']);
  const without = U.withBake(added, { programs: [1] });
  assert.deepEqual([without.added, without.reason], [null, ''], 'dropping Bake drops the time added with it');

  const gf = U.withBake(U.withBake(sized, { crust: 'dark' }), { programs: [6] });
  assert.deepEqual([gf.size, gf.crust, gf.minutes], ['1.5', 'dark', 135], 'the only size is picked for her');
  const dough = U.withBake(gf, { programs: [8] });
  assert.deepEqual([dough.size, dough.crust, dough.minutes], ['', '', 90]);
  assert.equal(U.withBake(U.withBake(sized, { crust: 'dark' }), { programs: [2] }).crust, '', 'French has no crust colour');
  const none = U.withBake(sized, { programs: [] });
  assert.deepEqual([none.size, none.minutes], ['1.5', null]);
});

test('an entry is dough until a bake is recorded', () => {
  assert.equal(U.isBaked(null), false, 'no baking details at all');
  assert.equal(U.isBaked({}), false);
  assert.equal(U.isBaked({ programs: [8] }), false, 'the Dough program alone');
  assert.equal(U.isBaked({ programs: [7, 8] }), false);
  assert.equal(U.isBaked({ program: 8, minutes: 90 }), false, 'as saved before programs could be combined');
  assert.equal(U.isBaked({ programs: [8, 12] }), true, 'Dough then Bake');
  assert.equal(U.isBaked({ programs: [1] }), true);
  assert.equal(U.isBaked({ programs: [8], ovenTemp: 375 }), true, 'Dough, then the oven');
  assert.equal(U.isBaked({ programs: [], ovenMinutes: 30 }), true);
});

test('proofing: where and how long', () => {
  assert.deepEqual(U.cleanBake({}).proof, ['machine'], 'the bread machine unless she says otherwise');
  assert.deepEqual(U.cleanBake({ proof: [] }).proof, [], 'unless she clears it');
  assert.deepEqual(U.cleanBake({ proof: ['fridge', 'machine', 'oven'] }).proof, ['machine', 'fridge'], 'several, in a fixed order');
  assert.equal(U.cleanBake({ proofMinutes: '720' }).proofMinutes, 720);
  assert.deepEqual(U.proofLabels(['machine', 'airfryer']), ['Bread machine', 'Air fryer']);
  const ing = [{ group: 'flour', type: 'AP', amount: '400', unit: 'g' }];
  assert.notEqual(U.recipeKey({ ingredients: ing, bake: { proof: ['fridge'] } }), U.recipeKey({ ingredients: ing, bake: {} }),
    'proofing somewhere else is another tweak');
  assert.equal(U.recipeKey({ ingredients: ing, bake: { proof: ['machine'] } }), U.recipeKey({ ingredients: ing, bake: {} }),
    'older entries match a machine proof');
  assert.equal(U.isEmptyRecipe(U.emptyRecipe()), true, 'the default place alone is not a recipe');
  assert.equal(U.isEmptyRecipe({ bake: { proofMinutes: 60 } }), false);
});

test('photos: a list, with the first version\'s single photo still read', () => {
  assert.deepEqual(U.photosOf({ photo: { full: 'a', thumb: 'b' } }), [{ full: 'a', thumb: 'b' }]);
  assert.deepEqual(U.photosOf({ photo: null }), []);
  assert.deepEqual(U.photosOf({ photos: [{ full: 'a' }, null, { full: 'c' }], photo: { full: 'a' } }), [{ full: 'a' }, { full: 'c' }]);
  assert.deepEqual(U.photosOf(null), []);
});

test('ratings can be half stars', () => {
  assert.equal(U.rating({ ratings: { crust: 3.5, crumb: 4.5, taste: 4 } }).toFixed(1), '4.0');
  assert.equal(U.rating({ ratings: { crust: 0.5 } }), 0.5);
});

test('stats arithmetic: flour in grams, time spent, and how they read', () => {
  assert.equal(U.flourGrams({ group: 'flour', amount: '500', unit: 'g' }), 500);
  assert.equal(U.flourGrams({ group: 'flour', amount: '3 1/4', unit: 'cup' }), 390, 'about 120 g a cup');
  assert.equal(U.flourGrams({ group: 'flour', amount: '2', unit: 'tbsp' }), 15);
  assert.equal(U.flourGrams({ group: 'flour', amount: '1 lb', unit: '' }), null, 'no unit: not counted');
  assert.equal(U.flourGrams({ group: 'water', amount: '300', unit: 'g' }), null, 'only flour');
  assert.equal(U.minutesSpent({ programs: [2, 12], minutes: 255, added: 10 }), 265);
  assert.equal(U.minutesSpent({ programs: [8], minutes: 90, proofMinutes: 45, ovenMinutes: 20 }), 155);
  assert.equal(U.minutesSpent({ programs: [8], minutes: 90, proofMinutes: 45, ovenMinutes: 20 }, true), 20, 'a split copy: only its own baking');
  assert.equal(U.minutesSpent(null), 0);
  assert.equal(U.fmtWeight(850), '850 g');
  assert.equal(U.fmtWeight(4385), '4.4 kg');
  assert.equal(U.fmtSpan(0), '0 min');
  assert.equal(U.fmtSpan(205), '3 h 25 min');
  assert.equal(U.fmtSpan(3000), '2 d 2 h');
  assert.equal(U.fmtSpan(1439), '23 h 59 min');
});

test('anything from Reddit is saved as just "Reddit"', () => {
  for (const s of ['Reddit, r/BreadMachines, comment by Ok_Instruction7805 (OP)', 'reddit', 'r/BreadMachines', 'r/BreadMachines, u/someone', 'u/someone on reddit.com'])
    assert.equal(U.cleanSource(s), 'Reddit', s);
  assert.equal(U.cleanSource('Daily Breads, page 45'), 'Daily Breads, page 45');
  assert.equal(U.cleanSource('  Mom  '), 'Mom');
  assert.equal(U.cleanSource('Bread & Butter, p. 3'), 'Bread & Butter, p. 3', 'not every r/ or u/ inside a word');
  assert.equal(U.cleanRecipe({ source: 'r/Breadit' }).source, 'Reddit');
});
