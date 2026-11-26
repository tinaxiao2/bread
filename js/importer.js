/* Reads a recipe out of a photo or screenshot by asking Claude through the artifact's
   `sample` capability, and turns the answer into recipe drafts for the form. */
(function (root) {
  var LGT = root.LGT = root.LGT || {};
  var U = LGT.util, P = LGT.platform;

  function programList(machine) {
    return machine.programs.map(function (p) {
      return p.n + ' ' + p.name + (p.aka && p.aka.length ? ' (also called ' + p.aka.join(', ') + ')' : '');
    }).join('; ');
  }

  function prompt(machine, tiled) {
    return [
      'Read the bread recipe in the attached image' + (tiled
        ? 's. The first image is the whole picture. The others are enlarged parts of that same picture: use them to read small print such as fractions.'
        : '(s).'),
      'Reply with only one JSON object, no other text, in exactly this shape:',
      '{',
      ' "name": string,            // the recipe title. If none is shown, a short plain name for what it makes.',
      ' "variants": [              // one entry per ingredient list. Usually one. A recipe printed for several loaf sizes has one per size.',
      '  { "label": string,        // e.g. "1 1/2-pound loaf". "" when there is only one list.',
      '    "size": "1" | "1.5" | "2" | "",   // loaf size in pounds, if stated',
      '    "ingredients": [',
      '     { "group": "flour" | "water" | "dairy" | "yeast" | "salt" | "other",',
      '       "type": string,      // flour: "Bread", "AP", "Whole wheat". water: "Lukewarm", "Warm" or "Hot" if stated, else "". dairy: "Milk", "Butter". yeast: the kind if stated. salt: "". other: the ingredient name, e.g. "Honey", "Egg".',
      '       "amount": string,    // exactly as written, with fractions as "1/2" or "2 7/8". "" if none.',
      '       "unit": "cup" | "tbsp" | "tsp" | "g" | "ml" | "oz" | "lb" | "",   // "" for counts such as 1 egg',
      '       "note": string,      // preparation or an alternative, e.g. "softened", "or 2 1/4 tsp bread machine yeast". "" if none.',
      '       "unsure": boolean    // true if you could not read this amount with confidence',
      '     } ] } ],',
      ' "programs": number[],      // the programs of this bread machine the recipe uses, in order: ' + programList(machine) + '. [] if it does not say or nothing fits.',
      ' "crust": "light" | "medium" | "dark" | "",',
      ' "ovenTemp": number | null, // degrees Fahrenheit, only if the recipe bakes in an oven',
      ' "ovenMinutes": number | null,',
      ' "method": string,          // the steps, concise, one per line, keeping the recipe\'s own instructions',
      ' "source": string           // where it is from, only as far as the image shows: book or chapter title and page number, or site. Anything from Reddit is just "Reddit" (no subreddit or username). "" if nothing is shown.',
      '}',
      'Rules: copy amounts exactly as printed. For an amount made of two measures, put both in "amount" (e.g. "1 tbsp + 1 tsp") and leave "unit" as "".',
      'When an ingredient offers alternatives, use the first and put the other in "note".',
      'Never invent an ingredient, an amount or a source. Ignore everything in the image that is not part of the recipe.'
    ].join('\n');
  }

  // ---------- turning the answer into something safe to show ----------
  var FRACTION = { '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' };
  var UNIT = {
    cup: 'cup', cups: 'cup', c: 'cup',
    tbsp: 'tbsp', tbsps: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tbs: 'tbsp',
    tsp: 'tsp', tsps: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
    g: 'g', gram: 'g', grams: 'g',
    ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
    oz: 'oz', ounce: 'oz', ounces: 'oz',
    lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb'
  };
  function str(v) { return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim(); }
  function text(v) {
    return v === null || v === undefined ? '' : String(v).split(/\r?\n/).map(function (l) { return l.replace(/\s+/g, ' ').trim(); })
      .filter(Boolean).join('\n');
  }
  function plainAmount(v) {
    return str(str(v).replace(/[½⅓⅔¼¾⅛⅜⅝⅞]/g, function (g) { return ' ' + FRACTION[g]; }));
  }
  function shaky(amount) { return /\d\/[38]\b/.test(amount); }

  function ingredient(i) {
    i = i || {};
    var amount = plainAmount(i.amount);
    var rawUnit = str(i.unit).toLowerCase().replace(/\.$/, '');
    var unit = UNIT[rawUnit] || '';
    if (rawUnit && !unit) amount = str(amount + ' ' + rawUnit);
    var g = U.upgradeIngredient({ group: i.group, type: str(i.type) });
    return {
      group: g.group,
      type: g.type, amount: amount, unit: unit, note: str(i.note),
      unsure: !!i.unsure || shaky(amount)
    };
  }

  /** Validate and tidy Claude's answer. Throws { code: 'empty' } when there is no recipe in it. */
  function normalize(raw, machine) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var variants = (Array.isArray(raw.variants) ? raw.variants : []).map(function (v) {
      v = v || {};
      var size = str(v.size);
      return {
        label: str(v.label),
        size: machine.sizes.some(function (s) { return s.id === size; }) ? size : '',
        ingredients: (Array.isArray(v.ingredients) ? v.ingredients : []).map(ingredient)
          .filter(function (i) { return i.amount || i.type; })
      };
    }).filter(function (v) { return v.ingredients.length; });
    if (!variants.length) throw { code: 'empty' };

    var programs = U.cleanBake({ programs: raw.programs, program: raw.program }).programs;
    var crust = str(raw.crust).toLowerCase();
    return {
      name: str(raw.name),
      variants: variants,
      programs: programs,
      crust: machine.crusts.some(function (c) { return c.id === crust; }) ? crust : '',
      ovenTemp: U.num(raw.ovenTemp), ovenMinutes: U.num(raw.ovenMinutes),
      method: text(raw.method), source: U.cleanSource(raw.source)
    };
  }

  /** A recipe draft for the form from one variant of a reading. */
  function toDraft(reading, index) {
    var v = reading.variants[index] || reading.variants[0];
    var bake = U.withBake(
      U.cleanBake({ crust: reading.crust, ovenTemp: reading.ovenTemp, ovenMinutes: reading.ovenMinutes }),
      { programs: reading.programs, size: v.size });
    return {
      name: reading.name,
      ingredients: v.ingredients.map(function (i) { return Object.assign({}, i); }),
      bake: bake, method: reading.method, source: reading.source, link: '', originals: [], basedOn: null
    };
  }
  function variantLabel(v) { return v.size ? U.sizeLabel(v.size) : v.label; }

  // ---------- preparing the images ----------
  /** Whole image plus enlarged parts when it is large, so small print survives the downsizing Claude applies. */
  function tiles(img, room) {
    var w = img.naturalWidth, h = img.naturalHeight, mp = (w * h) / 1e6, out = [];
    if (mp <= 1.3 || room < 2) return out;
    var o = 0.56;                                     // each half covers a little over half, so they overlap
    if (mp > 4 && room >= 4) {
      [0, 1].forEach(function (r) { [0, 1].forEach(function (c) {
        out.push({ x: c ? w * (1 - o) : 0, y: r ? h * (1 - o) : 0, w: w * o, h: h * o });
      }); });
    } else if (h >= w) {
      out.push({ x: 0, y: 0, w: w, h: h * o }, { x: 0, y: h * (1 - o), w: w, h: h * o });
    } else {
      out.push({ x: 0, y: 0, w: w * o, h: h }, { x: w * (1 - o), y: 0, w: w * o, h: h });
    }
    return out;
  }

  /** files -> { images: Blob[] to send, originals: Blob[] to keep on the card, tiled } */
  function prepare(files, maxCount) {
    files = Array.prototype.slice.call(files, 0, Math.max(1, maxCount));
    return Promise.all(files.map(U.loadImage)).then(function (loaded) {
      var jobs = [], tiled = false;
      loaded.forEach(function (h) { jobs.push(U.drawToBlob(h.img, 2000, 0.9)); });
      if (loaded.length === 1) {
        var parts = tiles(loaded[0].img, maxCount - 1);
        tiled = parts.length > 0;
        parts.forEach(function (r) { jobs.push(U.drawToBlob(loaded[0].img, 1600, 0.9, r)); });
      }
      var keep = loaded.map(function (h) { return U.drawToBlob(h.img, 1600, 0.85); });
      return Promise.all([Promise.all(jobs), Promise.all(keep)]).then(function (r) {
        loaded.forEach(function (h) { h.release(); });
        return { images: r[0], originals: r[1], tiled: tiled };
      });
    });
  }

  // ---------- the call ----------
  /** Resolves the reader's image limits, or null when reading from images is not possible here. */
  function limits() {
    return P.use('sample').then(function (sample) {
      if (!sample || typeof sample.limits !== 'function') return null;
      return sample.limits().then(function (l) { return l && l.images ? l.images : null; }, function () { return null; });
    });
  }

  /** files -> { reading, originals }. Rejects with { code }. */
  function read(files, signal) {
    return Promise.all([P.use('sample'), limits()]).then(function (r) {
      var sample = r[0], lim = r[1];
      if (!sample || !lim) throw { code: 'images_unavailable' };
      return prepare(files, lim.maxCount || 1).then(function (prep) {
        return sample.json(prompt(LGT.machine, prep.tiled), {
          images: prep.images, modelTier: 'default', cache: false, signal: signal
        }).then(function (raw) {
          return { reading: normalize(raw, LGT.machine), originals: prep.originals };
        });
      });
    });
  }

  LGT.importer = {
    prompt: prompt, normalize: normalize, toDraft: toDraft, variantLabel: variantLabel,
    tiles: tiles, limits: limits, read: read
  };
})(typeof window !== 'undefined' ? window : globalThis);
