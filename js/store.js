/* Data layer. Keeps live lists of breads and recipes from the artifact database, and
   holds every write: saving a bread with its recipe and photo, saving and deleting recipes. */
(function (root) {
  var LGT = root.LGT = root.LGT || {};
  var U = LGT.util, P = LGT.platform;

  var state = { phase: 'loading', slow: false, breads: [], recipes: [], toTryOrder: [], labelFlags: {}, labelCovers: {}, labelsLoaded: false, seenAchievements: null, canUpload: false };
  var listeners = [];
  var db = null, assets = null, timer = null;
  var got = { breads: false, recipes: false };

  function emit() { listeners.slice().forEach(function (fn) { fn(state); }); }
  function set(patch) { state = Object.assign({}, state, patch); emit(); }
  function subscribe(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }
  function getState() { return state; }

  function rows(snap) {
    return snap.docs.map(function (d) { return Object.assign({}, d.data(), { id: d.id }); });
  }
  function byDate(a, b) {
    return String(b.date || '').localeCompare(String(a.date || '')) || (b.createdAt || 0) - (a.createdAt || 0);
  }
  function byUpdated(a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }

  function listen(name, sort) {
    db.collection(name).limit(1000).onSnapshot(function (snap) {
      got[name] = true;
      var patch = {};
      patch[name] = rows(snap).sort(sort);
      if (got.breads && got.recipes) { clearTimeout(timer); patch.phase = 'ready'; patch.slow = false; }
      set(patch);
    }, function () {
      clearTimeout(timer);
      set({ phase: 'unavailable', slow: false });
    });
  }

  function init() {
    timer = setTimeout(function () { if (state.phase === 'loading') set({ slow: true }); }, 10000);
    return Promise.all([P.use('db'), P.use('assets')]).then(function (r) {
      db = r[0]; assets = r[1];
      if (!db) { clearTimeout(timer); set({ phase: 'unavailable', slow: false }); return; }
      set({ canUpload: !!assets });
      listen('breads', byDate);
      listen('recipes', byUpdated);
      // How she has ranked the recipes to try: one small document, written once per drag.
      db.doc('meta/order').onSnapshot(function (snap) {
        var d = snap.exists ? snap.data() : null;
        set({ toTryOrder: d && Array.isArray(d.toTry) ? d.toTry.map(String) : [] });
      }, function () {});
      // A label has no document of its own; the flags chosen for labels are kept together here.
      db.doc('meta/labels').onSnapshot(function (snap) {
        var d = snap.exists ? snap.data() : null;
        set({
          labelFlags: d && d.flags && typeof d.flags === 'object' ? d.flags : {},
          labelCovers: d && d.covers && typeof d.covers === 'object' ? d.covers : {},
          labelsLoaded: true
        });
      }, function () {});
      // Achievements are worked out from the log; this only remembers which have been celebrated.
      db.doc('meta/achievements').onSnapshot(function (snap) {
        var d = snap.exists ? snap.data() : null;
        set({ seenAchievements: d && d.seen && typeof d.seen === 'object' ? d.seen : {} });
      }, function () {});
    });
  }

  // ---------- reads ----------
  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function bread(id) { return find(state.breads, id); }
  /** A bread counts as baked once it has a date. An entry dated "–" is still a plan. */
  function isBakedBread(b) { return !!(b && U.parseDate(b.date)); }
  function bakedOf(list) { return list.filter(isBakedBread); }
  function recipe(id) { return find(state.recipes, id); }
  function breadsOf(recipeId) { return state.breads.filter(function (b) { return b.recipeId === recipeId; }); }

  // A recipe is a line of tweaks: each `recipes` document is one tweak, and its `line` is the id
  // of the recipe's first tweak. A recipe can be filed under a label (its `parent`); a label
  // and the recipes under it are one group. Entries saved before lines existed have no `line`:
  // those are read as one recipe per name, numbered in the order they were made.
  function byCreated(a, b) { return (a.createdAt || 0) - (b.createdAt || 0); }
  function recency(r) {
    var b = breadsOf(r.id)[0];                             // breads are kept newest first
    return [b ? String(b.date || '') : '', b ? (b.createdAt || 0) : 0, r.updatedAt || 0];
  }
  function mostRecentFirst(a, b) {
    var x = recency(a), y = recency(b);
    return y[0].localeCompare(x[0]) || (y[1] - x[1]) || (y[2] - x[2]);
  }
  var memo = {};
  function remember(name, build) {
    if (memo.recipes !== state.recipes || memo.breads !== state.breads || memo.labelFlags !== state.labelFlags || memo.labelCovers !== state.labelCovers) {
      memo = { recipes: state.recipes, breads: state.breads, labelFlags: state.labelFlags, labelCovers: state.labelCovers };
    }
    if (!memo[name]) memo[name] = build();
    return memo[name];
  }
  function newestFirst(list) { return list.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }); }

  /** Every recipe: { id, name, parent, flag, tweaks (in number order, each with .n), latest, breads, bakedCount, baked }. */
  function lines() { return remember('lines', buildLines); }
  function buildLines() {
    var legacy = {}, map = {}, out = [];
    state.recipes.slice().sort(byCreated).forEach(function (r) {
      var id = r.line;
      if (!id) {                                           // before lines: one recipe per name
        var k = U.nameKey(r.name);
        id = legacy[k] = legacy[k] || r.id;
      }
      if (!map[id]) { map[id] = { id: id, tweaks: [] }; out.push(map[id]); }
      map[id].tweaks.push(r);
    });
    out.forEach(function (l) {
      l.tweaks.sort(function (a, b) { return ((a.tweak || 0) - (b.tweak || 0)) || byCreated(a, b); });
      var used = 0;
      l.numbers = {};
      l.tweaks.forEach(function (t) { used = Math.max(used + 1, t.tweak || 0); l.numbers[t.id] = used; });
      var newest = newestFirst(l.tweaks)[0];
      l.name = String(newest.name || '').trim();
      l.parent = String(newest.parent || '').trim();
      l.flag = U.cleanFlag(newest.flag);
      var ids = {};
      l.tweaks.forEach(function (t) { ids[t.id] = true; });
      l.breads = state.breads.filter(function (b) { return ids[b.recipeId]; });
      l.latest = l.tweaks.slice().sort(mostRecentFirst)[0];
      l.bakedCount = bakedOf(l.breads).length;
      l.baked = l.bakedCount > 0;
    });
    return out.sort(function (a, b) { return mostRecentFirst(a.latest, b.latest); });
  }
  function lineById(id) {
    var byId = remember('lineById', function () {
      var m = {};
      lines().forEach(function (l) { m[l.id] = l; l.tweaks.forEach(function (t) { m['t:' + t.id] = l; }); });
      return m;
    });
    return byId[id] || null;
  }
  /** The recipe a tweak belongs to. */
  function lineOf(r) { return r ? lineById('t:' + r.id) : null; }
  /** A tweak's number in its recipe (1 for the first), and how many tweaks the recipe has. */
  function tweakOf(r) {
    var l = lineOf(r);
    return l ? { n: l.numbers[r.id] || 1, of: l.tweaks.length, line: l } : { n: 1, of: 1, line: null };
  }
  /** What a bread of this tweak is called by default. */
  function tweakTitle(r) { var t = tweakOf(r); return U.tweakName(t.line ? t.line.name : r.name, t.n); }

  /** Every group: a label and its recipes, or a recipe with no label. Most recent first. */
  function groups() { return remember('groups', buildGroups); }
  function buildGroups() {
    var map = {}, out = [];
    lines().forEach(function (l) {
      var key = l.parent ? 'label:' + U.nameKey(l.parent) : 'line:' + l.id;
      if (!map[key]) { map[key] = { key: key, label: !!l.parent, lines: [] }; out.push(map[key]); }
      map[key].lines.push(l);
    });
    out.forEach(function (g) {
      g.name = g.label ? g.lines[0].parent : g.lines[0].name;          // lines are most recent first
      g.legacyKey = U.nameKey(g.name);
      g.tweaks = [].concat.apply([], g.lines.map(function (l) { return l.tweaks; }));
      g.breads = [].concat.apply([], g.lines.map(function (l) { return l.breads; })).sort(function (a, b) {
        return String(b.date || '').localeCompare(String(a.date || '')) || (b.createdAt || 0) - (a.createdAt || 0);
      });
      g.latest = g.lines[0].latest;
      g.flag = (g.label && labelFlag(g.name)) || (g.lines.filter(function (l) { return l.flag; })[0] || {}).flag || '';
      g.bakedCount = bakedOf(g.breads).length;
      g.baked = g.bakedCount > 0;
    });
    return out;
  }
  function groupOf(r) {
    var l = lineOf(r);
    return l ? groups().filter(function (g) { return g.lines.indexOf(l) >= 0; })[0] || null : null;
  }
  function groupByKey(key) { return groups().filter(function (g) { return g.key === key; })[0] || null; }

  /** The flag shown before a name. */
  function recipeFlag(r) { var l = lineOf(r); return l ? l.flag : U.cleanFlag(r && r.flag); }
  function breadFlag(b) {
    var r = b && b.recipeId ? recipe(b.recipeId) : null;
    return r ? recipeFlag(r) : '';
  }
  function groupFlag(g) { return g ? g.flag : ''; }
  /** Flags already used, most used first. */
  function flagsUsed() {
    var count = {};
    lines().forEach(function (l) { if (l.flag) count[l.flag] = (count[l.flag] || 0) + l.tweaks.length; });
    return Object.keys(count).sort(function (a, b) { return count[b] - count[a]; });
  }
  /** Labels have no documents of their own: their flags and chosen covers are kept in one. */
  function saveLabels() { return db.doc('meta/labels').set({ flags: state.labelFlags, covers: state.labelCovers }); }
  /** The photo chosen to stand for a label ({full, thumb}), if any. */
  function labelCover(name) { var c = state.labelCovers[U.nameKey(name)]; return c && c.full ? c : null; }
  function setLabelCover(name, photo) {
    var k = U.nameKey(name), cur = labelCover(name);
    if (!k || (cur ? cur.full : '') === (photo ? photo.full : '')) return Promise.resolve();
    var next = Object.assign({}, state.labelCovers);
    if (photo && photo.full) next[k] = { full: photo.full, thumb: photo.thumb || photo.full }; else delete next[k];
    set({ labelCovers: next });
    return saveLabels();
  }
  /**
   * The photos of a group, newest bake first, each once (split copies share theirs). The chosen
   * cover comes first; without one, the newest bake's first photo does.
   */
  function groupPhotos(g) {
    var seen = {}, out = [];
    (g ? g.breads : []).forEach(function (b) {
      U.photosOf(b).forEach(function (p) { if (!seen[p.full]) { seen[p.full] = true; out.push(p); } });
    });
    var c = g && g.label ? labelCover(g.name) : null;
    if (c && seen[c.full]) out = [out.filter(function (p) { return p.full === c.full; })[0]].concat(out.filter(function (p) { return p.full !== c.full; }));
    return out;
  }
  /** The flag chosen for a label, if any. */
  function labelFlag(name) { return U.cleanFlag(state.labelFlags[U.nameKey(name)]); }
  /** Keep a label's flag. Nothing is written when it has not changed. */
  function setLabelFlag(name, code) {
    var k = U.nameKey(name), flag = U.cleanFlag(code);
    if (!k || labelFlag(name) === flag) return Promise.resolve();
    var next = Object.assign({}, state.labelFlags);
    if (flag) next[k] = flag; else delete next[k];
    set({ labelFlags: next });
    return saveLabels();
  }
  /**
   * Rename a label: every recipe filed under it moves to the new name, with its flag and its
   * place in the To try ranking.
   */
  function renameLabel(oldName, newName) {
    var from = U.nameKey(oldName), to = String(newName || '').trim();
    if (!from || !to || to === String(oldName).trim()) return Promise.resolve();
    var jobs = lines().filter(function (l) { return U.nameKey(l.parent) === from; }).map(function (l) {
      return setShared(l, { parent: to });
    });
    var flag = labelFlag(oldName);
    if (flag && U.nameKey(to) !== from) {
      var flags = Object.assign({}, state.labelFlags);
      delete flags[from];
      if (!flags[U.nameKey(to)]) flags[U.nameKey(to)] = flag;
      set({ labelFlags: flags });
    }
    var cover = state.labelCovers[from];
    if (cover && U.nameKey(to) !== from) {
      var covers = Object.assign({}, state.labelCovers);
      delete covers[from];
      if (!covers[U.nameKey(to)]) covers[U.nameKey(to)] = cover;
      set({ labelCovers: covers });
    }
    if ((flag || cover) && U.nameKey(to) !== from) jobs.push(saveLabels());
    var oldKey = 'label:' + from, newKey = 'label:' + U.nameKey(to);
    if (oldKey !== newKey && state.toTryOrder.indexOf(oldKey) >= 0) {
      var order = state.toTryOrder.map(function (k) { return k === oldKey ? newKey : k; });
      set({ toTryOrder: order });
      jobs.push(db.doc('meta/order').set({ toTry: order }));
    }
    return Promise.all(jobs);
  }
  /** What the Parent list offers: the labels already in use, A to Z. A new one is typed in. */
  function parentChoices() {
    return labels().slice().sort(function (a, b) { return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }); });
  }
  /** Labels already used, most recent first. */
  function labels() {
    var seen = {}, out = [];
    lines().forEach(function (l) { var k = U.nameKey(l.parent); if (k && !seen[k]) { seen[k] = true; out.push(l.parent); } });
    return out;
  }

  /** Recipes to try, in the order she ranked them; ones not ranked yet come last, newest first. */
  function toTry() {
    var list = groups().filter(function (g) { return !g.baked; }), rank = {};
    state.toTryOrder.forEach(function (k, i) { if (!(k in rank)) rank[k] = i; });
    function at(g) { return g.key in rank ? rank[g.key] : g.legacyKey in rank ? rank[g.legacyKey] : Infinity; }
    return list.map(function (g, i) { return [g, i]; }).sort(function (a, b) {
      var x = at(a[0]), y = at(b[0]);
      return x === y ? a[1] - b[1] : x - y;
    }).map(function (x) { return x[0]; });
  }
  function setToTryOrder(keys) {
    // keep the place of anything ranked that is not on the list right now (being baked, say)
    var shown = {}, kept = [];
    keys.forEach(function (k) { shown[k] = true; });
    state.toTryOrder.forEach(function (k) { if (!shown[k]) kept.push(k); });
    var next = keys.concat(kept);
    set({ toTryOrder: next });
    return db.doc('meta/order').set({ toTry: next });
  }

  /**
   * The numbers on the Stats page. Every entry is a loaf. Flour and time come from the recipe
   * each entry followed; a split copy's dough is counted once, with the entry it came from.
   */
  function stats() {
    var groupOfRecipe = {};
    groups().forEach(function (g) { g.tweaks.forEach(function (r) { groupOfRecipe[r.id] = g; }); });
    var flour = 0, minutes = 0, tally = {}, flours = {};
    state.breads.forEach(function (b) {
      var r = b.recipeId ? recipe(b.recipeId) : null;
      if (r) {
        if (!b.splitFrom) (r.ingredients || []).forEach(function (raw) {
          var i = U.upgradeIngredient(raw), g = U.flourGrams(i);
          if (!g) return;
          flour += g;
          var name = U.ingredientName(i), k = name.toLowerCase();
          if (!flours[k]) flours[k] = { name: name, grams: 0 };
          flours[k].grams += g;
        });
        minutes += U.minutesSpent(r.bake, !!b.splitFrom);
      }
      if (!isBakedBread(b)) return;                       // the favourite is the most baked: dated entries only
      var g = r ? groupOfRecipe[r.id] : null, key = g ? 'g:' + g.key : 'n:' + U.nameKey(b.name);
      if (!tally[key]) tally[key] = { name: g ? g.name : b.name, flag: groupFlag(g), count: 0, best: 0, last: '', lastBread: null, bestBread: null };
      var t = tally[key], x = U.rating(b) || 0;
      t.count++;
      if (x > t.best || !t.bestBread) { t.best = x; t.bestBread = b; }
      if (String(b.date || '') > t.last || !t.lastBread) { t.last = String(b.date || ''); t.lastBread = b; }
    });
    var all = Object.keys(tally).map(function (k) { return tally[k]; });
    /** Where tapping it goes: the recipe's page, on the recipe of that bake, or the bread's own page. */
    function pick(t, b) {
      return t ? { name: t.name, flag: t.flag, count: t.count, rating: t.best || null,
        open: b.recipeId && recipe(b.recipeId) ? { kind: 'recipe', id: b.recipeId } : { kind: 'bread', id: b.id } } : null;
    }
    var fav = all.slice().sort(function (a, b) {
      return (b.count - a.count) || (b.best - a.best) || b.last.localeCompare(a.last);
    })[0];
    var top = all.filter(function (t) { return t.best > 0; }).sort(function (a, b) {
      return (b.best - a.best) || (b.count - a.count) || b.last.localeCompare(a.last);
    })[0];
    // Where the recipes are from: every recipe once, baked or to try, by its flag or its label's.
    // Each country lists its recipes A to Z, and how many of them have been baked.
    var byFlag = {};
    lines().forEach(function (l) {
      var f = l.flag || (l.parent ? labelFlag(l.parent) : '');
      if (f) (byFlag[f] = byFlag[f] || []).push(l);
    });
    var countries = Object.keys(byFlag).map(function (f) {
      var list = byFlag[f].slice().sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }); });
      var breads = bakedOf([].concat.apply([], list.map(function (l) { return l.breads; })));
      var best = null, last = '';
      breads.forEach(function (b) {
        var x = U.rating(b);
        if (x !== null && (best === null || x > best)) best = x;
        if (String(b.date || '') > last) last = String(b.date || '');
      });
      return { flag: f, count: list.length, tried: list.filter(function (l) { return l.baked; }).length,
        loaves: breads.length, rating: best, last: last,
        recipes: list.map(function (l) { return { name: l.name, flag: l.flag, baked: l.baked, id: l.latest.id }; }) };
    }).sort(function (a, b) {
      return (b.count - a.count) || U.flagName(a.flag).localeCompare(U.flagName(b.flag));
    });
    return {
      // the average of every rated bake
      average: (function () {
        var v = bakedOf(state.breads).map(U.rating).filter(function (x) { return x !== null; });
        return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null;
      })(),
      flourGrams: flour, loaves: bakedOf(state.breads).length, minutes: minutes, countries: countries, recipes: lines().length,
      // every recipe A to Z, and the baked ones by how often they were baked
      recipeList: lines().map(function (l) {
        return { id: l.latest.id, name: l.name, flag: l.flag || (l.parent ? labelFlag(l.parent) : ''), baked: l.baked, count: l.bakedCount };
      }).sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }); }),
      flours: Object.keys(flours).map(function (k) { return flours[k]; }).sort(function (a, b) { return b.grams - a.grams; }),
      favorite: fav ? pick(fav, fav.lastBread) : null,
      highestRated: top ? pick(top, top.bestBread) : null
    };
  }

  // ---------- achievements ----------
  function lineFlag(l) { return l.flag || (l.parent ? labelFlag(l.parent) : ''); }
  /** What the achievements are worked out from: see achievements.js. Counted the way Stats counts. */
  function achievementFacts() {
    var loaves = [], flour = [], time = [];
    function typesOf(rows, group) {
      return rows.filter(function (i) { return i.group === group; }).map(function (i) { return i.type; });
    }
    state.breads.forEach(function (b) {
      var r = b.recipeId ? recipe(b.recipeId) : null, l = r ? lineOf(r) : null;
      var day = isBakedBread(b) ? b.date : '', made = b.createdAt || 0;
      var rows = r ? (r.ingredients || []).map(U.upgradeIngredient) : [];
      var bake = U.cleanBake(r ? r.bake : null), ratings = b.ratings || {};
      if (r) {
        var grams = 0;
        if (!b.splitFrom) rows.forEach(function (i) { grams += U.flourGrams(i) || 0; });
        if (grams) flour.push({ date: day, created: made, grams: grams });
        var minutes = U.minutesSpent(r.bake, !!b.splitFrom);
        if (minutes) time.push({ date: day, created: made, minutes: minutes });
      }
      if (!day) return;
      var places = bake.proof.slice();
      bake.extraProofs.forEach(function (x) { places = places.concat(x.proof); });
      loaves.push({
        date: day, created: made, line: l ? l.id : null,
        name: l ? l.name : '', label: l ? l.parent : '', bread: b.name || '',
        flag: l ? lineFlag(l) : '', source: r ? U.cleanSource(r.source) : '',
        rating: U.rating(b), crust: U.num(ratings.crust) || 0, crumb: U.num(ratings.crumb) || 0, taste: U.num(ratings.taste) || 0,
        gifted: !!b.gifted, split: !!b.splitFrom,
        dough: !U.isBaked(r ? r.bake : null), usesDough: U.hasDough(bake.programs),
        oven: bake.ovenTemp !== null || bake.ovenMinutes !== null, added: bake.added || 0,
        proof: r ? places : [], programs: r ? bake.programs : [],
        flours: typesOf(rows, 'flour'), yeasts: typesOf(rows, 'yeast'), dairy: typesOf(rows, 'dairy'),
        stages: U.photosOf(b).map(function (p) { return U.cleanStage(p.stage); }).filter(Boolean)
      });
    });
    return {
      loaves: loaves, flour: flour, time: time,
      recipes: lines().map(function (l) {
        var made = l.tweaks.map(function (t) { return t.createdAt || 0; });
        return {
          created: Math.min.apply(null, made), tweaks: made, flag: lineFlag(l),
          read: l.tweaks.some(function (t) { return (t.originals || []).length > 0; })
        };
      })
    };
  }
  /** Every achievement with how far along she is: derived, never stored. */
  function achievements() {
    return remember('achievements', function () { return LGT.achievements.evaluate(achievementFacts()); });
  }
  /** Earned and not celebrated yet. Empty until everything it depends on has loaded. */
  function newAchievements() {
    if (state.phase !== 'ready' || !state.labelsLoaded || !state.seenAchievements) return [];
    var seen = state.seenAchievements;
    return achievements().filter(function (a) { return LGT.achievements.uncelebrated(a, seen); });
  }
  function markAchievementsSeen(ids) {
    if (!ids.length || !db) return Promise.resolve();
    var next = Object.assign({}, state.seenAchievements || {}), day = U.today();
    ids.forEach(function (id) { next[id] = day; });
    set({ seenAchievements: next });
    return db.doc('meta/achievements').set({ seen: next }).catch(function () {});
  }

  // What was just added, so the screen can greet it: { kind: 'bread' | 'recipe', id, at }.
  var added = null;
  function justAdded(kind, id) { return !!(added && added.kind === kind && added.id === id && Date.now() - added.at < 4000); }

  /** Recipe names, most recently used first. */
  function names() { return lines().map(function (l) { return l.name; }); }
  /** Named ingredients added before, most used first. */
  function otherNames() {
    var count = {}, label = {}, order = [];
    state.recipes.forEach(function (r) {
      (r.ingredients || []).forEach(function (raw) {
        var i = U.upgradeIngredient(raw), t = String(i.type || '').trim(), k = t.toLowerCase();
        if (i.group !== 'other' || !t) return;
        if (!count[k]) { count[k] = 0; label[k] = t; order.push(k); }
        count[k]++;
      });
    });
    return order.sort(function (x, y) { return count[y] - count[x]; }).map(function (k) { return label[k]; });
  }

  /** Ingredient kinds to offer for a group: the defaults plus any the owner has used. */
  function types(group) {
    var seen = {}, out = [];
    (U.DEFAULT_TYPES[group] || []).forEach(function (t) { seen[t.toLowerCase()] = true; out.push(t); });
    state.recipes.forEach(function (r) {
      (r.ingredients || []).forEach(function (i) {
        var t = (i.type || '').trim();
        if (i.group === group && t && !seen[t.toLowerCase()]) { seen[t.toLowerCase()] = true; out.push(t); }
      });
    });
    return out;
  }
  /** Sources already used, most recent first. */
  function sources() {
    var seen = {}, out = [];
    state.recipes.forEach(function (r) {
      var s = U.cleanSource(r.source);
      if (s && !seen[s.toLowerCase()]) { seen[s.toLowerCase()] = true; out.push(s); }
    });
    return out.slice(0, 6);
  }

  // ---------- photos ----------
  function upload(blob) {
    if (!assets) return Promise.reject({ code: 'no_assets' });
    return assets.upload(blob).then(function (r) { return r.id; });
  }
  function putPhoto(blob) {
    return U.resizeImage(blob, 600, 0.8).then(function (thumb) {
      return Promise.all([upload(blob), upload(thumb)]);
    }).then(function (ids) { return { full: ids[0], thumb: ids[1] }; });
  }
  function putOriginals(blobs) {
    return Promise.all((blobs || []).map(upload));
  }
  function drop(ids) {
    if (!assets) return;
    ids.filter(Boolean).forEach(function (id) { assets.delete(id).catch(function () {}); });
  }
  /** Entries made with Split start out sharing a photo, so one is only deleted when no other bread uses it. */
  function dropPhoto(photo, breadId) {
    if (!photo) return;
    drop([photo.full, photo.thumb].filter(function (id) {
      return id && !state.breads.some(function (b) {
        return b.id !== breadId && U.photosOf(b).some(function (p) { return p.full === id || p.thumb === id; });
      });
    }));
  }
  function originalsInUse(exceptRecipeId) {
    var used = {};
    state.recipes.forEach(function (r) {
      if (r.id !== exceptRecipeId) (r.originals || []).forEach(function (id) { used[id] = true; });
    });
    return used;
  }

  // ---------- writes ----------
  function stored(recipeDoc, t, base) {
    return Object.assign({}, recipeDoc, { createdAt: (base && base.createdAt) || t, updatedAt: t });
  }

  /** Where a bread would land: its recipe (line), the plan for its tweak, and the tweak's number. */
  function placeBread(input) {
    var existing = input.id ? bread(input.id) : null;
    var current = existing && existing.recipeId ? recipe(existing.recipeId) : null;
    var base = input.baseRecipeId ? recipe(input.baseRecipeId) : null;
    var line = lineOf(base) || lineOf(current);
    var draft = U.cleanRecipe(input.recipe);
    var plan = U.planRecipeSave({
      draft: draft, line: line ? line.tweaks : [], current: current, base: base,
      others: current ? breadsOf(current.id).filter(function (x) { return x.id !== input.id; }).length : 0
    });
    var n = 1;
    if (plan.action === 'create') n = line ? Math.max.apply(null, line.tweaks.map(function (t) { return line.numbers[t.id] || 1; })) + 1 : 1;
    else if (plan.id && line) n = line.numbers[plan.id] || 1;
    return { line: plan.action === 'create' && !line ? null : line, plan: plan, n: n, draft: draft };
  }
  /** The name a bread gets by default: its recipe's name and the number of the tweak it lands in. */
  function previewName(input) {
    var p = placeBread(input);
    return p.line && p.plan.action !== 'none' ? U.tweakName(p.line.name, p.n) : '';
  }

  /**
   * Save a bread together with the tweak it followed. A bread started from a recipe (Bake again,
   * Bake this, Use recipe) lands in that recipe: on the matching tweak, or as its next one. A bread
   * started from nothing starts a new recipe, named like the bread.
   * input: { id?, bread: {name, date, ratings, notes, comments}, pics: [{photo} | {blob}] in order,
   *          recipe, baseRecipeId?, originalBlobs?, splitFrom? }
   */
  function saveBread(input) {
    var t = Date.now();
    var existing = input.id ? bread(input.id) : null;
    var b = input.bread;
    var name = String(b.name || '').trim();

    return Promise.all([
      Promise.all((input.pics || []).map(function (p) {
        // a photo keeps the stage it was taken at, when it has one
        var stage = U.cleanStage(p.stage);
        return (p.blob ? putPhoto(p.blob) : Promise.resolve(p.photo)).then(function (ph) {
          return ph && ph.full ? Object.assign({ full: ph.full, thumb: ph.thumb || ph.full }, stage ? { stage: stage } : {}) : null;
        });
      })),
      putOriginals(input.originalBlobs)
    ]).then(function (up) {
      var photos = up[0].filter(function (p) { return p && p.full; });
      var place = placeBread(input), plan = place.plan, line = place.line, draft = place.draft;
      draft.originals = draft.originals.concat(up[1]);
      draft.name = line ? line.name : name;
      var recipeId = null, write = Promise.resolve();
      if (plan.action === 'keep') {
        recipeId = plan.id;
      } else if (plan.action === 'update') {
        var target = recipe(plan.id);
        recipeId = plan.id;
        draft.basedOn = (target && target.basedOn) || null;
        write = db.collection('recipes').doc(plan.id).set(Object.assign(stored(draft, t, target), { line: line.id, tweak: place.n }));
      } else if (plan.action === 'create') {
        var fresh = db.collection('recipes').doc();
        recipeId = fresh.id;
        draft.basedOn = plan.basedOn;
        write = fresh.set(Object.assign(stored(draft, t, null), { line: line ? line.id : fresh.id, tweak: place.n }));
      }
      // the label and flag in the form are the recipe's: keep every tweak of it in step
      if (recipeId && line) write = write.then(function () { return setShared(line, { parent: draft.parent, flag: draft.flag }, recipeId); });
      if (recipeId && draft.parent && 'parentFlag' in input.recipe) write = write.then(function () { return setLabelFlag(draft.parent, input.recipe.parentFlag); });
      return write.then(function () {
        var ref = input.id ? db.collection('breads').doc(input.id) : db.collection('breads').doc();
        var r = b.ratings || {}, n = b.notes || {};
        return ref.set({
          name: name,
          date: U.parseDate(b.date) ? b.date : '',        // '' is "–": not baked yet
          recipeId: recipeId,
          photos: photos,
          photo: photos[0] || null,              // kept for entries read by older copies of the page
          ratings: { crust: U.num(r.crust) || 0, crumb: U.num(r.crumb) || 0, taste: U.num(r.taste) || 0 },
          notes: { crust: String(n.crust || '').trim(), crumb: String(n.crumb || '').trim(), taste: String(n.taste || '').trim() },
          comments: String(b.comments || '').trim(),
          gifted: !!b.gifted,
          splitFrom: (existing && existing.splitFrom) || input.splitFrom || null,
          createdAt: (existing && existing.createdAt) || t,
          updatedAt: t
        }).then(function () {
          U.photosOf(existing).forEach(function (old) {
            if (!photos.some(function (p) { return p.full === old.full; })) dropPhoto(old, existing.id);
          });
          if (!input.id) added = { kind: 'bread', id: ref.id, at: Date.now() };
          return ref.id;
        });
      });
    });
  }

  function deleteBread(id) {
    var b = bread(id);
    return db.collection('breads').doc(id).delete().then(function () {
      U.photosOf(b).forEach(function (p) { dropPhoto(p, id); });
    });
  }

  /**
   * Save one or more tweaks from the recipe form, sharing the same imported images.
   * list: [{ id?, recipe }]. Several new ones (both sizes of a recipe read in) are one recipe:
   * its tweaks I, II… in list order. Editing a tweak keeps its place; its name, label and flag
   * are the recipe's, so they apply to every tweak of it.
   */
  function saveRecipes(list, originalBlobs) {
    var t = Date.now(), lineId = null, n = 0;
    var first = list[0] && list[0].recipe;
    return putOriginals(originalBlobs).then(function (ids) {
      return list.reduce(function (chain, item) {
        return chain.then(function (doneIds) {
          var base = item.id ? recipe(item.id) : null, line = lineOf(base);
          var doc = U.cleanRecipe(item.recipe);
          doc.originals = doc.originals.concat(ids);
          var ref = item.id ? db.collection('recipes').doc(item.id) : db.collection('recipes').doc();
          if (base) {
            doc.line = line ? line.id : ref.id;
            doc.tweak = line ? line.numbers[base.id] || 1 : 1;
          } else {
            lineId = lineId || ref.id;
            doc.line = lineId;
            doc.tweak = ++n;
          }
          return ref.set(stored(doc, t, base)).then(function () {
            if (!line) return null;
            var oldName = line.name;
            return setShared(line, { name: doc.name, parent: doc.parent, flag: doc.flag }, ref.id).then(function () {
              return U.nameKey(oldName) === U.nameKey(doc.name) ? null : renameBreads(line, oldName, doc.name);
            });
          }).then(function () {
            if (base) {
              var kept = {}, used = originalsInUse(base.id);
              doc.originals.forEach(function (id) { kept[id] = true; });
              drop((base.originals || []).filter(function (id) { return !kept[id] && !used[id]; }));
            }
            return doneIds.concat([ref.id]);
          });
        });
      }, Promise.resolve([])).then(function (done) {
        if (lineId) added = { kind: 'recipe', id: lineId, at: Date.now() };
        var parent = first ? String(first.parent || '').trim() : '';
        return parent && 'parentFlag' in first ? setLabelFlag(parent, first.parentFlag).then(function () { return done; }) : done;
      });
    });
  }

  /** Give every tweak of a recipe the same name, label and flag, except the one already written. */
  function setShared(line, patch, doneId) {
    return Promise.all(line.tweaks.filter(function (r) {
      if (r.id === doneId) return false;
      return ('name' in patch && String(r.name || '').trim() !== patch.name) ||
        ('parent' in patch && String(r.parent || '').trim() !== patch.parent) ||
        ('flag' in patch && U.cleanFlag(r.flag) !== patch.flag) || !r.line;
    }).map(function (r) {
      return db.collection('recipes').doc(r.id).update(Object.assign({ line: line.id, tweak: line.numbers[r.id] || 1 }, patch));
    }));
  }
  /** A renamed recipe renames the breads still called by its old name ("Old", "Old II"…). */
  function renameBreads(line, oldName, newName) {
    var old = U.nameKey(oldName), jobs = [];
    line.breads.forEach(function (b) {
      var k = U.nameKey(b.name);
      if (k === old || k.indexOf(old + ' ') === 0) {
        jobs.push(db.collection('breads').doc(b.id).update({ name: newName + String(b.name).trim().slice(String(oldName).trim().length) }));
      }
    });
    return Promise.all(jobs);
  }

  function deleteRecipe(id) {
    var r = recipe(id);
    if (breadsOf(id).length) return Promise.reject({ code: 'in_use' });
    var used = originalsInUse(id);
    return db.collection('recipes').doc(id).delete().then(function () {
      if (r) drop((r.originals || []).filter(function (x) { return !used[x]; }));
    });
  }

  LGT.store = {
    init: init, subscribe: subscribe, getState: getState,
    bread: bread, recipe: recipe, breadsOf: breadsOf,
    lines: lines, lineOf: lineOf, lineById: lineById, tweakOf: tweakOf, tweakTitle: tweakTitle, previewName: previewName,
    groups: groups, groupOf: groupOf, groupByKey: groupByKey, toTry: toTry, setToTryOrder: setToTryOrder,
    stats: stats, isBakedBread: isBakedBread, bakedOf: bakedOf,
    recipeFlag: recipeFlag, breadFlag: breadFlag, groupFlag: groupFlag, flagsUsed: flagsUsed, labels: labels,
    labelFlag: labelFlag, parentChoices: parentChoices, renameLabel: renameLabel,
    labelCover: labelCover, setLabelCover: setLabelCover, groupPhotos: groupPhotos,
    achievements: achievements, newAchievements: newAchievements, markAchievementsSeen: markAchievementsSeen, justAdded: justAdded,
    names: names, otherNames: otherNames, types: types, sources: sources,
    saveBread: saveBread, deleteBread: deleteBread, saveRecipes: saveRecipes, deleteRecipe: deleteRecipe
  };
})(typeof window !== 'undefined' ? window : globalThis);
