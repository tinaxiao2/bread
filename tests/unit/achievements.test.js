const test = require('node:test');
const assert = require('node:assert/strict');
require('../../data/machine.js');
require('../../js/util.js');
require('../../js/achievements.js');
const { achievements: A, util: U } = globalThis.LGT;

// A loaf as the store describes it. Days count from 2026-01-01 (day 1), into later months.
const pad = (n) => String(n).padStart(2, '0');
const day = (n) => { const d = new Date(2026, 0, n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const noon = (n) => new Date(2026, 0, n, 12).getTime();
const loaf = (n, o = {}) => Object.assign({ date: day(n), created: n, line: 'r' + n, name: 'Loaf ' + n, label: '', bread: 'Loaf ' + n, flag: '',
  source: '', rating: null, crust: 0, crumb: 0, taste: 0, gifted: false, split: false, dough: false, usesDough: false, oven: false, added: 0,
  proof: ['machine'], programs: [1], flours: ['Spelt'], yeasts: [], dairy: [], stages: [] }, o);
const on = (date, o = {}) => loaf(1, Object.assign({ date }, o));
const by = (list) => Object.fromEntries(list.map((a) => [a.id, a]));
const got = (facts) => by(A.evaluate(facts));
const earned = (facts) => A.evaluate(facts).filter((a) => a.earned).map((a) => a.id);

test('nothing is earned with nothing baked', () => {
  const list = A.evaluate({ loaves: [], flour: [], time: [], recipes: [] });
  assert.equal(list.filter((a) => a.earned).length, 0);
  assert.equal(list.length, 86, 'the catalog, the fourteen named countries and the collector');
  assert.deepEqual(A.evaluate(undefined).filter((a) => a.earned), []);
  for (const a of list) {
    assert.ok(a.id && a.emoji && a.name && a.goal && a.need >= 1, JSON.stringify(a));
    assert.equal(a.date, '');
    assert.ok(a.goal.split(/\s+/).length <= 7, 'a goal stays short: ' + a.goal);
  }
  assert.equal(new Set(list.map((a) => a.id)).size, list.length, 'ids are unique');
  assert.equal(new Set(list.map((a) => a.name)).size, list.length, 'so are names');
});

test('loaf milestones are earned on the day of the loaf that reaches them', () => {
  const loaves = Array.from({ length: 26 }, (_, i) => loaf(i + 1));
  const a = got({ loaves });
  assert.deepEqual([a['loaves-1'].name, a['loaves-1'].date], ['Bread-y or not', day(1)]);
  assert.deepEqual([a['loaves-10'].earned, a['loaves-10'].date], [true, day(10)]);
  assert.deepEqual([a['loaves-13'].name, a['loaves-13'].date], ['Baker’s dozen', day(13)]);
  assert.deepEqual([a['loaves-25'].earned, a['loaves-25'].date, a['loaves-25'].name], [true, day(25), 'Yeast mode']);
  assert.deepEqual([a['loaves-50'].earned, a['loaves-50'].have, a['loaves-50'].need, a['loaves-50'].name], [false, 26, 50, 'Fifty shades of grain']);
  assert.deepEqual([a['loaves-221'].name, a['loaves-221'].goal], ['221B Baker Street', 'Bake 221 loaves']);
  assert.deepEqual([a['loaves-365'].name, a['loaves-365'].goal], ['Our daily bread', 'Bake 365 loaves']);
  assert.deepEqual([a['loaves-500'].name, a['loaves-500'].need], ['Kingbaker', 500]);
  // the order the loaves are handed over in does not matter
  assert.equal(got({ loaves: loaves.slice().reverse() })['loaves-10'].date, day(10));
});

test('flour is counted in pounds and time in hours, the way Stats shows them', () => {
  const lb = 453.592;
  let a = got({ flour: [{ date: day(1), created: 1, grams: 9.94 * lb }] });
  assert.deepEqual([a['flour-5'].name, a['flour-5'].earned, a['flour-10'].earned, a['flour-10'].have], ['Flour child', true, false, 9.9]);
  a = got({ flour: [{ date: day(1), created: 1, grams: 6 * lb }, { date: '', created: noon(150), grams: 100 * lb }, { date: day(3), created: 3, grams: 4 * lb }] });
  assert.deepEqual([a['flour-10'].earned, a['flour-10'].date], [true, day(3)], 'dated entries are counted first');
  assert.equal(a['flour-25'].name, 'Commercialized');
  assert.deepEqual([a['flour-50'].name, a['flour-50'].earned, a['flour-50'].date], ['Joan of Starch', true, day(150)], 'an entry not baked yet still counts, as it does in Stats');
  assert.deepEqual([a['flour-100'].name, a['flour-100'].have, a['flour-100'].earned], ['Bread equity', 110, true]);

  a = got({ time: [{ date: day(1), created: 1, minutes: 23 * 60 + 59 }] });
  assert.deepEqual([a['hours-24'].name, a['hours-24'].have, a['hours-24'].earned], ['Loafing around', 23, false]);
  a = got({ time: [{ date: day(1), created: 1, minutes: 20 * 60 }, { date: day(2), created: 2, minutes: 4 * 60 }, { date: day(9), created: 9, minutes: 80 * 60 }] });
  assert.deepEqual([a['hours-24'].date, a['hours-100'].name, a['hours-100'].date], [day(2), 'Bread, sweat, and tears', day(9)]);
});

test('recipes: how many were baked, where they came from, and how many are saved', () => {
  const loaves = [];
  for (let i = 1; i <= 10; i++) loaves.push(loaf(i, { line: 'reddit' + i, source: 'Reddit' }));
  loaves.push(loaf(11, { line: 'reddit1', source: 'Reddit' }));                 // the same recipe again
  for (let i = 12; i <= 20; i++) loaves.push(loaf(i, { line: 'c' + i, source: 'Cuisinart' }));
  loaves.push(loaf(21, { line: null, source: '' }));                            // a bread with no recipe
  const a = got({ loaves, recipes: Array.from({ length: 50 }, (_, i) => ({ created: noon(i + 1), flag: '', read: i === 7, tweaks: [noon(i + 1)] })) });
  assert.deepEqual([a['reddit-10'].earned, a['reddit-10'].date, a['reddit-10'].name], [true, day(10), 'Breddit']);
  assert.deepEqual([a['cuisinart-10'].earned, a['cuisinart-10'].have], [false, 9]);
  assert.deepEqual([a['recipes-10'].earned, a['recipes-10'].date, a['recipes-10'].have], [true, day(10), 19]);
  assert.deepEqual([a['saved-25'].name, a['saved-25'].date], ['Easier bread than done', day(25)]);
  assert.deepEqual([a['saved-50'].earned, a['saved-50'].date], [true, day(50)]);
  assert.deepEqual([a['read'].earned, a['read'].date], [true, day(8)]);
  assert.deepEqual([a['repeat-5'].earned, a['repeat-5'].have], [false, 2]);
  assert.equal(a['tweak'].earned, false, 'one of each is no tweak');
});

test('one recipe again and again, days in a row, and busy days', () => {
  const a = got({ loaves: [1, 2, 4, 5, 6].map((n) => loaf(n, { line: 'same' })) });
  assert.deepEqual([a['repeat-5'].earned, a['repeat-5'].date], [true, day(6)]);
  assert.deepEqual([a['streak-3'].name, a['streak-3'].earned, a['streak-3'].date, a['streak-3'].have], ['Rise and shine', true, day(6), 3]);
  assert.deepEqual([a['streak-7'].name, a['streak-7'].have, a['streak-7'].earned], ['Seven minutes in leaven', 3, false]);
  assert.equal(a['day-2'].earned, false);
  // two loaves on one day are one day; a gap starts over
  const b = got({ loaves: [loaf(1), loaf(1, { created: 2, line: 'another' }), loaf(2), loaf(4), loaf(5)] });
  assert.deepEqual([b['streak-3'].earned, b['streak-3'].have], [false, 2]);
  assert.deepEqual([b['day-2'].name, b['day-2'].date, b['day-5'].have], ['Dealbaker', day(1), 2]);
  assert.equal(b['twice-a-day'].earned, false, 'two recipes on one day are not one recipe twice');
  // across a month's end, and a whole week
  assert.equal(got({ loaves: [loaf(30), loaf(31), loaf(32)] })['streak-3'].earned, true);
  assert.equal(got({ loaves: [29, 30, 31, 32, 33, 34, 35].map((n) => loaf(n)) })['streak-7'].date, day(35));
  // five in a day; one recipe twice in a day
  const c = got({ loaves: [1, 2, 3, 4, 5].map((n) => loaf(n, { date: day(9), line: n < 3 ? 'same' : 'r' + n })) });
  assert.deepEqual([c['day-5'].name, c['day-5'].date], ['Bake no prisoners', day(9)]);
  assert.deepEqual([c['twice-a-day'].name, c['twice-a-day'].earned, c['twice-a-day'].date], ['All’s fair in loaf and war', true, day(9)]);
});

test('ratings', () => {
  let a = got({ loaves: [loaf(1, { rating: 3.5, taste: 4 }), loaf(2, { rating: 4, taste: 4 })] });
  assert.deepEqual([a['rated-4'].earned, a['rated-4'].date, a['rated-5'].earned, a['taste-5'].earned], [true, day(2), false, false]);
  a = got({ loaves: [loaf(1, { rating: 4.5, taste: 5, crust: 4.5, crumb: 4 }), loaf(2, { rating: 5, taste: 5, crust: 5, crumb: 5 })] });
  assert.deepEqual([a['taste-5'].date, a['rated-5'].date, a['rated-5'].name], [day(1), day(2), 'The best thing since sliced']);
  assert.deepEqual([a['crust-5'].name, a['crust-5'].date, a['crumb-5'].name, a['crumb-5'].date], ['In crust we trust', day(2), 'Crumb club', day(2)]);
  assert.equal(a['first-5'].date, day(2), 'a recipe whose first bake got five stars');
  assert.equal(got({ loaves: [loaf(1)] })['rated-4'].earned, false, 'an unrated loaf earns none');
  assert.equal(got({ loaves: [loaf(1, { line: 'x', rating: 4 }), loaf(2, { line: 'x', rating: 5 })] })['first-5'].earned, false, 'not the second bake');
  // many good ones, and a flop
  const many = Array.from({ length: 10 }, (_, i) => loaf(i + 1, { rating: i < 5 ? 5 : 4 }));
  a = got({ loaves: many.concat([loaf(11, { rating: 2 }), loaf(12, { rating: null })]) });
  assert.deepEqual([a['rated-5x5'].name, a['rated-5x5'].date, a['rated-4x10'].name, a['rated-4x10'].date], ['Upper crust', day(5), 'Well-bread', day(10)]);
  assert.deepEqual([a['flop'].name, a['flop'].date], ['We’re toast', day(11)]);
  assert.equal(got({ loaves: [loaf(1, { rating: 2.5 }), loaf(2)] })['flop'].earned, false);
});

test('countries: the named ones, the journey, and any other she has a recipe from', () => {
  const facts = {
    loaves: [loaf(1, { flag: 'CN' }), loaf(2, { flag: 'FR' }), loaf(3, { flag: 'GLOBAL' }), loaf(4, { flag: 'IN' }), loaf(5, { flag: 'IL' })],
    recipes: [{ created: 1, flag: 'JP' }, { created: 2, flag: 'FR' }, { created: 3, flag: 'GLOBAL' }, { created: 4, flag: '' }, { created: 5, flag: 'MX' }]
  };
  const a = by(A.evaluate(facts));
  assert.deepEqual([a['country-CN'].name, a['country-CN'].earned, a['country-CN'].emoji], ['Bing bing', true, U.flagEmoji('CN')]);
  assert.deepEqual([a['country-IN'].name, a['country-IN'].date], ['Like naan other', day(4)]);
  assert.deepEqual([a['country-DE'].name, a['country-DE'].earned], ['Gluten tag', false]);
  assert.deepEqual([a['country-GB'].name, a['country-GB'].goal], ['Great British Bake-off', 'Bake a bread from the UK']);
  assert.deepEqual([a['country-US'].name, a['country-US'].goal], ['Bakersfield, CA', 'Bake a bread from the US']);
  assert.deepEqual([a['country-FR'].name, a['country-FR'].goal, a['country-FR'].earned], ['Life is pain', 'Bake a bread from France', true]);
  assert.deepEqual([a['country-IL'].name, a['country-IL'].goal, a['country-IL'].date], ['Challahback girl', 'Bake a bread from Israel', day(5)]);
  assert.deepEqual(['IE', 'IT', 'JP', 'SE', 'BR', 'PL', 'MY'].map((c) => a['country-' + c].name),
    ['So da-lightful', 'For focaccia’s sake', 'Pan-chant for baking', 'On a roll', 'Kaboom pao', 'Everything bagel', 'Roti, set, go']);
  assert.equal(a['country-JP'].earned, false, 'a country only on the to-try list waits to be earned');
  assert.deepEqual([a['country-MX'].name, a['country-MX'].goal, a['country-MX'].earned], ['Mexico', 'Bake a bread from Mexico', false], 'any other country is named for itself');
  assert.equal(a['country-GLOBAL'], undefined, 'Global is not a country');
  assert.equal(a['challah'], undefined);

  // Eat, pray, loaf: Italy, India and somewhere in Southeast Asia
  assert.deepEqual([a['eat-pray-loaf'].name, a['eat-pray-loaf'].have, a['eat-pray-loaf'].need, a['eat-pray-loaf'].earned], ['Eat, pray, loaf', 1, 3, false]);
  const trip = got({ loaves: [loaf(1, { flag: 'TH' }), loaf(2, { flag: 'VN' }), loaf(3, { flag: 'IN' }), loaf(9, { flag: 'IT' }), loaf(10, { flag: 'MY' })] });
  assert.deepEqual([trip['eat-pray-loaf'].earned, trip['eat-pray-loaf'].date], [true, day(9)], 'earned the day the last of the three was baked');
  assert.deepEqual([trip['countries-5'].name, trip['countries-5'].date], ['Bakin my way downtown', day(10)]);
  assert.equal(got({ loaves: [loaf(1, { flag: 'IT' }), loaf(2, { flag: 'IN' }), loaf(3, { flag: 'CN' })] })['eat-pray-loaf'].have, 2, 'China is not Southeast Asia');

  // going back to one country
  const home = got({ loaves: Array.from({ length: 10 }, (_, i) => loaf(i + 1, { flag: i < 5 ? 'FR' : 'US' })).concat(Array.from({ length: 5 }, (_, i) => loaf(20 + i, { flag: 'US' }))) });
  assert.deepEqual([home['france-5'].name, home['france-5'].date], ['Let them eat bread', day(5)]);
  assert.deepEqual([home['us-10'].name, home['us-10'].date], ['Doughmestic affairs', day(24)]);
});

test('what went into the loaf', () => {
  let a = got({ loaves: [loaf(1, { flours: ['Bread', 'Rye'] }), loaf(2, { flours: ['Whole wheat'] }), loaf(3, { programs: [4] }), loaf(4, { flours: ['AP'], dairy: ['Milk', 'Butter'] }),
    loaf(5, { flours: ['ap', 'Semolina'], yeasts: ['Active dry'] }), loaf(6, { yeasts: ['Instant', 'active dry'] })] });
  assert.deepEqual(['rye', 'whole-wheat', 'fast', 'butter'].map((id) => a[id].earned), [true, true, true, true]);
  assert.equal(a['fast'].goal, 'Bake on Ultra-Fast', 'the program is named by the machine data');
  assert.deepEqual([a['flours-5'].name, a['flours-5'].have, a['flours-5'].date], ['Flour rangers', 6, day(4)], 'Bread, Rye, Whole wheat, Spelt, AP: capitals do not make a new kind');
  assert.deepEqual([a['yeasts-2'].name, a['yeasts-2'].date], ['Yeast of Eden', day(6)]);
  assert.deepEqual([a['ap-10'].name, a['ap-10'].have, a['bread-10'].name, a['bread-10'].have], ['Soft flour', 2, 'Submissive and breadable', 1]);
  a = got({ loaves: [loaf(1, { programs: [3] }), loaf(2, { dairy: ['Buttermilk'] }), loaf(3, { flours: ['Dark rye', 'All-purpose flour', 'Bread flour'] })] });
  assert.deepEqual([a['whole-wheat'].earned, a['butter'].earned, a['rye'].earned, a['ap-10'].have, a['bread-10'].have], [true, false, true, 1, 1]);
});

test('named for what was baked', () => {
  const a = got({ loaves: [loaf(1, { name: 'Dinner Rolls' }), loaf(2, { name: 'Lotus leaf buns' }), loaf(3, { bread: 'Buttermilk biscuits' }), loaf(4, { label: 'Breadsticks' }), loaf(5, { name: 'Brunswick stew' })] });
  assert.deepEqual(['rolls', 'buns', 'biscuits', 'breadsticks'].map((id) => [a[id].name, a[id].date]),
    [['Roll with it', day(1)], ['No bun intended', day(2)], ['Mind your biscuits', day(3)], ['Unlimited breadsticks', day(4)]]);
  assert.deepEqual(earned({ loaves: [loaf(1, { name: 'Brunswick stew' }), loaf(2, { name: 'Trolls' })] }).filter((id) => ['rolls', 'buns'].includes(id)), []);
});

test('dough, proofing, tweaks and photos', () => {
  const a = got({
    loaves: [loaf(1, { dough: true, usesDough: true }), loaf(2, { usesDough: true, oven: true, proof: ['machine', 'fridge'] }), loaf(3, { added: 10, proof: ['airfryer'] }),
      loaf(4, { split: true, stages: ['knead', 'proof', 'bake'] }), loaf(5, { stages: ['bake', 'proofed', 'proof', 'knead'] })],
    recipes: [{ created: noon(1), tweaks: [noon(1)] }, { created: noon(2), tweaks: [noon(2), noon(7), noon(4), noon(9), noon(12)] }]
  });
  assert.deepEqual([a['dough'].name, a['dough'].date], ['Half-baked', day(1)]);
  assert.deepEqual([a['dough-10'].name, a['dough-10'].have], ['Pillsbury doughboy', 2]);
  assert.deepEqual([a['dough-oven'].name, a['dough-oven'].date], ['Reap what you dough', day(2)]);
  assert.deepEqual([a['fridge'].name, a['fridge'].date], ['Dough not disturb', day(2)]);
  assert.deepEqual([a['proof-all'].name, a['proof-all'].goal, a['proof-all'].date], ['The butcher, the...', 'Proof in all 3 places', day(3)]);
  assert.deepEqual([a['added'].name, a['added'].date], ['Troublebaker', day(3)]);
  assert.deepEqual([a['split'].name, a['split'].date], ['My butter half', day(4)]);
  assert.deepEqual([a['tweak'].name, a['tweak'].date], ['Bake the rules', day(4)], 'the day the second tweak was made');
  assert.deepEqual([a['tweak-v'].name, a['tweak-v'].goal, a['tweak-v'].have, a['tweak-v'].date], ['Bake it till you make it', 'Reach tweak V of a recipe', 5, day(12)]);
  assert.deepEqual([a['stages'].name, a['stages'].goal, a['stages'].date], ['Bake a leg', 'Photograph all 4 stages', day(5)]);
});

test('gifts', () => {
  const loaves = Array.from({ length: 26 }, (_, i) => loaf(i + 1, { gifted: i !== 2, rating: i === 6 ? 5 : null }));
  const a = got({ loaves });
  assert.deepEqual([a['gift-1'].name, a['gift-1'].date], ['Givers and bakers', day(1)]);
  assert.deepEqual([a['gift-5'].name, a['gift-5'].date], ['Take my bread away', day(6)], 'the third was kept');
  assert.deepEqual([a['gift-10'].name, a['gift-10'].date], ['Breaking bread', day(11)]);
  assert.deepEqual([a['gift-25'].name, a['gift-25'].date], ['Made with loaf', day(26)]);
  assert.deepEqual([a['gift-5-stars'].name, a['gift-5-stars'].date], ['Heartbaker', day(7)]);
  assert.equal(got({ loaves: [loaf(1, { rating: 5 })] })['gift-5-stars'].earned, false, 'a five-star loaf she kept');
});

test('the calendar: Christmas, Valentine’s Day and Easter', () => {
  let a = got({ loaves: [on('2026-12-24'), on('2027-02-14'), on('2027-03-26')] });
  assert.deepEqual([a['christmas'].name, a['christmas'].date], ['Loaf, actually', '2026-12-24']);
  assert.deepEqual([a['valentine'].name, a['valentine'].date], ['Don’t go baking my heart', '2027-02-14']);
  assert.deepEqual([a['easter'].name, a['easter'].date], ['Hot cross buns', '2027-03-26'], 'Good Friday 2027');
  a = got({ loaves: [on('2026-12-26'), on('2026-02-13'), on('2026-04-02'), on('2026-04-07')] });
  assert.deepEqual([a['christmas'].earned, a['valentine'].earned, a['easter'].earned], [false, false, false]);
  assert.equal(got({ loaves: [on('2026-04-05')] })['easter'].earned, true, 'Easter Sunday 2026');
  assert.equal(got({ loaves: [on('2026-04-06')] })['easter'].earned, true, 'Easter Monday');
  assert.equal(got({ loaves: [on('2026-12-25')] })['christmas'].earned, true);
});

test('Master baker counts the others', () => {
  // 25 loaves on 25 days running, each from another recipe: the 25th achievement comes with a gift
  const loaves = Array.from({ length: 25 }, (_, i) => loaf(i + 1, { flag: ['CN', 'FR', 'US', 'IN', 'DE'][i % 5], rating: 5, crust: 5, crumb: 5, taste: 5, flours: ['AP'], gifted: true }));
  const list = A.evaluate({ loaves });
  const others = list.filter((a) => a.earned && a.id !== 'earned-25'), m = by(list)['earned-25'];
  assert.ok(others.length >= 25, 'this log earns ' + others.length);
  assert.deepEqual([m.name, m.goal, m.have, m.earned], ['Master baker', 'Earn 25 achievements', others.length, true]);
  assert.equal(m.date, others.map((a) => a.date).sort()[24], 'the day the 25th was earned');
  assert.equal(by(A.evaluate({ loaves: loaves.slice(0, 3) }))['earned-25'].earned, false);
});

test('a name that replaced another is celebrated again, once', () => {
  const fr = by(A.evaluate({ loaves: [loaf(1, { flag: 'FR' }), loaf(2, { flag: 'CN' })] }));
  assert.equal(fr['country-FR'].since, '2026-11-28');
  assert.equal(A.uncelebrated(fr['country-FR'], {}), true);
  assert.equal(A.uncelebrated(fr['country-FR'], { 'country-FR': '2026-11-27' }), true, 'that was for "France"');
  assert.equal(A.uncelebrated(fr['country-FR'], { 'country-FR': '2026-11-28' }), false);
  assert.equal(A.uncelebrated(fr['country-CN'], { 'country-CN': '2026-11-27' }), false);
  assert.equal(A.uncelebrated(fr['country-DE'], {}), false, 'not earned, so nothing to celebrate');
});

test('shown with the earned first, latest on top, then the closest to being earned', () => {
  const loaves = Array.from({ length: 12 }, (_, i) => loaf(i + 1, { flag: i === 11 ? 'CN' : '' }));
  const order = A.inOrder(A.evaluate({ loaves })).map((a) => a.id);
  assert.deepEqual(order.slice(0, 2), ['country-CN', 'loaves-10']);
  assert.deepEqual(earned({ loaves }).sort(), ['country-CN', 'loaves-1', 'loaves-10', 'recipes-10', 'streak-3', 'streak-7']);
  const locked = A.inOrder(A.evaluate({ loaves })).filter((a) => !a.earned);
  assert.equal(locked[0].id, 'loaves-13', '12 of 13 is the closest');
});
