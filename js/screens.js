/* The screens: Gallery, a bread's page, Recipes, a recipe's page, and the two forms. */
(function (root) {
  var LGT = root.LGT = root.LGT || {};
  var H = root.htmPreact, html = H.html, useState = H.useState, useEffect = H.useEffect, useRef = H.useRef;
  var U = LGT.util, ui = LGT.ui, F = LGT.fields, store = LGT.store, importer = LGT.importer;
  var Icon = ui.Icon, Field = F.Field;

  // ---------- recipe drafts ----------
  // A draft holds what is shared (name, method, source) and one or more variants
  // (ingredients + baking details). Only an imported recipe has more than one variant.
  function draftFromRecipe(r) {
    return {
      name: r.name || '', method: r.method || '', source: r.source || '', link: r.link || '',
      originals: (r.originals || []).slice(), basedOn: r.basedOn || null, index: 0,
      variants: [{ label: '', ingredients: F.keyed(r.ingredients), bake: U.cleanBake(r.bake) }]
    };
  }
  function blankDraft() {
    var r = U.emptyRecipe();
    r.ingredients.forEach(function (i) { i.unit = store.unitFor(i.group, i.type); });
    return draftFromRecipe(r);
  }
  function draftFromReading(reading) {
    return {
      name: reading.name, method: reading.method, source: reading.source, link: '',
      originals: [], basedOn: null, index: 0,
      variants: reading.variants.map(function (v, i) {
        var d = importer.toDraft(reading, i);
        return { label: importer.variantLabel(v), ingredients: F.keyed(d.ingredients), bake: d.bake };
      })
    };
  }
  function recipeOf(d, index) {
    var v = d.variants[index === undefined ? d.index : index];
    return {
      name: d.name, ingredients: v.ingredients, bake: v.bake, method: d.method,
      source: d.source, link: d.link, originals: d.originals, basedOn: d.basedOn
    };
  }
  /** True while the form offers the recipe's own sizes, which stand in for the loaf-size field. */
  function sizedVariants(d) {
    return d.variants.length > 1 && d.variants.every(function (v) { return v.bake.size; });
  }
  function withRecipe(d, r) {
    var variants = d.variants.slice();
    variants[d.index] = Object.assign({}, variants[d.index], { ingredients: r.ingredients, bake: r.bake });
    return Object.assign({}, d, { method: r.method, source: r.source, link: r.link, originals: r.originals, variants: variants });
  }

  // ---------- shared pieces ----------
  function Tile(props) {
    var b = props.bread, has = !!(b.photo && b.photo.thumb);
    return html`<button type="button" class=${'tile' + (has ? ' has' : '')} onClick=${props.onOpen}>
      ${has ? html`<${ui.Photo} id=${b.photo.thumb}/>` : html`<span class="blank"><${Icon} name="loaf"/></span>`}
      <${ui.Score} value=${U.rating(b)}/>
      <span class="meta"><b>${b.name}</b><small>${U.fmtDate(b.date)}</small></span>
    </button>`;
  }

  function bakeLine(bake) {
    var p = U.program(bake.program), parts = [];
    if (p) parts.push(p.n + ' · ' + p.name);
    if (bake.minutes !== null && bake.minutes !== undefined) {
      parts.push(U.fmtMinutes(bake.minutes) + (bake.added ? ' + ' + U.fmtMinutes(bake.added) : ''));
    }
    if (bake.ovenTemp !== null && bake.ovenTemp !== undefined) parts.push(bake.ovenTemp + '°F');
    return parts.join(' · ');
  }

  /** The recipe as a card: ingredients, baking details, method, source, original images. */
  function RecipeCard(props) {
    var r = props.recipe, b = U.cleanBake(r.bake), p = U.program(b.program), cells = [];
    if (p) cells.push(['Setting', p.n + ' · ' + p.name]);
    if (b.size) cells.push(['Loaf size', U.sizeLabel(b.size)]);
    if (b.crust) cells.push(['Crust color', U.crustLabel(b.crust)]);
    if (b.minutes !== null) cells.push(['Time', U.fmtMinutes(b.minutes)]);
    if (b.added) cells.push(['Added', '+' + U.fmtMinutes(b.added), b.reason]);
    if (b.ovenTemp !== null) cells.push(['Oven', b.ovenTemp + '°F', b.ovenMinutes !== null ? U.fmtMinutes(b.ovenMinutes) : '']);
    else if (b.ovenMinutes !== null) cells.push(['Oven', U.fmtMinutes(b.ovenMinutes)]);
    var link = U.safeLink(r.link), host = '';
    try { host = link ? new URL(link).hostname.replace(/^www\./, '') : ''; } catch (e) { host = ''; }
    var ings = (r.ingredients || []).filter(function (i) { return U.ingredientName(i); });
    return html`<div class="rcard">
      ${props.title ? html`<div class="rhead">
        <button type="button" class="open" onClick=${props.onOpen}>
          <span class="label">Recipe</span><h3 class="serif">${r.name}</h3>
        </button>
        ${props.action ? html`<button type="button" class="btn primary sm" onClick=${props.onAction}>${props.action}</button>` : null}
      </div>` : null}
      ${ings.length ? html`<ul class="ings">
        ${ings.map(function (i, n) {
          var detail = U.ingredientDetail(i);
          return html`<li key=${n}><span>${U.ingredientName(i)}${detail ? html`<em>${detail}</em>` : null}</span><b>${U.amountLabel(i)}</b></li>`;
        })}
      </ul>` : null}
      ${cells.length ? html`<div class="bake">
        ${cells.map(function (c) {
          return html`<div key=${c[0]}><span class="label">${c[0]}</span><b>${c[1]}</b>${c[2] ? html`<small>${c[2]}</small>` : null}</div>`;
        })}
      </div>` : null}
      ${r.method ? html`<div class="method"><span class="label">Method</span><p>${r.method}</p></div>` : null}
      ${r.source || link ? html`<div class="src"><${Icon} name="link"/>
        <span>${link ? html`<a href=${link} target="_blank" rel="noopener noreferrer">${r.source || host}</a>` : r.source}</span>
      </div>` : null}
      ${r.originals && r.originals.length ? html`<div class="origs">
        ${r.originals.map(function (id) {
          return html`<button type="button" class="orig" key=${id} aria-label="View original"
            onClick=${function () { props.onView({ id: id }); }}><${ui.Photo} id=${id}/></button>`;
        })}
      </div>` : null}
    </div>`;
  }

  function VariantChips(props) {
    var d = props.draft;
    if (d.variants.length < 2) return null;
    var options = d.variants.map(function (v, i) { return { id: i, label: v.label || String(i + 1) }; });
    return html`<${Field} label="Size">
      <div class="chips c3">
        ${options.map(function (o) {
          var on = o.id === d.index;
          return html`<button type="button" key=${o.id} class=${on ? 'on' : ''} aria-pressed=${on}
            onClick=${function () { props.onPick(o.id); }}>${o.label}</button>`;
        })}
        ${props.onBoth ? html`<button type="button" class=${props.both ? 'on' : ''} aria-pressed=${!!props.both}
          onClick=${function () { props.onBoth(!props.both); }}>Save both</button>` : null}
      </div>
    <//>`;
  }

  /** Runs a reading of the chosen images, showing progress, and reports the result. */
  function Reader(props) {
    var s = useState('reading'), phase = s[0], setPhase = s[1];
    var ctl = useRef(null), attempt = useState(0), latest = useRef(props);
    latest.current = props;
    useEffect(function () {
      var live = true;
      ctl.current = new AbortController();
      setPhase('reading');
      importer.read(props.files, ctl.current.signal).then(function (result) {
        if (live) latest.current.onDone(result);
      }, function (e) {
        if (!live) return;
        if (e && (e.code === 'cancelled' || e.code === 'not_granted')) latest.current.onCancel(); else setPhase('failed');
      });
      return function () { live = false; if (ctl.current) ctl.current.abort(); };
    }, [attempt[0]]);
    if (phase === 'failed') {
      return html`<${ui.Confirm} title="Couldn't read it" action="Retry"
        onCancel=${props.onCancel} onConfirm=${function () { attempt[1](attempt[0] + 1); }}/>`;
    }
    return html`<div class="busy" role="status" aria-label="Reading">
      <div class="spinner"></div>
      <button type="button" class="btn ghost sm" onClick=${function () { if (ctl.current) ctl.current.abort(); }}>Stop</button>
    </div>`;
  }

  function filesOf(e) {
    var list = Array.prototype.slice.call(e.target.files || []);
    e.target.value = '';
    return list;
  }

  // ---------- Gallery ----------
  function Gallery(props) {
    return html`<div class="wrap">
      <div class="top"><h1 class="serif">Let's Get This</h1><img class="mark" src="icons/icon.svg" alt=""/></div>
      <div class="gal">
        ${props.state.breads.map(function (b) {
          return html`<${Tile} key=${b.id} bread=${b} onOpen=${function () { props.nav.push({ kind: 'bread', id: b.id }); }}/>`;
        })}
      </div>
    </div>`;
  }

  // ---------- a bread's page ----------
  function BreadPage(props) {
    var nav = props.nav, b = store.bread(props.id);
    var v = useState(null), view = v[0], setView = v[1];
    useEffect(function () { if (!b) nav.close(props.k); }, [!b]);
    if (!b) return null;
    var r = store.recipe(b.recipeId);
    var rated = U.RATINGS.some(function (k) { return (b.ratings || {})[k[0]] > 0; });
    var notes = U.RATINGS.filter(function (k) { return (b.notes || {})[k[0]]; });
    var photo = b.photo && b.photo.full;
    return html`<div class="screen">
      <div class="floatbar"><div class="wrap">
        <button type="button" class="round" aria-label="Back" onClick=${function () { nav.close(props.k); }}><${Icon} name="back"/></button>
        <button type="button" class="round" aria-label="Edit" onClick=${function () { nav.push({ kind: 'breadForm', breadId: b.id }); }}><${Icon} name="edit"/></button>
      </div></div>
      <div class="scroll">
        ${photo ? html`<button type="button" class="hero" aria-label="View photo" onClick=${function () { setView({ id: photo }); }}><${ui.Photo} id=${photo}/></button>` : null}
        <div class=${'wrap page' + (photo ? '' : ' nohero')}>
          <h2 class="serif">${b.name}</h2>
          <div class="date">${U.fmtDate(b.date, true)}</div>
          ${rated || notes.length || b.comments ? html`<div class="how">
            ${rated ? html`<div class="scores">
              ${U.RATINGS.map(function (k) {
                return html`<div key=${k[0]}><span class="label">${k[1]}</span><${ui.Stars} value=${b.ratings[k[0]]}/></div>`;
              })}
            </div>` : null}
            ${notes.length ? html`<div class="notes">
              ${notes.map(function (k) { return html`<p key=${k[0]}><span class="label">${k[1]}</span>${b.notes[k[0]]}</p>`; })}
            </div>` : null}
            ${b.comments ? html`<div class="comments">${b.comments}</div>` : null}
          </div>` : null}
          ${r ? html`<${RecipeCard} recipe=${r} title=${true} action="Bake again"
            onOpen=${function () { nav.push({ kind: 'recipe', id: r.id }); }}
            onAction=${function () { nav.push({ kind: 'breadForm', fromRecipeId: r.id }); }}
            onView=${setView}/>` : null}
        </div>
      </div>
      ${view ? html`<${ui.Viewer} id=${view.id} blob=${view.blob} onClose=${function () { setView(null); }}/>` : null}
    </div>`;
  }

  // ---------- Recipes ----------
  function latestBread(recipeId) {
    var list = store.breadsOf(recipeId);
    return list.length ? list[0] : null;                   // breads are kept newest first
  }
  function bestRating(recipeId) {
    var best = null;
    store.breadsOf(recipeId).forEach(function (b) { var x = U.rating(b); if (x !== null && (best === null || x > best)) best = x; });
    return best;
  }
  function Summary(props) {
    var items = U.ingredientSummary(props.recipe), line = bakeLine(U.cleanBake(props.recipe.bake));
    if (!items.length && !line) return null;
    return html`<button type="button" class="body" onClick=${props.onOpen}>
      ${items.map(function (x, n) {
        return html`<span key=${n}>${n ? ' · ' : ''}<b>${x.name}</b>${x.amount ? ' ' + x.amount : ''}</span>`;
      })}
      ${line ? html`<span class="when"><${Icon} name="clock"/>${line}</span>` : null}
    </button>`;
  }

  function Recipes(props) {
    var nav = props.nav, st = props.state;
    var baked = [], toTry = [];
    st.recipes.forEach(function (r) { (store.breadsOf(r.id).length ? baked : toTry).push(r); });
    baked.sort(function (a, b) {
      return String(latestBread(b.id).date || '').localeCompare(String(latestBread(a.id).date || ''));
    });
    var showBaked = props.seg === 'baked';
    return html`<div class="wrap">
      <div class="top"><h1 class="serif">Recipes</h1></div>
      <div class="seg" role="tablist">
        <button type="button" role="tab" aria-selected=${showBaked} class=${showBaked ? 'on' : ''} onClick=${function () { props.onSeg('baked'); }}>Baked${baked.length ? html` <small>${baked.length}</small>` : null}</button>
        <button type="button" role="tab" aria-selected=${!showBaked} class=${showBaked ? '' : 'on'} onClick=${function () { props.onSeg('try'); }}>To try${toTry.length ? html` <small>${toTry.length}</small>` : null}</button>
      </div>
      <div class="list">
        ${showBaked ? null : html`<button type="button" class="add" onClick=${props.onAdd}><${Icon} name="plus"/>Add recipe</button>`}
        ${(showBaked ? baked : toTry).map(function (r) {
          function open() { nav.push({ kind: 'recipe', id: r.id }); }
          var last = showBaked ? latestBread(r.id) : null, count = store.breadsOf(r.id).length;
          return html`<div class="rc" key=${r.id}>
            <div class="rtop">
              <button type="button" class="open" onClick=${open}>
                ${last ? html`<span class="thumb">${last.photo ? html`<${ui.Photo} id=${last.photo.thumb}/>` : html`<${Icon} name="loaf"/>`}</span>` : null}
                <span>
                  <h3 class="serif">${r.name}</h3>
                  ${showBaked
                    ? html`<span class="facts"><span class="pill">Baked ${count}×</span><${ui.Score} value=${bestRating(r.id)}/></span>`
                    : r.source ? html`<span class="facts">${r.source}</span>` : null}
                </span>
              </button>
              ${showBaked ? null : html`<button type="button" class="btn primary sm"
                onClick=${function () { nav.push({ kind: 'breadForm', fromRecipeId: r.id }); }}>Bake this</button>`}
            </div>
            <${Summary} recipe=${r} onOpen=${open}/>
          </div>`;
        })}
      </div>
    </div>`;
  }

  // ---------- a recipe's page ----------
  function RecipePage(props) {
    var nav = props.nav, r = store.recipe(props.id);
    var v = useState(null), view = v[0], setView = v[1];
    useEffect(function () { if (!r) nav.close(props.k); }, [!r]);
    if (!r) return null;
    var breads = store.breadsOf(r.id), best = bestRating(r.id);
    return html`<div class="screen">
      <div class="floatbar"><div class="wrap">
        <button type="button" class="round" aria-label="Back" onClick=${function () { nav.close(props.k); }}><${Icon} name="back"/></button>
        <button type="button" class="round" aria-label="Edit" onClick=${function () { nav.push({ kind: 'recipeForm', recipeId: r.id }); }}><${Icon} name="edit"/></button>
      </div></div>
      <div class="scroll">
        <div class="wrap page nohero">
          <h2 class="serif">${r.name}</h2>
          <div class="tags">
            ${breads.length ? html`<span class="pill">Baked ${breads.length}×</span>` : html`<span class="pill sage">To try</span>`}
            <${ui.Score} value=${best}/>
          </div>
          <${RecipeCard} recipe=${r} onView=${setView}/>
          <div class="formend" style="margin-top:14px">
            <button type="button" class="btn primary wide" onClick=${function () { nav.push({ kind: 'breadForm', fromRecipeId: r.id }); }}>Bake this</button>
          </div>
          ${breads.length ? html`<div class="made"><span class="label">Breads</span><div class="row">
            ${breads.map(function (b) {
              return html`<${Tile} key=${b.id} bread=${b} onOpen=${function () { nav.push({ kind: 'bread', id: b.id }); }}/>`;
            })}
          </div></div>` : null}
        </div>
      </div>
      ${view ? html`<${ui.Viewer} id=${view.id} blob=${view.blob} onClose=${function () { setView(null); }}/>` : null}
    </div>`;
  }

  // ---------- picking a saved recipe ----------
  function RecipePicker(props) {
    var list = store.getState().recipes;
    return html`<${ui.Sheet} title="Recipes" onClose=${props.onClose}>
      ${list.map(function (r) {
        var last = latestBread(r.id), count = store.breadsOf(r.id).length;
        return html`<button type="button" class="opt" key=${r.id} onClick=${function () { props.onPick(r); }}>
          <span class="thumb">${last && last.photo ? html`<${ui.Photo} id=${last.photo.thumb}/>` : html`<${Icon} name="loaf"/>`}</span>
          <span>${r.name}<small>${count ? 'Baked ' + count + '×' : 'To try'}</small></span>
        </button>`;
      })}
    <//>`;
  }

  // ---------- the bread form ----------
  function BreadForm(props) {
    var nav = props.nav;
    var init = useRef(null);
    if (!init.current) {
      var bread = props.breadId ? store.bread(props.breadId) : null;
      var baseId = bread ? bread.recipeId : (props.fromRecipeId || null);
      var base = baseId ? store.recipe(baseId) : null;
      init.current = {
        name: bread ? bread.name : (base ? base.name : ''),
        date: bread ? bread.date : U.today(),
        photo: bread ? bread.photo : null, photoBlob: null,
        ratings: Object.assign({ crust: 0, crumb: 0, taste: 0 }, bread && bread.ratings),
        notes: Object.assign({ crust: '', crumb: '', taste: '' }, bread && bread.notes),
        comments: bread ? bread.comments : '',
        draft: base ? draftFromRecipe(base) : blankDraft(),
        baseRecipeId: base ? base.id : null,
        pending: []
      };
    }
    var fs = useState(init.current), f = fs[0], setF = fs[1];
    var ds = useState(false), dirty = ds[0], setDirty = ds[1];
    var bs = useState(''), busy = bs[0], setBusy = bs[1];           // '', 'saving', 'failed', 'photo'
    var os = useState(null), overlay = os[0], setOverlay = os[1];   // 'recipes' | 'discard' | 'delete' | {files} | {view}
    var editing = !!props.breadId;

    function set(patch) {
      setF(function (cur) { return Object.assign({}, cur, typeof patch === 'function' ? patch(cur) : patch); });
      setDirty(true);
      setBusy(function (b) { return b === 'saving' ? b : ''; });
    }
    function pickPhoto(file) {
      U.resizeImage(file, 1600, 0.85).then(function (blob) { set({ photoBlob: blob }); }, function () { setBusy('photo'); });
    }
    function useRecipe(r) {
      setOverlay(null);
      set(function (cur) { return { draft: draftFromRecipe(r), baseRecipeId: r.id, pending: [], name: cur.name || r.name }; });
    }
    function useReading(result) {
      setOverlay(null);
      set(function (cur) {
        return { draft: draftFromReading(result.reading), baseRecipeId: null, pending: result.originals, name: cur.name || result.reading.name };
      });
    }
    function save() {
      if (!f.name.trim() || busy === 'saving') return;
      setBusy('saving');
      store.saveBread({
        id: props.breadId || null,
        bread: { name: f.name, date: f.date, photo: f.photo, ratings: f.ratings, notes: f.notes, comments: f.comments },
        photoBlob: f.photoBlob, recipe: recipeOf(f.draft), baseRecipeId: f.baseRecipeId, originalBlobs: f.pending
      }).then(function () { nav.close(props.k); }, function () { setBusy('failed'); });
    }
    function remove() {
      setOverlay(null);
      setBusy('saving');
      store.deleteBread(props.breadId).then(function () { nav.close(props.k); }, function () { setBusy('failed'); });
    }
    function back() { if (dirty) setOverlay('discard'); else nav.close(props.k); }

    return html`<${ui.Screen} title=${editing ? 'Edit bread' : 'New bread'} onBack=${back}
        onGo=${save} goDisabled=${!f.name.trim() || busy === 'saving'}>
      ${editing ? null : html`<div class="quick">
        ${store.getState().recipes.length ? html`<button type="button" onClick=${function () { setOverlay('recipes'); }}><${Icon} name="recipes"/>Use recipe</button>` : null}
        ${props.canImport ? html`<button type="button" class="opt file" style="margin:0;padding:0;border:0;background:var(--butter);font-size:14.5px;justify-content:center;gap:8px">
          <${Icon} name="image"/>From photo
          <input id="f-from-photo" type="file" accept="image/*" multiple aria-label="From photo"
            onChange=${function (e) { var files = filesOf(e); if (files.length) setOverlay({ files: files }); }}/>
        </button>` : null}
      </div>`}
      <${Field} label="Name">
        <input id="f-name" class="input" value=${f.name} aria-label="Name" autocomplete="off" onInput=${function (e) { set({ name: e.target.value }); }}/>
      <//>
      <div class="pd">
        ${store.getState().canUpload || f.photo ? html`<${Field} label="Photo">
          <${F.PhotoField} photo=${f.photo} blob=${f.photoBlob} onPick=${pickPhoto}
            onClear=${function () { set({ photo: null, photoBlob: null }); }}/>
        <//>` : null}
        <${Field} label="Date">
          <input id="f-date" class="input" type="date" value=${f.date} aria-label="Date" onInput=${function (e) { set({ date: e.target.value }); }}/>
        <//>
      </div>
      <${VariantChips} draft=${f.draft} onPick=${function (i) { set({ draft: Object.assign({}, f.draft, { index: i }) }); }}/>
      <${F.RecipeFields} recipe=${recipeOf(f.draft)} pending=${f.pending} hideSize=${sizedVariants(f.draft)}
        onChange=${function (r) { set({ draft: withRecipe(f.draft, r) }); }}
        onPending=${function (list) { set({ pending: list }); }}
        onView=${function (x) { setOverlay({ view: x }); }}/>
      <${Field} label="Ratings">
        <${F.RatingsEditor} ratings=${f.ratings} notes=${f.notes}
          onChange=${function (ratings, notes) { set({ ratings: ratings, notes: notes }); }}/>
      <//>
      <${Field} label="Comments">
        <${F.Area} label="Comments" value=${f.comments} onChange=${function (v) { set({ comments: v }); }}/>
      <//>
      <div class="formend">
        ${busy === 'failed' ? html`<div class="err" role="alert">Not saved</div>` : null}
        ${busy === 'photo' ? html`<div class="err" role="alert">Photo not added</div>` : null}
        <button type="button" class="btn primary wide" disabled=${!f.name.trim() || busy === 'saving'} onClick=${save}>Save</button>
        ${editing ? html`<button type="button" class="btn danger wide" onClick=${function () { setOverlay('delete'); }}>Delete</button>` : null}
      </div>
      ${overlay === 'recipes' ? html`<${RecipePicker} onClose=${function () { setOverlay(null); }} onPick=${useRecipe}/>` : null}
      ${overlay === 'discard' ? html`<${ui.Confirm} title="Discard changes?" action="Discard"
        onCancel=${function () { setOverlay(null); }} onConfirm=${function () { nav.close(props.k); }}/>` : null}
      ${overlay === 'delete' ? html`<${ui.Confirm} title="Delete bread?" action="Delete"
        onCancel=${function () { setOverlay(null); }} onConfirm=${remove}/>` : null}
      ${overlay && overlay.files ? html`<${Reader} files=${overlay.files} onDone=${useReading}
        onCancel=${function () { setOverlay(null); }}/>` : null}
      ${overlay && overlay.view ? html`<${ui.Viewer} id=${overlay.view.id} blob=${overlay.view.blob}
        onClose=${function () { setOverlay(null); }}/>` : null}
    <//>`;
  }

  // ---------- the recipe form (new, edit, or checking an imported one) ----------
  function RecipeForm(props) {
    var nav = props.nav;
    var init = useRef(null);
    if (!init.current) {
      var existing = props.recipeId ? store.recipe(props.recipeId) : null;
      init.current = {
        draft: props.reading ? draftFromReading(props.reading) : existing ? draftFromRecipe(existing) : blankDraft(),
        pending: props.originals || [], both: false
      };
    }
    var fs = useState(init.current), f = fs[0], setF = fs[1];
    var ds = useState(!!props.reading), dirty = ds[0], setDirty = ds[1];
    var bs = useState(''), busy = bs[0], setBusy = bs[1];
    var os = useState(null), overlay = os[0], setOverlay = os[1];
    var editing = !!props.recipeId, d = f.draft;
    var inUse = editing && store.breadsOf(props.recipeId).length > 0;

    function set(patch) {
      setF(function (cur) { return Object.assign({}, cur, patch); });
      setDirty(true);
      setBusy(function (b) { return b === 'saving' ? b : ''; });
    }
    function save() {
      if (!d.name.trim() || busy === 'saving') return;
      setBusy('saving');
      var list = f.both
        ? d.variants.map(function (v, i) {
          var r = recipeOf(d, i);
          return { recipe: Object.assign({}, r, { name: d.name.trim() + (v.label ? ' (' + v.label + ')' : '') }) };
        })
        : [{ id: props.recipeId || null, recipe: recipeOf(d) }];
      store.saveRecipes(list, f.pending).then(function () { nav.close(props.k); }, function () { setBusy('failed'); });
    }
    function remove() {
      setOverlay(null);
      setBusy('saving');
      store.deleteRecipe(props.recipeId).then(function () { nav.close(props.k); }, function () { setBusy('failed'); });
    }
    function back() { if (dirty) setOverlay('discard'); else nav.close(props.k); }

    return html`<${ui.Screen} title=${props.reading ? 'Check recipe' : editing ? 'Edit recipe' : 'New recipe'} onBack=${back}
        onGo=${save} goDisabled=${!d.name.trim() || busy === 'saving'}>
      <${Field} label="Name">
        <input id="f-name" class="input" value=${d.name} aria-label="Name" autocomplete="off"
          onInput=${function (e) { set({ draft: Object.assign({}, d, { name: e.target.value }) }); }}/>
      <//>
      <${VariantChips} draft=${d} both=${f.both}
        onPick=${function (i) { set({ draft: Object.assign({}, d, { index: i }) }); }}
        onBoth=${function (on) { set({ both: on }); }}/>
      <${F.RecipeFields} recipe=${recipeOf(d)} pending=${f.pending} hideSize=${sizedVariants(d)}
        onChange=${function (r) { set({ draft: withRecipe(d, r) }); }}
        onPending=${function (list) { set({ pending: list }); }}
        onView=${function (x) { setOverlay({ view: x }); }}/>
      <div class="formend">
        ${busy === 'failed' ? html`<div class="err" role="alert">Not saved</div>` : null}
        <button type="button" class="btn primary wide" disabled=${!d.name.trim() || busy === 'saving'} onClick=${save}>Save</button>
        ${editing && !inUse ? html`<button type="button" class="btn danger wide" onClick=${function () { setOverlay('delete'); }}>Delete</button>` : null}
      </div>
      ${overlay === 'discard' ? html`<${ui.Confirm} title="Discard changes?" action="Discard"
        onCancel=${function () { setOverlay(null); }} onConfirm=${function () { nav.close(props.k); }}/>` : null}
      ${overlay === 'delete' ? html`<${ui.Confirm} title="Delete recipe?" action="Delete"
        onCancel=${function () { setOverlay(null); }} onConfirm=${remove}/>` : null}
      ${overlay && overlay.view ? html`<${ui.Viewer} id=${overlay.view.id} blob=${overlay.view.blob}
        onClose=${function () { setOverlay(null); }}/>` : null}
    <//>`;
  }

  /** The "Add recipe" choice: read one from a photo, or start blank. */
  function AddRecipeSheet(props) {
    return html`<${ui.Sheet} title="Add recipe" onClose=${props.onClose}>
      ${props.canImport ? html`<label class="opt file">
        <span class="oi"><${Icon} name="image"/></span><span>From photo</span>
        <input id="f-recipe-photo" type="file" accept="image/*" multiple aria-label="From photo"
          onChange=${function (e) { var files = filesOf(e); if (files.length) props.onFiles(files); }}/>
      </label>` : null}
      <button type="button" class="opt" onClick=${props.onBlank}>
        <span class="oi"><${Icon} name="edit"/></span><span>Type it in</span>
      </button>
    <//>`;
  }

  LGT.screens = {
    Gallery: Gallery, BreadPage: BreadPage, Recipes: Recipes, RecipePage: RecipePage,
    BreadForm: BreadForm, RecipeForm: RecipeForm, AddRecipeSheet: AddRecipeSheet, Reader: Reader
  };
})(typeof window !== 'undefined' ? window : globalThis);
