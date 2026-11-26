/* Data layer. Keeps live lists of breads and recipes from the artifact database, and
   holds every write: saving a bread with its recipe and photo, saving and deleting recipes. */
(function (root) {
  var LGT = root.LGT = root.LGT || {};
  var U = LGT.util, P = LGT.platform;

  var state = { phase: 'loading', slow: false, breads: [], recipes: [], toTryOrder: [], canUpload: false };
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

  // A recipe is known by its name. Each saved recipe document with that name is one
  // variation of it.
  function byCreated(a, b) { return (a.createdAt || 0) - (b.createdAt || 0); }
  function recency(r) {
    var b = breadsOf(r.id)[0];                             // breads are kept newest first
    return [b ? String(b.date || '') : '', b ? (b.createdAt || 0) : 0, r.updatedAt || 0];
  }
  function mostRecentFirst(a, b) {
    var x = recency(a), y = recency(b);
    return y[0].localeCompare(x[0]) || (y[1] - x[1]) || (y[2] - x[2]);
  }
  /** The variations saved under a name, oldest first. */
  function family(name) {
    var key = U.nameKey(name);
    if (!key) return [];
    return state.recipes.filter(function (r) { return U.nameKey(r.name) === key; }).sort(byCreated);
  }
  /** Every recipe name: { key, name, variations (oldest first), latest, parent, breads (newest first), baked }. */
  var memo = {};
  function remember(name, build) {
    if (memo.recipes !== state.recipes || memo.breads !== state.breads) memo = { recipes: state.recipes, breads: state.breads };
    if (!memo[name]) memo[name] = build();
    return memo[name];
  }
  function families() { return remember('families', buildFamilies); }
  function buildFamilies() {
    var map = {}, out = [];
    state.recipes.slice().sort(byCreated).forEach(function (r) {
      var key = U.nameKey(r.name);
      if (!map[key]) { map[key] = { key: key, name: r.name, variations: [], breads: [] }; out.push(map[key]); }
      map[key].variations.push(r);
    });
    out.forEach(function (f) {
      var ids = {};
      f.variations.forEach(function (r) { ids[r.id] = true; });
      f.breads = state.breads.filter(function (b) { return ids[b.recipeId]; });
      f.latest = f.variations.slice().sort(mostRecentFirst)[0];
      f.name = f.latest.name;
      // the parent is kept on every variation; the most recently saved one has the last word
      var newest = f.variations.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); })[0];
      f.parent = String(newest.parent || '').trim();
      f.flag = U.cleanFlag(newest.flag);
      f.bakedCount = bakedOf(f.breads).length;
      f.baked = f.bakedCount > 0;
    });
    return out.sort(function (a, b) { return mostRecentFirst(a.latest, b.latest); });
  }
  function familyByKey(key) {
    return families().filter(function (f) { return f.key === key; })[0] || null;
  }

  // A recipe can be attached to a parent recipe. A parent and everything attached to it
  // (at any depth) form one group, shown as one card; each variation in it is a "tweak".
  /** The top of a recipe's chain of parents. A parent that no longer exists still names the group. */
  function rootOf(f, byKey) {
    var key = f.key, name = f.name, seen = {};
    for (var i = 0; i < 20; i++) {
      seen[key] = true;
      var fam = byKey[key];
      if (!fam) return { key: key, name: name };                        // a parent with no recipe of its own
      var up = U.nameKey(fam.parent);
      if (!up || seen[up]) return { key: key, name: fam.name };
      name = fam.parent; key = up;
    }
    return { key: key, name: name };
  }
  /** Every group: { key, name, root, families, tweaks (oldest first), latest, breads, baked }, most recent first. */
  function groups() { return remember('groups', buildGroups); }
  function buildGroups() {
    var fams = families(), byKey = {}, map = {}, out = [];
    fams.forEach(function (f) { byKey[f.key] = f; });
    fams.forEach(function (f) {
      var top = rootOf(f, byKey);
      if (!map[top.key]) { map[top.key] = { key: top.key, name: top.name, root: byKey[top.key] || null, families: [] }; out.push(map[top.key]); }
      map[top.key].families.push(f);
    });
    out.forEach(function (g) {
      if (g.root) g.name = g.root.name;
      g.tweaks = [].concat.apply([], g.families.map(function (f) { return f.variations; })).sort(byCreated);
      g.breads = [].concat.apply([], g.families.map(function (f) { return f.breads; })).sort(function (a, b) {
        return String(b.date || '').localeCompare(String(a.date || '')) || (b.createdAt || 0) - (a.createdAt || 0);
      });
      g.latest = g.tweaks.slice().sort(mostRecentFirst)[0];
      g.bakedCount = bakedOf(g.breads).length;
      g.baked = g.bakedCount > 0;
    });
    return out.sort(function (a, b) { return mostRecentFirst(a.latest, b.latest); });
  }
  /** The flag shown before a recipe's name: its own, or else the nearest parent's. */
  function flagFor(name) {
    var byKey = remember('byKey', function () { var m = {}; families().forEach(function (f) { m[f.key] = f; }); return m; });
    var key = U.nameKey(name), seen = {};
    for (var i = 0; i < 20 && key && !seen[key]; i++) {
      seen[key] = true;
      var f = byKey[key];
      if (!f) return '';
      if (f.flag) return f.flag;
      key = U.nameKey(f.parent);
    }
    return '';
  }
  function breadFlag(b) {
    var r = b && b.recipeId ? recipe(b.recipeId) : null;
    return r ? flagFor(r.name) : '';
  }
  /** Flags already used, most used first. */
  function flagsUsed() {
    var count = {};
    families().forEach(function (f) { if (f.flag) count[f.flag] = (count[f.flag] || 0) + f.variations.length; });
    return Object.keys(count).sort(function (a, b) { return count[b] - count[a]; });
  }

  /** Recipes to try, in the order she ranked them; ones not ranked yet come last, newest first. */
  function toTry() {
    var list = groups().filter(function (g) { return !g.baked; }), rank = {};
    state.toTryOrder.forEach(function (k, i) { if (!(k in rank)) rank[k] = i; });
    return list.map(function (g, i) { return [g, i]; }).sort(function (a, b) {
      var x = a[0].key in rank ? rank[a[0].key] : Infinity, y = b[0].key in rank ? rank[b[0].key] : Infinity;
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
  /** The group a saved recipe belongs to. */
  function groupOf(r) {
    if (!r) return null;
    return groups().filter(function (g) { return g.tweaks.some(function (t) { return t.id === r.id; }); })[0] || null;
  }
  /** Which tweak of its group this is, counting from 1, and out of how many. */
  function tweakOf(r) {
    var g = groupOf(r);
    if (!g) return { n: 1, of: 1 };
    for (var i = 0; i < g.tweaks.length; i++) if (g.tweaks[i].id === r.id) return { n: i + 1, of: g.tweaks.length };
    return { n: 1, of: 1 };
  }
  /**
   * Recipes a recipe can be attached to: those with no parent of their own, other than itself
   * and anything already attached to it. `names` are the recipe's names (as typed, and as saved).
   */
  function parentChoices(names) {
    var keys = (Array.isArray(names) ? names : [names]).map(U.nameKey).filter(Boolean), own = {};
    var all = groups();
    all.forEach(function (g) {
      if (keys.indexOf(g.key) >= 0 || g.families.some(function (f) { return keys.indexOf(f.key) >= 0; })) own[g.key] = true;
    });
    return all.filter(function (g) { return !own[g.key]; }).map(function (g) { return g.name; });
  }

  /**
   * The numbers on the Stats page. Every entry is a loaf. Flour and time come from the recipe
   * each entry followed; a split copy's dough is counted once, with the entry it came from.
   */
  function stats() {
    var gs = groups(), groupOfRecipe = {};
    gs.forEach(function (g) { g.tweaks.forEach(function (r) { groupOfRecipe[r.id] = g; }); });
    var flour = 0, minutes = 0, tally = {};
    state.breads.forEach(function (b) {
      var r = b.recipeId ? recipe(b.recipeId) : null;
      if (r) {
        if (!b.splitFrom) (r.ingredients || []).forEach(function (i) { flour += U.flourGrams(U.upgradeIngredient(i)) || 0; });
        minutes += U.minutesSpent(r.bake, !!b.splitFrom);
      }
      if (!isBakedBread(b)) return;                       // the favourite is the most baked: dated entries only
      var g = r ? groupOfRecipe[r.id] : null, key = g ? 'g:' + g.key : 'n:' + U.nameKey(b.name);
      if (!tally[key]) tally[key] = { name: g ? g.name : b.name, flag: g ? flagFor(g.name) : '', count: 0, best: 0, last: '' };
      var t = tally[key];
      t.count++;
      t.best = Math.max(t.best, U.rating(b) || 0);
      if (String(b.date || '') > t.last) t.last = String(b.date || '');
    });
    var favorite = Object.keys(tally).map(function (k) { return tally[k]; }).sort(function (a, b) {
      return (b.count - a.count) || (b.best - a.best) || b.last.localeCompare(a.last);
    })[0] || null;
    return { flourGrams: flour, loaves: bakedOf(state.breads).length, favorite: favorite, minutes: minutes };
  }

  /** Recipe names, most recently used first. */
  function names() { return families().map(function (f) { return f.name; }); }
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
      var s = (r.source || '').trim();
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

  /**
   * Save a bread together with the recipe it followed. The bread's name is the recipe's name:
   * a bread named like a saved recipe joins it, as an existing variation or a new one.
   * input: { id?, bread: {name, date, ratings, notes, comments}, pics: [{photo} | {blob}] in order,
   *          recipe, baseRecipeId?, originalBlobs? }
   */
  function saveBread(input) {
    var t = Date.now();
    var existing = input.id ? bread(input.id) : null;
    var current = existing && existing.recipeId ? recipe(existing.recipeId) : null;
    var base = input.baseRecipeId ? recipe(input.baseRecipeId) : null;
    var b = input.bread;
    var name = String(b.name || '').trim();

    return Promise.all([
      Promise.all((input.pics || []).map(function (p) { return p.blob ? putPhoto(p.blob) : Promise.resolve(p.photo); })),
      putOriginals(input.originalBlobs)
    ]).then(function (up) {
      var photos = up[0].filter(function (p) { return p && p.full; });
      var draft = U.cleanRecipe(input.recipe);
      draft.originals = draft.originals.concat(up[1]);
      var fam = familyByKey(U.nameKey(name));
      // A parent set here applies to the whole recipe. Clearing it counts only when the form was filled from this recipe.
      var reparent = U.nameKey(draft.parent) !== U.nameKey(fam ? fam.parent : '') &&
        (draft.parent || (base && U.nameKey(base.name) === U.nameKey(name)));
      if (fam && !reparent) draft.parent = fam.parent;
      var reflag = draft.flag !== (fam ? fam.flag : '') && (draft.flag || (base && U.nameKey(base.name) === U.nameKey(name)));
      if (fam && !reflag) draft.flag = fam.flag;
      var plan = U.planRecipeSave({
        draft: draft, family: family(name).sort(mostRecentFirst), current: current, base: base,
        others: current ? breadsOf(current.id).filter(function (x) { return x.id !== input.id; }).length : 0
      });
      var recipeId = null, write = Promise.resolve();
      draft.name = name;
      if (plan.action === 'keep') {
        recipeId = plan.id;
      } else if (plan.action === 'update') {
        var target = recipe(plan.id);
        recipeId = plan.id;
        draft.basedOn = (target && target.basedOn) || null;
        write = db.collection('recipes').doc(plan.id).set(stored(draft, t, target));
      } else if (plan.action === 'create') {
        var fresh = db.collection('recipes').doc();
        recipeId = fresh.id;
        draft.basedOn = plan.basedOn;
        write = fresh.set(stored(draft, t, null));
      }
      var shared = {};
      if (reparent) shared.parent = draft.parent;
      if (reflag) shared.flag = draft.flag;
      if (recipeId && (reparent || reflag)) write = write.then(function () { return setShared(name, shared, plan.action === 'keep' ? null : recipeId); });
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
          splitFrom: (existing && existing.splitFrom) || input.splitFrom || null,
          createdAt: (existing && existing.createdAt) || t,
          updatedAt: t
        }).then(function () {
          U.photosOf(existing).forEach(function (old) {
            if (!photos.some(function (p) { return p.full === old.full; })) dropPhoto(old, existing.id);
          });
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
   * Save one or more recipes that share the same imported images.
   * list: [{ id?, recipe }]   originalBlobs: images to attach to every recipe in the list
   */
  function saveRecipes(list, originalBlobs) {
    var t = Date.now();
    return putOriginals(originalBlobs).then(function (ids) {
      return Promise.all(list.map(function (item) {
        var base = item.id ? recipe(item.id) : null;
        var doc = U.cleanRecipe(item.recipe);
        doc.originals = doc.originals.concat(ids);
        var ref = item.id ? db.collection('recipes').doc(item.id) : db.collection('recipes').doc();
        return ref.set(stored(doc, t, base)).then(function () {
          return setShared(doc.name, { parent: doc.parent, flag: doc.flag }, ref.id);
        }).then(function () {
          if (!base) return null;
          var kept = {}, used = originalsInUse(base.id);
          doc.originals.forEach(function (id) { kept[id] = true; });
          drop((base.originals || []).filter(function (id) { return !kept[id] && !used[id]; }));
          return base.name === doc.name ? null : rename(base.name, doc.name, base.id);
        }).then(function () { return ref.id; });
      }));
    });
  }

  /** Give every variation saved under `name` the same parent and flag, except the one already written. */
  function setShared(name, patch, doneId) {
    return Promise.all(family(name).filter(function (r) {
      if (r.id === doneId) return false;
      return ('parent' in patch && U.nameKey(r.parent) !== U.nameKey(patch.parent)) ||
        ('flag' in patch && U.cleanFlag(r.flag) !== patch.flag);
    }).map(function (r) { return db.collection('recipes').doc(r.id).update(patch); }));
  }
  function setParent(name, parent, doneId) { return setShared(name, { parent: parent }, doneId); }

  /** Give a recipe a new name: every variation of it, the breads baked from them, and what is attached to it. */
  function rename(oldName, newName, doneId) {
    var key = U.nameKey(oldName), ids = {}, jobs = [];
    state.recipes.forEach(function (r) {
      if (U.nameKey(r.name) !== key && r.id !== doneId) return;
      ids[r.id] = true;
      if (r.id !== doneId) jobs.push(db.collection('recipes').doc(r.id).update({ name: newName }));
    });
    state.breads.forEach(function (b) {
      if (ids[b.recipeId] && U.nameKey(b.name) === key) jobs.push(db.collection('breads').doc(b.id).update({ name: newName }));
    });
    state.recipes.forEach(function (r) {
      if (!ids[r.id] && U.nameKey(r.parent) === key) jobs.push(db.collection('recipes').doc(r.id).update({ parent: newName }));
    });
    var at = state.toTryOrder.indexOf(key);
    if (at >= 0) {
      var order = state.toTryOrder.slice();
      order[at] = U.nameKey(newName);
      jobs.push(setToTryOrder(order));
    }
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
    family: family, families: families, familyByKey: familyByKey, groups: groups, groupOf: groupOf, tweakOf: tweakOf, toTry: toTry, setToTryOrder: setToTryOrder, stats: stats, isBakedBread: isBakedBread, bakedOf: bakedOf,
    flagFor: flagFor, breadFlag: breadFlag, flagsUsed: flagsUsed,
    parentChoices: parentChoices, names: names, otherNames: otherNames, types: types, sources: sources,
    saveBread: saveBread, deleteBread: deleteBread, saveRecipes: saveRecipes, deleteRecipe: deleteRecipe
  };
})(typeof window !== 'undefined' ? window : globalThis);
