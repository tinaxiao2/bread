/* Pure helpers: dates, times, amounts, ratings, machine lookups and recipe comparison.
   No DOM access except the image helpers at the bottom, so most of this runs in Node for tests. */
(function (root) {
  var LGT = root.LGT = root.LGT || {};

  // ---------- dates ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function parseDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function fmtDate(iso, long) {
    var d = parseDate(iso);
    if (!d) return '';
    var opts = long
      ? { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }
      : { month: 'short', day: 'numeric' };
    if (!long && d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString(undefined, opts);
  }

  // ---------- numbers and times ----------
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function fmtMinutes(min) {
    min = num(min);
    if (min === null) return '';
    min = Math.round(min);
    var h = Math.floor(min / 60), m = min % 60;
    if (!h) return m + ' min';
    return h + ' h' + (m ? ' ' + m + ' min' : '');
  }
  function splitMinutes(min) {
    min = num(min);
    if (min === null) return { h: '', m: '' };
    return { h: String(Math.floor(min / 60)), m: String(Math.round(min % 60)) };
  }
  function joinMinutes(h, m) {
    var hh = num(h), mm = num(m);
    if (hh === null && mm === null) return null;
    return Math.max(0, Math.round((hh || 0) * 60 + (mm || 0)));
  }

  // ---------- amounts ----------
  var GLYPH = {
    '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾',
    '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞'
  };
  var FRACTION = {};
  Object.keys(GLYPH).forEach(function (k) { FRACTION[GLYPH[k]] = k; });

  /** "2 7/8" -> "2⅞", "1/2" -> "½". Anything it does not recognise is left alone. */
  function prettyAmount(s) {
    return String(s == null ? '' : s).trim().replace(/(?:(\d+)\s+)?\b(\d)\/(\d)\b/g, function (m, whole, a, b) {
      var g = GLYPH[a + '/' + b];
      return g ? (whole || '') + g : m;
    });
  }
  /** A single quantity as a number ("2 7/8", "2⅞", "1.5"), or null for anything else. */
  function parseAmount(s) {
    s = String(s == null ? '' : s).replace(/[½⅓⅔¼¾⅛⅜⅝⅞]/g, function (g) { return ' ' + FRACTION[g]; }).trim();
    var m = /^(\d+(?:\.\d+)?)?\s*(?:(\d+)\/(\d+))?$/.exec(s);
    if (!m || (!m[1] && !m[2])) return null;
    var v = (m[1] ? parseFloat(m[1]) : 0) + (m[2] ? m[2] / m[3] : 0);
    return isFinite(v) ? v : null;
  }

  var UNITS = ['cup', 'tbsp', 'tsp', 'g', 'ml', 'oz', 'lb', ''];
  function unitLabel(unit, amount) {
    if (unit === 'cup') { var v = parseAmount(amount); return v !== null && v > 1 ? 'cups' : 'cup'; }
    return unit || '';
  }
  function amountLabel(ing) {
    var a = prettyAmount(ing.amount), u = unitLabel(ing.unit, ing.amount);
    return a && u ? a + ' ' + u : a || '';
  }

  // ---------- ingredients ----------
  var GROUPS = ['flour', 'water', 'dairy', 'yeast', 'other'];
  var GROUP_LABEL = { flour: 'Flour', water: 'Water', dairy: 'Dairy', yeast: 'Yeast', other: 'Other' };
  var DEFAULT_TYPES = {
    flour: ['Bread', 'AP'],
    dairy: ['Milk', 'Butter'],
    yeast: ['Instant', 'Active dry', 'Bread machine']
  };
  var DEFAULT_UNIT = { flour: 'cup', water: 'cup', dairy: 'cup', yeast: 'tsp', other: 'tsp' };
  var TYPE_UNIT = { Butter: 'tbsp' };

  function ingredientName(ing) {
    var t = (ing.type || '').trim();
    if (ing.group === 'flour') return t ? (/flour/i.test(t) ? t : t + ' flour') : 'Flour';
    if (ing.group === 'water') return 'Water';
    if (ing.group === 'dairy') return t || 'Dairy';
    if (ing.group === 'yeast') return 'Yeast';
    return t;
  }
  /** The small print beside an ingredient: the yeast kind and any note. */
  function ingredientDetail(ing) {
    var parts = [];
    if (ing.group === 'yeast' && ing.type) parts.push(ing.type);
    if (ing.note) parts.push(ing.note);
    return parts.join(', ');
  }
  function newIngredient(group, like) {
    var type = group === 'flour' ? 'Bread' : group === 'dairy' ? 'Milk' : '';
    return { group: group, type: type, amount: '', unit: (like && like.unit) || DEFAULT_UNIT[group], note: '' };
  }
  function cleanIngredient(i) {
    return {
      group: GROUPS.indexOf(i.group) >= 0 ? i.group : 'other',
      type: String(i.type || '').trim(),
      amount: String(i.amount || '').trim(),
      unit: UNITS.indexOf(i.unit) >= 0 ? i.unit : '',
      note: String(i.note || '').trim()
    };
  }
  function isBlankIngredient(i) {
    return !i.amount && !i.note && !(i.group === 'other' && i.type);
  }
  function sortIngredients(list) {
    return list.map(function (i, n) { return [i, n]; }).sort(function (a, b) {
      return (GROUPS.indexOf(a[0].group) - GROUPS.indexOf(b[0].group)) || (a[1] - b[1]);
    }).map(function (x) { return x[0]; });
  }

  // ---------- recipes ----------
  function emptyRecipe() {
    return {
      name: '',
      ingredients: [newIngredient('flour'), newIngredient('water'), newIngredient('dairy'), newIngredient('yeast')],
      bake: { program: null, size: '', crust: '', minutes: null, added: null, reason: '', ovenTemp: null, ovenMinutes: null },
      method: '', source: '', link: '', originals: [], basedOn: null
    };
  }
  function cleanBake(b) {
    b = b || {};
    return {
      program: num(b.program), size: b.size || '', crust: b.crust || '',
      minutes: num(b.minutes), added: num(b.added), reason: String(b.reason || '').trim(),
      ovenTemp: num(b.ovenTemp), ovenMinutes: num(b.ovenMinutes)
    };
  }
  /** The shape a recipe is stored in: trimmed, blank rows dropped, groups in a fixed order. */
  function cleanRecipe(r) {
    return {
      name: String(r.name || '').trim(),
      ingredients: sortIngredients((r.ingredients || []).map(cleanIngredient).filter(function (i) { return !isBlankIngredient(i); })),
      bake: cleanBake(r.bake),
      method: String(r.method || '').trim(),
      source: String(r.source || '').trim(),
      link: safeLink(r.link),
      originals: (r.originals || []).slice(),
      basedOn: r.basedOn || null
    };
  }
  /** True when nothing about a recipe was entered, so there is no card to make. */
  function isEmptyRecipe(r) {
    var c = cleanRecipe(r), b = c.bake;
    return !c.ingredients.length && !c.method && !c.source && !c.link && !c.originals.length &&
      b.program === null && !b.size && !b.crust && b.minutes === null && b.added === null && !b.reason &&
      b.ovenTemp === null && b.ovenMinutes === null;
  }
  /** What makes two recipes "the same bake": the ingredients and the baking details. */
  function recipeKey(r) {
    var c = cleanRecipe(r);
    return JSON.stringify([c.ingredients, c.bake]);
  }
  function sameDetails(a, b) {
    var x = cleanRecipe(a), y = cleanRecipe(b);
    return x.method === y.method && x.source === y.source && x.link === y.link &&
      JSON.stringify(x.originals) === JSON.stringify(y.originals);
  }
  /**
   * Decide where a bread's recipe goes when the bread is saved.
   * base: the recipe the form started from (or null). draft: the recipe as edited.
   * others: how many OTHER breads use the base recipe.
   * -> { action: 'create' | 'update' | 'keep', id?, basedOn? }
   */
  function planRecipeSave(base, draft, others) {
    if (!base) return { action: 'create', basedOn: null };
    if (recipeKey(base) === recipeKey(draft)) {
      return sameDetails(base, draft) ? { action: 'keep', id: base.id } : { action: 'update', id: base.id };
    }
    return others > 0 ? { action: 'create', basedOn: base.id } : { action: 'update', id: base.id };
  }
  function ingredientSummary(recipe) {
    return (recipe.ingredients || []).map(function (i) {
      return { name: ingredientName(i), amount: amountLabel(i) };
    }).filter(function (x) { return x.name; });
  }

  // ---------- ratings ----------
  var RATINGS = [['crust', 'Crust'], ['crumb', 'Crumb'], ['taste', 'Taste']];
  function rating(bread) {
    var r = (bread && bread.ratings) || {};
    var v = RATINGS.map(function (k) { return num(r[k[0]]) || 0; }).filter(function (x) { return x > 0; });
    if (!v.length) return null;
    return v.reduce(function (a, b) { return a + b; }, 0) / v.length;
  }
  function fmtRating(x) { return x === null || x === undefined ? '' : x.toFixed(1); }

  // ---------- machine ----------
  function program(n) {
    var list = (LGT.machine && LGT.machine.programs) || [];
    for (var i = 0; i < list.length; i++) if (list[i].n === num(n)) return list[i];
    return null;
  }
  /** Loaf sizes on offer: every size until a program is chosen, then only the ones that program has. */
  function sizesFor(n) {
    var p = program(n), all = (LGT.machine && LGT.machine.sizes) || [];
    if (!p) return all.slice();
    if (!p.minutes) return [];
    return all.filter(function (s) { return p.minutes[s.id] != null; });
  }
  function hasCrust(n) { var p = program(n); return p ? !!p.crust : true; }
  function isDough(n) { var p = program(n); return !!(p && p.dough); }
  function programMinutes(n, size) {
    var p = program(n);
    if (!p) return null;
    if (p.minutes) return p.minutes[size] != null ? p.minutes[size] : null;
    return p.total != null ? p.total : null;
  }
  function sizeLabel(id) {
    var s = ((LGT.machine && LGT.machine.sizes) || []).filter(function (x) { return x.id === id; })[0];
    return s ? s.label : (id ? id + ' lb' : '');
  }
  function crustLabel(id) {
    var c = ((LGT.machine && LGT.machine.crusts) || []).filter(function (x) { return x.id === id; })[0];
    return c ? c.label : '';
  }
  /** Apply a change to the baking details, keeping size, crust and time consistent with the program. */
  function withBake(bake, patch) {
    var next = Object.assign({}, bake, patch);
    var wasAuto = bake.minutes === null || bake.minutes === undefined ||
      bake.minutes === programMinutes(bake.program, bake.size);
    if ('program' in patch || 'size' in patch) {
      var sizes = sizesFor(next.program);
      if (!sizes.some(function (s) { return s.id === next.size; })) next.size = sizes.length === 1 ? sizes[0].id : '';
      if (!hasCrust(next.program)) next.crust = '';
      if (wasAuto && !('minutes' in patch)) next.minutes = programMinutes(next.program, next.size);
    }
    return next;
  }

  // ---------- links ----------
  function safeLink(s) {
    s = String(s || '').trim();
    if (!s || /\s/.test(s)) return '';
    if (/^https:\/\//i.test(s)) return s;
    if (/^http:\/\//i.test(s)) return 'https://' + s.slice(7);
    if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(s)) return 'https://' + s;
    return '';
  }

  // ---------- images (browser only) ----------
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { resolve({ img: img, release: function () { URL.revokeObjectURL(url); } }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }
  /** Draw a region of an image (the whole image by default) no larger than `max` on its long side. */
  function drawToBlob(img, max, quality, region) {
    var r = region || { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    var scale = Math.min(1, max / Math.max(r.w, r.h));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(r.w * scale));
    canvas.height = Math.max(1, Math.round(r.h * scale));
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('image')); }, 'image/jpeg', quality || 0.85);
    });
  }
  function resizeImage(file, max, quality) {
    return loadImage(file).then(function (h) {
      return drawToBlob(h.img, max, quality).then(function (b) { h.release(); return b; }, function (e) { h.release(); throw e; });
    });
  }

  LGT.util = {
    today: today, parseDate: parseDate, fmtDate: fmtDate,
    num: num, fmtMinutes: fmtMinutes, splitMinutes: splitMinutes, joinMinutes: joinMinutes,
    prettyAmount: prettyAmount, parseAmount: parseAmount, amountLabel: amountLabel, unitLabel: unitLabel,
    UNITS: UNITS, GROUPS: GROUPS, GROUP_LABEL: GROUP_LABEL, DEFAULT_TYPES: DEFAULT_TYPES, DEFAULT_UNIT: DEFAULT_UNIT, TYPE_UNIT: TYPE_UNIT,
    ingredientName: ingredientName, ingredientDetail: ingredientDetail, newIngredient: newIngredient,
    cleanIngredient: cleanIngredient, isBlankIngredient: isBlankIngredient,
    emptyRecipe: emptyRecipe, isEmptyRecipe: isEmptyRecipe, cleanRecipe: cleanRecipe, cleanBake: cleanBake, recipeKey: recipeKey,
    planRecipeSave: planRecipeSave, ingredientSummary: ingredientSummary,
    RATINGS: RATINGS, rating: rating, fmtRating: fmtRating,
    program: program, sizesFor: sizesFor, hasCrust: hasCrust, isDough: isDough,
    programMinutes: programMinutes, sizeLabel: sizeLabel, crustLabel: crustLabel, withBake: withBake,
    safeLink: safeLink, loadImage: loadImage, drawToBlob: drawToBlob, resizeImage: resizeImage
  };
})(typeof window !== 'undefined' ? window : globalThis);
