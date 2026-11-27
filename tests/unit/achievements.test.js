const test = require('node:test');
const assert = require('node:assert/strict');
require('../../data/machine.js');
require('../../js/util.js');
require('../../js/achievements.js');
const { achievements: A, util: U } = globalThis.LGT;

// A loaf as the store describes it. Days count from 2026-01-01.
const day = (n) => { const d = new Date(2026, 0, n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const loaf = (n, o = {}) => Object.assign({ date: day(n), created: n, line: 'r' + n, name: 'Loaf ' + n, label: '', bread: 'Loaf ' + n, flag: '',
  source: '', rating: null, taste: 0, programs: [1], flours: ['AP'] }, o);
const by = (list) => Object.fromEntries(list.map((a) => [a.id, a]));
const earned = (facts) => A.evaluate(facts).filter((a) => a.earned).map((a) => a.id);

test('nothing is earned with nothing baked', () => {
  const list = A.evaluate({ loaves: [], flour: [], recipes: [] });
  assert.equal(list.filter((a) => a.earned).length, 0);
  assert.ok(list.length >= 28, 'the whole catalog is listed');
  assert.deepEqual(A.evaluate(undefined).filter((a) => a.earned), []);
  for (const a of list) {
    assert.ok(a.id && a.emoji && a.name && a.goal && a.need >= 1, JSON.stringify(a));
    assert.equal(a.date, '');
  }
  assert.equal(new Set(list.map((a) => a.id)).size, list.length, 'ids are unique');
});

test('loaf milestones are earned on the day of the loaf that reaches them', () => {
  const loaves = Array.from({ length: 26 }, (_, i) => loaf(i + 1));
  const a = by(A.evaluate({ loaves }));
  assert.deepEqual([a['loaves-1'].earned, a['loaves-1'].date], [true, day(1)]);
  assert.deepEqual([a['loaves-10'].earned, a['loaves-10'].date], [true, day(10)]);
  assert.deepEqual([a['loaves-25'].earned, a['loaves-25'].date, a['loaves-25'].name], [true, day(25), 'Yeast mode']);
  assert.deepEqual([a['loaves-50'].earned, a['loaves-50'].have, a['loaves-50'].need, a['loaves-50'].name], [false, 26, 50, 'Fifty shades of grain']);
  assert.deepEqual([a['loaves-365'].name, a['loaves-365'].goal], ['Our daily bread', 'Bake 365 loaves']);
  // the order the loaves are handed over in does not matter
  assert.equal(by(A.evaluate({ loaves: loaves.slice().reverse() }))['loaves-10'].date, day(10));
});

test('flour is counted in pounds, the way Stats shows it', () => {
  const lb = 453.592;
  let a = by(A.evaluate({ flour: [{ date: day(1), created: 1, grams: 9.94 * lb }] }));
  assert.deepEqual([a['flour-10'].earned, a['flour-10'].have], [false, 9.9]);
  a = by(A.evaluate({ flour: [{ date: day(1), created: 1, grams: 6 * lb }, { date: '', created: Date.UTC(2026, 5, 1, 12), grams: 30 * lb }, { date: day(3), created: 3, grams: 4 * lb }] }));
  assert.deepEqual([a['flour-10'].earned, a['flour-10'].date], [true, day(3)], 'dated entries are counted first');
  assert.equal(a['flour-25'].earned, true, 'an entry not baked yet still counts, as it does in Stats');
  assert.equal(a['flour-25'].name, 'Commercialized');
  assert.equal(a['flour-25'].have, 40);
});

test('recipes: how many were baked, where they came from, and how many are saved', () => {
  const loaves = [];
  for (let i = 1; i <= 10; i++) loaves.push(loaf(i, { line: 'reddit' + i, source: 'Reddit' }));
  loaves.push(loaf(11, { line: 'reddit1', source: 'Reddit' }));                 // the same recipe again
  for (let i = 12; i <= 20; i++) loaves.push(loaf(i, { line: 'c' + i, source: 'Cuisinart' }));
  loaves.push(loaf(21, { line: null, source: '' }));                            // a bread with no recipe
  const a = by(A.evaluate({ loaves, recipes: Array.from({ length: 50 }, (_, i) => ({ created: new Date(2026, 0, i + 1, 12).getTime(), flag: '', read: i === 7 })) }));
  assert.deepEqual([a['reddit-10'].earned, a['reddit-10'].date, a['reddit-10'].name], [true, day(10), 'Breddit']);
  assert.deepEqual([a['cuisinart-10'].earned, a['cuisinart-10'].have], [false, 9]);
  assert.deepEqual([a['recipes-10'].earned, a['recipes-10'].date, a['recipes-10'].have], [true, day(10), 19]);
  assert.deepEqual([a['saved-50'].earned, a['saved-50'].date], [true, day(50)]);
  assert.deepEqual([a['read'].earned, a['read'].date], [true, day(8)]);
  assert.deepEqual([a['repeat-5'].earned, a['repeat-5'].have], [false, 2]);
});

test('one recipe baked five times, and days in a row', () => {
  const loaves = [1, 2, 4, 5, 6].map((n) => loaf(n, { line: 'same' }));
  const a = by(A.evaluate({ loaves }));
  assert.deepEqual([a['repeat-5'].earned, a['repeat-5'].date], [true, day(6)]);
  assert.deepEqual([a['streak-3'].earned, a['streak-3'].date, a['streak-3'].have], [true, day(6), 3]);
  // two loaves on one day are one day; a gap starts over
  const b = by(A.evaluate({ loaves: [loaf(1), loaf(1, { created: 2 }), loaf(2), loaf(4), loaf(5)] }));
  assert.deepEqual([b['streak-3'].earned, b['streak-3'].have], [false, 2]);
  // across a month's end
  assert.equal(by(A.evaluate({ loaves: [loaf(30), loaf(31), loaf(32)] }))['streak-3'].earned, true);
});

test('ratings', () => {
  let a = by(A.evaluate({ loaves: [loaf(1, { rating: 3.5, taste: 4 }), loaf(2, { rating: 4, taste: 4 })] }));
  assert.deepEqual([a['rated-4'].earned, a['rated-4'].date, a['rated-5'].earned, a['taste-5'].earned], [true, day(2), false, false]);
  a = by(A.evaluate({ loaves: [loaf(1, { rating: 4.5, taste: 5 }), loaf(2, { rating: 5, taste: 5 })] }));
  assert.deepEqual([a['taste-5'].date, a['rated-5'].date, a['rated-5'].name], [day(1), day(2), 'The best thing since sliced']);
  assert.equal(by(A.evaluate({ loaves: [loaf(1)] }))['rated-4'].earned, false, 'an unrated loaf earns none');
});

test('countries: the named ones, three of them, and any other she has a recipe from', () => {
  const facts = {
    loaves: [loaf(1, { flag: 'CN' }), loaf(2, { flag: 'FR' }), loaf(3, { flag: 'GLOBAL' }), loaf(4, { flag: 'IN' })],
    recipes: [{ created: 1, flag: 'JP' }, { created: 2, flag: 'FR' }, { created: 3, flag: 'GLOBAL' }, { created: 4, flag: '' }]
  };
  const list = A.evaluate(facts), a = by(list);
  assert.deepEqual([a['country-CN'].name, a['country-CN'].earned, a['country-CN'].emoji], ['Bing bing', true, U.flagEmoji('CN')]);
  assert.deepEqual([a['country-IN'].name, a['country-IN'].date], ['Like naan other', day(4)]);
  assert.deepEqual([a['country-DE'].name, a['country-DE'].earned], ['Gluten tag', false]);
  assert.deepEqual([a['country-GB'].name, a['country-GB'].goal], ['Great British Bake-off', 'Bake a bread from the UK']);
  assert.deepEqual([a['country-US'].name, a['country-US'].earned], ['Bakersfield, CA', false]);
  assert.deepEqual([a['country-FR'].name, a['country-FR'].goal, a['country-FR'].earned], ['France', 'Bake a bread from France', true]);
  assert.deepEqual([a['country-JP'].name, a['country-JP'].earned], ['Japan', false], 'a country only on the to-try list waits to be earned');
  assert.equal(a['country-GLOBAL'], undefined, 'Global is not a country');
  assert.deepEqual([a['countries-3'].earned, a['countries-3'].date, a['countries-3'].name], [true, day(4), 'Eat, pray, loaf']);
});

test('what went into the loaf: Challah, rye, whole wheat, the fast program', () => {
  let a = by(A.evaluate({ loaves: [loaf(1, { name: 'Honey challah' }), loaf(2, { flours: ['Bread', 'Rye'] }), loaf(3, { flours: ['Whole wheat'] }), loaf(4, { programs: [4] })] }));
  assert.deepEqual(['challah', 'rye', 'whole-wheat', 'fast'].map((id) => a[id].earned), [true, true, true, true]);
  assert.equal(a['fast'].goal, 'Bake on Ultra-Fast', 'the program is named by the machine data');
  a = by(A.evaluate({ loaves: [loaf(1, { programs: [3] }), loaf(2, { name: 'Bread', label: 'Challah' })] }));
  assert.deepEqual([a['whole-wheat'].earned, a['challah'].earned, a['rye'].earned, a['fast'].earned], [true, true, false, false]);
  assert.equal(by(A.evaluate({ loaves: [loaf(1, { flours: ['Dark rye'] }), loaf(2, { name: 'Country bread' })] }))['challah'].earned, false);
});

test('shown with the earned first, latest on top, then the closest to being earned', () => {
  const loaves = Array.from({ length: 12 }, (_, i) => loaf(i + 1, { flag: i === 11 ? 'CN' : '' }));
  const order = A.inOrder(A.evaluate({ loaves })).map((a) => a.id);
  assert.deepEqual(order.slice(0, 5), ['country-CN', 'loaves-10', 'recipes-10', 'streak-3', 'loaves-1']);
  const locked = A.inOrder(A.evaluate({ loaves })).filter((a) => !a.earned);
  assert.equal(locked[0].id, 'loaves-25', '12 of 25 is the closest');
  assert.deepEqual(earned({ loaves }).sort(), ['country-CN', 'loaves-1', 'loaves-10', 'recipes-10', 'streak-3']);
});
