/* Achievements. Each one is worked out from the log every time it is looked at: its name, what
   earns it, how far along she is and the day it was earned. Nothing here is stored (what has
   already been celebrated is: see the store). The names are the owner's own. */
(function (root) {
  var LGT = root.LGT = root.LGT || {};
  var U = LGT.util;

  var GRAMS_PER_LB = 453.592;
  /** Southeast Asia, where "Eat, pray, loaf" ends its journey. */
  var SOUTHEAST_ASIA = ['BN', 'KH', 'ID', 'LA', 'MY', 'MM', 'PH', 'SG', 'TH', 'TL', 'VN'];

  /**
   * Reads the facts the store hands over:
   *   loaves   every baked (dated) bread:
   *            { date, created, line, name, label, bread, flag, source, rating, crust, crumb, taste,
   *              gifted, split, dough (no bake recorded), usesDough (a dough program), oven (an oven
   *              step), added (minutes added on Bake), proof[] (places), programs[], flours[],
   *              yeasts[], dairy[], stages[] (of its photos) }
   *   flour    every entry's flour, as Stats counts it: { date ('' when not baked yet), created, grams }
   *   time     every entry's time, as Stats counts it: { date, created, minutes }
   *   recipes  every recipe: { created, flag, read (it was read from a photo), tweaks[] (when each was made) }
   */
  function context(facts) {
    var loaves = (facts.loaves || []).slice().sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date)) || ((a.created || 0) - (b.created || 0));
    });
    // amounts in the order they were used; entries not baked yet come last
    function running(list, size) {
      return (list || []).map(function (x) {
        return { day: x.date || U.isoDay(x.created), dated: !!x.date, size: x[size] || 0, created: x.created || 0 };
      }).sort(function (a, b) {
        return (a.dated === b.dated ? 0 : a.dated ? -1 : 1) || a.day.localeCompare(b.day) || (a.created - b.created);
      });
    }
    return {
      loaves: loaves,
      flour: running(facts.flour, 'grams'),
      time: running(facts.time, 'minutes'),
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
  /** A running total passing a mark. `as` turns the total into the number shown. */
  function total(of, as) {
    return function (c, need) {
      var sum = 0, date = '';
      c[of].forEach(function (x) {
        var before = as(sum);
        sum += x.size;
        if (!date && before < need && as(sum) >= need) date = x.day;
      });
      return { have: as(sum), date: date };
    };
  }
  /** Pounds of flour, to the tenth Stats shows. */
  var flourUsed = total('flour', function (g) { return Math.round(g / GRAMS_PER_LB * 10) / 10; });
  /** Whole hours spent. */
  var hoursSpent = total('time', function (m) { return Math.floor(m / 60); });
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
  /** The most of something sharing a key (a recipe, a day, a recipe on a day). */
  function mostWith(keyOf) {
    return function (c, need) {
      var n = {}, best = 0, date = '';
      c.loaves.forEach(function (l) {
        var k = keyOf(l);
        if (!k) return;
        n[k] = (n[k] || 0) + 1;
        if (n[k] > best) best = n[k];
        if (!date && n[k] >= need) date = l.date;
      });
      return { have: best, date: date };
    };
  }
  var sameRecipe = mostWith(function (l) { return l.line; });
  var inOneDay = mostWith(function (l) { return l.date; });
  /** One recipe baked twice on the same day. */
  function twiceInADay(c, need) {
    var t = mostWith(function (l) { return l.line ? l.line + '|' + l.date : ''; })(c, 2);
    return { have: t.have >= 2 ? 1 : 0, date: t.have >= 2 && need <= 1 ? t.date : '' };
  }
  /** How many different kinds (of flour, yeast, proofing place…) have gone into loaves. `pick` lists a loaf's. */
  function kinds(pick) {
    return function (c, need) {
      var seen = {}, days = [];
      c.loaves.forEach(function (l) {
        (pick(l) || []).forEach(function (k) {
          k = String(k || '').trim().toLowerCase();
          if (!k || seen[k]) return;
          seen[k] = true;
          days.push(l.date);
        });
      });
      return nth(days, need);
    };
  }
  /** Recipes whose very first bake fits. */
  function firstBakesThat(fits) {
    return function (c, need) {
      var seen = {}, days = [];
      c.loaves.forEach(function (l) {
        if (!l.line || seen[l.line]) return;
        seen[l.line] = true;
        if (fits(l)) days.push(l.date);
      });
      return nth(days, need);
    };
  }
  /** The most tweaks any one recipe has. `skip` leaves out the first, which every recipe has. */
  function tweaks(skip) {
    return function (c, need) {
      var best = 0, date = '';
      c.recipes.forEach(function (r) {
        var made = (r.tweaks || []).slice().sort(function (a, b) { return a - b; }), n = made.length - skip;
        if (n > best) best = n;
        if (n >= need) {
          var day = U.isoDay(made[need + skip - 1]);
          if (!date || day < date) date = day;
        }
      });
      return { have: best, date: date };
    };
  }
  /** Several things, each done at least once: how many are done, and the day the last one was. */
  function eachOf(parts) {
    return function (c, need) {
      var days = parts.map(function (fits) { return c.when(fits)[0] || ''; }).filter(Boolean).sort();
      return { have: days.length, date: days.length >= need ? days[days.length - 1] : '' };
    };
  }

  // ---------- what a loaf is like ----------
  function named(re) { return function (l) { return re.test([l.name, l.label, l.bread].join(' ')); }; }
  function from(re) { return function (l) { return re.test(String(l.source || '')); }; }
  function has(field, re) {
    return function (l) { return (l[field] || []).some(function (t) { return re.test(String(t || '')); }); };
  }
  function program(flag) {
    return function (l) { return (l.programs || []).some(function (n) { var p = U.program(n); return !!(p && p[flag]); }); };
  }
  function either(a, b) { return function (l) { return a(l) || b(l); }; }
  function both(a, b) { return function (l) { return a(l) && b(l); }; }
  function is(field) { return function (l) { return !!l[field]; }; }
  function rated(least) { return function (l) { return l.rating !== null && l.rating !== undefined && l.rating >= least; }; }
  function stars(field, least) { return function (l) { return (l[field] || 0) >= least; }; }
  function fromCountry(code) { return function (l) { return l.flag === code; }; }
  function fromAnyOf(codes) { return function (l) { return codes.indexOf(l.flag) >= 0; }; }
  /** Month and day, as "12-25". */
  function onDay(days) { return function (l) { return days.indexOf(String(l.date).slice(5)) >= 0; }; }
  /** Easter Sunday of a year (the Western date). */
  function easter(year) {
    var a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
    var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }
  /** Good Friday to Easter Monday. */
  function atEaster(l) {
    var d = U.parseDate(l.date);
    if (!d) return false;
    var off = Math.round((d - easter(d.getFullYear())) / 86400000);
    return off >= -2 && off <= 1;
  }
  /** The name of the machine's program marked with a flag: names live in the machine data, not here. */
  function programName(flag) {
    var p = ((LGT.machine && LGT.machine.programs) || []).filter(function (x) { return x[flag]; })[0];
    return p ? p.name : '';
  }
  function allStages(l) {
    return U.STAGES.every(function (s) { return (l.stages || []).indexOf(s.id) >= 0; });
  }

  // ---------- the achievements ----------
  // name and goal are shown as they are; need is how many it takes; tally counts.
  var PLACES = U.PROOF_PLACES.length;
  var CATALOG = [
    // loaves
    { id: 'loaves-1', emoji: '🍞', name: 'Bread-y or not', goal: 'Bake your first loaf', need: 1, tally: loavesThat(any) },
    { id: 'loaves-10', emoji: '🏡', name: 'Doughmesticated', goal: 'Bake 10 loaves', need: 10, tally: loavesThat(any) },
    { id: 'loaves-13', emoji: '🧺', name: 'Baker’s dozen', goal: 'Bake 13 loaves', need: 13, tally: loavesThat(any) },
    { id: 'loaves-25', emoji: '💪', name: 'Yeast mode', goal: 'Bake 25 loaves', need: 25, tally: loavesThat(any) },
    { id: 'loaves-50', emoji: '🌾', name: 'Fifty shades of grain', goal: 'Bake 50 loaves', need: 50, tally: loavesThat(any) },
    { id: 'loaves-100', emoji: '🥇', name: 'Doughverachiever', goal: 'Bake 100 loaves', need: 100, tally: loavesThat(any) },
    { id: 'loaves-221', emoji: '🔎', name: '221B Baker Street', goal: 'Bake 221 loaves', need: 221, tally: loavesThat(any) },
    { id: 'loaves-365', emoji: '🗓️', name: 'Our daily bread', goal: 'Bake 365 loaves', need: 365, tally: loavesThat(any) },
    { id: 'loaves-500', emoji: '👑', name: 'Kingbaker', goal: 'Bake 500 loaves', need: 500, tally: loavesThat(any) },
    { id: 'streak-3', emoji: '🌅', name: 'Rise and shine', goal: 'Bake 3 days in a row', need: 3, tally: daysInARow },
    { id: 'streak-7', emoji: '😇', name: 'Seven minutes in leaven', goal: 'Bake 7 days in a row', need: 7, tally: daysInARow },
    { id: 'day-2', emoji: '🤝', name: 'Dealbaker', goal: 'Bake 2 loaves in a day', need: 2, tally: inOneDay },
    { id: 'day-5', emoji: '🏴‍☠️', name: 'Bake no prisoners', goal: 'Bake 5 loaves in a day', need: 5, tally: inOneDay },
    { id: 'twice-a-day', emoji: '⚔️', name: 'All’s fair in loaf and war', goal: 'Bake one recipe twice in a day', need: 1, tally: twiceInADay },
    { id: 'repeat-5', emoji: '💛', name: 'Fleischmann’s Fave', goal: 'Bake one recipe 5 times', need: 5, tally: sameRecipe },
    { id: 'hours-24', emoji: '🛋️', name: 'Loafing around', goal: 'Spend 24 hours baking', need: 24, tally: hoursSpent },
    { id: 'hours-100', emoji: '😅', name: 'Bread, sweat, and tears', goal: 'Spend 100 hours baking', need: 100, tally: hoursSpent },

    // flour and what goes in
    { id: 'flour-5', emoji: '🌸', name: 'Flour child', goal: 'Use 5 lb of flour', need: 5, tally: flourUsed },
    { id: 'flour-10', emoji: '🌼', name: 'Flour power', goal: 'Use 10 lb of flour', need: 10, tally: flourUsed },
    { id: 'flour-25', emoji: '🏭', name: 'Commercialized', goal: 'Use 25 lb of flour', need: 25, tally: flourUsed },
    { id: 'flour-50', emoji: '🛡️', name: 'Joan of Starch', goal: 'Use 50 lb of flour', need: 50, tally: flourUsed },
    { id: 'flour-100', emoji: '📈', name: 'Bread equity', goal: 'Use 100 lb of flour', need: 100, tally: flourUsed },
    { id: 'flours-5', emoji: '🦸', name: 'Flour rangers', goal: 'Bake with 5 kinds of flour', need: 5, tally: kinds(function (l) { return l.flours; }) },
    { id: 'ap-10', emoji: '☁️', name: 'Soft flour', goal: 'Bake 10 loaves with AP flour', need: 10,
      tally: loavesThat(has('flours', /^(ap|all[\s-]*purpose)(\s+flour)?$/i)) },
    { id: 'bread-10', emoji: '🥺', name: 'Submissive and breadable', goal: 'Bake 10 loaves with bread flour', need: 10,
      tally: loavesThat(has('flours', /^bread(\s+flour)?$/i)) },
    { id: 'whole-wheat', emoji: '🥣', name: 'Eat your wheaties', goal: 'Bake with whole wheat', need: 1,
      tally: loavesThat(either(has('flours', /whole[\s-]*(wheat|meal|grain)/i), program('wholeWheat'))) },
    { id: 'rye', emoji: '⚾', name: 'Catcher in the rye', goal: 'Bake with rye flour', need: 1, tally: loavesThat(has('flours', /\brye\b/i)) },
    { id: 'yeasts-2', emoji: '🍎', name: 'Yeast of Eden', goal: 'Bake with 2 kinds of yeast', need: 2, tally: kinds(function (l) { return l.yeasts; }) },
    { id: 'butter', emoji: '🧈', name: 'Butter together', goal: 'Bake with butter', need: 1, tally: loavesThat(has('dairy', /\bbutter\b/i)) },
    { id: 'fast', emoji: '🏎️', name: 'Knead for speed', need: 1, tally: loavesThat(program('fast')),
      goal: function () { return 'Bake on ' + (programName('fast') || 'the fastest program'); } },

    // dough, proofing and the bake
    { id: 'dough', emoji: '🫓', name: 'Half-baked', goal: 'Log a dough', need: 1, tally: loavesThat(is('dough')) },
    { id: 'dough-10', emoji: '🤭', name: 'Pillsbury doughboy', goal: 'Make 10 doughs', need: 10, tally: loavesThat(is('usesDough')) },
    { id: 'dough-oven', emoji: '🧑‍🌾', name: 'Reap what you dough', goal: 'Bake a dough in the oven', need: 1, tally: loavesThat(both(is('usesDough'), is('oven'))) },
    { id: 'fridge', emoji: '🚪', name: 'Dough not disturb', goal: 'Proof in the fridge', need: 1, tally: loavesThat(has('proof', /^fridge$/)) },
    { id: 'proof-all', emoji: '🛁', name: 'The butcher, the...', goal: 'Proof in all ' + PLACES + ' places', need: PLACES, tally: kinds(function (l) { return l.proof; }) },
    { id: 'added', emoji: '⏲️', name: 'Troublebaker', goal: 'Add time to a bake', need: 1, tally: loavesThat(function (l) { return l.added > 0; }) },
    { id: 'split', emoji: '✂️', name: 'My butter half', goal: 'Split a dough', need: 1, tally: loavesThat(is('split')) },
    { id: 'tweak', emoji: '📏', name: 'Bake the rules', goal: 'Tweak a recipe', need: 1, tally: tweaks(1) },
    { id: 'tweak-v', emoji: '🔁', name: 'Bake it till you make it', goal: 'Reach tweak ' + U.roman(5) + ' of a recipe', need: 5, tally: tweaks(0) },
    { id: 'stages', emoji: '🎭', name: 'Bake a leg', goal: 'Photograph all ' + U.STAGES.length + ' stages', need: 1, tally: loavesThat(allStages) },

    // recipes
    { id: 'recipes-10', emoji: '🥐', name: 'Roll model', goal: 'Bake 10 recipes', need: 10, tally: recipesBaked() },
    { id: 'saved-25', emoji: '📝', name: 'Easier bread than done', goal: 'Save 25 recipes', need: 25, tally: recipesSaved() },
    { id: 'saved-50', emoji: '📚', name: 'Knowledge is flour', goal: 'Save 50 recipes', need: 50, tally: recipesSaved() },
    { id: 'read', emoji: '📰', name: 'Baking news', goal: 'Read a recipe from a photo', need: 1, tally: recipesSaved(function (r) { return !!r.read; }) },
    { id: 'reddit-10', emoji: '👽', name: 'Breddit', goal: 'Bake 10 recipes from Reddit', need: 10, tally: recipesBaked(from(/reddit/i)) },
    { id: 'cuisinart-10', emoji: '🧑‍🍳', name: 'Chef de Cuisinart', goal: 'Bake 10 recipes from Cuisinart', need: 10, tally: recipesBaked(from(/cuisinart/i)) },
    { id: 'rolls', emoji: '🌀', name: 'Roll with it', goal: 'Bake rolls', need: 1, tally: loavesThat(named(/\brolls?\b/i)) },
    { id: 'buns', emoji: '🙊', name: 'No bun intended', goal: 'Bake buns', need: 1, tally: loavesThat(named(/\bbuns?\b/i)) },
    { id: 'biscuits', emoji: '🍪', name: 'Mind your biscuits', goal: 'Bake biscuits', need: 1, tally: loavesThat(named(/\bbiscuits?\b/i)) },
    { id: 'breadsticks', emoji: '♾️', name: 'Unlimited breadsticks', goal: 'Bake breadsticks', need: 1, tally: loavesThat(named(/bread\s*sticks?|grissini/i)) },

    // ratings
    { id: 'rated-4', emoji: '🌠', name: 'Rising star', goal: 'Rate a loaf 4+ stars', need: 1, tally: loavesThat(rated(4)) },
    { id: 'crust-5', emoji: '🪙', name: 'In crust we trust', goal: 'Give Crust 5 stars', need: 1, tally: loavesThat(stars('crust', 5)) },
    { id: 'crumb-5', emoji: '♣️', name: 'Crumb club', goal: 'Give Crumb 5 stars', need: 1, tally: loavesThat(stars('crumb', 5)) },
    { id: 'taste-5', emoji: '😋', name: 'Doughpamine', goal: 'Give Taste 5 stars', need: 1, tally: loavesThat(stars('taste', 5)) },
    { id: 'rated-5', emoji: '🥪', name: 'The best thing since sliced', goal: 'Rate a loaf 5 stars', need: 1, tally: loavesThat(rated(5)) },
    { id: 'rated-5x5', emoji: '🎩', name: 'Upper crust', goal: 'Rate 5 loaves 5 stars', need: 5, tally: loavesThat(rated(5)) },
    { id: 'rated-4x10', emoji: '🎓', name: 'Well-bread', goal: 'Rate 10 loaves 4+ stars', need: 10, tally: loavesThat(rated(4)) },
    { id: 'first-5', emoji: '😍', name: 'Loaf at first sight', goal: 'Rate a first bake 5 stars', need: 1, tally: firstBakesThat(rated(5)) },
    { id: 'flop', emoji: '🔥', name: 'We’re toast', goal: 'Rate a loaf 2 stars or less', need: 1,
      tally: loavesThat(function (l) { return l.rating !== null && l.rating !== undefined && l.rating <= 2; }) },

    // gifts
    { id: 'gift-1', emoji: '🎁', name: 'Givers and bakers', goal: 'Gift a bread', need: 1, tally: loavesThat(is('gifted')) },
    { id: 'gift-5', emoji: '✈️', name: 'Take my bread away', goal: 'Gift 5 breads', need: 5, tally: loavesThat(is('gifted')) },
    { id: 'gift-10', emoji: '🤲', name: 'Breaking bread', goal: 'Gift 10 breads', need: 10, tally: loavesThat(is('gifted')) },
    { id: 'gift-25', emoji: '💝', name: 'Made with loaf', goal: 'Gift 25 breads', need: 25, tally: loavesThat(is('gifted')) },
    { id: 'gift-5-stars', emoji: '💘', name: 'Heartbaker', goal: 'Gift a 5-star loaf', need: 1, tally: loavesThat(both(is('gifted'), rated(5))) },

    // the calendar
    { id: 'christmas', emoji: '🎄', name: 'Loaf, actually', goal: 'Bake at Christmas', need: 1, tally: loavesThat(onDay(['12-24', '12-25'])) },
    { id: 'valentine', emoji: '❤️', name: 'Don’t go baking my heart', goal: 'Bake on Valentine’s Day', need: 1, tally: loavesThat(onDay(['02-14'])) },
    { id: 'easter', emoji: '🐣', name: 'Hot cross buns', goal: 'Bake at Easter', need: 1, tally: loavesThat(atEaster) },

    // countries
    { id: 'countries-5', emoji: '🚶', name: 'Bakin my way downtown', goal: 'Bake from 5 countries', need: 5, tally: countriesBaked },
    { id: 'eat-pray-loaf', emoji: '🧳', name: 'Eat, pray, loaf', goal: 'Bake from Italy, India and Southeast Asia', need: 3,
      tally: eachOf([fromCountry('IT'), fromCountry('IN'), fromAnyOf(SOUTHEAST_ASIA)]) },
    { id: 'france-5', emoji: '👸', name: 'Let them eat bread', goal: 'Bake 5 breads from France', need: 5, tally: loavesThat(fromCountry('FR')) },
    { id: 'us-10', emoji: '🏛️', name: 'Doughmestic affairs', goal: 'Bake 10 breads from the US', need: 10, tally: loavesThat(fromCountry('US')) }
  ];

  // The first bread from a country. These have names; any other country she has a recipe from
  // is named for itself. A third entry is the day a name replaced the country's own: an earlier
  // celebration was for the old one, so it is celebrated again.
  var STAMPS = [
    ['US', 'Bakersfield, CA'], ['IN', 'Like naan other'], ['DE', 'Gluten tag'], ['CN', 'Bing bing'], ['GB', 'Great British Bake-off'],
    ['IL', 'Challahback girl'], ['IE', 'So da-lightful'], ['IT', 'For focaccia’s sake'], ['JP', 'Pan-chant for baking'],
    ['FR', 'Life is pain', '2026-11-28'], ['SE', 'On a roll'], ['BR', 'Kaboom pao'], ['PL', 'Everything bagel'], ['MY', 'Roti, set, go']
  ];
  var SHORT = { US: 'the US', GB: 'the UK' };
  function stamp(code, name, since) {
    var place = SHORT[code] || U.flagName(code);
    return {
      id: 'country-' + code, emoji: U.flagEmoji(code), need: 1, since: since || '',
      name: name || place, goal: 'Bake a bread from ' + place, tally: loavesThat(fromCountry(code))
    };
  }
  // Counted from the others, so they come last.
  var COLLECTORS = [
    { id: 'earned-25', emoji: '🎖️', name: 'Master baker', goal: 'Earn 25 achievements', need: 25 }
  ];

  function build(a, c) {
    var t = a.tally(c, a.need), earned = t.have >= a.need;
    return {
      id: a.id, emoji: a.emoji, name: a.name, goal: typeof a.goal === 'function' ? a.goal() : a.goal,
      need: a.need, have: t.have, earned: earned, date: earned ? t.date : '', since: a.since || ''
    };
  }

  /** Every achievement: the catalog, the countries (named, then any other she has a recipe from), the collectors. */
  function evaluate(facts) {
    var c = context(facts || {});
    var list = CATALOG.map(function (a) { return build(a, c); });
    var taken = {}, others = {};
    STAMPS.forEach(function (s) {
      taken[s[0]] = true;
      list.push(build(stamp(s[0], s[1], s[2]), c));
    });
    c.recipes.concat(c.loaves).forEach(function (x) {
      var code = U.cleanFlag(x.flag);
      if (code && code !== U.GLOBAL && !taken[code]) others[code] = true;
    });
    Object.keys(others).sort(function (a, b) { return U.flagName(a).localeCompare(U.flagName(b)); }).forEach(function (code) {
      list.push(build(stamp(code), c));
    });
    var days = list.filter(function (a) { return a.earned; }).map(function (a) { return a.date; }).sort();
    COLLECTORS.forEach(function (a) {
      list.push(build(Object.assign({ tally: function (x, need) { return nth(days, need); } }, a), c));
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

  /** Whether one has still to be celebrated, given the day each was (`seen`: id → day). */
  function uncelebrated(a, seen) {
    var day = seen && seen[a.id];
    return a.earned && (!day || (!!a.since && String(day) < a.since));
  }

  LGT.achievements = { evaluate: evaluate, inOrder: inOrder, uncelebrated: uncelebrated, SOUTHEAST_ASIA: SOUTHEAST_ASIA };
})(typeof window !== 'undefined' ? window : globalThis);
