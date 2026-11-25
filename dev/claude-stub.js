/* Local stand-in for the Claude artifact runtime (window.claude): a small document store,
   photo storage and a canned recipe reader. For development and tests only. The dev server
   injects it; it is never part of the published page.

   Behaviour can be steered from localStorage before the page loads:
     lgt-dev-flags   {"noDb":true,"noAssets":true,"noSample":true,"sampleError":"rate_limited","sampleDelay":300}
     lgt-dev-sample  the JSON the recipe reader should answer with */
(function () {
  if (window.claude) return;

  var KEY = 'lgt-dev-db';
  function read(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v === null ? fallback : v; } catch (e) { return fallback; }
  }
  var flags = read('lgt-dev-flags', {});
  var data = read(KEY, {});              // path -> document body
  var subs = [];

  function persist() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function newId() {
    var s = '', a = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (var i = 0; i < 20; i++) s += a[Math.floor(Math.random() * a.length)];
    return s;
  }
  function segments(path) { return String(path).split('/'); }
  function check(path, wantEven) {
    var seg = segments(path);
    var ok = seg.every(function (s) { return /^[A-Za-z0-9_\-.~:@+]+$/.test(s) && s !== '.' && s !== '..'; });
    if (!ok || (seg.length % 2 === 0) !== wantEven) throw new TypeError('bad path: ' + path);
  }
  function fail(code, message) { return Promise.reject({ code: code, message: message || code }); }
  function later(fn) { return setTimeout(fn, 5); }

  function docSnap(path) {
    var body = data[path], seg = segments(path);
    return {
      id: seg[seg.length - 1],
      exists: body !== undefined,
      data: function () { return body === undefined ? undefined : clone(body); },
      metadata: { fromCache: false, hasPendingWrites: false }
    };
  }
  function test(v, op, want) {
    switch (op) {
      case '==': return v === want;
      case '!=': return v !== want;
      case '<': return v < want;
      case '<=': return v <= want;
      case '>': return v > want;
      case '>=': return v >= want;
      case 'in': return want.indexOf(v) >= 0;
      case 'not-in': return want.indexOf(v) < 0;
      case 'array-contains': return Array.isArray(v) && v.indexOf(want) >= 0;
    }
    return false;
  }
  function run(colPath, q) {
    var depth = segments(colPath).length + 1;
    var docs = Object.keys(data).filter(function (p) {
      return p.indexOf(colPath + '/') === 0 && segments(p).length === depth;
    }).sort().map(docSnap);
    (q.where || []).forEach(function (w) {
      docs = docs.filter(function (d) { return test(d.data()[w[0]], w[1], w[2]); });
    });
    if (q.orderBy) {
      var f = q.orderBy[0], dir = q.orderBy[1] === 'desc' ? -1 : 1;
      docs.sort(function (a, b) {
        var x = a.data()[f], y = b.data()[f];
        if (x === undefined) return 1;
        if (y === undefined) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * dir;
      });
    }
    if (q.limit) docs = docs.slice(0, q.limit);
    return {
      docs: docs, size: docs.length, empty: !docs.length,
      docChanges: function () { return []; },
      metadata: { fromCache: false, hasPendingWrites: false }
    };
  }
  function changed(path) {
    persist();
    var col = segments(path).slice(0, -1).join('/');
    subs.slice().forEach(function (s) {      // your own writes show at once, as in the real store
      if (s.doc === path) s.next(docSnap(path));
      if (s.col === col) s.next(run(col, s.q));
    });
  }
  function listen(sub) {
    subs.push(sub);
    later(function () { if (subs.indexOf(sub) >= 0) sub.next(sub.doc ? docSnap(sub.doc) : run(sub.col, sub.q)); });
    return function () { subs = subs.filter(function (s) { return s !== sub; }); };
  }
  function merge(into, from) {
    Object.keys(from).forEach(function (k) {
      var a = into[k], b = from[k];
      if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) merge(a, b);
      else into[k] = b;
    });
    return into;
  }
  function plain(v) { return v && typeof v === 'object' && !Array.isArray(v); }

  function docRef(path) {
    check(path, true);
    var seg = segments(path);
    return {
      id: seg[seg.length - 1], path: path,
      get: function () { return Promise.resolve(docSnap(path)); },
      set: function (body) {
        if (!plain(body)) return fail('invalid_argument');
        data[path] = clone(body); changed(path); return Promise.resolve();
      },
      update: function (body) {
        if (!plain(body) || data[path] === undefined) return fail('invalid_argument');
        data[path] = merge(data[path], clone(body)); changed(path); return Promise.resolve();
      },
      delete: function () { delete data[path]; changed(path); return Promise.resolve(); },
      onSnapshot: function (next) { return listen({ doc: path, next: next }); },
      collection: function (p) { return colRef(path + '/' + p, {}); }
    };
  }
  function colRef(path, q) {
    check(path, false);
    function more(patch) { return colRef(path, Object.assign({}, q, patch)); }
    return {
      path: path,
      where: function (f, op, v) { return more({ where: (q.where || []).concat([[f, op, v]]) }); },
      orderBy: function (f, dir) { return more({ orderBy: [f, dir || 'asc'] }); },
      limit: function (n) { return more({ limit: n }); },
      get: function () { return Promise.resolve(run(path, q)); },
      onSnapshot: function (next) { return listen({ col: path, q: q, next: next }); },
      doc: function (id) { return docRef(path + '/' + (id || newId())); },
      add: function (body) { var ref = docRef(path + '/' + newId()); return ref.set(body).then(function () { return ref; }); }
    };
  }
  var db = { doc: docRef, collection: function (p) { return colRef(p, {}); } };

  // ---------- assets: kept by the dev server so "/_blob/<id>" works like the real thing ----------
  var assets = {
    upload: function (blob) {
      return fetch('/_blob', { method: 'POST', headers: { 'content-type': blob.type || 'application/octet-stream' }, body: blob })
        .then(function (r) { return r.json(); })
        .then(function (j) { return { id: j.id, url: '/_blob/' + j.id, sizeBytes: blob.size, contentType: blob.type }; });
    },
    list: function () { return Promise.resolve({ assets: [], usage: { files: 0, bytes: 0, maxFiles: 5000, maxBytes: 1073741824 } }); },
    delete: function (id) {
      return fetch('/_blob/' + String(id).replace(/^\/_blob\//, ''), { method: 'DELETE' }).then(function () { return { deleted: true }; });
    }
  };

  // ---------- sample: answers with a fixed reading ----------
  var DEFAULT_READING = {
    name: 'Everyday white loaf',
    variants: [
      { label: '1 1/2-pound loaf', size: '1.5', ingredients: [
        { group: 'water', type: '', amount: '3/4', unit: 'cup', note: '', unsure: true },
        { group: 'dairy', type: 'Milk', amount: '1/4', unit: 'cup', note: '', unsure: true },
        { group: 'other', type: 'Olive oil', amount: '1 1/2', unit: 'tbsp', note: '', unsure: false },
        { group: 'other', type: 'Sugar', amount: '2', unit: 'tbsp', note: '', unsure: false },
        { group: 'flour', type: 'Bread', amount: '2 7/8', unit: 'cup', note: '', unsure: false },
        { group: 'other', type: 'Salt', amount: '1', unit: 'tsp', note: '', unsure: false },
        { group: 'yeast', type: 'Instant', amount: '1 3/4', unit: 'tsp', note: 'or 2 1/4 tsp active dry yeast', unsure: false }
      ] },
      { label: '2-pound loaf', size: '2', ingredients: [
        { group: 'water', type: '', amount: '1', unit: 'cup', note: '', unsure: false },
        { group: 'dairy', type: 'Milk', amount: '1/3', unit: 'cup', note: '', unsure: false },
        { group: 'other', type: 'Olive oil', amount: '2', unit: 'tbsp', note: '', unsure: false },
        { group: 'other', type: 'Sugar', amount: '3', unit: 'tbsp', note: '', unsure: false },
        { group: 'flour', type: 'Bread', amount: '3 3/4', unit: 'cup', note: '', unsure: false },
        { group: 'other', type: 'Milk powder', amount: '1 tbsp + 1 tsp', unit: '', note: '', unsure: false },
        { group: 'other', type: 'Salt', amount: '1 1/2', unit: 'tsp', note: '', unsure: false },
        { group: 'yeast', type: 'Instant', amount: '2 1/4', unit: 'tsp', note: 'or 2 3/4 tsp active dry yeast', unsure: false }
      ] }
    ],
    program: 1, crust: 'medium', ovenTemp: null, ovenMinutes: null,
    method: 'Add everything to the pan, liquids first.\nRun the Basic cycle with a medium crust.\nCool on a rack before slicing.',
    source: 'Sample Cookbook, p. 12'
  };
  var calls = [];
  function answer(input, opts) {
    opts = opts || {};
    calls.push({ input: input, images: opts.images ? [].slice.call(opts.images).length : 0, modelTier: opts.modelTier });
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        done = true;
        if (flags.sampleError) reject({ code: flags.sampleError, message: flags.sampleError });
        else resolve(read('lgt-dev-sample', DEFAULT_READING));
      }, flags.sampleDelay || 150);
      if (opts.signal) opts.signal.addEventListener('abort', function () {
        if (!done) { clearTimeout(timer); reject({ code: 'cancelled', message: 'cancelled' }); }
      });
    });
  }
  function sample(input, opts) {
    return answer(input, opts).then(function (v) { return { text: JSON.stringify(v), truncated: false, modelTierApplied: 'default' }; });
  }
  sample.json = answer;
  sample.limits = function () {
    return Promise.resolve({
      maxPromptBytes: 262144,
      images: { maxCount: 5, maxInputBytes: 20000000, mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] }
    });
  };

  var caps = {
    db: flags.noDb ? null : db,
    assets: flags.noAssets ? null : assets,
    sample: flags.noSample ? null : sample
  };
  window.claude = {
    use: function (name) {
      return new Promise(function (resolve) { setTimeout(function () { resolve(caps[name] || null); }, 20); });
    }
  };
  window.__lgtDev = { data: data, calls: calls };
})();
