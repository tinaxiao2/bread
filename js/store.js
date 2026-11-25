/* Data layer. Keeps live lists of breads and recipes from the artifact database, and
   holds every write: saving a bread with its recipe and photo, saving and deleting recipes. */
(function (root) {
  var LGT = root.LGT = root.LGT || {};
  var U = LGT.util, P = LGT.platform;

  var state = { phase: 'loading', slow: false, breads: [], recipes: [], canUpload: false };
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
    });
  }

  // ---------- reads ----------
  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function bread(id) { return find(state.breads, id); }
  function recipe(id) { return find(state.recipes, id); }
  function breadsOf(recipeId) { return state.breads.filter(function (b) { return b.recipeId === recipeId; }); }

  // A recipe is known by its name. Each saved recipe document with that name is one
  // variation of it, numbered in the order it was first saved.
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
  /** Every recipe: { key, name, variations (oldest first), latest, breads (newest first), baked }, most recent first. */
  function families() {
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
      f.baked = f.breads.length > 0;
    });
    return out.sort(function (a, b) { return mostRecentFirst(a.latest, b.latest); });
  }
  function familyByKey(key) {
    return families().filter(function (f) { return f.key === key; })[0] || null;
  }
  /** Which variation of its recipe this is, counting from 1, and out of how many. */
  function variationOf(r) {
    var list = family(r.name);
    for (var i = 0; i < list.length; i++) if (list[i].id === r.id) return { n: i + 1, of: list.length };
    return { n: 1, of: 1 };
  }
  /** Recipe names, most recently used first. */
  function names() { return families().map(function (f) { return f.name; }); }
  /** Named ingredients added before, most used first. */
  function otherNames() {
    var count = {}, label = {}, order = [];
    state.recipes.forEach(function (r) {
      (r.ingredients || []).forEach(function (i) {
        var t = String(i.type || '').trim(), k = t.toLowerCase();
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
  /** The unit last used for this kind of ingredient. */
  function unitFor(group, type) {
    var exact = null, loose = null;
    for (var r = 0; r < state.recipes.length && !exact; r++) {
      var list = state.recipes[r].ingredients || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].group !== group) continue;
        if (!loose) loose = list[i].unit;
        if ((list[i].type || '') === (type || '')) { exact = list[i].unit; break; }
      }
    }
    if (exact !== null && exact !== undefined) return exact;
    if (U.TYPE_UNIT[type]) return U.TYPE_UNIT[type];
    return loose !== null && loose !== undefined ? loose : U.DEFAULT_UNIT[group];
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
   * input: { id?, bread: {name, date, photo, ratings, notes, comments}, photoBlob?,
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
      input.photoBlob ? putPhoto(input.photoBlob) : Promise.resolve(b.photo || null),
      putOriginals(input.originalBlobs)
    ]).then(function (up) {
      var photo = up[0];
      var draft = U.cleanRecipe(input.recipe);
      draft.originals = draft.originals.concat(up[1]);
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
      return write.then(function () {
        var ref = input.id ? db.collection('breads').doc(input.id) : db.collection('breads').doc();
        var r = b.ratings || {}, n = b.notes || {};
        return ref.set({
          name: name,
          date: b.date || U.today(),
          recipeId: recipeId,
          photo: photo,
          ratings: { crust: U.num(r.crust) || 0, crumb: U.num(r.crumb) || 0, taste: U.num(r.taste) || 0 },
          notes: { crust: String(n.crust || '').trim(), crumb: String(n.crumb || '').trim(), taste: String(n.taste || '').trim() },
          comments: String(b.comments || '').trim(),
          createdAt: (existing && existing.createdAt) || t,
          updatedAt: t
        }).then(function () {
          if (existing && existing.photo && (!photo || photo.full !== existing.photo.full)) {
            drop([existing.photo.full, existing.photo.thumb]);
          }
          return ref.id;
        });
      });
    });
  }

  function deleteBread(id) {
    var b = bread(id);
    return db.collection('breads').doc(id).delete().then(function () {
      if (b && b.photo) drop([b.photo.full, b.photo.thumb]);
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
          if (!base) return null;
          var kept = {}, used = originalsInUse(base.id);
          doc.originals.forEach(function (id) { kept[id] = true; });
          drop((base.originals || []).filter(function (id) { return !kept[id] && !used[id]; }));
          return base.name === doc.name ? null : rename(base.name, doc.name, base.id);
        }).then(function () { return ref.id; });
      }));
    });
  }

  /** Give a recipe a new name: every variation of it, and the breads baked from them. */
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
    family: family, families: families, familyByKey: familyByKey, variationOf: variationOf,
    names: names, otherNames: otherNames, types: types, unitFor: unitFor, sources: sources,
    saveBread: saveBread, deleteBread: deleteBread, saveRecipes: saveRecipes, deleteRecipe: deleteRecipe
  };
})(typeof window !== 'undefined' ? window : globalThis);
