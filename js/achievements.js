/* Achievements. Each one is worked out from the log every time it is looked at: its name, what
   earns it, how far along she is and the day it was earned. Nothing here is stored (what has
   already been celebrated is: see the store). The names are the owner's own. */
(function (root) {
  var LGT = root.LGT = root.LGT || {};
  var U = LGT.util;

  var GRAMS_PER_LB = 453.592;

  /**
   * Reads the facts the store hands over:
   *   loaves   every baked (dated) bread:
   *            { date, created, line, name, label, bread, flag, source, rating, taste, programs[], flours[] }
   *   flour    every entry's flour, as Stats counts it: { date ('' when not baked yet), created, grams }
   *   recipes  every recipe: { created, flag, read (it was read from a photo) }
   */
  function context(facts) {
    var loaves = (facts.loaves || []).slice().sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date)) || ((a.created || 0) - (b.created || 0));
    });
    return {
      loaves: loaves,
      // flour in the order it was used; entries not baked yet come last
      flour: (facts.flour || []).map(function (f) {
        return { day: f.date || U.isoDay(f.created), dated: !!f.date, grams: f.grams || 0, created: f.created || 0 };
      }).sort(function (a, b) {
        return (a.dated === b.dated ? 0 : a.dated ? -1 : 1) || a.day.localeCompare(b.day) || (a.created - b.created);
      }),
      recipes: (facts.recipes || []).slice().sort(function (a, b) { return (a.created || 0) - (b.created || 0); }),
      /** The day of every loaf that fits. */
      when: function (fits) { return loaves.filter(fits).map(function (l) { return l.date; }); },
      /** The day each distinct thing (a recipe, a country…) was first baked. */
      first: function (keyOf, fits) {
        var seen = {}, out = [];
        loaves.forEach(function (l) {
          if (fits && !fits(l)) return;
          var k = keyOf(l);
          if (!k || seen[k]) return;
          seen[k] = true;
          out.push(l.date);
        });
        return out;
      }
    };
  }

  // ---------- ways of counting ----------
  // Each returns { have, date }: how far along she is, and the day the goal was reached ('' if not yet).
  function nth(days, need) { return { have: days.length, date: days.length >= need ? days[need - 1] : '' }; }
  function any() { return true; }
  function country(l) { return l.flag && l.flag !== U.GLOBAL ? l.flag : ''; }

  function loavesThat(fits) { return function (c, need) { return nth(c.when(fits), need); }; }
  function recipesBaked(fits) {
    return function (c, need) { return nth(c.first(function (l) { return l.line; }, fits), need); };
  }
  function countriesBaked(c, need) { return nth(c.first(country), need); }
  function recipesSaved(fits) {
    return function (c, need) {
      return nth(c.recipes.filter(fits || any).map(function (r) { return U.isoDay(r.created); }), need);
    };
  }
  /** Pounds of flour, to the tenth Stats shows. */
  function flourUsed(c, need) {
    var grams = 0, date = '', lb = function (g) { return Math.round(g / GRAMS_PER_LB * 10) / 10; };
    c.flour.forEach(function (f) {
      var before = lb(grams);
      grams += f.grams;
      if (!date && before < need && lb(grams) >= need) date = f.day;
    });
    return { have: lb(grams), date: date };
  }
  /** The longest run of days in a row with a bake. */
  function daysInARow(c, need) {
    var seen = {}, best = 0, run = 0, prev = null, date = '';
    c.loaves.forEach(function (l) {
      var t = U.parseDate(l.date);
      if (!t || seen[l.date]) return;
      seen[l.date] = true;
      run = prev && Math.round((t - prev) / 86400000) === 1 ? run + 1 : 1;
      prev = t;
      if (run > best) best = run;
      if (!date && run >= need) date = l.date;
    });
    return { have: best, date: date };
  }
  /** The most times any one recipe has been baked. */
  function sameRecipe(c, need) {
    var n = {}, best = 0, date = '';
    c.loaves.forEach(function (l) {
      if (!l.line) return;
      n[l.line] = (n[l.line] || 0) + 1;
      if (n[l.line] > best) best = n[l.line];
      if (!date && n[l.line] >= need) date = l.date;
    });
    return { have: best, date: date };
  }

  function named(re) {
    return function (l) { return re.test([l.name, l.label, l.bread].join(' ')); };
  }
  function from(re) { return function (l) { return re.test(String(l.source || '')); }; }
  function flourLike(re) {
    return function (l) { return (l.flours || []).some(function (t) { return re.test(String(t || '')); }); };
  }
  function program(flag) {
    return function (l) { return (l.programs || []).some(function (n) { var p = U.program(n); return !!(p && p[flag]); }); };
  }
  function either(a, b) { return function (l) { return a(l) || b(l); }; }
  /** The name of the machine's program marked with a flag: names live in the machine data, not here. */
  function programName(flag) {
    var p = ((LGT.machine && LGT.machine.programs) || []).filter(function (x) { return x[flag]; })[0];
    return p ? p.name : '';
  }

  // ---------- the achievements ----------
  // name and goal are shown as they are; need is how many it takes; tally counts.
  var CATALOG = [
    { id: 'loaves-1', group: 'loaves', emoji: '🍞', name: 'Bread-y or not', goal: 'Bake your first loaf', need: 1, tally: loavesThat(any) },
    { id: 'loaves-10', group: 'loaves', emoji: '🏡', name: 'Doughmesticated', goal: 'Bake 10 loaves', need: 10, tally: loavesThat(any) },
    { id: 'loaves-25', group: 'loaves', emoji: '💪', name: 'Yeast mode', goal: 'Bake 25 loaves', need: 25, tally: loavesThat(any) },
    { id: 'loaves-50', group: 'loaves', emoji: '🌾', name: 'Fifty shades of grain', goal: 'Bake 50 loaves', need: 50, tally: loavesThat(any) },
    { id: 'loaves-100', group: 'loaves', emoji: '🥇', name: 'Doughverachiever', goal: 'Bake 100 loaves', need: 100, tally: loavesThat(any) },
    { id: 'loaves-365', group: 'loaves', emoji: '🗓️', name: 'Our daily bread', goal: 'Bake 365 loaves', need: 365, tally: loavesThat(any) },
    { id: 'streak-3', group: 'loaves', emoji: '🔥', name: 'On a roll', goal: 'Bake 3 days in a row', need: 3, tally: daysInARow },
    { id: 'repeat-5', group: 'loaves', emoji: '💛', name: 'Fleischmann’s Fave', goal: 'Bake one recipe 5 times', need: 5, tally: sameRecipe },

    { id: 'flour-10', group: 'flour', emoji: '🌼', name: 'Flour power', goal: 'Use 10 lb of flour', need: 10, tally: flourUsed },
    { id: 'flour-25', group: 'flour', emoji: '🏭', name: 'Commercialized', goal: 'Use 25 lb of flour', need: 25, tally: flourUsed },
    { id: 'whole-wheat', group: 'flour', emoji: '🥣', name: 'Eat your wheaties', goal: 'Bake with whole wheat', need: 1,
      tally: loavesThat(either(flourLike(/whole[\s-]*(wheat|meal|grain)/i), program('wholeWheat'))) },
    { id: 'rye', group: 'flour', emoji: '⚾', name: 'Catcher in the rye', goal: 'Bake with rye flour', need: 1, tally: loavesThat(flourLike(/\brye\b/i)) },
    { id: 'fast', group: 'flour', emoji: '🏎️', name: 'Knead for speed', need: 1, tally: loavesThat(program('fast')),
      goal: function () { return 'Bake on ' + (programName('fast') || 'the fastest program'); } },

    { id: 'recipes-10', group: 'recipes', emoji: '🥐', name: 'Roll model', goal: 'Bake 10 recipes', need: 10, tally: recipesBaked() },
    { id: 'saved-50', group: 'recipes', emoji: '📚', name: 'Knowledge is flour', goal: 'Save 50 recipes', need: 50, tally: recipesSaved() },
    { id: 'read', group: 'recipes', emoji: '📰', name: 'Baking news', goal: 'Read a recipe from a photo', need: 1,
      tally: recipesSaved(function (r) { return !!r.read; }) },
    { id: 'reddit-10', group: 'recipes', emoji: '👽', name: 'Breddit', goal: 'Bake 10 recipes from Reddit', need: 10, tally: recipesBaked(from(/reddit/i)) },
    { id: 'cuisinart-10', group: 'recipes', emoji: '🧑‍🍳', name: 'Chef de Cuisinart', goal: 'Bake 10 recipes from Cuisinart', need: 10,
      tally: recipesBaked(from(/cuisinart/i)) },
    { id: 'challah', group: 'recipes', emoji: '🎤', name: 'Challahback girl', goal: 'Bake Challah', need: 1, tally: loavesThat(named(/\bchallah/i)) },

    { id: 'rated-4', group: 'ratings', emoji: '🌠', name: 'Rising star', goal: 'Rate a loaf 4+ stars', need: 1,
      tally: loavesThat(function (l) { return l.rating !== null && l.rating !== undefined && l.rating >= 4; }) },
    { id: 'taste-5', group: 'ratings', emoji: '😋', name: 'Doughpamine', goal: 'Give Taste 5 stars', need: 1,
      tally: loavesThat(function (l) { return l.taste >= 5; }) },
    { id: 'rated-5', group: 'ratings', emoji: '🥪', name: 'The best thing since sliced', goal: 'Rate a loaf 5 stars', need: 1,
      tally: loavesThat(function (l) { return l.rating !== null && l.rating !== undefined && l.rating >= 5; }) },

    { id: 'countries-3', group: 'countries', emoji: '🧳', name: 'Eat, pray, loaf', goal: 'Bake from 3 countries', need: 3, tally: countriesBaked },
    { id: 'country-US', group: 'countries', country: 'US', name: 'Bakersfield, CA', goal: 'Bake a bread from the US' },
    { id: 'country-IN', group: 'countries', country: 'IN', name: 'Like naan other', goal: 'Bake a bread from India' },
    { id: 'country-DE', group: 'countries', country: 'DE', name: 'Gluten tag', goal: 'Bake a bread from Germany' },
    { id: 'country-CN', group: 'countries', country: 'CN', name: 'Bing bing', goal: 'Bake a bread from China' },
    { id: 'country-GB', group: 'countries', country: 'GB', name: 'Great British Bake-off', goal: 'Bake a bread from the UK' }
  ];

  /** The first bread from a country. The ones above have names; any other country is its own name. */
  function stamp(a) {
    var code = a.country, place = U.flagName(code);
    return {
      id: a.id || 'country-' + code, group: 'countries', emoji: U.flagEmoji(code), need: 1,
      name: a.name || place, goal: a.goal || 'Bake a bread from ' + place,
      tally: loavesThat(function (l) { return l.flag === code; })
    };
  }

  function build(a, c) {
    if (a.country) a = stamp(a);
    var t = a.tally(c, a.need), earned = t.have >= a.need;
    return {
      id: a.id, group: a.group, emoji: a.emoji, name: a.name,
      goal: typeof a.goal === 'function' ? a.goal() : a.goal,
      need: a.need, have: t.have, earned: earned, date: earned ? t.date : ''
    };
  }

  /** Every achievement, in the catalog's order, then one for each other country she has a recipe from. */
  function evaluate(facts) {
    var c = context(facts || {});
    var list = CATALOG.map(function (a) { return build(a, c); });
    var taken = {}, others = {};
    CATALOG.forEach(function (a) { if (a.country) taken[a.country] = true; });
    c.recipes.concat(c.loaves).forEach(function (x) {
      var code = U.cleanFlag(x.flag);
      if (code && code !== U.GLOBAL && !taken[code]) others[code] = true;
    });
    Object.keys(others).sort(function (a, b) { return U.flagName(a).localeCompare(U.flagName(b)); }).forEach(function (code) {
      list.push(build({ country: code }, c));
    });
    return list;
  }

  /** Earned first, the latest on top; then the ones closest to being earned. */
  function inOrder(list) {
    return list.map(function (a, i) { return [a, i]; }).sort(function (x, y) {
      var a = x[0], b = y[0];
      if (a.earned !== b.earned) return a.earned ? -1 : 1;
      if (a.earned) return String(b.date).localeCompare(String(a.date)) || (x[1] - y[1]);
      return (Math.min(b.have / b.need, 1) - Math.min(a.have / a.need, 1)) || (x[1] - y[1]);
    }).map(function (x) { return x[0]; });
  }

  LGT.achievements = { evaluate: evaluate, inOrder: inOrder };
})(typeof window !== 'undefined' ? window : globalThis);
