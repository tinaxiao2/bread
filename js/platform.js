/* Access to what the Claude artifact runtime provides: the database, photo storage and
   the recipe reader. Each resolves to null where it is not available, so callers branch on null. */
(function (root) {
  var LGT = root.LGT = root.LGT || {};
  var cache = {};

  function use(name) {
    if (!cache[name]) {
      var c = root.claude;
      cache[name] = c && typeof c.use === 'function'
        ? Promise.resolve().then(function () { return c.use(name); }).catch(function () { return null; })
        : Promise.resolve(null);
    }
    return cache[name];
  }

  /** Where a stored photo is served from. */
  function blobUrl(id) { return id ? '/_blob/' + id : ''; }

  LGT.platform = { use: use, blobUrl: blobUrl };
})(typeof window !== 'undefined' ? window : globalThis);
