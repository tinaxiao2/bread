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
      name: r.name || '', method: r.method || '', source: U.cleanSource(r.source), link: r.link || '', parent: r.parent || '', flag: U.cleanFlag(r.flag),
      parentFlag: r.parent ? store.labelFlag(r.parent) : '',
      originals: (r.originals || []).slice(), basedOn: r.basedOn || null, index: 0,
      variants: [{ label: '', ingredients: F.keyed((r.ingredients || []).map(U.upgradeIngredient)), bake: U.cleanBake(r.bake) }]
    };
  }
  function blankDraft() {
    return draftFromRecipe(U.emptyRecipe());
  }
  function draftFromReading(reading) {
    return {
      name: reading.name, method: reading.method, source: reading.source, link: '', parent: '', flag: '', parentFlag: '',
      originals: [], basedOn: null, index: 0,
      variants: reading.variants.map(function (v, i) {
        var d = importer.toDraft(reading, i);
        return { label: importer.variantLabel(v), ingredients: F.keyed(d.ingredients.map(U.upgradeIngredient)), bake: d.bake };
      })
    };
  }
  function recipeOf(d, index) {
    var v = d.variants[index === undefined ? d.index : index];
    return {
      name: d.name, ingredients: v.ingredients, bake: v.bake, method: d.method,
      source: d.source, link: d.link, parent: d.parent, flag: d.flag, parentFlag: d.parentFlag, originals: d.originals, basedOn: d.basedOn
    };
  }
  /** True while the form offers the recipe's own sizes, which stand in for the loaf-size field. */
  function sizedVariants(d) {
    return d.variants.length > 1 && d.variants.every(function (v) { return v.bake.size; });
  }
  function withRecipe(d, r) {
    var variants = d.variants.slice();
    variants[d.index] = Object.assign({}, variants[d.index], { ingredients: r.ingredients, bake: r.bake });
    return Object.assign({}, d, { method: r.method, source: r.source, link: r.link, parent: r.parent, parentFlag: r.parentFlag, originals: r.originals, variants: variants });
  }

  // ---------- shared pieces ----------
  function bestRating(breads) {
    var best = null;
    breads.forEach(function (b) { var x = U.rating(b); if (x !== null && (best === null || x > best)) best = x; });
    return best;
  }

  function Tile(props) {
    var b = props.bread, cover = U.photosOf(b)[0], has = !!cover;
    var r = b.recipeId ? store.recipe(b.recipeId) : null;
    return html`<button type="button" class=${'tile' + (has ? ' has' : '')} onClick=${props.onOpen}>
      ${has ? html`<${ui.Photo} id=${cover.thumb || cover.full}/>` : html`<span class="blank"><${Icon} name="loaf"/></span>`}
      ${U.photosOf(b).length > 1 ? html`<span class="many" aria-hidden="true"><${Icon} name="image"/></span>` : null}
      <span class="tl">${U.isBaked(r ? r.bake : null) ? null : html`<span class="flag">Dough</span>`}<${ui.Score} value=${U.rating(b)}/></span>
      <span class="meta"><b><${ui.Named} flag=${store.breadFlag(b)} name=${b.name}/></b><small>${U.fmtDate(b.date) || '–'}</small></span>
    </button>`;
  }

  function bakeLine(bake) {
    var b = U.cleanBake(bake), labels = U.programLabels(b.programs), parts = [];
    if (labels.length) parts.push(labels.join(' + '));
    if (b.minutes !== null) parts.push(U.fmtMinutes(b.minutes) + (b.added ? ' + ' + U.fmtMinutes(b.added) : ''));
    else if (b.added) parts.push('+' + U.fmtMinutes(b.added));
    if (b.ovenTemp !== null) parts.push(b.ovenTemp + '°F');
    return parts.join(' · ');
  }

  /**
   * The recipe as a card: ingredients, baking details, method, source, original images.
   * props: recipe, title, tag, action, onAction, onOpen, onView, against (a recipe whose
   * ingredient lines this one is compared with, so the lines that differ stand out)
   */
  function RecipeCard(props) {
    var r = props.recipe, source = U.cleanSource(r.source), b = U.cleanBake(r.bake), labels = U.programLabels(b.programs), cells = [];
    if (labels.length) cells.push(['Setting', labels]);
    if (b.size) cells.push(['Loaf size', [U.sizeLabel(b.size)]]);
    if (b.crust) cells.push(['Crust color', [U.crustLabel(b.crust)]]);
    if (b.minutes !== null) cells.push(['Time', [U.fmtMinutes(b.minutes)]]);
    if (b.added) cells.push(['Added', ['+' + U.fmtMinutes(b.added)], b.reason]);
    var proof = U.proofLabels(b.proof);
    if (proof.length || b.proofMinutes !== null) cells.push(['Proofing', proof.length ? proof : [U.fmtMinutes(b.proofMinutes)], proof.length && b.proofMinutes !== null ? U.fmtMinutes(b.proofMinutes) : '']);
    b.extraProofs.forEach(function (x, i) {
      var places = U.proofLabels(x.proof);
      cells.push([U.ordinal(i + 2) + ' proof', places.length ? places : [U.fmtMinutes(x.minutes)], places.length && x.minutes !== null ? U.fmtMinutes(x.minutes) : '']);
    });
    if (b.ovenTemp !== null) cells.push(['Oven', [b.ovenTemp + '°F'], b.ovenMinutes !== null ? U.fmtMinutes(b.ovenMinutes) : '']);
    else if (b.ovenMinutes !== null) cells.push(['Oven', [U.fmtMinutes(b.ovenMinutes)]]);
    var link = U.safeLink(r.link), host = '';
    try { host = link ? new URL(link).hostname.replace(/^www\./, '') : ''; } catch (e) { host = ''; }
    var ings = (r.ingredients || []).filter(function (i) { return U.ingredientName(i); });
    var marks = props.against ? U.changedLines(props.against, { ingredients: ings }) : [];
    return html`<div class="rcard">
      ${props.title ? html`<div class="rhead">
        <button type="button" class="open" onClick=${props.onOpen}>
          <span class="rl"><span class="label">Recipe</span>${props.tag ? html`<span class="pill sage">${props.tag}</span>` : null}</span>
          <h3 class="serif"><${ui.Named} flag=${store.recipeFlag(r)} name=${props.name || r.name}/></h3>
        </button>
        ${props.action ? html`<button type="button" class="btn primary sm" onClick=${props.onAction}>${props.action}</button>` : null}
      </div>` : null}
      ${ings.length ? html`<ul class="ings">
        ${ings.map(function (i, n) {
          var detail = U.ingredientDetail(i);
          return html`<li key=${n} class=${marks[n] ? 'diff' : ''}><span>${U.ingredientName(i)}${detail ? html`<em>${detail}</em>` : null}</span><b>${U.amountLabel(i)}</b></li>`;
        })}
      </ul>` : null}
      ${cells.length ? html`<div class="bake">
        ${cells.map(function (c) {
          return html`<div key=${c[0]}><span class="label">${c[0]}</span>
            ${c[1].map(function (line, n) { return html`<b key=${n}>${line}</b>`; })}
            ${c[2] ? html`<small>${c[2]}</small>` : null}</div>`;
        })}
      </div>` : null}
      ${r.method ? html`<div class="method"><span class="label">Method</span><p>${r.method}</p></div>` : null}
      ${source || link ? html`<div class="src"><${Icon} name="link"/>
        <span>${link ? html`<a href=${link} target="_blank" rel="noopener noreferrer">${source || host}</a>` : source}</span>
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
  /** One tile per parent recipe: its latest bread's photo, its best rating. */
  function RecipeTile(props) {
    var g = props.group, last = g.breads[0], cover = U.photosOf(g.breads.filter(function (b) { return U.photosOf(b).length; })[0])[0];
    var layers = Math.min(Math.max(g.bakedCount - 1, 0), 3);              // +1, +2, +3 or more
    return html`<div class=${'stack s' + layers}>
      ${[3, 2, 1].filter(function (n) { return n <= layers; }).map(function (n) { return html`<span class=${'layer l' + n} key=${n} aria-hidden="true"></span>`; })}
      ${g.bakedCount > 1 ? html`<span class="badge" aria-label=${g.bakedCount + ' entries'}>${g.bakedCount}</span>` : null}
      <button type="button" class=${'tile' + (cover ? ' has' : '')} onClick=${props.onOpen}>
      ${cover ? html`<${ui.Photo} id=${cover.thumb || cover.full}/>` : html`<span class="blank"><${Icon} name="loaf"/></span>`}
      <span class="tl"><${ui.Score} value=${bestRating(g.breads)}/></span>
      <span class="meta"><b><${ui.Named} flag=${g.flag} name=${g.name}/></b><small>${U.fmtDate(last.date) || '–'}</small></span>
      </button>
    </div>`;
  }

  var VIEW_KEY = 'lgt-gallery-view', SORT_KEY = 'lgt-gallery-sort';
  function remembered(key, allowed, fallback) {
    try { var v = localStorage.getItem(key); return allowed.indexOf(v) >= 0 ? v : fallback; } catch (e) { return fallback; }
  }
  function remember(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* a convenience only */ } }

  var SORTS = [['recent', 'Most recent'], ['baked', 'Most baked'], ['rating', 'Rating'], ['az', 'A to Z'], ['country', 'Country']];
  /** By country name, then by name; no flag last. */
  function byCountry(fa, na, fb, nb) {
    if (!fa !== !fb) return fa ? -1 : 1;
    return (fa ? byName(U.flagName(fa), U.flagName(fb)) : 0) || byName(na, nb);
  }
  function byName(a, b) { return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true }); }
  /** Higher first, with nothing (null) last. */
  function desc(x, y) { return (y === null ? -Infinity : y) - (x === null ? -Infinity : x); }

  /**
   * The Gallery's entries or recipe tiles, in the chosen order.
   *   Most baked: then the best rated, then the most recent with a photo, then those without one.
   *   Rating: the rated first, best first; ties and the unrated then go by most baked, and then
   *   the most recent with a photo, then those without one.
   * Each item is read as { baked, rating, photo, date, created, name, flag }.
   */
  function recentWithPhoto(a, b) {
    if (a.photo !== b.photo) return a.photo ? -1 : 1;
    return b.date.localeCompare(a.date) || (b.created - a.created);
  }
  var ORDER = {
    baked: function (a, b) { return (b.baked - a.baked) || desc(a.rating, b.rating) || recentWithPhoto(a, b); },
    rating: function (a, b) { return desc(a.rating, b.rating) || (b.baked - a.baked) || recentWithPhoto(a, b); },
    az: function (a, b) { return byName(a.name, b.name); },
    country: function (a, b) { return byCountry(a.flag, a.name, b.flag, b.name); }
  };
  function inOrder(list, sort, facts) {
    if (!ORDER[sort]) return list;
    return list.map(function (x, i) { return { x: x, f: facts(x), i: i }; })
      .sort(function (a, b) { return ORDER[sort](a.f, b.f) || (a.i - b.i); })
      .map(function (y) { return y.x; });
  }
  function sorted(view, sort, breads) {
    if (view === 'recipes') {
      return inOrder(store.groups().filter(function (g) { return g.baked; }), sort, function (g) {
        var last = g.breads[0];
        return { baked: g.bakedCount, rating: bestRating(g.breads), photo: g.breads.some(function (b) { return U.photosOf(b).length; }),
          date: String((last && last.date) || ''), created: (last && last.createdAt) || 0, name: g.name, flag: g.flag };
      });
    }
    var count = {};
    store.groups().forEach(function (g) { g.breads.forEach(function (b) { count[b.id] = g.bakedCount; }); });
    return inOrder(breads, sort, function (b) {
      return { baked: count[b.id] || 0, rating: U.rating(b), photo: U.photosOf(b).length > 0,
        date: String(b.date || ''), created: b.createdAt || 0, name: b.name, flag: store.breadFlag(b) };
    });
  }

  function Gallery(props) {
    var vs = useState(remembered(VIEW_KEY, ['recipes', 'all'], 'all')), view = vs[0], setView = vs[1];
    var ss = useState(remembered(SORT_KEY, SORTS.map(function (o) { return o[0]; }), 'recent')), sort = ss[0], setSort = ss[1];
    var nav = props.nav;
    var label = SORTS.filter(function (o) { return o[0] === sort; })[0][1];
    return html`<div class="wrap">
      <div class="top">
        <h1 class="serif">Let's Get This</h1><img class="mark" src="icons/icon.svg" alt=""/>
        <div class="controls">
          <div class="toggle" role="tablist">
            ${[['recipes', 'Recipes'], ['all', 'All']].map(function (o) {
              return html`<button type="button" role="tab" key=${o[0]} aria-selected=${view === o[0]} class=${view === o[0] ? 'on' : ''}
                onClick=${function () { setView(o[0]); remember(VIEW_KEY, o[0]); }}>${o[1]}</button>`;
            })}
          </div>
          <div class="sortby">
            <${Icon} name="sort"/><span>${label}</span>
            <select id="f-sort" aria-label="Filter by" value=${sort} onChange=${function (e) { setSort(e.target.value); remember(SORT_KEY, e.target.value); }}>
              ${SORTS.map(function (o) { return html`<option key=${o[0]} value=${o[0]}>${o[1]}</option>`; })}
            </select>
          </div>
        </div>
      </div>
      <div class=${'gal' + (view === 'recipes' ? ' stacks' : '')}>
        ${view === 'recipes'
          ? sorted('recipes', sort).map(function (g) {
            return html`<${RecipeTile} key=${g.key} group=${g} onOpen=${function () { nav.push({ kind: 'recipe', id: g.latest.id }); }}/>`;
          })
          : sorted('all', sort, props.state.breads).map(function (b) {
            return html`<${Tile} key=${b.id} bread=${b} onOpen=${function () { nav.push({ kind: 'bread', id: b.id }); }}/>`;
          })}
      </div>
    </div>`;
  }

  // ---------- a bread's page ----------
  /** The bread's photos, side by side: swipe between them, tap one to see it whole. */
  function Hero(props) {
    var photos = props.photos, s = useState(0), at = s[0], setAt = s[1], ref = useRef(null);
    function onScroll(e) {
      var el = e.currentTarget, i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      if (i !== at) setAt(i);
    }
    function go(i) { var el = ref.current; if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' }); }
    return html`<div class="heroes">
      <div class="hero-row" ref=${ref} onScroll=${onScroll}>
        ${photos.map(function (p, i) {
          return html`<button type="button" class="hero" key=${p.full} aria-label=${'Photo ' + (i + 1)} onClick=${function () { props.onView({ id: p.full }); }}>
            <${ui.Photo} id=${p.full}/></button>`;
        })}
      </div>
      ${photos.length > 10 ? html`<span class="herocount">${at + 1} / ${photos.length}</span>` : null}
      ${photos.length > 1 && photos.length <= 10 ? html`<div class="dots">
        ${photos.map(function (p, i) {
          return html`<button type="button" key=${p.full} class=${i === at ? 'on' : ''} aria-label=${'Show photo ' + (i + 1)} onClick=${function () { go(i); }}></button>`;
        })}
      </div>` : null}
    </div>`;
  }

  function BreadPage(props) {
    var nav = props.nav, b = store.bread(props.id);
    var v = useState(null), view = v[0], setView = v[1];
    useEffect(function () { if (!b) nav.close(props.k); }, [!b]);
    if (!b) return null;
    var r = store.recipe(b.recipeId);
    var which = r ? store.tweakOf(r) : null;
    var rated = U.RATINGS.some(function (k) { return (b.ratings || {})[k[0]] > 0; });
    var notes = U.RATINGS.filter(function (k) { return (b.notes || {})[k[0]]; });
    var photos = U.photosOf(b), photo = photos.length > 0;
    return html`<div class="screen">
      <div class=${'floatbar' + (photo ? '' : ' solid')}><div class="wrap">
        <button type="button" class="round" aria-label="Back" onClick=${function () { nav.close(props.k); }}><${Icon} name="back"/></button>
        <span class="acts">
          <button type="button" class="pillbtn" onClick=${function () { nav.push({ kind: 'breadForm', splitFromId: b.id }); }}>Split</button>
          <button type="button" class="round" aria-label="Edit" onClick=${function () { nav.push({ kind: 'breadForm', breadId: b.id }); }}><${Icon} name="edit"/></button>
        </span>
      </div></div>
      <div class="scroll">
        ${photo ? html`<${Hero} photos=${photos} onView=${setView}/>` : null}
        <div class=${'wrap page' + (photo ? '' : ' nohero')}>
          <h2 class="serif"><${ui.Named} flag=${store.breadFlag(b)} name=${b.name}/></h2>
          <div class="date">${U.fmtDate(b.date, true) || '–'}</div>
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
          ${r ? html`<${RecipeCard} recipe=${r} title=${true} action="Bake again" name=${which.line ? which.line.name : r.name}
            tag=${which.of > 1 ? U.roman(which.n) : ''}
            onOpen=${function () { nav.push({ kind: 'recipe', id: r.id }); }}
            onAction=${function () { nav.push({ kind: 'breadForm', fromRecipeId: r.id }); }}
            onView=${setView}/>` : null}
        </div>
      </div>
      ${view ? html`<${ui.Viewer} id=${view.id} blob=${view.blob} onClose=${function () { setView(null); }}/>` : null}
    </div>`;
  }

  // ---------- Recipes ----------
  // One card per group: a label and the recipes filed under it, or a recipe with no label.
  function Summary(props) {
    var items = U.ingredientSummary(props.recipe), line = bakeLine(props.recipe.bake);
    if (!items.length && !line) return null;
    return html`<button type="button" class="body" onClick=${props.onOpen}>
      ${items.map(function (x, n) {
        return html`<span key=${n}>${n ? ' · ' : ''}<b>${x.name}</b>${x.amount ? ' ' + x.amount : ''}</span>`;
      })}
      ${line ? html`<span class="when"><${Icon} name="clock"/>${line}</span>` : null}
    </button>`;
  }
  /** How many recipes a label holds, shown like the rating: no background. */
  function RecipeCount(props) {
    return props.n > 1 ? html`<span class="count"><${Icon} name="recipes"/>${props.n} recipes</span>` : null;
  }

  function Recipes(props) {
    var nav = props.nav, all = store.groups();
    var baked = all.filter(function (g) { return g.baked; }), toTry = store.toTry();
    var showBaked = props.seg === 'baked';
    var byKey = {};
    toTry.forEach(function (g) { byKey[g.key] = g; });
    var d = ui.useDragOrder(toTry.map(function (g) { return g.key; }), store.setToTryOrder);
    var shown = showBaked ? baked : d.order.map(function (k) { return byKey[k]; }).filter(Boolean);
    return html`<div class="wrap">
      <div class="top"><h1 class="serif">Recipes</h1></div>
      <div class="seg" role="tablist">
        <button type="button" role="tab" aria-selected=${showBaked} class=${showBaked ? 'on' : ''} onClick=${function () { props.onSeg('baked'); }}>Baked${baked.length ? html` <small>${baked.length}</small>` : null}</button>
        <button type="button" role="tab" aria-selected=${!showBaked} class=${showBaked ? '' : 'on'} onClick=${function () { props.onSeg('try'); }}>To try${toTry.length ? html` <small>${toTry.length}</small>` : null}</button>
      </div>
      <div class="list">
        ${showBaked ? null : html`<button type="button" class="add" onClick=${props.onAdd}><${Icon} name="plus"/>Add recipe</button>`}
      </div>
      <div class=${'list' + (showBaked ? '' : ' ranked') + (d.dragging ? ' dragging' : '')} ref=${showBaked ? null : d.box}>
        ${shown.map(function (g) {
          function open() { nav.push({ kind: 'recipe', id: g.latest.id }); }
          var last = g.breads[0];
          return html`<div class=${'rc' + (d.dragging === g.key ? ' lifted' : '')} key=${g.key} ...${showBaked ? {} : d.item(g.key)}>
            <div class="rtop">
              <button type="button" class="open" onClick=${open}>
                ${last ? html`<span class="thumb">${U.photosOf(last)[0] ? html`<${ui.Photo} id=${U.photosOf(last)[0].thumb}/>` : html`<${Icon} name="loaf"/>`}</span>` : null}
                <span>
                  <h3 class="serif"><${ui.Named} flag=${g.flag} name=${g.name}/></h3>
                  <span class="facts">
                    ${g.baked ? html`<span class="pill">Baked ${g.bakedCount}×</span>` : null}
                    <${RecipeCount} n=${g.lines.length}/>
                    <${ui.Score} value=${bestRating(g.breads)}/>
                    ${!g.baked && g.latest.source ? U.cleanSource(g.latest.source) : null}
                  </span>
                </span>
              </button>
              ${g.baked ? null : html`<button type="button" class="btn primary sm" onClick=${function () {
                if (g.tweaks.length > 1) open(); else nav.push({ kind: 'breadForm', fromRecipeId: g.latest.id });
              }}>Bake this</button>`}
            </div>
            <${Summary} recipe=${g.latest} onOpen=${open}/>
          </div>`;
        })}
      </div>
    </div>`;
  }

  // ---------- a recipe's page: a label's recipes, one at a time, each with its tweaks ----------
  function firstMade(l) { return l.tweaks[0].createdAt || 0; }
  function RecipePage(props) {
    var nav = props.nav;
    var ls = useState(function () { var l = store.lineOf(store.recipe(props.id)); return l ? l.id : null; }), lineId = ls[0], setLineId = ls[1];
    var gkey = useRef('');
    var line = lineId ? store.lineById(lineId) : null;
    var g = line ? store.groups().filter(function (x) { return x.lines.indexOf(line) >= 0; })[0] : store.groupByKey(gkey.current);
    if (g) gkey.current = g.key;
    var v = useState(null), view = v[0], setView = v[1];
    var rn = useState(null), renaming = rn[0], setRenaming = rn[1];       // the label's name while it is being edited
    useEffect(function () { if (!g) nav.close(props.k); }, [!g]);
    if (!g) return null;
    function rename() {
      var to = String(renaming || '').trim();
      setRenaming(null);
      if (to) store.renameLabel(g.name, to);
    }
    var list = g.lines.slice().sort(function (a, b) { return firstMade(a) - firstMade(b); });
    if (!line || list.indexOf(line) < 0) line = list[0];
    var at = list.indexOf(line), many = line.tweaks.length > 1, first = line.tweaks[0];
    function edit(rv) { nav.push({ kind: 'recipeForm', recipeId: rv.id }); }
    function step(d) { var next = list[at + d]; if (next) setLineId(next.id); }
    // every photo of every bake under it, newest bake first; split copies share theirs
    var seen = {}, photos = [];
    g.breads.forEach(function (b) {
      U.photosOf(b).forEach(function (p) { if (!seen[p.full]) { seen[p.full] = true; photos.push(p); } });
    });
    var heading = html`<${ui.Named} flag=${g.label ? g.flag : line.flag} name=${g.label ? g.name : line.name}/>`;
    return html`<div class="screen">
      <div class=${'floatbar' + (photos.length ? '' : ' solid')}><div class="wrap">
        <button type="button" class="round" aria-label="Back" onClick=${function () { nav.close(props.k); }}><${Icon} name="back"/></button>
        ${many ? null : html`<button type="button" class="round" aria-label="Edit" onClick=${function () { edit(first); }}><${Icon} name="edit"/></button>`}
      </div></div>
      <div class="scroll">
        ${photos.length ? html`<${Hero} photos=${photos} onView=${setView}/>` : null}
        <div class=${'wrap page' + (photos.length ? '' : ' nohero')}>
          <h2 class="serif">${heading}${g.label ? html`<button type="button" class="round sm" aria-label="Edit parent"
            onClick=${function () { setRenaming(g.name); }}><${Icon} name="edit"/></button>` : null}</h2>
          <div class="tags">
            ${g.baked ? html`<span class="pill">Baked ${g.bakedCount}×</span>` : html`<span class="pill sage">To try</span>`}
            <${RecipeCount} n=${list.length}/>
            <${ui.Score} value=${bestRating(g.breads)}/>
          </div>
          ${g.label && list.length === 1 && U.nameKey(line.name) !== U.nameKey(g.name)
            ? html`<h3 class="serif tname pname"><${ui.Named} flag=${line.flag} name=${line.name}/></h3>` : null}
          ${g.label && list.length > 1 ? html`<div class="pager">
            <button type="button" class="round" aria-label="Previous recipe" disabled=${at <= 0} onClick=${function () { step(-1); }}><${Icon} name="back"/></button>
            <h3 class="serif"><${ui.Named} flag=${line.flag} name=${line.name}/></h3>
            <button type="button" class="round" aria-label="Next recipe" disabled=${at >= list.length - 1} onClick=${function () { step(1); }}><${Icon} name="next"/></button>
          </div>` : null}
          ${line.tweaks.map(function (rv) {
            var breads = store.breadsOf(rv.id), baked = store.bakedOf(breads), n = line.numbers[rv.id] || 1;
            return html`<div class="variation" key=${rv.id}>
              ${many ? html`<div class="vhead">
                <span class="label num serif">${U.roman(n)}</span>
                ${baked.length ? html`<span class="pill">Baked ${baked.length}×</span>` : html`<span class="pill sage">To try</span>`}
                <${ui.Score} value=${bestRating(breads)}/>
                <button type="button" class="round" aria-label=${'Edit ' + U.roman(n)} onClick=${function () { edit(rv); }}><${Icon} name="edit"/></button>
              </div>` : null}
              <${RecipeCard} recipe=${rv} against=${many && rv !== first ? first : null} onView=${setView}/>
              <div class="formend">
                <button type="button" class="btn primary wide" onClick=${function () { nav.push({ kind: 'breadForm', fromRecipeId: rv.id }); }}>Bake this</button>
              </div>
              ${breads.length ? html`<div class="made">
                ${many ? null : html`<span class="label">Breads</span>`}
                <div class="row">
                  ${breads.map(function (b) {
                    return html`<${Tile} key=${b.id} bread=${b} onOpen=${function () { nav.push({ kind: 'bread', id: b.id }); }}/>`;
                  })}
                </div>
              </div>` : null}
            </div>`;
          })}
        </div>
      </div>
      ${view ? html`<${ui.Viewer} id=${view.id} blob=${view.blob} onClose=${function () { setView(null); }}/>` : null}
      ${renaming !== null ? html`<${ui.Sheet} title="Edit parent" onClose=${function () { setRenaming(null); }}>
        <input id="f-parent-name" class="input" value=${renaming} aria-label="Parent name" autocomplete="off" autoFocus
          onInput=${function (e) { setRenaming(e.target.value); }}
          onKeyDown=${function (e) { if (e.key === 'Enter') rename(); }}/>
        <div class="formend">
          <button type="button" class="btn primary wide" disabled=${!String(renaming).trim()} onClick=${rename}>Save</button>
        </div>
      <//>` : null}
    </div>`;
  }

  // ---------- picking a saved recipe ----------
  function RecipePicker(props) {
    return html`<${ui.Sheet} title="Recipes" onClose=${props.onClose}>
      ${store.lines().map(function (l) {
        var last = l.breads[0];
        return html`<button type="button" class="opt" key=${l.id} onClick=${function () { props.onPick(l.latest); }}>
          <span class="thumb">${last && U.photosOf(last)[0] ? html`<${ui.Photo} id=${U.photosOf(last)[0].thumb}/>` : html`<${Icon} name="loaf"/>`}</span>
          <span><${ui.Named} flag=${l.flag} name=${l.name}/><small>${l.baked ? 'Baked ' + l.bakedCount + '×' : 'To try'}</small></span>
        </button>`;
      })}
    <//>`;
  }

  // ---------- the bread form ----------
  function BreadForm(props) {
    var nav = props.nav;
    var init = useRef(null);
    if (!init.current) {
      // Editing a bread, or splitting one: a split starts as a copy of the entry, saved as a new one.
      var bread = store.bread(props.breadId || props.splitFromId) || null;
      var baseId = bread ? bread.recipeId : (props.fromRecipeId || null);
      var base = baseId ? store.recipe(baseId) : null;
      init.current = {
        name: bread ? bread.name : '',
        // Until she types her own, the name is the recipe's with the number of the tweak it lands in.
        named: !!bread && (!base || U.nameKey(bread.name) !== U.nameKey(store.tweakTitle(base))),
        date: bread ? bread.date : U.today(),
        pics: U.photosOf(bread).map(function (p) { return F.pic({ photo: p }); }),
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
    var editing = !!props.breadId, splitting = !editing && !!props.splitFromId;

    function set(patch) {
      setF(function (cur) { return Object.assign({}, cur, typeof patch === 'function' ? patch(cur) : patch); });
      setDirty(true);
      setBusy(function (b) { return b === 'saving' ? b : ''; });
    }
    /** Photos picked together are added together, in the order they were picked. */
    function pickPhotos(files) {
      Promise.all(files.map(function (file) {
        return U.resizeImage(file, 1600, 0.85).catch(function () { setBusy('photo'); return null; });
      })).then(function (blobs) {
        var added = blobs.filter(Boolean).map(function (blob) { return F.pic({ blob: blob }); });
        if (added.length) set(function (cur) { return { pics: cur.pics.concat(added) }; });
      });
    }
    function useRecipe(r) {
      setOverlay(null);
      set({ draft: draftFromRecipe(r), baseRecipeId: r.id, pending: [], named: false });
    }
    /** A recipe read from a photo is saved as a recipe to try, not as a bread: check it, then both forms close. */
    function useReading(result) {
      setOverlay(null);
      nav.push({ kind: 'recipeForm', reading: result.reading, originals: result.originals, closes: props.k });
    }
    var auto = f.named ? '' : store.previewName({ id: props.breadId || null, baseRecipeId: f.baseRecipeId, recipe: recipeOf(f.draft) });
    var name = auto || f.name;
    function save() {
      if (!name.trim() || busy === 'saving') return;
      setBusy('saving');
      store.saveBread({
        id: props.breadId || null,
        bread: { name: name, date: f.date, ratings: f.ratings, notes: f.notes, comments: f.comments },
        pics: f.pics, splitFrom: splitting ? props.splitFromId : null, recipe: recipeOf(f.draft), baseRecipeId: f.baseRecipeId, originalBlobs: f.pending
      }).then(function () { nav.close(props.k); }, function () { setBusy('failed'); });
    }
    function remove() {
      setOverlay(null);
      setBusy('saving');
      store.deleteBread(props.breadId).then(function () { nav.close(props.k); }, function () { setBusy('failed'); });
    }
    function back() { if (dirty) setOverlay('discard'); else nav.close(props.k); }

    // Recipes whose name holds what she typed: picking one is how a new bread joins a recipe.
    var typed = f.named ? U.nameKey(f.name) : '', baseLine = store.lineOf(store.recipe(f.baseRecipeId));
    var matches = typed && !editing ? store.lines().filter(function (l) {
      return l !== baseLine && U.nameKey(l.name).indexOf(typed) >= 0;
    }).slice(0, 4) : [];

    return html`<${ui.Screen} title=${editing ? 'Edit bread' : splitting ? 'Split bread' : 'New bread'} onBack=${back}
        onGo=${save} goDisabled=${!name.trim() || busy === 'saving'}>
      ${editing || splitting ? null : html`<div class="quick">
        ${store.getState().recipes.length ? html`<button type="button" onClick=${function () { setOverlay('recipes'); }}><${Icon} name="recipes"/>Use recipe</button>` : null}
        ${props.canImport ? html`<label class="filebtn"><${Icon} name="image"/>From photo
          <input id="f-from-photo" type="file" accept="image/*" multiple aria-label="From photo"
            onChange=${function (e) { var files = filesOf(e); if (files.length) setOverlay({ files: files }); }}/>
        </label>` : null}
      </div>`}
      <${Field} label="Name">
        <div class="namerow">
        <${F.FlagPicker} value=${f.draft.flag} onChange=${function (v) { set(function (cur) { return { draft: Object.assign({}, cur.draft, { flag: v }) }; }); }}/>
        <input id="f-name" class="input" value=${name} aria-label="Name" autocomplete="off"
          onInput=${function (e) { var v = e.target.value; set({ name: v, named: !!v.trim() }); }}/>
        </div>
        ${matches.length ? html`<div class="suggest">
          ${matches.map(function (l) {
            return html`<button type="button" key=${l.id} onClick=${function () { useRecipe(l.latest); }}>${l.name}</button>`;
          })}
        </div>` : null}
      <//>
      ${store.getState().canUpload || f.pics.length ? html`<${Field} label="Photos">
        <${F.PhotosField} items=${f.pics}
          onAdd=${pickPhotos}
          onChange=${function (pics) { set({ pics: pics }); }}
          onView=${function (x) { setOverlay({ view: x }); }}/>
      <//>` : null}
      <${Field} label="Date">
        <div class="daterow">
          <input id="f-date" class="input date" type="date" value=${f.date} aria-label="Date" onInput=${function (e) { set({ date: e.target.value }); }}/>
          <button type="button" class=${'nodate' + (f.date ? '' : ' on')} aria-label="No date" aria-pressed=${!f.date}
            onClick=${function () { set({ date: f.date ? '' : U.today() }); }}>–</button>
        </div>
      <//>
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
        <button type="button" class="btn primary wide" disabled=${!name.trim() || busy === 'saving'} onClick=${save}>Save</button>
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
      // Saving both sizes keeps one name: they are two tweaks of the same recipe.
      var list = f.both
        ? d.variants.map(function (v, i) { return { recipe: recipeOf(d, i) }; })
        : [{ id: props.recipeId || null, recipe: recipeOf(d) }];
      store.saveRecipes(list, f.pending).then(function () { nav.close(props.closes || props.k); }, function () { setBusy('failed'); });
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
        <div class="namerow">
          <${F.FlagPicker} value=${d.flag} onChange=${function (v) { set({ draft: Object.assign({}, d, { flag: v }) }); }}/>
          <input id="f-name" class="input" value=${d.name} aria-label="Name" autocomplete="off"
            onInput=${function (e) { set({ draft: Object.assign({}, d, { name: e.target.value }) }); }}/>
        </div>
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

  // ---------- Stats ----------
  /** A named stat: tap the name to open its recipe (or the bread, when it has no recipe). */
  function Pick(props) {
    var x = props.item;
    if (!x) return html`<b>–</b>`;
    return html`<button type="button" class="pick" onClick=${function () { props.nav.push(x.open); }}>
      <b class="serif"><${ui.Named} flag=${x.flag} name=${x.name}/></b>${props.children}
    </button>`;
  }
  /**
   * The favorite and highest rated names stay on one line, at one size: when either is too
   * long, both are set smaller until both fit.
   */
  function fitNames(box) {
    if (!box) return;
    var els = Array.prototype.slice.call(box.querySelectorAll('.pick b.serif'));
    if (!els.length) return;
    els.forEach(function (el) { el.style.fontSize = ''; });
    var size = parseFloat(getComputedStyle(els[0]).fontSize);
    function over() { return els.some(function (el) { return el.scrollWidth > el.clientWidth + 1; }); }
    while (over() && size > 15) {
      size -= 1;
      els.forEach(function (el) { el.style.fontSize = size + 'px'; });
    }
  }
  function Stats(props) {
    var st = store.stats(), nav = props.nav, box = useRef(null);
    var os = useState({}), open = os[0], setOpen = os[1];
    H.useLayoutEffect(function () { fitNames(box.current); });
    useEffect(function () {
      // measure again once the serif font has loaded, and when the screen changes size
      function refit() { fitNames(box.current); }
      if (root.document.fonts && root.document.fonts.ready) root.document.fonts.ready.then(refit);
      root.addEventListener('resize', refit);
      return function () { root.removeEventListener('resize', refit); };
    }, []);
    return html`<div class="wrap">
      <div class="top"><h1 class="serif">Stats</h1></div>
      <div class="stats" ref=${box}>
        <div class="stat"><span class="label">Flour used</span><b>${U.fmtWeight(st.flourGrams)}</b></div>
        <div class="stat"><span class="label">Loaves</span><b>${st.loaves}</b></div>
        <div class="stat wide"><span class="label">Favorite</span>
          <${Pick} item=${st.favorite} nav=${nav}>${st.favorite ? html`<small>${st.favorite.count}×</small>` : null}<//>
        </div>
        <div class="stat wide"><span class="label">Highest rated</span>
          <${Pick} item=${st.highestRated} nav=${nav}>${st.highestRated ? html`<${ui.Score} value=${st.highestRated.rating}/>` : null}<//>
        </div>
        <div class="stat wide"><span class="label">Time spent</span><b>${U.fmtSpan(st.minutes)}</b></div>
        ${st.countries.length ? html`<div class="stat wide"><span class="label">Countries</span>
          <ul class="countries">
            ${st.countries.map(function (c) {
              var on = !!open[c.flag];
              return html`<li key=${c.flag} class=${on ? 'open' : ''}>
                <button type="button" class="crow" aria-expanded=${on} onClick=${function () {
                  var next = Object.assign({}, open); next[c.flag] = !on; setOpen(next);
                }}>
                  <span class="fl" aria-hidden="true">${U.flagEmoji(c.flag)}</span><span class="cname">${U.flagName(c.flag)}</span>
                  <b>${c.tried} / ${c.count}</b><${Icon} name="next"/>
                </button>
                ${on ? html`<div class="crecipes">
                  ${c.recipes.map(function (r) {
                    return html`<button type="button" key=${r.id} class=${r.baked ? '' : 'untried'}
                      onClick=${function () { nav.push({ kind: 'recipe', id: r.id }); }}>${r.name}</button>`;
                  })}
                </div>` : null}
              </li>`;
            })}
          </ul>
        </div>` : null}
      </div>
    </div>`;
  }

  LGT.screens = {
    Gallery: Gallery, BreadPage: BreadPage, Recipes: Recipes, RecipePage: RecipePage,
    Stats: Stats, BreadForm: BreadForm, RecipeForm: RecipeForm, AddRecipeSheet: AddRecipeSheet, Reader: Reader
  };
})(typeof window !== 'undefined' ? window : globalThis);
