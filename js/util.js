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

  var UNITS = ['g', 'cup', 'tbsp', 'tsp', 'ml', 'oz', 'lb', ''];
  function unitLabel(unit, amount) {
    if (unit === 'cup') { var v = parseAmount(amount); return v !== null && v > 1 ? 'cups' : 'cup'; }
    return unit || '';
  }
  function amountLabel(ing) {
    var a = prettyAmount(ing.amount), u = unitLabel(ing.unit, ing.amount);
    return a && u ? a + ' ' + u : a || '';
  }

  // ---------- ingredients ----------
  var GROUPS = ['flour', 'water', 'dairy', 'yeast', 'salt', 'other'];
  var GROUP_LABEL = { flour: 'Flour', water: 'Water', dairy: 'Dairy', yeast: 'Yeast', salt: 'Salt', other: 'Other' };
  /** The kinds offered for each group. */
  var DEFAULT_TYPES = {
    flour: ['AP', 'Bread'],
    water: ['Lukewarm', 'Warm', 'Hot'],
    dairy: ['Milk', 'Butter'],
    yeast: ['Active dry', 'Instant', 'Bread machine']
  };
  /** The kind a new row starts with. */
  var DEFAULT_TYPE = { flour: 'AP', water: '', dairy: 'Milk', yeast: 'Active dry', salt: '', other: '' };
  /** Every measurement starts in grams. */
  var DEFAULT_UNIT = 'g';
  /** Named ingredients that are always one tap away. */
  var STAPLES = ['Sugar'];
  /** The rows a blank recipe starts with. */
  var STARTING = ['flour', 'water', 'yeast', 'salt'];

  /** Salt has its own row now; the first version kept it as a named "other" ingredient. */
  function regroup(i) {
    var group = GROUPS.indexOf(i.group) >= 0 ? i.group : 'other';
    var type = String(i.type || '').trim();
    if (group === 'other' && /^salt$/i.test(type)) return { group: 'salt', type: '' };
    return { group: group, type: group === 'salt' ? '' : type };
  }
  /** The same row, brought up to date, keeping anything else the form keeps on it. */
  function upgradeIngredient(i) { return Object.assign({}, i, regroup(i)); }

  function ingredientName(ing) {
    var t = (ing.type || '').trim();
    if (ing.group === 'flour') return t ? (/flour/i.test(t) ? t : t + ' flour') : 'Flour';
    if (ing.group === 'water') return t ? (/water/i.test(t) ? t : t + ' water') : 'Water';
    if (ing.group === 'dairy') return t || 'Dairy';
    if (ing.group === 'yeast') return 'Yeast';
    if (ing.group === 'salt') return 'Salt';
    return t;
  }
  /** The small print beside an ingredient: the yeast kind and any note. */
  function ingredientDetail(ing) {
    var parts = [];
    if (ing.group === 'yeast' && ing.type) parts.push(ing.type);
    if (ing.note) parts.push(ing.note);
    return parts.join(', ');
  }
  /** A new row. `_auto` marks one that was offered rather than typed: left without an amount, it is not saved. */
  function newIngredient(group, type) {
    if (type === undefined || type === null) type = DEFAULT_TYPE[group] || '';
    return { group: group, type: type, amount: '', unit: DEFAULT_UNIT, note: '', _auto: true };
  }
  function cleanIngredient(i) {
    var g = regroup(i);
    return {
      group: g.group,
      type: g.type,
      amount: String(i.amount || '').trim(),
      unit: UNITS.indexOf(i.unit) >= 0 ? i.unit : '',
      note: String(i.note || '').trim()
    };
  }
  function isBlankIngredient(i) {
    var c = cleanIngredient(i);
    return !c.amount && !c.note && (!!i._auto || !(c.group === 'other' && c.type));
  }
  function sortIngredients(list) {
    return list.map(function (i, n) { return [i, n]; }).sort(function (a, b) {
      return (GROUPS.indexOf(a[0].group) - GROUPS.indexOf(b[0].group)) || (a[1] - b[1]);
    }).map(function (x) { return x[0]; });
  }
  function lineKey(i) {
    return [i.group, String(i.type || '').toLowerCase(), i.amount, i.unit].join('|');
  }
  /** Which of `other`'s ingredient lines are not in `base` exactly, as a list of true/false. */
  function changedLines(base, other) {
    var seen = {};
    ((base && base.ingredients) || []).forEach(function (i) { seen[lineKey(cleanIngredient(i))] = true; });
    return ((other && other.ingredients) || []).map(function (i) { return !seen[lineKey(cleanIngredient(i))]; });
  }

  // ---------- recipes ----------
  function emptyRecipe() {
    return {
      name: '',
      ingredients: STARTING.map(function (g) { return newIngredient(g); }),
      bake: cleanBake({}),
      method: '', source: '', link: '', parent: '', flag: '', originals: [], basedOn: null
    };
  }
  /** The programs a bake used, in the order chosen. Older entries kept a single `program`. */
  function programsOf(b) {
    var list = Array.isArray(b.programs) ? b.programs
      : (b.program === null || b.program === undefined || b.program === '' ? [] : [b.program]);
    var out = [];
    list.forEach(function (n) { n = num(n); if (n !== null && program(n) && out.indexOf(n) < 0) out.push(n); });
    return out;
  }
  /** The shape the baking details are stored in. */
  /** Where dough can be proofed. Several can be used for one bake. */
  var PROOF_PLACES = [
    { id: 'machine', label: 'Bread machine' },
    { id: 'airfryer', label: 'Air fryer' },
    { id: 'fridge', label: 'Fridge' }
  ];
  var DEFAULT_PROOF = ['machine'];
  /** The proofing places, in a fixed order. Entries saved before proofing was logged were proofed in the machine. */
  function proofOf(b) {
    if (!Array.isArray(b.proof)) return DEFAULT_PROOF.slice();
    return PROOF_PLACES.map(function (p) { return p.id; }).filter(function (id) { return b.proof.indexOf(id) >= 0; });
  }
  function proofLabels(ids) {
    return PROOF_PLACES.filter(function (p) { return ids.indexOf(p.id) >= 0; }).map(function (p) { return p.label; });
  }
  function cleanBake(b) {
    b = b || {};
    var programs = programsOf(b), added = num(b.added), manual = manualProgram();
    // Time added by hand is the manual program's time, so having one means the other was used.
    if (added !== null && manual && programs.indexOf(manual.n) < 0) programs.push(manual.n);
    var extra = !manual || hasManual(programs);
    return {
      programs: programs, size: b.size || '', crust: b.crust || '', minutes: num(b.minutes),
      added: extra ? added : null, reason: extra ? String(b.reason || '').trim() : '',
      proof: proofOf(b), proofMinutes: num(b.proofMinutes),
      ovenTemp: num(b.ovenTemp), ovenMinutes: num(b.ovenMinutes)
    };
  }
  /** The shape a recipe is stored in: trimmed, blank rows dropped, groups in a fixed order. */
  function cleanRecipe(r) {
    return {
      name: String(r.name || '').trim(),
      ingredients: sortIngredients((r.ingredients || []).filter(function (i) { return !isBlankIngredient(i); }).map(cleanIngredient)),
      bake: cleanBake(r.bake),
      method: String(r.method || '').trim(),
      source: cleanSource(r.source),
      link: safeLink(r.link),
      parent: String(r.parent || '').trim(),
      flag: cleanFlag(r.flag),
      originals: (r.originals || []).slice(),
      basedOn: r.basedOn || null
    };
  }
  /** Where a recipe is from. Anything from Reddit is saved as just "Reddit": the link carries the rest. */
  function cleanSource(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return /reddit|(^|[\s,(])\/?r\/\w|(^|[\s,(])\/?u\/\w/i.test(s) ? 'Reddit' : s;
  }
  /** True when nothing about a recipe was entered, so there is no card to make. */
  function isEmptyRecipe(r) {
    var c = cleanRecipe(r), b = c.bake;
    return !c.ingredients.length && !c.method && !c.source && !c.link && !c.parent && !c.flag && !c.originals.length &&
      !b.programs.length && !b.size && !b.crust && b.minutes === null && b.added === null && !b.reason &&
      b.ovenTemp === null && b.ovenMinutes === null && b.proofMinutes === null;
  }
  /** What makes two bakes the same variation: the ingredients and the baking details. */
  function recipeKey(r) {
    var c = cleanRecipe(r), bake = Object.assign({}, c.bake);
    delete bake.reason;
    return JSON.stringify([c.ingredients, bake]);
  }
  function sameDetails(a, b) {
    var x = cleanRecipe(a), y = cleanRecipe(b);
    return x.method === y.method && x.source === y.source && x.link === y.link && x.bake.reason === y.bake.reason &&
      nameKey(x.parent) === nameKey(y.parent) && x.flag === y.flag &&
      JSON.stringify(x.originals) === JSON.stringify(y.originals);
  }
  /** Two names are the same recipe when they match apart from capitals and spacing. */
  function nameKey(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
  /** 1 -> "I", 4 -> "IV". */
  function roman(n) {
    n = Math.max(1, Math.floor(n || 1));
    var out = '', table = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    table.forEach(function (t) { while (n >= t[0]) { out += t[1]; n -= t[0]; } });
    return out;
  }
  /** What a bread of a tweak is called: the recipe's name, then the tweak's numeral from II on. */
  function tweakName(name, n) { return n > 1 ? String(name || '').trim() + ' ' + roman(n) : String(name || '').trim(); }

  /**
   * Decide where a bread's recipe goes when the bread is saved. A recipe is a line of tweaks;
   * the bread joins the line it was started from (Bake again, Bake this, Use recipe) or starts one.
   *   draft    the recipe as entered
   *   line     the tweaks of the recipe the bread belongs to, or [] for a new recipe
   *   current  the tweak this bread is on now (when editing), or null
   *   base     the tweak the form was filled from, or null
   *   others   how many OTHER breads are on `current`
   * -> { action: 'none' | 'keep' | 'update' | 'create', id?, basedOn? }
   */
  function planRecipeSave(o) {
    var line = o.line || [];
    var start = o.base || o.current || null;
    if (isEmptyRecipe(o.draft)) return start ? { action: 'keep', id: start.id } : { action: 'none' };
    var key = recipeKey(o.draft);
    var match = line.filter(function (r) { return recipeKey(r) === key; })[0];
    if (match) {
      // Only a form that was filled from this tweak may change its method or source.
      var edited = start && start.id === match.id && !sameDetails(match, o.draft);
      return { action: edited ? 'update' : 'keep', id: match.id };
    }
    var inLine = function (r) { return r && line.some(function (t) { return t.id === r.id; }); };
    if (o.current && !o.others && inLine(o.current)) return { action: 'update', id: o.current.id };
    return { action: 'create', basedOn: start ? start.id : null };
  }
  function ingredientSummary(recipe) {
    return (recipe.ingredients || []).map(function (i) {
      return { name: ingredientName(i), amount: amountLabel(i) };
    }).filter(function (x) { return x.name; });
  }

  // ---------- flags ----------
  /** Countries a recipe can be marked with, by ISO code. Shown as their flag emoji. */
  var FLAGS = ('AD AE AF AG AI AL AM AO AR AT AU AW AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ CA CD CF CG ' +
    'CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FO FR GA GB GD GE GH GI GL GM GN GQ ' +
    'GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS ' +
    'LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK ' +
    'PL PR PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR ' +
    'TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS XK YE ZA ZM ZW').split(' ');
  function cleanFlag(code) {
    code = String(code || '').trim().toUpperCase();
    return FLAGS.indexOf(code) >= 0 ? code : '';
  }
  /** The flag emoji for a country code: two regional-indicator letters. */
  function flagEmoji(code) {
    code = cleanFlag(code);
    return code ? String.fromCodePoint(0x1F1E6 + code.charCodeAt(0) - 65, 0x1F1E6 + code.charCodeAt(1) - 65) : '';
  }
  var regionNames = null;
  function flagName(code) {
    try { regionNames = regionNames || new Intl.DisplayNames(['en'], { type: 'region' }); return regionNames.of(code); } catch (e) { return code; }
  }

  // ---------- photos ----------
  /** A bread's photos, cover first. The first versions kept a single `photo`. */
  function photosOf(b) {
    if (!b) return [];
    if (Array.isArray(b.photos)) return b.photos.filter(function (p) { return p && p.full; });
    return b.photo && b.photo.full ? [b.photo] : [];
  }

  // ---------- stats ----------
  /** Grams per unit for flour. Cups and spoons are by volume, so they are converted at about 120 g a cup. */
  var FLOUR_GRAMS = { g: 1, oz: 28.35, lb: 453.6, cup: 120, tbsp: 7.5, tsp: 2.5, ml: 0.51 };
  /** One flour row in grams, or null when its amount or unit cannot be weighed. */
  function flourGrams(ing) {
    if (!ing || ing.group !== 'flour') return null;
    var v = parseAmount(ing.amount), k = FLOUR_GRAMS[ing.unit];
    return v === null || !k ? null : v * k;
  }
  /**
   * Minutes one entry took: the machine programs, the time added on Bake, proofing and the oven.
   * A split copy shares the dough with the entry it came from, so only its own baking counts.
   */
  function minutesSpent(bake, splitCopy) {
    var b = cleanBake(bake), sum = 0;
    if (!splitCopy) sum += (b.minutes || 0) + (b.proofMinutes || 0);
    return sum + (b.added || 0) + (b.ovenMinutes || 0);
  }
  /** "850 g" or "2.4 kg". */
  function fmtWeight(g) {
    g = Math.round(g || 0);
    return g < 1000 ? g + ' g' : (Math.round(g / 100) / 10) + ' kg';
  }
  /** "45 min", "3 h 25 min", "2 d 4 h". */
  function fmtSpan(min) {
    min = Math.round(min || 0);
    if (min < 24 * 60) return fmtMinutes(min) || '0 min';
    var d = Math.floor(min / 1440), h = Math.round((min % 1440) / 60);
    if (h === 24) { d++; h = 0; }
    return d + ' d' + (h ? ' ' + h + ' h' : '');
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
  function machinePrograms() { return (LGT.machine && LGT.machine.programs) || []; }
  function program(n) {
    var list = machinePrograms();
    for (var i = 0; i < list.length; i++) if (list[i].n === num(n)) return list[i];
    return null;
  }
  function programList(programs) { return (programs || []).map(program).filter(Boolean); }
  /** The program whose time is set by hand each time it is used, if the machine has one. */
  function manualProgram() { return machinePrograms().filter(function (p) { return p.manual; })[0] || null; }
  /** Loaf sizes on offer: every size until a program is chosen, then the ones every sized program has. */
  function sizesFor(programs) {
    var all = (LGT.machine && LGT.machine.sizes) || [], list = programList(programs);
    if (!list.length) return all.slice();
    var sized = list.filter(function (p) { return p.minutes; });
    if (!sized.length) return [];
    return all.filter(function (s) { return sized.every(function (p) { return p.minutes[s.id] != null; }); });
  }
  function hasCrust(programs) {
    var list = programList(programs);
    return !list.length || list.some(function (p) { return p.crust; });
  }
  function hasDough(programs) { return programList(programs).some(function (p) { return p.dough; }); }
  function hasManual(programs) { return programList(programs).some(function (p) { return p.manual; }); }
  function programMinutes(n, size) {
    var p = program(n);
    if (!p) return null;
    if (p.minutes) return p.minutes[size] != null ? p.minutes[size] : null;
    return p.total != null ? p.total : null;
  }
  /** The machine's own time for the chosen programs. A manual program adds nothing: its time is typed in. */
  function totalMinutes(programs, size) {
    var timed = programList(programs).filter(function (p) { return !p.manual; }), sum = 0;
    if (!timed.length) return null;
    for (var i = 0; i < timed.length; i++) {
      var m = programMinutes(timed[i].n, size);
      if (m === null) return null;
      sum += m;
    }
    return sum;
  }
  function programLabels(programs) {
    return programList(programs).map(function (p) { return p.n + ' · ' + p.name; });
  }
  function toggleProgram(programs, n) {
    return programs.indexOf(n) >= 0 ? programs.filter(function (x) { return x !== n; }) : programs.concat([n]);
  }
  /** True when the details record an actual bake. Dough programs alone, or nothing at all, are not one. */
  function isBaked(bake) {
    var b = cleanBake(bake);
    return programList(b.programs).some(function (p) { return !p.dough; }) || b.ovenTemp !== null || b.ovenMinutes !== null;
  }
  function sizeLabel(id) {
    var s = ((LGT.machine && LGT.machine.sizes) || []).filter(function (x) { return x.id === id; })[0];
    return s ? s.label : (id ? id + ' lb' : '');
  }
  function crustLabel(id) {
    var c = ((LGT.machine && LGT.machine.crusts) || []).filter(function (x) { return x.id === id; })[0];
    return c ? c.label : '';
  }
  /** Apply a change to the baking details, keeping size, crust, time and added time consistent with the programs. */
  function withBake(bake, patch) {
    var prev = cleanBake(bake);
    var next = Object.assign({}, prev, patch);
    next.programs = programsOf(next);
    var wasAuto = prev.minutes === null || prev.minutes === totalMinutes(prev.programs, prev.size);
    if ('programs' in patch || 'size' in patch) {
      var sizes = sizesFor(next.programs);
      if (!sizes.some(function (s) { return s.id === next.size; })) next.size = sizes.length === 1 ? sizes[0].id : '';
      if (!hasCrust(next.programs)) next.crust = '';
      if (wasAuto && !('minutes' in patch)) next.minutes = totalMinutes(next.programs, next.size);
      if (manualProgram() && !hasManual(next.programs)) { next.added = null; next.reason = ''; }
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
    UNITS: UNITS, GROUPS: GROUPS, GROUP_LABEL: GROUP_LABEL, DEFAULT_TYPES: DEFAULT_TYPES, DEFAULT_UNIT: DEFAULT_UNIT,
    DEFAULT_TYPE: DEFAULT_TYPE, PROOF_PLACES: PROOF_PLACES, proofLabels: proofLabels, STAPLES: STAPLES, STARTING: STARTING, upgradeIngredient: upgradeIngredient,
    ingredientName: ingredientName, ingredientDetail: ingredientDetail, newIngredient: newIngredient,
    cleanIngredient: cleanIngredient, isBlankIngredient: isBlankIngredient, changedLines: changedLines,
    emptyRecipe: emptyRecipe, isEmptyRecipe: isEmptyRecipe, cleanRecipe: cleanRecipe, cleanBake: cleanBake,
    recipeKey: recipeKey, nameKey: nameKey, planRecipeSave: planRecipeSave, roman: roman, tweakName: tweakName, ingredientSummary: ingredientSummary,
    FLAGS: FLAGS, cleanFlag: cleanFlag, flagEmoji: flagEmoji, flagName: flagName, cleanSource: cleanSource, photosOf: photosOf, flourGrams: flourGrams, minutesSpent: minutesSpent, fmtWeight: fmtWeight, fmtSpan: fmtSpan,
    RATINGS: RATINGS, rating: rating, fmtRating: fmtRating,
    program: program, manualProgram: manualProgram, sizesFor: sizesFor, hasCrust: hasCrust, hasDough: hasDough,
    hasManual: hasManual, programMinutes: programMinutes, totalMinutes: totalMinutes, programLabels: programLabels,
    toggleProgram: toggleProgram, isBaked: isBaked, sizeLabel: sizeLabel, crustLabel: crustLabel, withBake: withBake,
    safeLink: safeLink, loadImage: loadImage, drawToBlob: drawToBlob, resizeImage: resizeImage
  };
})(typeof window !== 'undefined' ? window : globalThis);
