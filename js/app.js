/* The app shell: two tabs, the add button, and a stack of pages opened on top. */
(function (root) {
  var LGT = root.LGT = root.LGT || {};
  var H = root.htmPreact, html = H.html, useState = H.useState, useEffect = H.useEffect, useRef = H.useRef;
  var ui = LGT.ui, S = LGT.screens, Icon = ui.Icon;

  function hashTab() { return root.location.hash === '#recipes' ? 'recipes' : 'gallery'; }
  var seq = 0;

  function App() {
    var st = ui.useStore();
    var ts = useState(hashTab()), tab = ts[0], setTab = ts[1];
    var ks = useState([]), stack = ks[0], setStack = ks[1];
    var gs = useState('baked'), seg = gs[0], setSeg = gs[1];
    var as = useState(null), adding = as[0], setAdding = as[1];      // null | 'sheet' | { files }
    var cs = useState(false), canImport = cs[0], setCanImport = cs[1];
    var stackRef = useRef(stack), mainRef = useRef(null);
    stackRef.current = stack;

    useEffect(function () {
      function onHash() { setTab(hashTab()); }
      root.addEventListener('hashchange', onHash);
      LGT.importer.limits().then(function (l) { setCanImport(!!l); });
      return function () { root.removeEventListener('hashchange', onHash); };
    }, []);
    useEffect(function () { if (mainRef.current) mainRef.current.scrollTop = 0; }, [tab]);

    function go(t) {
      setTab(t);
      try { if (hashTab() !== t) root.location.hash = t; } catch (e) { /* the hash is a convenience only */ }
    }
    var nav = {
      push: function (screen) { setStack(stackRef.current.concat([Object.assign({ key: ++seq }, screen)])); },
      /** Close a page and anything opened on top of it. */
      close: function (key) {
        var list = stackRef.current;
        for (var i = 0; i < list.length; i++) if (list[i].key === key) { setStack(list.slice(0, i)); return; }
      }
    };

    function page(s) {
      if (s.kind === 'bread') return html`<${S.BreadPage} key=${s.key} k=${s.key} id=${s.id} nav=${nav}/>`;
      if (s.kind === 'recipe') return html`<${S.RecipePage} key=${s.key} k=${s.key} id=${s.id} nav=${nav}/>`;
      if (s.kind === 'breadForm') {
        return html`<${S.BreadForm} key=${s.key} k=${s.key} breadId=${s.breadId} splitFromId=${s.splitFromId} fromRecipeId=${s.fromRecipeId}
          canImport=${canImport} nav=${nav}/>`;
      }
      if (s.kind === 'recipeForm') {
        return html`<${S.RecipeForm} key=${s.key} k=${s.key} recipeId=${s.recipeId} reading=${s.reading}
          originals=${s.originals} nav=${nav}/>`;
      }
      return null;
    }

    if (st.phase !== 'ready') {
      return html`<div class="shell"><div class="state" role="status">
        ${st.phase === 'loading' ? html`<div class="spinner"></div>` : null}
        ${st.phase === 'unavailable' ? html`<span>Unavailable</span>` : st.slow ? html`<span>Can't connect</span>` : null}
      </div></div>`;
    }

    return html`<div class="shell">
      <div class="main" ref=${mainRef}>
        ${tab === 'recipes'
          ? html`<${S.Recipes} state=${st} nav=${nav} seg=${seg} onSeg=${setSeg} onAdd=${function () { setAdding('sheet'); }}/>`
          : html`<${S.Gallery} state=${st} nav=${nav}/>`}
      </div>
      <div class="fabwrap"><div class="wrap">
        <button type="button" class="fab" aria-label="Add bread" onClick=${function () { nav.push({ kind: 'breadForm' }); }}><${Icon} name="plus"/></button>
      </div></div>
      <nav class="tabbar"><div class="wrap">
        <button type="button" class=${'tab' + (tab === 'gallery' ? ' on' : '')} aria-current=${tab === 'gallery' ? 'page' : null}
          onClick=${function () { go('gallery'); }}><${Icon} name="gallery"/>Gallery</button>
        <button type="button" class=${'tab' + (tab === 'recipes' ? ' on' : '')} aria-current=${tab === 'recipes' ? 'page' : null}
          onClick=${function () { go('recipes'); }}><${Icon} name="recipes"/>Recipes</button>
      </div></nav>
      ${stack.map(page)}
      ${adding === 'sheet' ? html`<${S.AddRecipeSheet} canImport=${canImport}
        onClose=${function () { setAdding(null); }}
        onFiles=${function (files) { setAdding({ files: files }); }}
        onBlank=${function () { setAdding(null); nav.push({ kind: 'recipeForm' }); }}/>` : null}
      ${adding && adding.files ? html`<${S.Reader} files=${adding.files}
        onCancel=${function () { setAdding(null); }}
        onDone=${function (result) {
          setAdding(null);
          nav.push({ kind: 'recipeForm', reading: result.reading, originals: result.originals });
        }}/>` : null}
    </div>`;
  }

  H.render(html`<${App}/>`, root.document.getElementById('app'));
  LGT.store.init();
})(typeof window !== 'undefined' ? window : globalThis);
